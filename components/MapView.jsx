'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function MapView({ myLocation, peerLocation, myLabel, peerLabel, myColor, peerColor }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const myMarkerRef = useRef(null)
  const peerMarkerRef = useRef(null)
  const myCircleRef = useRef(null)
  const lineRef = useRef(null)

  useEffect(() => {
    if (mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([20, 0], 2)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !myLocation) return

    const latlng = [myLocation.lat, myLocation.lng]

    if (myMarkerRef.current) {
      myMarkerRef.current.setLatLng(latlng)
    } else {
      const icon = L.divIcon({
        html: `<div style="width:44px;height:44px;background:${myColor};border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:18px;box-shadow:0 3px 12px rgba(0,0,0,0.35);transition:transform 0.3s;">${myLabel}</div>`,
        className: '',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      })
      myMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map)
    }

    if (myCircleRef.current) {
      myCircleRef.current.setLatLng(latlng)
    } else if (myLocation.accuracy) {
      myCircleRef.current = L.circle(latlng, {
        radius: myLocation.accuracy,
        color: myColor,
        fillColor: myColor,
        fillOpacity: 0.08,
        weight: 1.5,
        opacity: 0.4,
      }).addTo(map)
    }

    if (peerLocation) {
      const peerLatlng = [peerLocation.lat, peerLocation.lng]
      const bounds = L.latLngBounds(latlng, peerLatlng)
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16 })
    } else {
      map.setView(latlng, 15)
    }
  }, [myLocation, myColor, myLabel, peerLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !peerLocation) return

    const latlng = [peerLocation.lat, peerLocation.lng]

    if (peerMarkerRef.current) {
      peerMarkerRef.current.setLatLng(latlng)
    } else {
      const icon = L.divIcon({
        html: `<div style="width:44px;height:44px;background:${peerColor};border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:18px;box-shadow:0 3px 12px rgba(0,0,0,0.35);">${peerLabel}</div>`,
        className: '',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      })
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
          color: '#ffffff',
          weight: 2,
          opacity: 0.5,
          dashArray: '8, 8',
        }).addTo(map)
      }
    }
  }, [peerLocation, peerColor, peerLabel, myLocation])

  return <div ref={containerRef} className="w-full h-full" />
}
