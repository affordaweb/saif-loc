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

const STATUS = {
  initializing: { color: 'bg-gray-400', text: 'Initializing...' },
  waiting: { color: 'bg-amber-500', text: 'Waiting for friend...' },
  connecting: { color: 'bg-blue-500 animate-pulse', text: 'Connecting...' },
  connected: { color: 'bg-green-500', text: 'Connected' },
  disconnected: { color: 'bg-red-500', text: 'Friend left' },
  'no-gps': { color: 'bg-red-500', text: 'Enable location access' },
  'gps-error': { color: 'bg-red-500', text: 'Could not get location' },
  error: { color: 'bg-red-500', text: 'Connection failed' },
}

export default function RoomPage() {
  const { id: roomId } = useParams()
  const peerRef = useRef(null)
  const connRef = useRef(null)
  const watchRef = useRef(null)
  const myLocationRef = useRef(null)
  const [myLocation, setMyLocation] = useState(null)
  const [peerLocation, setPeerLocation] = useState(null)
  const [status, setStatus] = useState('initializing')
  const [role, setRole] = useState(null)
  const [copied, setCopied] = useState(false)

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/r/${roomId}`
    : ''

  const sendLocation = useCallback((loc) => {
    if (connRef.current?.open) {
      connRef.current.send({ type: 'location', location: loc })
    }
  }, [])

  // Start watching location immediately on mount, regardless of connection
  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('no-gps')
      return
    }

    const success = (pos) => {
      const loc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 50,
      }
      myLocationRef.current = loc
      setMyLocation(loc)
      sendLocation(loc)
    }

    const err = () => {
      setStatus('gps-error')
    }

    navigator.geolocation.getCurrentPosition(success, err, {
      enableHighAccuracy: true,
      timeout: 10000,
    })

    watchRef.current = navigator.geolocation.watchPosition(success, err, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 5000,
    })

    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
    }
  }, [sendLocation])

  useEffect(() => {
    let destroyed = false

    const init = () => {
      const hostPeer = new Peer(roomId, { debug: 0 })
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

        conn.on('data', (data) => {
          if (data.type === 'location') {
            setPeerLocation(data.location)
          }
        })

        conn.on('close', () => {
          setStatus('disconnected')
          setPeerLocation(null)
        })

        // Send current location immediately if we already have it
        if (myLocationRef.current) {
          conn.send({ type: 'location', location: myLocationRef.current })
        }
      })

      hostPeer.on('error', (err) => {
        if (destroyed) return
        if (err.type === 'unavailable-id') {
          hostPeer.destroy()
          joinAsGuest()
        } else {
          setStatus('error')
        }
      })
    }

    const joinAsGuest = () => {
      const guestPeer = new Peer()
      peerRef.current = guestPeer

      guestPeer.on('open', () => {
        if (destroyed) return
        setRole('guest')
        setStatus('connecting')

        const conn = guestPeer.connect(roomId, { reliable: true })
        connRef.current = conn

        conn.on('open', () => {
          if (destroyed) return
          setStatus('connected')

          conn.on('data', (data) => {
            if (data.type === 'location') {
              setPeerLocation(data.location)
            }
          })

          conn.on('close', () => {
            setStatus('disconnected')
            setPeerLocation(null)
          })

          // Send current location immediately if we already have it
          if (myLocationRef.current) {
            conn.send({ type: 'location', location: myLocationRef.current })
          }
        })

        conn.on('error', () => {
          setStatus('error')
        })
      })

      guestPeer.on('error', () => {
        setStatus('error')
      })
    }

    init()

    return () => {
      destroyed = true
      if (peerRef.current) peerRef.current.destroy()
    }
  }, [roomId, sendLocation])

  const s = STATUS[status] || STATUS.error

  const distance =
    myLocation && peerLocation
      ? getDistance(myLocation.lat, myLocation.lng, peerLocation.lat, peerLocation.lng)
      : null

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isSaif = role === 'host'

  return (
    <div className="h-screen w-full relative bg-black overflow-hidden">
      <MapView
        myLocation={myLocation}
        peerLocation={peerLocation}
        myLabel={isSaif ? 'S' : 'F'}
        peerLabel={isSaif ? 'F' : 'S'}
        myColor={isSaif ? '#3b82f6' : '#22c55e'}
        peerColor={isSaif ? '#22c55e' : '#3b82f6'}
      />

      <div className="absolute inset-0 pointer-events-none">
        <div className="pointer-events-auto absolute top-4 left-4 right-4 flex items-center justify-between gap-2">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl px-4 py-2.5 shadow-lg flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
            <span className="text-sm font-medium text-gray-800">{s.text}</span>
          </div>
          <button
            onClick={copyLink}
            className="bg-white/90 backdrop-blur-md rounded-2xl px-4 py-2.5 shadow-lg text-sm font-medium text-gray-800 hover:bg-white transition flex items-center gap-1.5"
          >
            {copied ? '✅ Copied!' : '🔗 Share'}
          </button>
        </div>

        <div className="pointer-events-auto absolute bottom-6 left-4 right-4">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 shadow-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${isSaif ? 'bg-blue-500' : 'bg-green-500'}`} />
                  <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">
                    {isSaif ? 'You' : 'Saif'}
                  </span>
                </div>
                <div className="font-bold text-gray-900 text-lg">
                  {isSaif ? 'Saif' : 'Saif'}
                </div>
                {myLocation && isSaif ? (
                  <div className="text-[11px] text-gray-400 mt-0.5 font-mono">
                    {myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}
                  </div>
                ) : peerLocation && !isSaif ? (
                  <div className="text-[11px] text-gray-400 mt-0.5 font-mono">
                    {peerLocation.lat.toFixed(5)}, {peerLocation.lng.toFixed(5)}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-300 mt-0.5">⏳ Waiting...</div>
                )}
              </div>
              <div className="text-center border-l border-gray-200">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${isSaif ? 'bg-green-500' : 'bg-blue-500'}`} />
                  <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">
                    {isSaif ? 'Friend' : 'You'}
                  </span>
                </div>
                <div className="font-bold text-gray-900 text-lg">
                  {peerLocation ? 'Friend' : '—'}
                </div>
                {peerLocation && !isSaif ? (
                  <div className="text-[11px] text-gray-400 mt-0.5 font-mono">
                    {myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}
                  </div>
                ) : peerLocation && isSaif ? (
                  <div className="text-[11px] text-gray-400 mt-0.5 font-mono">
                    {peerLocation.lat.toFixed(5)}, {peerLocation.lng.toFixed(5)}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-300 mt-0.5">⏳ Waiting...</div>
                )}
              </div>
            </div>

            {distance !== null && (
              <div className="pt-3 border-t border-gray-200 flex items-center justify-center gap-2">
                <span className="text-xs text-gray-400">Distance</span>
                <span className="font-bold text-gray-900 text-lg">
                  {distance < 1000
                    ? `${Math.round(distance)} m`
                    : `${(distance / 1000).toFixed(2)} km`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
