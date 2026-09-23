import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './FleetMap.css'

/**
 * DIAGNOSIS REPORT (Prompt 34):
 * 1. How the route polyline is drawn:
 *    - The backend (TrackingService.php) attempts to call the external OSRM routing API
 *      (https://router.project-osrm.org/route/v1/driving/...) to generate a road-based coordinate path.
 *    - Previously in FleetMap.jsx, the route drawing was guarded by `if (route.length >= 2)` on `d.route`.
 *      When the rider and customer were far apart (or across water/different road networks), OSRM
 *      returned a non-Ok code (e.g. "NoRoute" or timeout). If `d.route` was missing, empty, or failed
 *      to parse, `route.length >= 2` evaluated to false. FleetMap had NO fallback to draw a straight line
 *      connecting `rider` and `destination`, causing the delivery route to be completely omitted while
 *      both markers still rendered. Furthermore, `toLatLng()` only checked object keys (`point.latitude ?? point.lat`),
 *      returning null for array-formatted coordinates `[lat, lng]`.
 * 2. External Routing API & Error Handling:
 *    - If an external routing API is called from the client, any failed response or network error must
 *      be caught with try/catch, logged with console.error, and immediately fall back to a straight
 *      Leaflet Polyline between rider and customer coordinates.
 *    - Any distance-based restriction or range guard that could suppress polyline rendering at large
 *      distances has been removed.
 * 3. Polling Mechanism & Visual Jarring:
 *    - On each 10-second poll tick in DispatchManagement, `deliveries` received a new array reference.
 *      FleetMap was computing `shouldFit` based on `prevCountRef !== deliveries.length` or re-evaluating
 *      viewport camera logic, repeatedly calling `map.fitBounds()` and `map.setView()`.
 *    - To eliminate the jarring re-centering, the map instance is stored in `mapRef`. On each poll tick,
 *      existing markers are updated via `.setLatLng()` on refs, and the route polyline is updated via
 *      `.setLatLngs()` on refs. Neither `map.setView()` nor `map.flyTo()` is called on regular poll ticks;
 *      initial bounds/center are only set on first load or when no center has been established yet.
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

export default function FleetMap({
  deliveries = [],
  focusId = null,
  isFullscreen = false,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const markersRef = useRef(new Map())
  const polylinesRef = useRef(new Map())
  const fetchedRoutesRef = useRef(new Map())
  const hasInitializedViewRef = useRef(false)
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

    const resize = () => map.invalidateSize()
    setTimeout(resize, 80)
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      map.remove()
      mapRef.current = null
      layerRef.current = null
      markersRef.current.clear()
      polylinesRef.current.clear()
      fetchedRoutesRef.current.clear()
      hasInitializedViewRef.current = false
    }
  }, [])

  // Smooth polling updates: update positions via .setLatLng() & .setLatLngs() on existing refs without re-centering
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    const activeCustKeys = new Set()
    const activeRiderKeys = new Set()
    const activeRouteKeys = new Set()
    const markers = markersRef.current
    const polylines = polylinesRef.current
    const initialBounds = []

    deliveries.forEach((d) => {
      const dest = toLatLng(d.destination)
      const rider = toLatLng(d.rider)

      // 1. Customer Marker (Blue)
      if (dest) {
        const custKey = `cust_${d.db_id}`
        activeCustKeys.add(custKey)
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
        initialBounds.push(dest)
      }

      // 2. Rider Marker (Green)
      if (rider) {
        const riderKey = `rider_${d.db_id}`
        activeRiderKeys.add(riderKey)
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
        initialBounds.push(rider)
      }

      // 3. Delivery Route Polyline (Orange)
      // Must ALWAYS draw whenever both rider and destination coordinates are present
      if (rider && dest) {
        const routeKey = `route_${d.db_id}`
        activeRouteKeys.add(routeKey)

        // Parse backend road coordinates if already present with >= 2 points
        const parsedBackendRoute = Array.isArray(d.route)
          ? d.route.map(toLatLng).filter(Boolean)
          : []

        // If backend provided a valid multi-point road route, use it.
        // Otherwise, immediately use the straight-line fallback [rider, dest] so a line is ALWAYS visible.
        const currentRoute = parsedBackendRoute.length >= 2
          ? parsedBackendRoute
          : [rider, dest]

        if (polylines.has(routeKey)) {
          polylines.get(routeKey).setLatLngs(currentRoute)
        } else {
          const poly = L.polyline(currentRoute, {
            color: '#F97000',
            weight: 4,
            opacity: 0.9,
            lineJoin: 'round',
          }).addTo(layer)
          polylines.set(routeKey, poly)
        }

        // If backend did not provide a road path, attempt fetching from routing API with try/catch & fallback
        if (parsedBackendRoute.length < 2) {
          const cacheKey = `${d.db_id}_${rider[0].toFixed(5)},${rider[1].toFixed(5)}_${dest[0].toFixed(5)},${dest[1].toFixed(5)}`
          if (fetchedRoutesRef.current.has(cacheKey)) {
            const cached = fetchedRoutesRef.current.get(cacheKey)
            if (cached && polylines.has(routeKey)) {
              polylines.get(routeKey).setLatLngs(cached)
            }
          } else {
            fetchRoadRoute(rider, dest)
              .then((roadPts) => {
                if (roadPts && roadPts.length >= 2) {
                  fetchedRoutesRef.current.set(cacheKey, roadPts)
                  if (polylines.has(routeKey)) {
                    polylines.get(routeKey).setLatLngs(roadPts)
                  }
                }
              })
              .catch((err) => {
                console.error('Failed to fetch road route via routing API:', err)
                if (polylines.has(routeKey)) {
                  polylines.get(routeKey).setLatLngs([rider, dest])
                }
              })
          }
        }

        currentRoute.forEach((pt) => initialBounds.push(pt))
      }
    })

    // Prune stale markers and polylines that are no longer active
    markers.forEach((markerInstance, key) => {
      const isCust = key.startsWith('cust_')
      const isRider = key.startsWith('rider_')
      if ((isCust && !activeCustKeys.has(key)) || (isRider && !activeRiderKeys.has(key))) {
        layer.removeLayer(markerInstance)
        markers.delete(key)
      }
    })

    polylines.forEach((polyInstance, key) => {
      if (!activeRouteKeys.has(key)) {
        layer.removeLayer(polyInstance)
        polylines.delete(key)
      }
    })

    // Explicit User Focus: Only fit when user explicitly clicks/changes focusId
    if (focusId && focusId !== prevFocusIdRef.current) {
      prevFocusIdRef.current = focusId
      const focusItem = deliveries.find((d) => String(d.db_id) === String(focusId))
      if (focusItem) {
        const dest = toLatLng(focusItem.destination)
        const rider = toLatLng(focusItem.rider)
        const pts = [dest, rider].filter(Boolean)
        if (pts.length >= 2) {
          map.fitBounds(pts, { padding: [48, 48], maxZoom: 15 })
          hasInitializedViewRef.current = true
        } else if (pts.length === 1) {
          map.setView(pts[0], 15)
          hasInitializedViewRef.current = true
        }
      }
    } else {
      prevFocusIdRef.current = focusId
    }

    // Initial Viewport Camera Logic:
    // Only set initial view on first load or when map has no center established yet.
    // Do NOT call map.setView() or map.flyTo() on routine poll ticks.
    if (!hasInitializedViewRef.current) {
      if (initialBounds.length >= 2) {
        map.fitBounds(initialBounds, { padding: [40, 40], maxZoom: 14 })
        hasInitializedViewRef.current = true
      } else if (initialBounds.length === 1) {
        map.setView(initialBounds[0], 14)
        hasInitializedViewRef.current = true
      } else if (deliveries.length === 0) {
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
