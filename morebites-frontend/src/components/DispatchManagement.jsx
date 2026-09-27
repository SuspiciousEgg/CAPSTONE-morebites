import { useEffect, useMemo, useState } from 'react'
import {
  LuClock,
  LuMapPin,
  LuBike,
  LuNavigation,
  LuEye,
  LuX,
  LuMaximize2,
  LuChevronLeft,
  LuChevronRight,
} from 'react-icons/lu'
import { dispatchApi } from '../api/client'
import FleetMap from './FleetMap'
import EmptyState from './EmptyState'
import './DispatchManagement.css'

/**
 * PROMPT 43 DIAGNOSTIC REPORT — Why Delivery Status Monitoring Showed "No Active Deliveries"
 * While Live Delivery Map Showed Active Delivery (#ORD-00034):
 *
 * 1. Separate Polled Endpoints (Before Fix):
 *    - Live Delivery Map called `loadFleet()` -> `GET /api/dispatch/fleet` (`TrackingController::fleet()` -> `TrackingService::fleetPayload()`).
 *    - Delivery Status Monitoring table called `loadDispatch()` -> `GET /api/dispatch` (`DispatchController::index()`).
 *
 * 2. Side-by-Side Backend Query Comparison (Before Fix):
 *    - Query A — Live Delivery Map (`TrackingService::fleetPayload()`):
 *        Order::query()
 *            ->with('driver')
 *            ->whereNotNull('driver_id')
 *            ->where('order_type', 'Online Order')
 *            ->where('status', 'Out for Delivery')
 *            ->latest()
 *            ->take(20)
 *            ->get()
 *    - Query B — Delivery Status Monitoring (`DispatchController::index()`):
 *        Order::query()
 *            ->with(['driver', 'items', 'customer'])
 *            ->whereNotNull('driver_id')
 *            ->where('order_type', 'Online Order')
 *            ->whereIn('status', ['Assigned', 'Picked Up', 'Out for Delivery', 'Completed', 'Delivered', 'Cancelled'])
 *            ->latest()
 *            ->take(10)
 *            ->get()
 *
 * 3. Exact Differences Causing the Table to Come Back Empty:
 *    - Primary Cause (Frontend Filter Discarding 100% of Backend Rows):
 *      In `DispatchController::index()`, `$pending` mapped `'order_type' => $o->order_type`,
 *      but `$monitoring` omitted both `'order_type'` and `'type'` from its `.map()` return object.
 *      Then in `DispatchManagement.jsx` (`loadDispatch()`), `d.monitoring` was filtered through:
 *        const isDeliveryOrder = (o) =>
 *          (o.order_type === 'Online Order' || o.type === 'Online Order') && ...
 *      Because `o.order_type` and `o.type` were `undefined` on every row in `d.monitoring`,
 *      `isDeliveryOrder(o)` evaluated to `false` for 100% of monitoring rows (including `#ORD-00034`),
 *      discarding every row returned by the backend and setting `monitoring` state to `[]`
 *      ("No active deliveries"). Meanwhile, `loadFleet()` did not run `isDeliveryOrder` and passed
 *      `d.deliveries` straight to `<FleetMap />`.
 *    - Secondary Cause (Divergent WHERE Status Clauses & Dual-Endpoint Drift):
 *      `fleetPayload()` only matched `status = 'Out for Delivery'` (excluding `'Assigned'`, `'Picked Up'`,
 *      and case variant `'Out For Delivery'`), while `DispatchController::index()` included terminal statuses
 *      (`'Completed'`, `'Delivered'`, `'Cancelled'`) in `$monitoring`, which meant completed orders would
 *      never clear from the table when marked Delivered on the Driver app.
 *
 * 4. Fix Implemented:
 *    - Both backend endpoints now use `TrackingService::activeDeliveriesPayload()` with the exact same
 *      active status list (`['Assigned', 'Picked Up', 'Out for Delivery', 'Out For Delivery']`) and
 *      include `'order_type'` and `'type'` plus all map and table fields on every row.
 *    - On the frontend, both `fleet.deliveries` (Live Delivery Map) and `monitoring` (Delivery Status
 *      Monitoring table) derive their displayed state from the same single polled response via
 *      `applyActiveDeliveries()`, ensuring both panels always show the exact same active deliveries
 *      and clear them simultaneously on the next poll tick once marked Delivered.
 */

const ACTIVE_DELIVERY_STATUSES = [
  'Assigned',
  'Picked Up',
  'Out for Delivery',
  'Out For Delivery',
]

