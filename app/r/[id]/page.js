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
      .map((el) => {
        const type = el.tags.amenity || el.tags.shop || 'default'
        return { lat: el.lat, lng: el.lng, type, name: el.tags.name || el.tags.brand || type }
      })
      .filter((poi) => poi.name && poi.name !== poi.type).slice(0, 20)
  } catch { return [] }
}

const STATUS = {
  initializing: { color: 'bg-amber-400', text: 'Connecting...' },
  waiting: { color: 'bg-amber-400', text: 'Waiting for friend...' },
  connected: { color: 'bg-emerald-400', text: 'Connected' },
  disconnected: { color: 'bg-rose-500', text: 'Friend left' },
  'no-gps': { color: 'bg-rose-500', text: 'Location unavailable' },
  error: { color: 'bg-rose-500', text: 'Connection failed' },
}

function parseRoomSlug(slug) {
  const parts = slug.split('~')
  if (parts.length >= 3) return { hostName: parts[0] || 'Saif', friendName: parts[1] || 'Friend', roomCode: parts.slice(2).join('~') }
  return { hostName: 'Saif', friendName: 'Friend', roomCode: slug }
}

function capitalize(word) { return word.charAt(0).toUpperCase() + word.slice(1) }

function getPeerConfig() {
  if (typeof window === 'undefined') return {}
  const host = process.env.NEXT_PUBLIC_PEER_HOST || '0.peerjs.com'
  if (host === '0.peerjs.com') return { debug: 0 }
  return {
    host,
    port: parseInt(process.env.NEXT_PUBLIC_PEER_PORT || '443'),
    path: process.env.NEXT_PUBLIC_PEER_PATH || '/',
    secure: process.env.NEXT_PUBLIC_PEER_SECURE !== 'false',
    debug: 0,
  }
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
  const typingTimerRef = useRef(null)
  const chatEndRef = useRef(null)
  const chatInputRef = useRef(null)
  const reconnectTimerRef = useRef(null)

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
  const [sharingDuration, setSharingDuration] = useState(0)
  const [sharingUntil, setSharingUntil] = useState(null)
  const [destination, setDestination] = useState(null)
  const [arrived, setArrived] = useState(null)
  const [setDestMode, setSetDestMode] = useState(false)
  const [now, setNow] = useState(0)
  const [peerConsented, setPeerConsented] = useState(false)
  const [showConsent, setShowConsent] = useState(true)

  const isHost = role === 'host'
  const myName = isHost ? hName : fName
  const peerName = isHost ? fName : hName

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

  const sendDest = useCallback((dest) => {
    if (connRef.current?.open) connRef.current.send({ type: 'destination', destination: dest })
  }, [])

  const sendArrived = useCallback((name) => {
    if (connRef.current?.open) connRef.current.send({ type: 'arrived', name })
  }, [])

  const sendConsentStatus = useCallback((sharing) => {
    if (connRef.current?.open) connRef.current.send({ type: 'consent', sharing })
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
    if (dropPinMode) {
      const pin = { lat: latlng.lat, lng: latlng.lng }
      setMeetingPin(pin)
      sendMeetingPin(pin)
      setDropPinMode(false)
    }
    if (setDestMode) {
      const dest = { lat: latlng.lat, lng: latlng.lng, name: 'Destination' }
      setDestination(dest)
      sendDest(dest)
      setSetDestMode(false)
    }
  }, [dropPinMode, setDestMode, sendMeetingPin, sendDest])

  const nativeShare = () => {
    if (navigator.share) navigator.share({ title: 'Share Loc', url: shareUrl }).catch(() => {})
    else navigator.clipboard.writeText(shareUrl).then(() => setCopied(true)).catch(() => {})
  }

  const handleShareLocation = () => {
    setSharingUntil(sharingDuration > 0 ? Date.now() + sharingDuration * 3600000 : null)
    setConsented(true)
    setShowConsent(false)
    sendConsentStatus(true)
  }

  const handleStopSharing = () => {
    setConsented(false)
    setShowConsent(true)
    if (watchRef.current) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
    if (connRef.current?.open) connRef.current.send({ type: 'stopped-sharing' })
  }

  useEffect(() => {
    if (!consented && !peerConsented) return
    if (!consented) return
    if (!navigator.geolocation) { setStatus('no-gps'); return }
    const success = (pos) => {
      if (sharingUntil && Date.now() >= sharingUntil) {
        if (watchRef.current) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
        setConsented(false)
        if (connRef.current?.open) connRef.current.send({ type: 'sharing-expired' })
        return
      }
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || 50 }
      myLocationRef.current = loc
      setMyLocation(loc)
      setTrail((prev) => [...prev.slice(-19), { lat: loc.lat, lng: loc.lng }])
      sendLocation(loc)
    }
    const err = () => setStatus('no-gps')
    navigator.geolocation.getCurrentPosition(success, err, { enableHighAccuracy: true, timeout: 10000 })
    watchRef.current = navigator.geolocation.watchPosition(success, err, { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 })
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current) }
  }, [sendLocation, consented, sharingUntil, peerConsented])

  useEffect(() => {
    if (!myLocation) return
    const timer = setTimeout(() => fetchNearbyPOIs(myLocation.lat, myLocation.lng, 500).then(setPois), 1000)
    return () => clearTimeout(timer)
  }, [myLocation])

  // ---- peer connection with retry ----
  useEffect(() => {
    let destroyed = false
    let retryCount = 0
    const MAX_RETRIES = 3

    const handleData = (data) => {
      if (data.type === 'location') setPeerLocation(data.location)
      else if (data.type === 'chat') {
        setMessages((prev) => [...prev, { ...data, isMe: false }])
        setUnreadCount((prev) => prev + 1)
        playNotification()
      } else if (data.type === 'typing') setTyping(data.isTyping)
      else if (data.type === 'meetingPin') setMeetingPin(data.pin)
      else if (data.type === 'destination') setDestination(data.destination)
      else if (data.type === 'arrived') setArrived(data.name)
      else if (data.type === 'sharing-expired' || data.type === 'stopped-sharing') {
        setPeerConsented(false)
        setPeerLocation(null)
      } else if (data.type === 'consent') {
        setPeerConsented(data.sharing)
      }
    }

    const wireConn = (conn) => {
      connRef.current = conn
      conn.on('data', handleData)
      conn.on('close', () => { if (!destroyed) { setStatus('disconnected'); scheduleReconnect() } })
      conn.on('error', () => { if (!destroyed) { setStatus('error'); scheduleReconnect() } })
      if (myLocationRef.current) {
        try { conn.send({ type: 'location', location: myLocationRef.current }) } catch {}
      }
      sendConsentStatus(consented)
    }

    const scheduleReconnect = () => {
      if (destroyed || retryCount >= MAX_RETRIES) return
      retryCount++
      reconnectTimerRef.current = setTimeout(() => {
        if (!destroyed) connect()
      }, 3000 * retryCount)
    }

    const connect = () => {
      if (destroyed) return
      const config = getPeerConfig()

      if (retryCount > 0) {
        const guestPeer = new Peer({ ...config })
        peerRef.current = guestPeer
        guestPeer.on('open', () => {
          if (destroyed) return
          setRole('guest'); setStatus('connecting')
          const conn = guestPeer.connect(roomCode, { reliable: true })
          conn.on('open', () => {
            if (destroyed) return
            setStatus('connected')
            wireConn(conn)
          })
          conn.on('error', () => { if (!destroyed) scheduleReconnect() })
        })
        guestPeer.on('error', () => { if (!destroyed) scheduleReconnect() })
        return
      }

      const hostPeer = new Peer(roomCode, { ...config })
      peerRef.current = hostPeer
      hostPeer.on('open', () => { if (!destroyed) { setRole('host'); setStatus('waiting') } })
      hostPeer.on('connection', (conn) => {
        if (destroyed) return
        conn.on('open', () => { if (!destroyed) { setStatus('connected'); wireConn(conn) } })
      })
      hostPeer.on('error', (err) => {
        if (destroyed) return
        if (err.type === 'unavailable-id') { hostPeer.destroy(); retryCount = 1; connect() }
        else scheduleReconnect()
      })
    }

    connect()
    return () => {
      destroyed = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (peerRef.current) peerRef.current.destroy()
    }
  }, [roomCode])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!destination || !myLocation || !role) return
    const dist = getDistance(myLocation.lat, myLocation.lng, destination.lat, destination.lng)
    if (dist < 100) {
      setArrived(myName)
      sendArrived(myName)
    }
  }, [myLocation, destination, myName, role, sendArrived])

  useEffect(() => {
    if (!sharingUntil) return
    const expire = () => {
      if (watchRef.current) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
      setConsented(false)
      if (connRef.current?.open) connRef.current.send({ type: 'sharing-expired' })
    }
    const remaining = sharingUntil - Date.now()
    if (remaining <= 0) { expire(); return }
    const timer = setTimeout(expire, remaining)
    return () => clearTimeout(timer)
  }, [sharingUntil])

  useEffect(() => {
    if (!arrived) return
    const timer = setTimeout(() => setArrived(null), 8000)
    return () => clearTimeout(timer)
  }, [arrived])

  useEffect(() => {
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(interval)
  }, [])

  const s = STATUS[status] || STATUS.error

  const showPeer = peerLocation && peerConsented
  const showMe = myLocation && consented

  return (
    <div className="h-screen w-full relative bg-black overflow-hidden">
      <MapView
        myLocation={showMe ? myLocation : null}
        participants={showPeer ? [{ id: 'peer', name: peerName, color: isHost ? '#22c55e' : '#f43f5e', location: peerLocation }] : []}
        pois={pois} myName={myName} myColor={isHost ? '#f43f5e' : '#22c55e'}
        trail={showMe ? trail : []} midpoint={(showMe && showPeer) ? midpoint : null}
        meetingPin={meetingPin} destination={destination} onMapClick={handleMapClick}
      />

      {/* Top bar */}
      <div className="absolute top-4 left-4 z-[10000] bg-white/95 backdrop-blur-md rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2.5">
        <div className={`w-2.5 h-2.5 rounded-full ${s.color} ${status === 'waiting' || status === 'connecting' ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-semibold text-gray-900 max-md:hidden">{s.text}</span>
        <span className="md:hidden text-xs font-semibold text-gray-900">{s.text}</span>
        {consented && sharingUntil && now > 0 && (
          <span className="text-[10px] text-gray-500 font-mono">{Math.max(0, Math.floor((sharingUntil - now) / 60000))}m</span>
        )}
        {typing && <span className="text-xs text-gray-500 animate-pulse">typing...</span>}
      </div>

      {/* Share / Stop sharing button */}
      <div className="absolute top-4 right-4 z-[10000] flex gap-2">
        {consented ? (
          <button onClick={handleStopSharing} className="bg-rose-500 text-white rounded-full px-4 md:px-5 py-2.5 shadow-xl text-sm font-semibold hover:bg-rose-600 transition flex items-center gap-2">
            <span>⏹ Stop Sharing</span>
          </button>
        ) : (
          <button onClick={() => setShowConsent(true)} className="bg-emerald-500 text-white rounded-full px-4 md:px-5 py-2.5 shadow-xl text-sm font-semibold hover:bg-emerald-600 transition flex items-center gap-2">
            <span>📍 Share Location</span>
          </button>
        )}
        <button onClick={nativeShare} className="bg-white/95 backdrop-blur-md rounded-full px-4 md:px-5 py-2.5 shadow-xl text-sm font-semibold text-gray-800 hover:bg-white transition flex items-center gap-2 border border-white/50">
          <span className="md:hidden">📤</span><span className="max-md:hidden">{copied ? '✅ Copied!' : '📤 Share Link'}</span>
        </button>
      </div>

      {/* Chat button */}
      <button onClick={handleChatOpen} className={`absolute bottom-6 right-4 z-[10000] rounded-full w-14 h-14 shadow-xl flex items-center justify-center text-xl transition border-2 ${unreadCount > 0 ? 'bg-rose-500 border-rose-400 animate-pulse shadow-rose-400/50' : 'bg-white/95 backdrop-blur-md border-white/50 hover:bg-white'}`}>
        💬
        {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-amber-400 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {/* Drop Pin button */}
      <button
        onClick={() => setDropPinMode(!dropPinMode)}
        className={`absolute bottom-6 left-4 z-[10000] rounded-full w-14 h-14 shadow-xl flex items-center justify-center text-lg transition border-2 ${
          dropPinMode ? 'bg-amber-500 border-amber-400 shadow-amber-400/50 scale-110' : 'bg-white/95 backdrop-blur-md border-white/50 hover:bg-white'
        }`}
        title={dropPinMode ? 'Tap the map to place pin' : 'Drop a meeting pin'}
      >
        📍
      </button>

      {/* Destination button */}
      <button
        onClick={() => setSetDestMode(!setDestMode)}
        className={`absolute bottom-24 left-4 z-[10000] rounded-full w-14 h-14 shadow-xl flex items-center justify-center text-lg transition border-2 ${
          setDestMode ? 'bg-emerald-500 border-emerald-400 shadow-emerald-400/50 scale-110' : destination ? 'bg-emerald-100 border-emerald-300' : 'bg-white/95 backdrop-blur-md border-white/50 hover:bg-white'
        }`}
        title={setDestMode ? 'Tap the map to set destination' : destination ? 'Destination set' : 'Set destination'}
      >
        🎯
      </button>

      {/* Consent sheet */}
      {showConsent && !consented && (
        <div className="absolute inset-0 z-[20000] bg-black/50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-rose-100 to-purple-100 rounded-2xl mb-4">
              <span className="text-3xl">📍</span>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-1">
              Share your location
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {peerConsented
                ? `${peerName} is already sharing their location with you. Share yours to meet up!`
                : `Share your live location with ${peerName} so you can find each other.`}
            </p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="text-xs text-gray-400 font-semibold tracking-wider uppercase">Share for</span>
              <div className="flex gap-1.5">
                {[{ val: 0, label: '∞' }, { val: 1, label: '1h' }, { val: 8, label: '8h' }].map((opt) => (
                  <button key={opt.val} onClick={() => setSharingDuration(opt.val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${sharingDuration === opt.val ? 'bg-purple-400 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{opt.label}</button>
                ))}
              </div>
            </div>
            <button onClick={handleShareLocation} className="w-full bg-gradient-to-r from-rose-400 to-purple-400 hover:from-rose-500 hover:to-purple-500 text-white font-semibold py-3 px-6 rounded-xl transition shadow-lg shadow-purple-300/30 mb-2">
              Share My Location
            </button>
            {peerConsented && (
              <button onClick={() => setShowConsent(false)} className="text-sm text-gray-500 font-medium hover:text-gray-700 transition">
                Just watch {peerName}'s location
              </button>
            )}
          </div>
        </div>
      )}

      {/* Arrival toast */}
      {arrived && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[15000] bg-emerald-500 text-white rounded-2xl px-5 py-3 shadow-2xl shadow-emerald-500/30 animate-bounce text-center">
          <div className="font-bold text-sm">🎉 {arrived} arrived at destination!</div>
          <div className="text-[10px] opacity-80 mt-0.5">Journey complete</div>
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
      {(showMe || showPeer) && (
        <div className="absolute bottom-0 md:bottom-6 left-0 md:left-4 right-0 md:right-4 z-[7000] md:max-w-md md:mx-auto text-shadow-sm" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="bg-white/98 md:bg-white/95 backdrop-blur-lg rounded-t-2xl md:rounded-2xl p-3 md:p-4 shadow-lg space-y-2 md:space-y-3">
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-0.5">
                  <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${consented ? (isHost ? 'bg-rose-400' : 'bg-emerald-400') : 'bg-gray-300'}`} />
                  <span className="text-[10px] text-gray-500 font-semibold tracking-wider uppercase">{isHost ? 'You' : hName}</span>
                </div>
                <div className="font-bold text-gray-900 text-base md:text-lg">{hName}</div>
                {showMe ? (
                  <div className="text-[10px] md:text-[11px] text-gray-500 mt-0.5 font-mono truncate">{myLocation.lat.toFixed(4)}, {myLocation.lng.toFixed(4)}</div>
                ) : <div className="text-[11px] text-gray-400 mt-0.5">{consented ? '⏳ Getting location...' : '📍 Not sharing'}</div>}
              </div>
              <div className="text-center border-l border-gray-300">
                <div className="flex items-center justify-center gap-1.5 mb-0.5">
                  <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${peerConsented ? (isHost ? 'bg-emerald-400' : 'bg-rose-400') : 'bg-gray-300'}`} />
                  <span className="text-[10px] text-gray-500 font-semibold tracking-wider uppercase">{isHost ? fName : 'You'}</span>
                </div>
                <div className="font-bold text-gray-900 text-base md:text-lg">{fName}</div>
                {showPeer ? (
                  <div className="text-[10px] md:text-[11px] text-gray-500 mt-0.5 font-mono truncate">{peerLocation.lat.toFixed(4)}, {peerLocation.lng.toFixed(4)}</div>
                ) : <div className="text-[11px] text-gray-400 mt-0.5">{peerConsented ? '⏳ Getting location...' : '📍 Not sharing'}</div>}
              </div>
            </div>

            {distance !== null && showMe && showPeer && (
              <div className="pt-2 md:pt-3 border-t border-gray-300 space-y-1.5 md:space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[11px] md:text-xs text-gray-500 font-medium">Distance</span>
                  <span className="font-bold text-gray-900 text-base md:text-lg">{distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`}</span>
                </div>
                <div className="flex items-center justify-center gap-3 md:gap-4 text-[11px] md:text-xs text-gray-600">
                  <span>🚶 {etaWalk} min</span>
                  <span>🚗 {etaDrive} min</span>
                </div>
                <div className="flex gap-2 justify-center">
                  {showPeer && (
                    <>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${peerLocation.lat},${peerLocation.lng}`} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] bg-blue-100 text-blue-700 rounded-full px-2.5 md:px-3 py-1.5 font-semibold hover:bg-blue-200 transition">Google Maps</a>
                      <a href={`https://maps.apple.com/?daddr=${peerLocation.lat},${peerLocation.lng}`} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] bg-gray-200 text-gray-700 rounded-full px-2.5 md:px-3 py-1.5 font-semibold hover:bg-gray-300 transition">Apple Maps</a>
                    </>
                  )}
                </div>
              </div>
            )}

            {destination && myLocation && (
              <div className="pt-2 md:pt-3 border-t border-gray-300 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-gray-500 font-semibold">
                  <span>🎯 Destination</span>
                  <button onClick={() => { setDestination(null); setArrived(null); if (connRef.current?.open) connRef.current.send({ type: 'destination', destination: null }) }} className="text-rose-500 hover:text-rose-700 font-semibold">Clear</button>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="font-bold text-gray-900 text-sm">
                    {getDistance(myLocation.lat, myLocation.lng, destination.lat, destination.lng) < 1000
                      ? `${Math.round(getDistance(myLocation.lat, myLocation.lng, destination.lat, destination.lng))} m away`
                      : `${(getDistance(myLocation.lat, myLocation.lng, destination.lat, destination.lng) / 1000).toFixed(2)} km away`}
                  </span>
                </div>
                <div className="flex gap-2 justify-center">
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] bg-blue-100 text-blue-700 rounded-full px-2.5 md:px-3 py-1.5 font-semibold hover:bg-blue-200 transition">Navigate</a>
                </div>
              </div>
            )}

            {pois.length > 0 && (
              <div className="pt-2 md:pt-3 border-t border-gray-300">
                <div className="text-[10px] text-gray-500 font-semibold mb-1.5">Nearby</div>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(pois.map((p) => p.type))].slice(0, 8).map((t) => (
                    <span key={t} className="bg-gray-200 text-gray-700 rounded-full px-2 py-1 text-[10px] font-semibold">{t.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
