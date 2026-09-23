import { memo, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './FleetMap.css'

/**
 * PROMPT 38 DIAGNOSTIC REPORT:
 * 1. Re-render Cause Investigation:
 *    - setState on the map instance itself: Not called. The map instance is stored in `mapRef.current`.
 *    - map.remove() followed by re-initialization: Only occurs when <FleetMap> unmounts. However, broad
 *      re-renders in the parent <DispatchManagement> previously caused recreation of DOM structures.
 *    - map.setView() / map.flyTo() called unconditionally: In the previous code (lines 293-303), when
 *      `deliveries.length === 0`, `map.setView([7.6094, 124.9883], 13)` was called, but `hasInitializedViewRef`
 *      was never marked true. Consequently, every 10-second polling tick repeatedly re-centered the map back
 *      to default coordinates, snapping user panning/zooming.
 *    - Marker and Polyline storage (useRef vs useState): Markers and polylines were managed in a generic
 *      Map ref and iteratively pruned and re-added. Dedicated singular refs (`riderMarkerRef`, `customerMarkerRef`,
 *      `routePolylineRef`) were missing.
 *
 * 2. In-Place Polling Architecture (Prompt 38 Fix):
 *    - Dedicated refs: `mapRef`, `riderMarkerRef`, `customerMarkerRef`, and `routePolylineRef`.
 *    - In-place updates: On each poll tick, existing instances are mutated in place via `.setLatLng()`
 *      and `.setLatLngs()` without removing/recreating markers or polylines.
 *    - Camera positioning: The initial view is set once on initial mount. Bounds/view are only adjusted
 *      when transitioning from 0 to 1 active delivery for the first time, or when the user explicitly clicks
 *      a delivery row (`focusId`). Routine poll ticks NEVER call map.setView(), map.flyTo(), or map.fitBounds().
 *    - Zero active deliveries: When deliveries count is 0, markers are cleanly detached from the layer,
 *      and the map stays completely visually still at its current coordinates and zoom level.
 *    - Memoization: <FleetMap> is exported with React.memo to prevent unnecessary container reconciliations.
 */

function toLatLng(point) {
  if (!point) return null
  if (Array.isArray(point) && point.length >= 2) {
    const lat = Number(point[0])
    const lng = Number(point[1])
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng]
    return null
  }
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

async function fetchRoadRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Routing API HTTP error: ${res.status}`)
    }
    const data = await res.json()
    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
    }
    throw new Error(`Routing API response code: ${data.code || 'No route found'}`)
  } catch (err) {
    console.error('Failed to fetch road route via routing API:', err)
    return [from, to] // Fallback gracefully to straight line
  }
}

function FleetMap({
  deliveries = [],
  focusId = null,
  isFullscreen = false,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const riderMarkerRef = useRef(null)
  const customerMarkerRef = useRef(null)
  const routePolylineRef = useRef(null)
  const fetchedRoutesRef = useRef(new Map())
  const hasInitializedViewRef = useRef(false)
  const prevCountRef = useRef(0)
  const prevFocusIdRef = useRef(focusId)

  // Handle container resizing (e.g. fullscreen toggle or modal opening)
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

  // Initialize Leaflet Map Instance Once on Mount
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

    const layer = L.layerGroup().addTo(map)
    layerRef.current = layer
    mapRef.current = map
    hasInitializedViewRef.current = true

    const resize = () => map.invalidateSize()
    setTimeout(resize, 80)
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      map.remove()
      mapRef.current = null
      layerRef.current = null
      riderMarkerRef.current = null
      customerMarkerRef.current = null
      routePolylineRef.current = null
      fetchedRoutesRef.current.clear()
      hasInitializedViewRef.current = false
      prevCountRef.current = 0
    }
  }, [])

  // Smooth polling updates: update positions in place via .setLatLng() & .setLatLngs() on dedicated refs
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    const focused = focusId
      ? deliveries.find((d) => String(d.db_id) === String(focusId))
      : null
    const active = focused || deliveries[0]

    if (active) {
      const dest = toLatLng(active.destination)
      const rider = toLatLng(active.rider)

      // 1. Customer Marker: update in place via setLatLng
      if (dest) {
        const custPopup = `<strong>${active.order_id || ''}</strong><br/>${active.customer || 'Customer'}`
        if (customerMarkerRef.current) {
          customerMarkerRef.current.setLatLng(dest)
          customerMarkerRef.current.setPopupContent(custPopup)
        } else {
          customerMarkerRef.current = L.marker(dest, { icon: markerIcon('customer') })
            .bindPopup(custPopup)
            .addTo(layer)
        }
      } else if (customerMarkerRef.current) {
        layer.removeLayer(customerMarkerRef.current)
        customerMarkerRef.current = null
      }

      // 2. Rider Marker: update in place via setLatLng
      if (rider) {
        const riderPopup = `<strong>${active.driver || 'Rider'}</strong><br/>${active.status || ''}`
        if (riderMarkerRef.current) {
          riderMarkerRef.current.setLatLng(rider)
          riderMarkerRef.current.setPopupContent(riderPopup)
        } else {
          riderMarkerRef.current = L.marker(rider, { icon: markerIcon('rider') })
            .bindPopup(riderPopup)
            .addTo(layer)
        }
      } else if (riderMarkerRef.current) {
        layer.removeLayer(riderMarkerRef.current)
        riderMarkerRef.current = null
      }

      // 3. Delivery Route Polyline: update in place via setLatLngs
      const parsedBackendRoute = Array.isArray(active.route)
        ? active.route.map(toLatLng).filter(Boolean)
        : []
      const currentRoute = parsedBackendRoute.length >= 2
        ? parsedBackendRoute
        : (rider && dest ? [rider, dest] : [])

      if (currentRoute.length >= 2) {
        if (routePolylineRef.current) {
          routePolylineRef.current.setLatLngs(currentRoute)
        } else {
          routePolylineRef.current = L.polyline(currentRoute, {
            color: '#F97000',
            weight: 4,
            opacity: 0.9,
            lineJoin: 'round',
          }).addTo(layer)
        }

        // Fetch road route asynchronously if backend only provided endpoints
        if (parsedBackendRoute.length < 2 && rider && dest) {
          const cacheKey = `${active.db_id}_${rider[0].toFixed(5)},${rider[1].toFixed(5)}_${dest[0].toFixed(5)},${dest[1].toFixed(5)}`
          if (fetchedRoutesRef.current.has(cacheKey)) {
            const cached = fetchedRoutesRef.current.get(cacheKey)
            if (cached && routePolylineRef.current) {
              routePolylineRef.current.setLatLngs(cached)
            }
          } else {
            fetchRoadRoute(rider, dest)
              .then((roadPts) => {
                if (roadPts && roadPts.length >= 2) {
                  fetchedRoutesRef.current.set(cacheKey, roadPts)
                  if (routePolylineRef.current) {
                    routePolylineRef.current.setLatLngs(roadPts)
                  }
                }
              })
              .catch((err) => {
                console.error('Failed to fetch road route via routing API:', err)
                if (routePolylineRef.current) {
                  routePolylineRef.current.setLatLngs([rider, dest])
                }
              })
          }
        }
      } else if (routePolylineRef.current) {
        layer.removeLayer(routePolylineRef.current)
        routePolylineRef.current = null
      }

      // 4. Viewport Camera: Only adjust on user focus change or transition from 0 to 1 active delivery
      if (focusId && focusId !== prevFocusIdRef.current) {
        prevFocusIdRef.current = focusId
        const pts = [dest, rider].filter(Boolean)
        if (pts.length >= 2) {
          map.fitBounds(pts, { padding: [48, 48], maxZoom: 15 })
        } else if (pts.length === 1) {
          map.setView(pts[0], 15)
        }
      } else if (prevCountRef.current === 0 && deliveries.length > 0) {
        // Transition from 0 active deliveries to 1 active delivery for the first time
        const pts = [dest, rider].filter(Boolean)
        if (pts.length >= 2) {
          map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 })
        } else if (pts.length === 1) {
          map.setView(pts[0], 14)
        }
      }
      // Routine poll ticks DO NOT call map.setView(), map.flyTo(), or map.fitBounds()
    } else {
      // When there are no active deliveries:
      // Clean up markers and polyline without moving or re-centering the map
      if (customerMarkerRef.current) {
        layer.removeLayer(customerMarkerRef.current)
        customerMarkerRef.current = null
      }
      if (riderMarkerRef.current) {
        layer.removeLayer(riderMarkerRef.current)
        riderMarkerRef.current = null
      }
      if (routePolylineRef.current) {
        layer.removeLayer(routePolylineRef.current)
        routePolylineRef.current = null
      }
      // Map stays visually still at its current position! Never reset view on 0 deliveries tick.
    }

    prevCountRef.current = deliveries.length
    prevFocusIdRef.current = focusId
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

export default memo(FleetMap)
