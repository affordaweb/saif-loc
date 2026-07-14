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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getMidpoint(lat1, lon1, lat2, lon2) {
  return { lat: (lat1 + lat2) / 2, lng: (lon1 + lon2) / 2 }
}

function getETA(distanceMeters, speedKmh) {
  return Math.round(distanceMeters / 1000 / speedKmh * 60)
}

const POI_TYPES = {
  cafe: 'cafe', restaurant: 'restaurant', fast_food: 'fast_food',
  pub: 'pub', supermarket: 'supermarket', convenience: 'convenience',
  mall: 'mall', pharmacy: 'pharmacy', atm: 'atm', bank: 'bank',
  fuel: 'fuel', bakery: 'bakery',
}

async function fetchNearbyPOIs(lat, lng, radius = 500) {
  const queries = Object.values(POI_TYPES).map((t) => `node["amenity"="${t}"](around:${radius},${lat},${lng});`)
  queries.push(`node["shop"](around:${radius},${lat},${lng});`)
  const overpass = `[out:json][timeout:8];(${queries.join('')});out center 30;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: overpass })
    const data = await res.json()
    return data.elements.filter((el) => el.tags && el.lat && el.lon)
      .map((el) => ({ lat: el.lat, lng: el.lon, type: el.tags.amenity || el.tags.shop || 'default', name: el.tags.name || el.tags.brand || type }))
      .filter((poi) => poi.name && poi.name !== poi.type).slice(0, 20)
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
  if (parts.length >= 3) return { hostName: parts[0] || 'Saif', friendName: parts[1] || 'Friend', roomCode: parts.slice(2).join('~') }
  return { hostName: 'Saif', friendName: 'Friend', roomCode: slug }
}

function capitalize(word) { return word.charAt(0).toUpperCase() + word.slice(1) }

export default function RoomPage() {
  const { id: rawSlug } = useParams()
  const { hostName, friendName, roomCode } = parseRoomSlug(rawSlug)
  const hName = capitalize(hostName)
  const fName = capitalize(friendName)

  const peerRef = useRef(null)
  const connRef = useRef(null)
  const watchRef = useRef(null)
  const myLocationRef = useRef(null)
  const typingTimerRef = useRef(null)
  const chatEndRef = useRef(null)
  const chatInputRef = useRef(null)

  const [myLocation, setMyLocation] = useState(null)
  const [peerLocation, setPeerLocation] = useState(null)
  const [trail, setTrail] = useState([])
  const [status, setStatus] = useState('initializing')
  const [role, setRole] = useState(null)
  const [copied, setCopied] = useState(false)
  const [pois, setPois] = useState([])
  const [consented, setConsented] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [typing, setTyping] = useState(false)
  const [meetingPin, setMeetingPin] = useState(null)
  const [dropPinMode, setDropPinMode] = useState(false)
  const [showQR, setShowQR] = useState(false)

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/r/${rawSlug}` : ''

  const midpoint = myLocation && peerLocation
    ? getMidpoint(myLocation.lat, myLocation.lng, peerLocation.lat, peerLocation.lng)
    : null

  const distance = myLocation && peerLocation
    ? getDistance(myLocation.lat, myLocation.lng, peerLocation.lat, peerLocation.lng)
    : null

  const etaWalk = distance ? getETA(distance, 5) : null
  const etaDrive = distance ? getETA(distance, 40) : null

  const sendLocation = useCallback((loc) => {
    if (connRef.current?.open) connRef.current.send({ type: 'location', location: loc })
  }, [])

  const sendTyping = useCallback((isTyping) => {
    if (connRef.current?.open) connRef.current.send({ type: 'typing', isTyping })
  }, [])

  const sendMeetingPin = useCallback((pin) => {
    if (connRef.current?.open) connRef.current.send({ type: 'meetingPin', pin })
  }, [])

  function playNotification() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
    } catch {}
  }

  const handleChatOpen = () => { setChatOpen(true); setUnreadCount(0) }

  const sendChat = useCallback((text) => {
    if (!text.trim() || !connRef.current) return
    try {
      const msg = { type: 'chat', text: text.trim(), name: role === 'host' ? hName : fName, timestamp: Date.now() }
      connRef.current.send(msg)
      setMessages((prev) => [...prev, { ...msg, isMe: true }])
      setChatInput('')
    } catch {}
  }, [role, hName, fName])

  const handleTyping = useCallback((text) => {
    setChatInput(text)
    sendTyping(true)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => sendTyping(false), 1500)
  }, [sendTyping])

  const handleMapClick = useCallback((latlng) => {
    if (!dropPinMode) return
    const pin = { lat: latlng.lat, lng: latlng.lng }
    setMeetingPin(pin)
    sendMeetingPin(pin)
    setDropPinMode(false)
  }, [dropPinMode, sendMeetingPin])

  const nativeShare = () => {
    if (navigator.share) navigator.share({ title: 'Share Loc', url: shareUrl }).catch(() => {})
    else navigator.clipboard.writeText(shareUrl).then(() => setCopied(true)).catch(() => {})
  }

  useEffect(() => {
    if (!consented || !navigator.geolocation) { if (!navigator.geolocation) setStatus('no-gps'); return }
    const success = (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || 50 }
      myLocationRef.current = loc
      setMyLocation(loc)
      setTrail((prev) => [...prev.slice(-19), { lat: loc.lat, lng: loc.lng }])
      sendLocation(loc)
    }
    const err = () => setStatus('gps-error')
    navigator.geolocation.getCurrentPosition(success, err, { enableHighAccuracy: true, timeout: 10000 })
    watchRef.current = navigator.geolocation.watchPosition(success, err, { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 })
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current) }
  }, [sendLocation, consented])

  useEffect(() => {
    if (!myLocation) return
    const timer = setTimeout(() => fetchNearbyPOIs(myLocation.lat, myLocation.lng, 500).then(setPois), 1000)
    return () => clearTimeout(timer)
  }, [myLocation])

  useEffect(() => {
    let destroyed = false
    const handleData = (data) => {
      if (data.type === 'location') setPeerLocation(data.location)
      else if (data.type === 'chat') {
        setMessages((prev) => [...prev, { ...data, isMe: false }])
        setUnreadCount((prev) => prev + 1)
        playNotification()
      } else if (data.type === 'typing') setTyping(data.isTyping)
      else if (data.type === 'meetingPin') setMeetingPin(data.pin)
    }

    const init = () => {
      const hostPeer = new Peer(roomCode, { debug: 0 })
      peerRef.current = hostPeer
      hostPeer.on('open', () => { if (destroyed) return; setRole('host'); setStatus('waiting') })
      hostPeer.on('connection', (conn) => {
        if (destroyed) return; connRef.current = conn; setStatus('connected')
        conn.on('data', handleData)
        conn.on('close', () => setStatus('disconnected'))
        if (myLocationRef.current) conn.send({ type: 'location', location: myLocationRef.current })
      })
      hostPeer.on('error', (err) => {
        if (destroyed) return
        if (err.type === 'unavailable-id') { hostPeer.destroy(); joinAsGuest() } else setStatus('error')
      })
    }

    const joinAsGuest = () => {
      const guestPeer = new Peer()
      peerRef.current = guestPeer
      guestPeer.on('open', () => {
        if (destroyed) return; setRole('guest'); setStatus('connecting')
        const conn = guestPeer.connect(roomCode, { reliable: true })
        connRef.current = conn
        conn.on('open', () => {
          if (destroyed) return; setStatus('connected')
          conn.on('data', handleData)
          conn.on('close', () => setStatus('disconnected'))
          if (myLocationRef.current) conn.send({ type: 'location', location: myLocationRef.current })
        })
        conn.on('error', () => setStatus('error'))
      })
      guestPeer.on('error', () => setStatus('error'))
    }

    init()
    return () => { destroyed = true; if (peerRef.current) peerRef.current.destroy() }
  }, [roomCode, sendLocation])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const s = STATUS[status] || STATUS.error
  const isHost = role === 'host'
  const myName = isHost ? hName : fName
  const peerName = isHost ? fName : hName


  return (
    <div className="h-screen w-full relative bg-black overflow-hidden">
    { !consented && (
      <div className="absolute inset-x-0 bottom-4 left-4 right-4 mb-4 flex items-center justify-center pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 md:p-6 w-full max-w-md text-center pointer-events-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-white/70 backdrop-blur rounded-2xl md:rounded-3xl mb-4"><span className="text-3xl md:text-4xl">📍</span></div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
            {role === 'host' ? `Share your location with ${fName}` : `${hName} wants to share locations`}
          </h2>
          <p className="text-gray-500 text-xs md:text-sm mb-4">{role === 'host' ? 'Your location will be shared so you can meet up.' : `Share your location to meet up with ${hName}.`}</p>
          <div className="flex flex-col gap-3">
            <button onClick={() => setConsented(true)} className="w-full bg-gradient-to-r from-rose-400 to-purple-400 hover:from-rose-500 hover:to-purple-500 text-white font-semibold py-2 md:py-2.5 px-4 rounded-xl md:rounded-2xl transition shadow-lg shadow-purple-300/30">Share Location</button>
            <button onClick={() => setStatus('no-gps')} className="w-full bg-white/70 hover:bg-white/90 text-gray-500 font-medium py-2 px-4 rounded-xl md:rounded-2xl transition">Not now</button>
          </div>
        </div>
      </div>
    ) }
      <MapView
        myLocation={myLocation} participants={peerLocation ? [{ id: 'peer', name: peerName, color: isHost ? '#22c55e' : '#f43f5e', location: peerLocation }] : []}
        pois={pois} myName={myName} myColor={isHost ? '#f43f5e' : '#22c55e'}
        trail={trail} midpoint={midpoint} meetingPin={meetingPin} onMapClick={handleMapClick}
      />

      {/* Top bar */}
      <div className="absolute top-4 left-4 z-[10000] bg-white/90 backdrop-blur-md rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2.5">
        <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
        <span className="text-sm font-medium text-gray-700 max-md:hidden">{s.text}</span>
        <span className="md:hidden text-xs font-medium text-gray-700">{s.text}</span>
        {typing && <span className="text-xs text-gray-400 animate-pulse">typing...</span>}
      </div>

      <div className="absolute top-4 right-4 z-[10000] flex gap-2">
        <button onClick={nativeShare} className="bg-white/90 backdrop-blur-md rounded-full px-4 md:px-5 py-2.5 shadow-xl text-sm font-semibold text-gray-700 hover:bg-white transition flex items-center gap-2 border border-white/50">
          <span className="md:hidden">📤</span><span className="max-md:hidden">{copied ? '✅ Copied!' : '📤 Share'}</span>
        </button>
        <button onClick={() => setShowQR(true)} className="bg-white/90 backdrop-blur-md rounded-full w-10 h-10 shadow-xl flex items-center justify-center text-lg hover:bg-white transition border border-white/50">
          📱
        </button>
      </div>

      {/* Chat button */}
      <button onClick={handleChatOpen} className={`absolute bottom-32 md:bottom-8 right-4 z-[10000] rounded-full w-14 h-14 shadow-xl flex items-center justify-center text-xl transition border-2 ${unreadCount > 0 ? 'bg-rose-500 border-rose-400 animate-pulse shadow-rose-400/50' : 'bg-white/90 backdrop-blur-md border-white/50 hover:bg-white'}`}>
        💬
        {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-amber-400 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {/* Drop Pin button */}
      <button
        onClick={() => setDropPinMode(!dropPinMode)}
        className={`absolute bottom-32 md:bottom-8 left-4 z-[10000] rounded-full w-14 h-14 shadow-xl flex items-center justify-center text-lg transition border-2 ${
          dropPinMode ? 'bg-amber-500 border-amber-400 shadow-amber-400/50 scale-110' : 'bg-white/90 backdrop-blur-md border-white/50 hover:bg-white'
        }`}
        title={dropPinMode ? 'Tap the map to place pin' : 'Drop a meeting pin'}
      >
        📍
      </button>

      {/* QR modal */}
      {showQR && (
        <div className="absolute inset-0 z-[20000] bg-black/60 flex items-center justify-center p-6" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-3xl p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`} alt="QR" className="rounded-2xl mx-auto mb-4" />
            <p className="text-sm text-gray-500 font-medium mb-3">Scan to join room</p>
            <button onClick={() => { navigator.clipboard.writeText(shareUrl); setShowQR(false) }} className="text-sm text-purple-500 font-semibold">Copy Link</button>
          </div>
        </div>
      )}

      {/* Chat panel */}
      {chatOpen && (
        <div className="absolute inset-0 z-[9000] flex flex-col pointer-events-none">
          <div className="flex-1 pointer-events-auto" onClick={() => { setChatOpen(false); setTyping(false) }} />
          <div className="bg-white/95 backdrop-blur-xl rounded-t-3xl md:rounded-2xl p-4 pb-6 shadow-2xl pointer-events-auto max-h-[50vh] md:max-h-[60vh] md:max-w-md md:mx-auto md:mb-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">Chat with {peerName}</span>
              <button onClick={() => setChatOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[120px] max-h-[30vh] md:max-h-[40vh] px-1">
              {messages.length === 0 && <p className="text-center text-gray-400 text-xs py-8">No messages yet</p>}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.isMe ? 'bg-gradient-to-r from-rose-400 to-purple-400 text-white rounded-br-md' : 'bg-gray-100 text-gray-700 rounded-bl-md'}`}>
                    {!msg.isMe && <div className="text-[10px] font-semibold text-gray-500 mb-0.5">{msg.name}</div>}
                    {msg.text}
                    {msg.isMe && <span className="text-[10px] ml-1 opacity-70">✓</span>}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); sendChat(chatInput); sendTyping(false) }} className="flex gap-2">
              <input ref={chatInputRef} type="text" placeholder="Type a message..." value={chatInput}
                onChange={(e) => handleTyping(e.target.value)} autoFocus
                className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <button type="submit" className="bg-gradient-to-r from-rose-400 to-purple-400 text-white rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center shadow-md hover:from-rose-500 hover:to-purple-500 transition">➤</button>
            </form>
          </div>
        </div>
      )}

      {/* Bottom card */}
      <div className="absolute bottom-0 md:bottom-6 left-0 md:left-4 right-0 md:right-4 z-[7000] md:max-w-md md:mx-auto" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="bg-white/95 md:bg-white/90 backdrop-blur-md rounded-t-2xl md:rounded-2xl p-3 md:p-4 shadow-lg space-y-2 md:space-y-3">
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${isHost ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">{isHost ? 'You' : hName}</span>
              </div>
              <div className="font-bold text-gray-800 text-base md:text-lg">{hName}</div>
              {myLocation && isHost ? (
                <div className="text-[10px] md:text-[11px] text-gray-400 mt-0.5 font-mono truncate">{myLocation.lat.toFixed(4)}, {myLocation.lng.toFixed(4)}</div>
              ) : peerLocation && !isHost ? (
                <div className="text-[10px] md:text-[11px] text-gray-400 mt-0.5 font-mono truncate">{peerLocation.lat.toFixed(4)}, {peerLocation.lng.toFixed(4)}</div>
              ) : <div className="text-[11px] text-gray-300 mt-0.5">⏳ Waiting...</div>}
            </div>
            <div className="text-center border-l border-gray-200">
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${isHost ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">{isHost ? fName : 'You'}</span>
              </div>
              <div className="font-bold text-gray-800 text-base md:text-lg">{fName}</div>
              {peerLocation && isHost ? (
                <div className="text-[10px] md:text-[11px] text-gray-400 mt-0.5 font-mono truncate">{peerLocation.lat.toFixed(4)}, {peerLocation.lng.toFixed(4)}</div>
              ) : myLocation && !isHost ? (
                <div className="text-[10px] md:text-[11px] text-gray-400 mt-0.5 font-mono truncate">{myLocation.lat.toFixed(4)}, {myLocation.lng.toFixed(4)}</div>
              ) : <div className="text-[11px] text-gray-300 mt-0.5">⏳ Waiting...</div>}
            </div>
          </div>

          {distance !== null && (
            <div className="pt-2 md:pt-3 border-t border-gray-200 space-y-1.5 md:space-y-2">
              <div className="flex items-center justify-center gap-2">
                <span className="text-[11px] md:text-xs text-gray-400">Distance</span>
                <span className="font-bold text-gray-800 text-base md:text-lg">{distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`}</span>
              </div>
              <div className="flex items-center justify-center gap-3 md:gap-4 text-[11px] md:text-xs text-gray-500">
                <span>🚶 {etaWalk} min</span>
                <span>🚗 {etaDrive} min</span>
              </div>
              <div className="flex gap-2 justify-center">
                {peerLocation && (
                  <>
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${peerLocation.lat},${peerLocation.lng}`} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] bg-blue-50 text-blue-600 rounded-full px-2.5 md:px-3 py-1.5 font-medium hover:bg-blue-100 transition">Google Maps</a>
                    <a href={`https://maps.apple.com/?daddr=${peerLocation.lat},${peerLocation.lng}`} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] bg-gray-100 text-gray-600 rounded-full px-2.5 md:px-3 py-1.5 font-medium hover:bg-gray-200 transition">Apple Maps</a>
                  </>
                )}
              </div>
            </div>
          )}

          {pois.length > 0 && (
            <div className="pt-2 md:pt-3 border-t border-gray-200">
              <div className="text-[10px] text-gray-400 font-semibold mb-1.5">Nearby</div>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set(pois.map((p) => p.type))].slice(0, 8).map((t) => (
                  <span key={t} className="bg-gray-100 rounded-full px-2 py-1 text-[10px] text-gray-600 font-medium">{t.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
