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
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

export default function FleetMap({
  deliveries = [],
  focusId = null,
  isFullscreen = false,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const itemsRef = useRef({ markers: new Map(), polylines: new Map() })
  const hasFittedBoundsRef = useRef(false)
  const prevFocusIdRef = useRef(focusId)
  const prevCountRef = useRef(deliveries.length)

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

    const defaultCenter = [7.6094, 124.9883]
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(defaultCenter, 13)

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
      itemsRef.current = { markers: new Map(), polylines: new Map() }
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    const bounds = []
    const currentCustKeys = new Set()
    const currentRiderKeys = new Set()
    const currentRouteKeys = new Set()
    const { markers, polylines } = itemsRef.current

    deliveries.forEach((d) => {
      const dest = toLatLng(d.destination)
      const rider = toLatLng(d.rider)
      const route = Array.isArray(d.route) ? d.route.map(toLatLng).filter(Boolean) : []

      // 1. Customer Marker (Blue)
      if (dest) {
        bounds.push(dest)
        const custKey = `cust_${d.db_id}`
        currentCustKeys.add(custKey)
        const custPopup = `<strong>${d.order_id || ''}</strong><br/>${d.customer || 'Customer'}`
        if (markers.has(custKey)) {
          const m = markers.get(custKey)
          m.setLatLng(dest)
          m.setPopupContent(custPopup)
        } else {
          const m = L.marker(dest, { icon: markerIcon('customer') })
            .bindPopup(custPopup)
            .addTo(layer)
          markers.set(custKey, m)
        }
      }

      // 2. Rider Marker (Green) - only when rider location actually exists
      if (rider) {
        bounds.push(rider)
        const riderKey = `rider_${d.db_id}`
        currentRiderKeys.add(riderKey)
        const riderPopup = `<strong>${d.driver || 'Rider'}</strong><br/>${d.status || ''}`
        if (markers.has(riderKey)) {
          const m = markers.get(riderKey)
          m.setLatLng(rider)
          m.setPopupContent(riderPopup)
        } else {
          const m = L.marker(rider, { icon: markerIcon('rider') })
            .bindPopup(riderPopup)
            .addTo(layer)
          markers.set(riderKey, m)
        }
      }

      // 3. Delivery Route (Orange) - only when a valid route exists
      if (route.length >= 2) {
        const routeKey = `route_${d.db_id}`
        currentRouteKeys.add(routeKey)
        if (polylines.has(routeKey)) {
          polylines.get(routeKey).setLatLngs(route)
        } else {
          const poly = L.polyline(route, {
            color: '#F97000',
            weight: 4,
            opacity: 0.9,
            lineJoin: 'round',
          }).addTo(layer)
          polylines.set(routeKey, poly)
        }
        route.forEach((c) => bounds.push(c))
      }
    })

    // Prune stale markers and polylines that are no longer active
    markers.forEach((markerInstance, key) => {
      const isCust = key.startsWith('cust_')
      const isRider = key.startsWith('rider_')
      if ((isCust && !currentCustKeys.has(key)) || (isRider && !currentRiderKeys.has(key))) {
        layer.removeLayer(markerInstance)
        markers.delete(key)
      }
    })

    polylines.forEach((polyInstance, key) => {
      if (!currentRouteKeys.has(key)) {
        layer.removeLayer(polyInstance)
        polylines.delete(key)
      }
    })

    // Viewport camera logic: only fit bounds when needed, no jarring resets
    const shouldFit =
      !hasFittedBoundsRef.current ||
      prevFocusIdRef.current !== focusId ||
      prevCountRef.current !== deliveries.length

    prevFocusIdRef.current = focusId
    prevCountRef.current = deliveries.length

    if (shouldFit) {
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
          hasFittedBoundsRef.current = true
          return
        }
      }

      if (bounds.length >= 2) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
        hasFittedBoundsRef.current = true
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14)
        hasFittedBoundsRef.current = true
      } else if (deliveries.length === 0 && !hasFittedBoundsRef.current) {
        map.setView([7.6094, 124.9883], 13)
      }
    }
  }, [deliveries, focusId])

  return (
    <div className={`fm-map${isFullscreen ? ' fm-fullscreen' : ''}`} ref={containerRef}>
      {deliveries.length === 0 && (
        <div className="fm-empty-badge">
          No active deliveries on the road
        </div>
      )}
    </div>
  )
}