function badgeClass(status) {
  if (status === 'Delivered') return 'delivered'
  if (status === 'Cancelled') return 'cancelled'
  if (status === 'Out for Delivery' || status === 'Out For Delivery') return 'delivery'
  if (status === 'Picked Up') return 'delivery'
  if (status === 'Assigned') return 'waiting'
  return 'waiting'
}

export default function DispatchManagement() {
  const [pending, setPending] = useState([])
  const [riders, setRiders] = useState([])
  const [monitoring, setMonitoring] = useState([])
  const [fleet, setFleet] = useState({ deliveries: [], store: null })
  const [estimatedDistance, setEstimatedDistance] = useState('—')
  const [estimatedTime, setEstimatedTime] = useState('—')
  const [activeDeliveriesCount, setActiveDeliveriesCount] = useState(0)
  const [page, setPage] = useState(1)
  const [monitorPage, setMonitorPage] = useState(1)
  const [assignOrder, setAssignOrder] = useState(null)
  const [selectedRider, setSelectedRider] = useState(null)
  const [viewDelivery, setViewDelivery] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [showMapModal, setShowMapModal] = useState(false)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setShowMapModal(false)
        setAssignOrder(null)
        setViewDelivery(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (showMapModal) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'))
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [showMapModal])

  function isDeliveryOrder(o) {
    if (!o) return false
    const orderType = o.order_type || o.type || 'Online Order'
    return (
      orderType === 'Online Order' &&
      orderType !== 'Dine-in' &&
      orderType !== 'Takeout'
    )
  }

  function isActiveDelivery(o) {
    if (!isDeliveryOrder(o)) return false
    return (
      ACTIVE_DELIVERY_STATUSES.includes(o.status) ||
      ACTIVE_DELIVERY_STATUSES.includes(o.raw_status)
    )
  }

  function applyActiveDeliveries(rawList, store = null) {
    const activeDeliveries = (rawList || [])
      .filter(isActiveDelivery)
      .map((o) => ({
        ...o,
        id: o.id || o.order_id,
        order_id: o.order_id || o.id,
        name: o.name || o.driver || 'Unknown',
        driver: o.driver || o.name || 'Unknown',
        phone: o.phone || '+63 912 345 6789',
        destination:
          o.destination ||
          (o.dest_lat != null && o.dest_lng != null
            ? { latitude: Number(o.dest_lat), longitude: Number(o.dest_lng) }
            : null),
        rider:
          o.rider ||
          (o.rider_lat != null && o.rider_lng != null
            ? { latitude: Number(o.rider_lat), longitude: Number(o.rider_lng) }
            : null),
      }))

    setMonitoring(activeDeliveries)
    setActiveDeliveriesCount(activeDeliveries.length)

    const focused = activeDeliveries.find((item) => String(item.db_id) === String(focusId))
    const active = focused || activeDeliveries[0]
    if (active) {
      const distNum = Number(active.distance_km)
      const etaNum = Number(active.eta_mins)
      setEstimatedDistance(Number.isFinite(distNum) && distNum > 0 ? `${distNum.toFixed(1)} km` : '—')
      setEstimatedTime(Number.isFinite(etaNum) && etaNum > 0 ? `${etaNum} mins` : '—')
    } else {
      setEstimatedDistance('—')
      setEstimatedTime('—')
    }

    setFleet({
      deliveries: activeDeliveries,
      store: store || null,
    })
  }

  async function loadDispatch() {
    try {
      const r = await dispatchApi.get()
      const d = r.data?.data || r.data || {}
      setPending((d.pending || []).filter(isDeliveryOrder))
      setRiders(d.riders || [])
      // Derive both Live Delivery Map and Delivery Status Monitoring from the same single polled response
      applyActiveDeliveries(d.deliveries || d.monitoring || [], d.store)
    } catch (err) {
      console.error(err)
    }
  }

  async function loadFleet() {
    try {
      const r = await dispatchApi.fleet()
      const d = r.data?.data || r.data || {}
      applyActiveDeliveries(d.deliveries || d.monitoring || [], d.store)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadDispatch().catch(console.error)
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      loadDispatch().catch(() => {})
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  const mapStats = useMemo(() => {
    return {
      distance: estimatedDistance,
      eta: estimatedTime,
      activeCount: activeDeliveriesCount,
    }
  }, [estimatedDistance, estimatedTime, activeDeliveriesCount])

  const pageSize = 5
  const totalPages = Math.max(1, Math.ceil(pending.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = pending.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const monitorTotalPages = Math.max(1, Math.ceil(monitoring.length / pageSize))
  const currentMonitorPage = Math.min(monitorPage, monitorTotalPages)
  const monitorRows = monitoring.slice((currentMonitorPage - 1) * pageSize, currentMonitorPage * pageSize)

  async function assignDelivery() {
    if (!assignOrder || !selectedRider) return
    const orderId = assignOrder.db_id || assignOrder.id
    const riderParam = selectedRider.name || selectedRider.label || selectedRider
    try {
      await dispatchApi.assign(orderId, riderParam)
      await loadDispatch()
      setAssignOrder(null)
      setSelectedRider(null)
      setPage(1)
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to assign rider.')
    }
  }

  return (
    <div className="dp-page">
      <header className="dp-header">
        <h1 className="dp-title">Dispatch Management</h1>
      </header>

      {/* Pending Deliveries Card */}
      <section className="dp-card dp-pending-card">
        <div className="dp-card-head">
          <div className="dp-card-title-group">
            <span className="dp-icon-pill amber">
              <LuClock size={18} />
            </span>
            <h2 className="dp-card-title">Pending Deliveries</h2>
          </div>
        </div>

        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Address</th>
                <th>Order Total</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="dp-empty-row">
                    <EmptyState
                      icon="truck"
                      title="No pending deliveries"
                      subtitle="Orders ready for rider assignment will appear here."
                    />
                  </td>
                </tr>
              ) : (
                rows.map((o) => (
                  <tr key={o.id}>
                    <td className="dp-order-id">{o.id}</td>
                    <td className="dp-customer-name">{o.customer}</td>
                    <td className="dp-address-text">{o.address}</td>
                    <td className="dp-order-total">
                      ₱{Number(o.total || 0).toLocaleString()}
                    </td>
                    <td>
                      <span className={`dp-status-pill ${badgeClass(o.status)}`}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="dp-btn-assign"
                        onClick={() => {
                          setAssignOrder(o)
                          setSelectedRider(null)
                        }}
                      >
                        Assign Rider
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="dp-pagination-row">
          <span className="dp-pagination-info">
            Showing {(currentPage - 1) * pageSize + (rows.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * pageSize, pending.length)} of {pending.length} pending deliveries
          </span>
          {totalPages > 1 && (
            <div className="dp-pagination-controls">
              <button
                type="button"
                className="dp-page-btn arrow"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <LuChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`dp-page-btn${n === currentPage ? ' active' : ''}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="dp-page-btn arrow"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <LuChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Bottom Grid: Live Delivery Map & Delivery Status Monitoring */}
      <div className="dp-bottom-grid">
        {/* Live Delivery Map Card */}
        <section className="dp-card dp-map-section-card">
          <div className="dp-card-head">
            <div className="dp-card-title-group">
              <span className="dp-icon-pill amber">
                <LuMapPin size={18} />
              </span>
              <h2 className="dp-card-title">Live Delivery Map</h2>
            </div>
            <button
              type="button"
              className="dp-btn-view-map"
              onClick={() => setShowMapModal(true)}
              aria-label="Full View"
              title="Full View"
            >
              <LuMaximize2 size={13} />
              <span>Full View</span>
            </button>
          </div>

          <div className="dp-map-canvas-container">
            <FleetMap
              deliveries={fleet.deliveries}
              focusId={focusId}
            />
          </div>

          <div className="dp-map-legend-row">
            <span><i className="dp-legend-dot blue" /> Customer Location</span>
            <span><i className="dp-legend-dot green" /> Rider Location</span>
            <span><i className="dp-legend-dot orange" /> Delivery Route</span>
          </div>

          <div className="dp-map-stats-bar">
            <div className="dp-map-stat-item">
              <LuNavigation size={14} className="dp-stat-icon" />
              <span>Estimated Distance: <strong>{mapStats.distance}</strong></span>
            </div>
            <span className="dp-stat-divider">|</span>
            <div className="dp-map-stat-item">
              <LuClock size={14} className="dp-stat-icon" />
              <span>Estimated Time: <strong>{mapStats.eta}</strong></span>
            </div>
          </div>
        </section>

        {/* Delivery Status Monitoring Card */}
        <section className="dp-card dp-monitor-section-card">
          <div className="dp-card-head">
            <div className="dp-card-title-group">
              <span className="dp-icon-pill green">
                <LuBike size={18} />
              </span>
              <div>
                <h2 className="dp-card-title">Delivery Status Monitoring</h2>
                <p className="dp-card-subtitle">Track the status of ongoing deliveries</p>
              </div>
            </div>
          </div>

          <div className="dp-table-wrap">
            <table className="dp-table dp-monitor-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Assigned Order</th>
                  <th>Status</th>
                  <th>Last Update</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {monitorRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="dp-empty-row">
                      <EmptyState
                        icon="pin"
                        title="No active deliveries"
                        subtitle="Dispatched deliveries in transit will appear here."
                      />
                    </td>
                  </tr>
                ) : (
                  monitorRows.map((m) => {
                    const initial = (m.name || '?')[0]?.toUpperCase()
                    return (
                      <tr key={`${m.db_id || m.id}-${m.status}`}>
                        <td>
                          <div className="dp-rider-profile">
                            <div className="dp-rider-avatar-badge">{initial}</div>
                            <div className="dp-rider-text">
                              <strong className="dp-rider-name">{m.name}</strong>
                              <span className="dp-rider-phone">{m.phone || '+63 912 345 6789'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="dp-assigned-order-id">{m.id}</td>
                        <td>
                          <span className={`dp-status-pill ${badgeClass(m.status)}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="dp-last-update-text">
                          <div className="dp-update-time">{m.updated_time || m.updated || '—'}</div>
                          <div className="dp-update-date">{m.updated_date || m.date || 'Today'}</div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="dp-btn-view-order"
                            onClick={() => {
                              setViewDelivery(m)
                              setFocusId(m.db_id || null)
                            }}
                          >
                            <LuEye size={14} />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="dp-pagination-row">
            <span className="dp-pagination-info">
              Showing {(currentMonitorPage - 1) * pageSize + (monitorRows.length ? 1 : 0)} to{' '}
              {Math.min(currentMonitorPage * pageSize, monitoring.length)} of {monitoring.length} active deliveries
            </span>
            {monitorTotalPages > 1 && (
              <div className="dp-pagination-controls">
                <button
                  type="button"
                  className="dp-page-btn arrow"
                  disabled={currentMonitorPage <= 1}
                  onClick={() => setMonitorPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <LuChevronLeft size={16} />
                </button>
                {Array.from({ length: monitorTotalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`dp-page-btn${n === currentMonitorPage ? ' active' : ''}`}
                    onClick={() => setMonitorPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="dp-page-btn arrow"
                  disabled={currentMonitorPage >= monitorTotalPages}
                  onClick={() => setMonitorPage((p) => Math.min(monitorTotalPages, p + 1))}
                  aria-label="Next page"
                >
                  <LuChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Assign Rider Modal */}
      {assignOrder && (
        <div
          className="dp-modal-backdrop"
          onClick={() => setAssignOrder(null)}
          role="presentation"
        >
          <div
            className="dp-assign-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="dp-modal-head">
              <div className="dp-modal-title-wrap">
                <span className="dp-icon-pill amber">
                  <LuBike size={18} />
                </span>
                <div>
                  <h3 className="dp-modal-title">Assign Rider</h3>
                  <p className="dp-modal-subtitle">
                    Select an available rider for order {assignOrder.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="dp-modal-close-btn"
                onClick={() => setAssignOrder(null)}
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>

            <div className="dp-order-summary-strip">
              <div className="dp-summary-col">
                <span>Customer</span>
                <strong>{assignOrder.customer}</strong>
              </div>
              <div className="dp-summary-col">
                <span>Address</span>
                <strong>{assignOrder.address}</strong>
              </div>
              <div className="dp-summary-col">
                <span>Order Total</span>
                <strong className="dp-summary-price">
                  ₱{Number(assignOrder.total || 0).toLocaleString()}
                </strong>
              </div>
            </div>

            <div className="dp-rider-selection-section">
              <div className="dp-section-header-label">Available Riders</div>
              <div className="dp-rider-cards-list">
                {riders.length === 0 ? (
                  <EmptyState
                    icon="driver"
                    title="No riders available"
                    subtitle="All riders are currently on delivery or offline."
                    style={{ padding: '24px 16px' }}
                  />
                ) : (
                  riders.map((r) => {
                    const rObj =
                      typeof r === 'string'
                        ? { name: r, vehicle: 'Honda Click (Motorcycle)', phone: '+63 912 345 6789', rating: 5.0 }
                        : r
                    const isSelected =
                      selectedRider &&
                      (selectedRider.id
                        ? selectedRider.id === rObj.id
                        : (selectedRider.name || selectedRider) === rObj.name)
                    const initial = (rObj.name || '?')[0]?.toUpperCase()

                    return (
                      <div
                        key={rObj.id || rObj.name}
                        className={`dp-rider-select-card${isSelected ? ' selected' : ''}`}
                        onClick={() => setSelectedRider(rObj)}
                      >
                        <div className="dp-radio-circle">
                          {isSelected && <div className="dp-radio-dot" />}
                        </div>
                        <div className="dp-rider-avatar-badge small">{initial}</div>
                        <div className="dp-rider-card-info">
                          <div className="dp-rider-card-top">
                            <strong className="dp-rider-card-name">{rObj.name}</strong>
                            <span className="dp-rider-rating-badge">★ {Number(rObj.rating || 5).toFixed(1)}</span>
                          </div>
                          <div className="dp-rider-card-sub">
                            <span>{rObj.vehicle || 'Honda Click • ABC-1234'}</span>
                            <span>•</span>
                            <span>{rObj.phone || '+63 912 345 6789'}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="dp-modal-foot">
              <button
                type="button"
                className="dp-btn-ghost"
                onClick={() => setAssignOrder(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dp-btn-confirm-assign"
                disabled={!selectedRider}
                onClick={assignDelivery}
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Delivery Map Centered Modal */}
      {showMapModal && (
        <div
          className="dp-map-modal-backdrop"
          onClick={() => setShowMapModal(false)}
          role="presentation"
        >
          <div
            className="dp-map-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-map-modal-title"
          >
            <div className="dp-map-modal-head">
              <div className="dp-card-title-group">
                <span className="dp-icon-pill amber">
                  <LuMapPin size={18} />
                </span>
                <h2 id="dp-map-modal-title" className="dp-card-title">Live Delivery Map</h2>
              </div>
              <button
                type="button"
                className="dp-modal-close-btn"
                onClick={() => setShowMapModal(false)}
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>

            <div className="dp-map-modal-body">
              <FleetMap
                deliveries={fleet.deliveries}
                focusId={focusId}
              />
              <div className="dp-map-modal-legend">
                <span><i className="dp-legend-dot blue" /> Customer Location</span>
                <span><i className="dp-legend-dot green" /> Rider Location</span>
                <span><i className="dp-legend-dot orange" /> Delivery Route</span>
              </div>
            </div>

            <div className="dp-map-modal-foot">
              <div className="dp-map-stats-bar">
                <div className="dp-map-stat-item">
                  <LuNavigation size={14} className="dp-stat-icon" />
                  <span>Estimated Distance: <strong>{mapStats.distance}</strong></span>
                </div>
                <span className="dp-stat-divider">|</span>
                <div className="dp-map-stat-item">
                  <LuClock size={14} className="dp-stat-icon" />
                  <span>Estimated Time: <strong>{mapStats.eta}</strong></span>
                </div>
                <span className="dp-stat-divider">|</span>
                <div className="dp-map-stat-item">
                  <LuBike size={14} className="dp-stat-icon" />
                  <span>Active Deliveries: <strong>{activeDeliveriesCount}</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Details Modal */}
      {viewDelivery && (
        <div
          className="dp-modal-backdrop"
          onClick={() => setViewDelivery(null)}
          role="presentation"
        >
          <div
            className="dp-view-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="dp-modal-head">
              <div className="dp-card-title-group">
                <span className="dp-icon-pill green">
                  <LuEye size={18} />
                </span>
                <div>
                  <h3 className="dp-modal-title">Delivery Details</h3>
                  <p className="dp-modal-subtitle">Details for order {viewDelivery.id}</p>
                </div>
              </div>
              <button
                type="button"
                className="dp-modal-close-btn"
                onClick={() => setViewDelivery(null)}
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>
            <dl className="dp-detail-grid">
              <div>
                <dt>Order ID</dt>
                <dd className="dp-order-id">{viewDelivery.id}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`dp-status-pill ${badgeClass(viewDelivery.status)}`}>
                    {viewDelivery.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Rider</dt>
                <dd>{viewDelivery.name}</dd>
              </div>
              <div>
                <dt>Rider Phone</dt>
                <dd>{viewDelivery.phone || 'N/A'}</dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{viewDelivery.customer || 'N/A'}</dd>
              </div>
              <div>
                <dt>Customer Phone</dt>
                <dd>{viewDelivery.customer_phone || 'N/A'}</dd>
              </div>
              <div className="full">
                <dt>Address</dt>
                <dd>{viewDelivery.address || 'N/A'}</dd>
              </div>
              <div className="full">
                <dt>Items</dt>
                <dd>{viewDelivery.items || 'N/A'}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>{viewDelivery.payment_method || 'COD'}</dd>
              </div>
              <div>
                <dt>Order Total</dt>
                <dd className="dp-summary-price">₱{Number(viewDelivery.total || 0).toLocaleString()}</dd>
              </div>
            </dl>
            <div className="dp-modal-foot">
              <button
                type="button"
                className="dp-btn-ghost"
                onClick={() => setViewDelivery(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
