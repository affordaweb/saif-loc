'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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

export default function MapView({ myLocation, peerLocation, myLabel, peerLabel, myColor, peerColor, pois, myName, peerName }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const initializedRef = useRef(false)
  const myMarkerRef = useRef(null)
  const peerMarkerRef = useRef(null)
  const myCircleRef = useRef(null)
  const lineRef = useRef(null)
  const poiLayerRef = useRef(null)
  const styleRef = useRef(null)

  useEffect(() => {
    if (initializedRef.current || !myLocation) return
    initializedRef.current = true

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([myLocation.lat, myLocation.lng], 15)

    mapRef.current = map

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    ).addTo(map)

    // Fix mobile rendering
    setTimeout(() => map.invalidateSize(), 300)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [myLocation])

  // Inject pulsing animation CSS
  useEffect(() => {
    if (styleRef.current) return
    styleRef.current = document.createElement('style')
    styleRef.current.textContent = `
      @keyframes markerPulse {
        0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.6), 0 3px 12px rgba(0,0,0,0.4); }
        50% { box-shadow: 0 0 0 18px rgba(255,255,255,0), 0 3px 12px rgba(0,0,0,0.4); }
        100% { box-shadow: 0 0 0 0 rgba(255,255,255,0), 0 3px 12px rgba(0,0,0,0.4); }
      }
      .marker-pulse {
        animation: markerPulse 2s ease-in-out infinite;
      }
    `
    document.head.appendChild(styleRef.current)
    return () => {
      if (styleRef.current) styleRef.current.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !myLocation) return

    const latlng = [myLocation.lat, myLocation.lng]

    if (myMarkerRef.current) {
      myMarkerRef.current.setLatLng(latlng)
    } else {
      const icon = avatarIcon(myName, myColor)
      myMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map)
    }

    if (myCircleRef.current) {
      myCircleRef.current.setLatLng(latlng)
    } else if (myLocation.accuracy) {
      myCircleRef.current = L.circle(latlng, {
        radius: myLocation.accuracy, color: myColor, fillColor: myColor,
        fillOpacity: 0.08, weight: 1.5, opacity: 0.4,
      }).addTo(map)
    }

    if (peerLocation) {
      const peerLatlng = [peerLocation.lat, peerLocation.lng]
      const bounds = L.latLngBounds(latlng, peerLatlng)
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16 })
    } else {
      map.setView(latlng, 15)
    }
  }, [myLocation, myColor, myName, peerLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !peerLocation) return

    const latlng = [peerLocation.lat, peerLocation.lng]

    if (peerMarkerRef.current) {
      peerMarkerRef.current.setLatLng(latlng)
    } else {
      const icon = avatarIcon(peerName, peerColor)
      peerMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 999 }).addTo(map)
    }

    if (myLocation) {
      const myLatlng = [myLocation.lat, myLocation.lng]
      const bounds = L.latLngBounds(myLatlng, latlng)
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16 })

      if (lineRef.current) {
        lineRef.current.setLatLngs([myLatlng, latlng])
      } else {
        lineRef.current = L.polyline([myLatlng, latlng], {
          color: '#ffffff', weight: 2, opacity: 0.5, dashArray: '8, 8',
        }).addTo(map)
      }
    }
  }, [peerLocation, peerColor, peerName, myLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (poiLayerRef.current) poiLayerRef.current.clearLayers()
    else poiLayerRef.current = L.layerGroup().addTo(map)

    if (!pois || pois.length === 0) return

    pois.forEach((poi) => {
      const icon = poiLabelIcon(poi.type, poi.name)
      L.marker([poi.lat, poi.lng], { icon }).addTo(poiLayerRef.current)
    })
  }, [pois])

  return <div ref={containerRef} className="w-full h-full" />
}
