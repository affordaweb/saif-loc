'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Peer from 'peerjs'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const POI_TYPES = {
  cafe: 'cafe', restaurant: 'restaurant', fast_food: 'fast_food',
  pub: 'pub', supermarket: 'supermarket', convenience: 'convenience',
  mall: 'mall', pharmacy: 'pharmacy', atm: 'atm', bank: 'bank',
  fuel: 'fuel', bakery: 'bakery',
}

async function fetchNearbyPOIs(lat, lng, radius = 500) {
  const queries = Object.values(POI_TYPES).map(
    (t) => `node["amenity"="${t}"](around:${radius},${lat},${lng});`
  )
  queries.push(`node["shop"](around:${radius},${lat},${lng});`)
  const overpass = `[out:json][timeout:8];(${queries.join('')});out center 30;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: overpass,
    })
    const data = await res.json()
    return data.elements
      .filter((el) => el.tags && el.lat && el.lon)
      .map((el) => {
        const type = el.tags.amenity || el.tags.shop || 'default'
        const name = el.tags.name || el.tags.brand || type
        return { lat: el.lat, lng: el.lon, type, name }
      })
      .filter((poi) => poi.name && poi.name !== poi.type)
      .slice(0, 20)
  } catch { return [] }
}

const STATUS = {
  initializing: { color: 'bg-rose-400', text: 'Initializing...' },
  waiting: { color: 'bg-amber-400', text: 'Waiting for friend...' },
  connecting: { color: 'bg-sky-400 animate-pulse', text: 'Connecting...' },
  connected: { color: 'bg-emerald-400', text: 'Connected' },
  disconnected: { color: 'bg-rose-500', text: 'Friend left' },
  'no-gps': { color: 'bg-rose-500', text: 'Enable location access' },
  'gps-error': { color: 'bg-rose-500', text: 'Could not get location' },
  error: { color: 'bg-rose-500', text: 'Connection failed' },
}

function parseRoomSlug(slug) {
  const parts = slug.split('~')
  if (parts.length >= 3) {
    return {
      hostName: parts[0] || 'Saif',
      friendName: parts[1] || 'Friend',
      roomCode: parts.slice(2).join('~'),
    }
  }
  return { hostName: 'Saif', friendName: 'Friend', roomCode: slug }
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export default function RoomPage() {
  const { id: rawSlug } = useParams()
  const { hostName, friendName, roomCode } = parseRoomSlug(rawSlug)
  const hName = capitalize(hostName)
  const fName = capitalize(friendName)

  const peerRef = useRef(null)
  const connRef = useRef(null)
  const watchRef = useRef(null)
  const myLocationRef = useRef(null)
  const chatEndRef = useRef(null)
  const [myLocation, setMyLocation] = useState(null)
  const [peerLocation, setPeerLocation] = useState(null)
  const [status, setStatus] = useState('initializing')
  const [role, setRole] = useState(null)
  const [copied, setCopied] = useState(false)
  const [pois, setPois] = useState([])
  const [consented, setConsented] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/r/${rawSlug}`
    : ''

  const sendLocation = useCallback((loc) => {
    if (connRef.current?.open) {
      connRef.current.send({ type: 'location', location: loc })
    }
  }, [])

  const sendChat = useCallback((text) => {
    if (!connRef.current?.open || !text.trim()) return
    const msg = { type: 'chat', text: text.trim(), name: role === 'host' ? hName : fName, timestamp: Date.now() }
    connRef.current.send(msg)
    setMessages((prev) => [...prev, { ...msg, isMe: true }])
    setChatInput('')
  }, [role, hName, fName])

  useEffect(() => {
    if (!consented) return
    if (!navigator.geolocation) { setStatus('no-gps'); return }

    const success = (pos) => {
      const loc = {
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 50,
      }
      myLocationRef.current = loc
      setMyLocation(loc)
      sendLocation(loc)
    }

    const err = () => setStatus('gps-error')

    navigator.geolocation.getCurrentPosition(success, err, {
      enableHighAccuracy: true, timeout: 10000,
    })

    watchRef.current = navigator.geolocation.watchPosition(success, err, {
      enableHighAccuracy: true, maximumAge: 1000, timeout: 5000,
    })

    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current) }
  }, [sendLocation, consented])

  useEffect(() => {
    if (!myLocation) return
    const timer = setTimeout(() => {
      fetchNearbyPOIs(myLocation.lat, myLocation.lng, 500).then(setPois)
    }, 1000)
    return () => clearTimeout(timer)
  }, [myLocation])

  useEffect(() => {
    let destroyed = false

    const handleData = (data) => {
      if (data.type === 'location') setPeerLocation(data.location)
      else if (data.type === 'chat') setMessages((prev) => [...prev, { ...data, isMe: false }])
    }

    const init = () => {
      const hostPeer = new Peer(roomCode, { debug: 0 })
      peerRef.current = hostPeer

      hostPeer.on('open', () => {
        if (destroyed) return
        setRole('host')
        setStatus('waiting')
      })

      hostPeer.on('connection', (conn) => {
        if (destroyed) return
        connRef.current = conn
        setStatus('connected')
        conn.on('data', handleData)
        conn.on('close', () => { setStatus('disconnected'); setPeerLocation(null) })
        if (myLocationRef.current) conn.send({ type: 'location', location: myLocationRef.current })
      })

      hostPeer.on('error', (err) => {
        if (destroyed) return
        if (err.type === 'unavailable-id') { hostPeer.destroy(); joinAsGuest() }
        else setStatus('error')
      })
    }

    const joinAsGuest = () => {
      const guestPeer = new Peer()
      peerRef.current = guestPeer

      guestPeer.on('open', () => {
        if (destroyed) return
        setRole('guest')
        setStatus('connecting')
        const conn = guestPeer.connect(roomCode, { reliable: true })
        connRef.current = conn
        conn.on('open', () => {
          if (destroyed) return
          setStatus('connected')
          conn.on('data', handleData)
          conn.on('close', () => { setStatus('disconnected'); setPeerLocation(null) })
          if (myLocationRef.current) conn.send({ type: 'location', location: myLocationRef.current })
        })
        conn.on('error', () => setStatus('error'))
      })

      guestPeer.on('error', () => setStatus('error'))
    }

    init()
    return () => { destroyed = true; if (peerRef.current) peerRef.current.destroy() }
  }, [roomCode, sendLocation])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const s = STATUS[status] || STATUS.error

  const distance =
    myLocation && peerLocation
      ? getDistance(myLocation.lat, myLocation.lng, peerLocation.lat, peerLocation.lng)
      : null

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => {})
  }

  const isHost = role === 'host'
  const myName = isHost ? hName : fName
  const peerName = isHost ? fName : hName

  if (!consented) {
    return (
      <div className="h-screen w-full bg-gradient-to-br from-rose-100 via-purple-100 to-sky-100 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/70 backdrop-blur rounded-3xl mb-6 shadow-sm">
            <span className="text-4xl">📍</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {role === 'host'
              ? `Share your location with ${fName}`
              : `${hName} wants to share locations`}
          </h2>
          <p className="text-gray-500 text-sm mb-8">
            {role === 'host'
              ? `Your location will be shared so you can meet up.`
              : `Share your location to meet up with ${hName}.`}
          </p>
          <button
            onClick={() => setConsented(true)}
            className="w-full bg-gradient-to-r from-rose-400 to-purple-400 hover:from-rose-500 hover:to-purple-500 text-white font-semibold py-3.5 px-6 rounded-2xl transition shadow-lg shadow-purple-300/30 mb-3"
          >
            Share Location
          </button>
          <button
            onClick={() => setStatus('no-gps')}
            className="w-full bg-white/70 hover:bg-white/90 text-gray-500 font-medium py-3 px-6 rounded-2xl transition"
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-dvh w-full relative bg-black overflow-hidden">
      <MapView
        myLocation={myLocation}
        peerLocation={peerLocation}
        pois={pois}
        myLabel={myName.charAt(0).toUpperCase()}
        peerLabel={peerName.charAt(0).toUpperCase()}
        myColor={isHost ? '#f43f5e' : '#22c55e'}
        peerColor={isHost ? '#22c55e' : '#f43f5e'}
        myName={myName}
        peerName={peerName}
      />

      {/* Floating buttons */}
      <button
        onClick={copyLink}
        className="absolute top-4 right-4 z-[10000] bg-white/90 backdrop-blur-md rounded-full px-5 py-2.5 shadow-xl text-sm font-semibold text-gray-700 hover:bg-white transition flex items-center gap-2 border border-white/50"
      >
        {copied ? '✅ Copied!' : '🔗 Copy Link'}
      </button>

      <div className="absolute top-4 left-4 z-[10000] bg-white/90 backdrop-blur-md rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2.5">
        <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
        <span className="text-sm font-medium text-gray-700">{s.text}</span>
      </div>

      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="absolute bottom-28 right-4 z-[10000] bg-white/90 backdrop-blur-md rounded-full w-12 h-12 shadow-xl flex items-center justify-center text-xl hover:bg-white transition border border-white/50"
      >
        💬
      </button>

      {/* Chat panel */}
      {chatOpen && (
        <div className="absolute inset-0 z-[9000] flex flex-col pointer-events-none">
          <div className="flex-1 pointer-events-auto" onClick={() => setChatOpen(false)} />
          <div className="bg-white/95 backdrop-blur-xl rounded-t-3xl p-4 pb-6 shadow-2xl pointer-events-auto max-h-[50vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">Chat with {peerName}</span>
              <button onClick={() => setChatOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[120px] max-h-[30vh] px-1">
              {messages.length === 0 && (
                <p className="text-center text-gray-400 text-xs py-8">No messages yet</p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    msg.isMe
                      ? 'bg-gradient-to-r from-rose-400 to-purple-400 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-700 rounded-bl-md'
                  }`}>
                    {!msg.isMe && <div className="text-[10px] font-semibold text-gray-500 mb-0.5">{msg.name}</div>}
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); sendChat(chatInput) }} className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <button
                type="submit"
                className="bg-gradient-to-r from-rose-400 to-purple-400 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-md hover:from-rose-500 hover:to-purple-500 transition"
              >
                ➤
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bottom card */}
      <div className="absolute bottom-6 left-4 right-4 z-[7000]" style={{ marginRight: '4rem' }}>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 shadow-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <div className={`w-2.5 h-2.5 rounded-full ${isHost ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">{isHost ? 'You' : hName}</span>
              </div>
              <div className="font-bold text-gray-800 text-lg">{hName}</div>
              {myLocation && isHost ? (
                <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}</div>
              ) : peerLocation && !isHost ? (
                <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{peerLocation.lat.toFixed(5)}, {peerLocation.lng.toFixed(5)}</div>
              ) : (
                <div className="text-[11px] text-gray-300 mt-0.5">⏳ Waiting...</div>
              )}
            </div>
            <div className="text-center border-l border-gray-200">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <div className={`w-2.5 h-2.5 rounded-full ${isHost ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">{isHost ? fName : 'You'}</span>
              </div>
              <div className="font-bold text-gray-800 text-lg">{fName}</div>
              {peerLocation && isHost ? (
                <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{peerLocation.lat.toFixed(5)}, {peerLocation.lng.toFixed(5)}</div>
              ) : myLocation && !isHost ? (
                <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}</div>
              ) : (
                <div className="text-[11px] text-gray-300 mt-0.5">⏳ Waiting...</div>
              )}
            </div>
          </div>

          {distance !== null && (
            <div className="pt-3 border-t border-gray-200 flex items-center justify-center gap-2">
              <span className="text-xs text-gray-400">Distance</span>
              <span className="font-bold text-gray-800 text-lg">
                {distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`}
              </span>
            </div>
          )}

          {pois.length > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <div className="text-[10px] text-gray-400 font-semibold mb-2">Nearby</div>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set(pois.map((p) => p.type))].slice(0, 8).map((t) => (
                  <span key={t} className="bg-gray-100 rounded-full px-2.5 py-1 text-[10px] text-gray-600 font-medium">
                    {t.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
