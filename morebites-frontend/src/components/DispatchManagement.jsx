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
import './DispatchManagement.css'

function badgeClass(status) {
  if (status === 'Delivered') return 'delivered'
  if (status === 'Cancelled') return 'cancelled'
  if (status === 'Out for Delivery') return 'delivery'
  if (status === 'Picked Up') return 'delivery'
  if (status === 'Assigned') return 'waiting'
  return 'waiting'
}

export default function DispatchManagement() {
  const [pending, setPending] = useState([])
  const [riders, setRiders] = useState([])
  const [monitoring, setMonitoring] = useState([])
  const [fleet, setFleet] = useState({ deliveries: [], store: null })
  const [page, setPage] = useState(1)
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

  async function loadDispatch() {
    try {
      const r = await dispatchApi.get()
      const d = r.data?.data || r.data || {}
      const isDeliveryOrder = (o) =>
        o.order_type !== 'Dine-in' &&
        o.order_type !== 'Takeout' &&
        o.type !== 'Dine-in' &&
        o.type !== 'Takeout'
      setPending((d.pending || []).filter(isDeliveryOrder))
      setRiders(d.riders || [])
      setMonitoring((d.monitoring || []).filter(isDeliveryOrder))
    } catch (err) {
      console.error(err)
    }
  }

  async function loadFleet() {
    try {
      const r = await dispatchApi.fleet()
      const d = r.data?.data || r.data || {}
      setFleet({
        deliveries: d.deliveries || [],
        store: d.store || null,
      })
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadDispatch().catch(console.error)
    loadFleet().catch(console.error)
    const timer = setInterval(() => {
      loadDispatch().catch(() => {})
      loadFleet().catch(() => {})
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const mapStats = useMemo(() => {
    const focused = fleet.deliveries.find((d) => String(d.db_id) === String(focusId))
    const active = focused || fleet.deliveries[0]
    if (!active) {
      return { distance: '4.6 km', eta: '12 mins' }
    }
    return {
      distance: `${Number(active.distance_km || 4.6).toFixed(1)} km`,
      eta: `${active.eta_mins || 12} mins`,
    }
  }, [fleet.deliveries, focusId])

  const pageSize = 3
  const totalPages = Math.max(1, Math.ceil(pending.length / pageSize))
  const rows = pending.slice((page - 1) * pageSize, page * pageSize)

  async function assignDelivery() {
    if (!assignOrder || !selectedRider) return
    const orderId = assignOrder.db_id || assignOrder.id
    const riderParam = selectedRider.name || selectedRider.label || selectedRider
    try {
      await dispatchApi.assign(orderId, riderParam)
      await Promise.all([loadDispatch(), loadFleet()])
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
                    No pending deliveries waiting for dispatch.
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
            Showing {(page - 1) * pageSize + (rows.length ? 1 : 0)} to{' '}
            {Math.min(page * pageSize, pending.length)} of {pending.length} pending deliveries
          </span>
          <div className="dp-pagination-controls">
            <button
              type="button"
              className="dp-page-btn arrow"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`dp-page-btn${n === page ? ' active' : ''}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="dp-page-btn arrow"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
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
              store={fleet.store}
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
                {monitoring.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="dp-empty-row">
                      No active deliveries currently being tracked.
                    </td>
                  </tr>
                ) : (
                  monitoring.map((m) => {
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
                          <div className="dp-update-time">{m.updated || '10:15 AM'}</div>
                          <div className="dp-update-date">May 25, 2026</div>
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
                  <div className="dp-empty-riders">No riders available right now.</div>
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
                store={fleet.store}
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
                  <span>Active Deliveries: <strong>{fleet.deliveries.length}</strong></span>
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
