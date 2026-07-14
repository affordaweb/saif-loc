'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'

const POI_ICONS = {
  cafe: '☕', restaurant: '🍽️', fast_food: '🍔', pub: '🍺',
  supermarket: '🛒', convenience: '🏪', mall: '🏬', pharmacy: '💊',
  atm: '🏧', bank: '🏦', fuel: '⛽', bakery: '🥐',
  clothes: '👕', electronics: '📱', default: '📍',
}

function poiLabelIcon(type, name) {
  const emoji = POI_ICONS[type] || POI_ICONS.default
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;gap:4px;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.3);border-radius:20px;padding:3px 10px 3px 6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;white-space:nowrap;"><span style="font-size:12px;">${emoji}</span><span style="color:white;font-size:10px;font-weight:500;">${name}</span></div>`,
    className: '', iconSize: [0, 0], iconAnchor: [0, 0],
  })
}

function avatarIcon(name, color) {
  const url = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${color.replace('#', '')}&color=fff&size=80&rounded=true&bold=true`
  return L.divIcon({
    html: `<div class="marker-pulse" style="width:44px;height:44px;border-radius:50%;border:3px solid white;overflow:hidden;box-shadow:0 3px 12px rgba(0,0,0,0.4);background:${color};display:flex;align-items:center;justify-content:center;"><img src="${url}" alt="${name}" style="width:44px;height:44px;border-radius:50%;" /></div>`,
    className: '', iconSize: [44, 44], iconAnchor: [22, 22],
  })
}

function midpointIcon() {
  return L.divIcon({
    html: `<div style="width:32px;height:32px;background:gold;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 10px rgba(0,0,0,0.4);">⭐</div>`,
    className: '', iconSize: [32, 32], iconAnchor: [16, 16],
  })
}

function meetingPinIcon(emoji = '📍') {
  return L.divIcon({
    html: `<div style="width:36px;height:36px;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);border:2px solid #f59e0b;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 10px rgba(0,0,0,0.4);transform:rotate(0);">${emoji}</div>`,
    className: '', iconSize: [36, 36], iconAnchor: [18, 18],
  })
}

export default function MapView({
  myLocation, peerLocation, myLabel, peerLabel, myColor, peerColor,
  pois, myName, peerName, trail, midpoint, meetingPin, onMapClick,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const initializedRef = useRef(false)
  const myMarkerRef = useRef(null)
  const peerMarkerRef = useRef(null)
  const myCircleRef = useRef(null)
  const lineRef = useRef(null)
  const poiLayerRef = useRef(null)
  const trailRef = useRef(null)
  const midpointRef = useRef(null)
  const meetingPinRef = useRef(null)
  const clickHandlerRef = useRef(null)
  const styleRef = useRef(null)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const map = L.map(containerRef.current, {
      zoomControl: false, attributionControl: false,
    }).setView([20, 0], 2)

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    ).addTo(map)

    map.on('click', (e) => {
      if (onMapClick) onMapClick(e.latlng)
    })

    mapRef.current = map
    map.invalidateSize()

    return () => { map.remove(); mapRef.current = null; initializedRef.current = false }
  }, [])

  // Update map click handler reference
  useEffect(() => {
    clickHandlerRef.current = onMapClick
    if (mapRef.current) {
      mapRef.current.off('click')
      mapRef.current.on('click', (e) => {
        if (clickHandlerRef.current) clickHandlerRef.current(e.latlng)
      })
    }
  }, [onMapClick])

  useEffect(() => {
    if (styleRef.current) return
    styleRef.current = document.createElement('style')
    styleRef.current.textContent = `
      @keyframes markerPulse {
        0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.6), 0 3px 12px rgba(0,0,0,0.4); }
        50% { box-shadow: 0 0 0 18px rgba(255,255,255,0), 0 3px 12px rgba(0,0,0,0.4); }
        100% { box-shadow: 0 0 0 0 rgba(255,255,255,0), 0 3px 12px rgba(0,0,0,0.4); }
      }
      .marker-pulse { animation: markerPulse 2s ease-in-out infinite; }
    `
    document.head.appendChild(styleRef.current)
    return () => { if (styleRef.current) styleRef.current.remove() }
  }, [])

  // My marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !myLocation) return
    const latlng = [myLocation.lat, myLocation.lng]

    if (myMarkerRef.current) myMarkerRef.current.setLatLng(latlng)
    else {
      const icon = avatarIcon(myName, myColor)
      myMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map)
    }

    if (myCircleRef.current) myCircleRef.current.setLatLng(latlng)
    else if (myLocation.accuracy) {
      myCircleRef.current = L.circle(latlng, {
        radius: myLocation.accuracy, color: myColor, fillColor: myColor,
        fillOpacity: 0.08, weight: 1.5, opacity: 0.4,
      }).addTo(map)
    }

    if (peerLocation) {
      const b = L.latLngBounds(latlng, [peerLocation.lat, peerLocation.lng])
      map.fitBounds(b, { padding: [70, 70], maxZoom: 16 })
    } else map.setView(latlng, 15)
  }, [myLocation, myColor, myName, peerLocation])

  // Peer marker + line
  useEffect(() => {
    const map = mapRef.current
    if (!map || !peerLocation) return
    const latlng = [peerLocation.lat, peerLocation.lng]

    if (peerMarkerRef.current) peerMarkerRef.current.setLatLng(latlng)
    else {
      const icon = avatarIcon(peerName, peerColor)
      peerMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 999 }).addTo(map)
    }

    if (myLocation) {
      const myLatlng = [myLocation.lat, myLocation.lng]
      const b = L.latLngBounds(myLatlng, latlng)
      map.fitBounds(b, { padding: [70, 70], maxZoom: 16 })
      if (lineRef.current) lineRef.current.setLatLngs([myLatlng, latlng])
      else {
        lineRef.current = L.polyline([myLatlng, latlng], {
          color: '#ffffff', weight: 2, opacity: 0.5, dashArray: '8, 8',
        }).addTo(map)
      }
    }
  }, [peerLocation, peerColor, peerName, myLocation])

  // POIs
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (poiLayerRef.current) poiLayerRef.current.clearLayers()
    else poiLayerRef.current = L.layerGroup().addTo(map)
    if (!pois || pois.length === 0) return
    pois.forEach((poi) => {
      L.marker([poi.lat, poi.lng], { icon: poiLabelIcon(poi.type, poi.name) }).addTo(poiLayerRef.current)
    })
  }, [pois])

  // Trail
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (trailRef.current) trailRef.current.setLatLngs(trail || [])
    else if (trail && trail.length > 1) {
      trailRef.current = L.polyline(trail.map(t => [t.lat, t.lng]), {
        color: myColor, weight: 3, opacity: 0.4, dashArray: '6, 8',
      }).addTo(map)
    }
  }, [trail, myColor])

  // Midpoint
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (midpointRef.current) { map.removeLayer(midpointRef.current); midpointRef.current = null }
    if (midpoint) {
      midpointRef.current = L.marker([midpoint.lat, midpoint.lng], {
        icon: midpointIcon(), zIndexOffset: 1100,
      }).addTo(map).bindPopup('⭐ Meeting midpoint')
    }
  }, [midpoint])

  // Meeting pin
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (meetingPinRef.current) { map.removeLayer(meetingPinRef.current); meetingPinRef.current = null }
    if (meetingPin) {
      meetingPinRef.current = L.marker([meetingPin.lat, meetingPin.lng], {
        icon: meetingPinIcon(), zIndexOffset: 1100,
      }).addTo(map).bindPopup(`📍 Meeting spot`)
    }
  }, [meetingPin])

  return <div ref={containerRef} className="w-full h-full" />
}
