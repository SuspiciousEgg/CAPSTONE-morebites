import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './FleetMap.css'

function toLatLng(point) {
  if (!point) return null
  const lat = Number(point.latitude ?? point.lat)
  const lng = Number(point.longitude ?? point.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return [lat, lng]
}

function markerIcon(kind) {
  return L.divIcon({
    className: `fm-marker fm-marker-${kind}`,
    iconSize: kind === 'store' ? [14, 14] : [26, 26],
    iconAnchor: kind === 'store' ? [7, 7] : [13, 13],
  })
}

export default function FleetMap({
  store,
  deliveries = [],
  focusId = null,
  isFullscreen = false,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    map.invalidateSize()
    const t1 = setTimeout(() => map.invalidateSize(), 50)
    const t2 = setTimeout(() => map.invalidateSize(), 150)
    const t3 = setTimeout(() => map.invalidateSize(), 300)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [isFullscreen])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const center = toLatLng(store) || [7.6094, 124.9883]
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(center, 13)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    const resize = () => map.invalidateSize()
    setTimeout(resize, 80)
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [store])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    const bounds = []

    const storeLL = toLatLng(store)
    if (storeLL) {
      bounds.push(storeLL)
      L.marker(storeLL, { icon: markerIcon('store') })
        .bindPopup('MoreBites Store')
        .addTo(layer)
    }

    deliveries.forEach((d) => {
      const dest = toLatLng(d.destination)
      const rider = toLatLng(d.rider)
      const route = Array.isArray(d.route)
        ? d.route.map(toLatLng).filter(Boolean)
        : []

      if (route.length >= 2) {
        L.polyline(route, {
          color: '#2F7DE0',
          weight: 4,
          opacity: 0.85,
        }).addTo(layer)
        route.forEach((c) => bounds.push(c))
      }

      if (dest) {
        bounds.push(dest)
        L.marker(dest, { icon: markerIcon('customer') })
          .bindPopup(`<strong>${d.order_id || ''}</strong><br/>${d.customer || 'Customer'}`)
          .addTo(layer)
      }

      if (rider) {
        bounds.push(rider)
        L.marker(rider, { icon: markerIcon('rider') })
          .bindPopup(`<strong>${d.driver || 'Rider'}</strong><br/>${d.status || ''}`)
          .addTo(layer)
      }
    })

    const focus = deliveries.find((d) => String(d.db_id) === String(focusId))
    if (focus) {
      const focusPts = [
        ...(Array.isArray(focus.route) ? focus.route : []),
        focus.rider,
        focus.destination,
      ]
        .map(toLatLng)
        .filter(Boolean)
      if (focusPts.length) {
        map.fitBounds(focusPts, { padding: [48, 48], maxZoom: 15 })
        return
      }
    }

    if (bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14)
    }

    setTimeout(() => map.invalidateSize(), 50)
  }, [deliveries, store, focusId])

  return <div className={`fm-map${isFullscreen ? ' fm-fullscreen' : ''}`} ref={containerRef} />
}
