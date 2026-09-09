import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuShoppingCart,
  LuCircleCheck,
  LuClock,
  LuBike,
  LuSearch,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuPlus,
  LuMinus,
  LuX,
  LuEllipsis,
} from 'react-icons/lu'
import { TbClipboardList } from 'react-icons/tb'
import { ordersApi } from '../api/client'
import { RowActionMenuPopup, useRowActionMenu } from './RowActionMenu'
import './OrderManagement.css'

const STATUS_OPTIONS = [
  'All Status',
  'Pending',
  'Confirmed',
  'Preparing',
  'Out for Delivery',
  'Completed',
  'Cancelled',
]
const TYPE_OPTIONS = ['All Types', 'Online Order', 'Dine-in', 'Takeout']
const POS_ORDER_TYPES = ['Dine-in', 'Takeout']
const DATE_OPTIONS = ['Today', 'This Week', 'This Month', 'All Time']
const MENU_TABS = ['All', 'Pizza', 'Pasta', 'Sides', 'Drinks', 'Desserts']

const PAGE_SIZE = 8

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function statusClass(status) {
  const map = {
    Pending: 'pending',
    Confirmed: 'confirmed',
    Preparing: 'preparing',
    Ready: 'ready',
    'Out for Delivery': 'delivery',
    Completed: 'completed',
    Cancelled: 'cancelled',
  }
  return map[status] || 'pending'
}

function FilterSelect({ value, options, open, onToggle, onSelect, menuRef }) {
  return (
    <div className="om-filter-wrap" ref={menuRef}>
      <button
        type="button"
        className={`om-filter-btn${open ? ' open' : ''}`}
        onClick={onToggle}
      >
        <span className="om-filter-value">{value}</span>
        <LuChevronDown className="om-filter-chevron" size={16} />
      </button>
      {open && (
        <div className="om-filter-menu">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`om-filter-option${value === opt ? ' selected' : ''}`}
              onClick={() => onSelect(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateOrderModal({ orderId, onClose, onPlace, menuCatalog = [] }) {
  const [menuTab, setMenuTab] = useState('All')
  const [orderType, setOrderType] = useState('Dine-in')
  const [customerName, setCustomerName] = useState('')
  const [typeOpen, setTypeOpen] = useState(false)
  const [activeItem, setActiveItem] = useState(null)
  const [qty, setQty] = useState(1)
  const [cart, setCart] = useState([])
  const typeRef = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (typeRef.current && !typeRef.current.contains(e.target)) setTypeOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const visibleMenu = menuCatalog.filter(
    (item) => menuTab === 'All' || item.category === menuTab,
  )

  const total = cart.reduce((sum, line) => sum + line.price * line.qty, 0)

  function openItem(item) {
    setActiveItem(item.id)
    setQty(1)
  }

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((p) => p.id === item.id)
      if (existing) {
        return prev.map((p) => (p.id === item.id ? { ...p, qty: p.qty + qty } : p))
      }
      return [...prev, { ...item, qty }]
    })
    setActiveItem(null)
    setQty(1)
  }

  function removeLine(id) {
    setCart((prev) => prev.filter((p) => p.id !== id))
  }

  function changeLineQty(id, next) {
    if (next < 1) {
      removeLine(id)
      return
    }
    setCart((prev) => prev.map((p) => (p.id === id ? { ...p, qty: next } : p)))
  }

  function placeOrder() {
    if (!customerName.trim() || cart.length === 0) return
    onPlace({
      customer_name: customerName.trim(),
      order_type: orderType,
      status: 'Preparing',
      items: cart.map((c) => ({
        name: c.name,
        menu_item_id: c.id,
        qty: c.qty,
        unit_price: c.price,
      })),
    })
  }

  return (
    <div className="om-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="om-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="om-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="om-modal-head">
          <h2 id="om-modal-title">Create New Order - {orderId}</h2>
          <button
            type="button"
            className="om-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <LuX size={18} />
          </button>
        </div>

        <div className="om-modal-body">
          <section className="om-menu-pane">
            <h3 className="om-pane-title">Select Items from Menu</h3>
            <div className="om-menu-tabs">
              {MENU_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`om-menu-tab${menuTab === tab ? ' active' : ''}`}
                  onClick={() => setMenuTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="om-menu-grid">
              {visibleMenu.length === 0 ? (
                <div className="om-empty-menu">No items in this category</div>
              ) : (
                visibleMenu.map((item) => {
                  const isActive = activeItem === item.id
                  return (
                    <div
                      key={item.id}
                      className={`om-menu-card${isActive ? ' active' : ''}`}
                      onClick={() => openItem(item)}
                    >
                      <div className="om-menu-card-name">{item.name}</div>
                      <div className="om-menu-card-meta">
                        {item.category?.toUpperCase()}
                      </div>
                      <div className="om-menu-card-price">{peso(item.price)}.00</div>

                      {isActive && (
                        <div
                          className="om-menu-overlay"
                          onClick={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <div className="om-qty">
                            <button
                              type="button"
                              onClick={() => setQty((q) => Math.max(1, q - 1))}
                              aria-label="Decrease quantity"
                            >
                              <LuMinus size={14} />
                            </button>
                            <span>{qty}</span>
                            <button
                              type="button"
                              onClick={() => setQty((q) => q + 1)}
                              aria-label="Increase quantity"
                            >
                              <LuPlus size={14} />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="om-add-cart"
                            onClick={() => addToCart(item)}
                          >
                            Add to Cart
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="om-details-pane">
            <h3 className="om-pane-title">Customer & Details</h3>

            <label className="om-field-label" htmlFor="order-type">
              Order Type
            </label>
            <div className="om-type-select" ref={typeRef}>
              <button
                id="order-type"
                type="button"
                className="om-type-btn"
                onClick={() => setTypeOpen((v) => !v)}
              >
                <span>{orderType}</span>
                <LuChevronDown size={16} />
              </button>
              {typeOpen && (
                <div className="om-filter-menu om-type-menu">
                  {POS_ORDER_TYPES.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`om-filter-option${orderType === opt ? ' selected' : ''}`}
                      onClick={() => {
                        setOrderType(opt)
                        setTypeOpen(false)
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="om-field-label" htmlFor="customer-name">
              Customer Name
            </label>
            <input
              id="customer-name"
              className="om-input"
              placeholder="e.g. John Henry"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />

            <div className="om-cart">
              {cart.length === 0 ? (
                <div className="om-cart-empty">
                  <TbClipboardList size={32} style={{ color: '#D1D5DB' }} />
                  <p>No items yet. Select items from the menu.</p>
                </div>
              ) : (
                <ul className="om-cart-list">
                  {cart.map((line) => (
                    <li key={line.id}>
                      <div className="om-cart-line-info">
                        <strong>
                          {line.qty}x {line.name}
                        </strong>
                        <span>{peso(line.price * line.qty)}.00</span>
                      </div>
                      <div className="om-cart-actions">
                        <button
                          type="button"
                          onClick={() => changeLineQty(line.id, line.qty - 1)}
                          aria-label="Decrease"
                        >
                          <LuMinus size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => changeLineQty(line.id, line.qty + 1)}
                          aria-label="Increase"
                        >
                          <LuPlus size={12} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="om-modal-footer">
              <div className="om-order-total">
                <span>Order Total</span>
                <strong>{peso(total)}.00</strong>
              </div>
              <div className="om-modal-actions">
                <button type="button" className="om-btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="om-btn-primary"
                  disabled={!customerName.trim() || cart.length === 0}
                  onClick={placeOrder}
                >
                  Place Order
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default function OrderManagement() {
  const [orders, setOrders] = useState([])
  const [serverStats, setServerStats] = useState(null)
  const [menuCatalog, setMenuCatalog] = useState([])
  const [status, setStatus] = useState('All Status')
  const [type, setType] = useState('All Types')
  const [date, setDate] = useState('Today')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [openFilter, setOpenFilter] = useState(null)
  const [saving, setSaving] = useState(false)
  const { menuRef, menu: rowMenu, toggleMenu, closeMenu: closeRowMenu } = useRowActionMenu()
  const [viewOrder, setViewOrder] = useState(null)

  const statusRef = useRef(null)
  const typeRef = useRef(null)
  const dateRef = useRef(null)

  async function loadOrders() {
    try {
      const [o, m] = await Promise.all([ordersApi.list(), ordersApi.menuOptions()])
      setOrders(o.data?.data || o.data || [])
      if (o.data?.meta?.stats) {
        setServerStats(o.data.meta.stats)
      }
      setMenuCatalog(m.data?.data || m.data || [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadOrders().catch(console.error)
  }, [])

  useEffect(() => {
    function onDoc(e) {
      const refs = [statusRef, typeRef, dateRef]
      if (refs.every((r) => r.current && !r.current.contains(e.target))) {
        setOpenFilter(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = new Date()
    const todayStr = now.toDateString()

    return orders.filter((o) => {
      // Status filter
      if (status !== 'All' && status !== 'All Status' && o.status !== status) {
        return false
      }
      // Type filter
      if (type !== 'All' && type !== 'All Types' && o.type !== type) {
        return false
      }
      // Date filter
      if (date !== 'All Time' && o.created_at) {
        const orderDate = new Date(o.created_at)
        if (date === 'Today') {
          if (orderDate.toDateString() !== todayStr) return false
        } else if (date === 'This Week') {
          const diffDays = (now - orderDate) / (1000 * 60 * 60 * 24)
          if (diffDays > 7 || diffDays < 0) return false
        } else if (date === 'This Month') {
          if (
            orderDate.getMonth() !== now.getMonth() ||
            orderDate.getFullYear() !== now.getFullYear()
          ) {
            return false
          }
        }
      }
      // Search filter
      if (q) {
        const matchId = o.id && o.id.toLowerCase().includes(q)
        const matchCustomer = o.customer && o.customer.toLowerCase().includes(q)
        const matchItems = o.items && o.items.toLowerCase().includes(q)
        if (!matchId && !matchCustomer && !matchItems) return false
      }
      return true
    })
  }, [orders, status, type, date, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rowMenuOrder = rowMenu?.orderId
    ? orders.find((o) => o.db_id === rowMenu.orderId) || null
    : null

  const stats = {
    total:
      serverStats?.total ??
      (orders.filter((o) => {
        if (!o.created_at) return true
        return new Date(o.created_at).toDateString() === new Date().toDateString()
      }).length || orders.length),
    completed:
      serverStats?.completed ?? orders.filter((o) => o.status === 'Completed').length,
    pending:
      serverStats?.pending ?? orders.filter((o) => o.status === 'Pending').length,
    delivery:
      serverStats?.delivery ?? orders.filter((o) => o.status === 'Out for Delivery').length,
  }

  const nextOrderId = `#ORD-${String(orders.length + 21).padStart(5, '0')}`

  async function handlePlace(payload) {
    setSaving(true)
    try {
      await ordersApi.create(payload)
      await loadOrders()
      setCreateOpen(false)
      setPage(1)
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to create order.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAction(order) {
    if (order.action === 'View' || order.action === 'Track') {
      setViewOrder(order)
      return
    }
    const next =
      order.action === 'Confirm'
        ? 'Preparing'
        : order.action === 'Mark Ready'
          ? 'Ready'
          : null
    if (!next || !order.db_id) return
    try {
      const { data } = await ordersApi.updateStatus(order.db_id, next)
      const updated = data?.data || data
      setOrders((prev) => prev.map((o) => (o.db_id === order.db_id ? updated : o)))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="om-page">
      <header className="om-header">
        <h1 className="om-title">Order Management</h1>
      </header>

      {/* 4 Stat Cards */}
      <section className="om-stats-grid">
        <article className="om-stat-card">
          <div className="om-stat-icon-wrap orange">
            <LuShoppingCart size={22} />
          </div>
          <div className="om-stat-info">
            <div className="om-stat-value">{stats.total}</div>
            <div className="om-stat-label">Total Orders Today</div>
          </div>
        </article>

        <article className="om-stat-card">
          <div className="om-stat-icon-wrap green">
            <LuCircleCheck size={22} />
          </div>
          <div className="om-stat-info">
            <div className="om-stat-value">{stats.completed}</div>
            <div className="om-stat-label">Orders Completed</div>
          </div>
        </article>

        <article className="om-stat-card">
          <div className="om-stat-icon-wrap amber">
            <LuClock size={22} />
          </div>
          <div className="om-stat-info">
            <div className="om-stat-value">{stats.pending}</div>
            <div className="om-stat-label">Pending Orders</div>
          </div>
        </article>

        <article className="om-stat-card">
          <div className="om-stat-icon-wrap blue">
            <LuBike size={22} />
          </div>
          <div className="om-stat-info">
            <div className="om-stat-value">{stats.delivery}</div>
            <div className="om-stat-label">Out for Delivery</div>
          </div>
        </article>
      </section>

      {/* Filter Row */}
      <section className="om-toolbar">
        <div className="om-filters">
          <FilterSelect
            value={status}
            options={STATUS_OPTIONS}
            open={openFilter === 'status'}
            onToggle={() => setOpenFilter((v) => (v === 'status' ? null : 'status'))}
            onSelect={(v) => {
              setStatus(v)
              setOpenFilter(null)
              setPage(1)
            }}
            menuRef={statusRef}
          />
          <FilterSelect
            value={type}
            options={TYPE_OPTIONS}
            open={openFilter === 'type'}
            onToggle={() => setOpenFilter((v) => (v === 'type' ? null : 'type'))}
            onSelect={(v) => {
              setType(v)
              setOpenFilter(null)
              setPage(1)
            }}
            menuRef={typeRef}
          />
          <FilterSelect
            value={date}
            options={DATE_OPTIONS}
            open={openFilter === 'date'}
            onToggle={() => setOpenFilter((v) => (v === 'date' ? null : 'date'))}
            onSelect={(v) => {
              setDate(v)
              setOpenFilter(null)
              setPage(1)
            }}
            menuRef={dateRef}
          />
          <div className="om-search-wrap">
            <LuSearch className="om-search-icon" size={16} />
            <input
              type="text"
              placeholder="Search by ID or Customer"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="om-search-input"
            />
          </div>
        </div>

        <button
          type="button"
          className="om-create-btn"
          onClick={() => setCreateOpen(true)}
        >
          <LuPlus size={16} />
          <span>Create Order</span>
        </button>
      </section>

      {/* Main Table / Empty State Card */}
      <section className="om-main-card">
        {pageRows.length === 0 ? (
          <div className="om-empty-state">
            <div className="om-empty-icon-wrap">
              <TbClipboardList size={32} />
            </div>
            <h3 className="om-empty-title">No orders yet</h3>
            <p className="om-empty-subtitle">
              Orders will appear here once customers place them or you create one
            </p>
          </div>
        ) : (
          <>
            <div className="om-table-wrap">
              <table className="om-table">
                <thead>
                  <tr>
                    <th>ORDER ID</th>
                    <th>CUSTOMER</th>
                    <th>ORDER TYPE</th>
                    <th>ITEMS</th>
                    <th>TOTAL</th>
                    <th>STATUS</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((o) => (
                    <tr key={o.id}>
                      <td className="om-id-cell">{o.id}</td>
                      <td className="om-customer-cell">{o.customer}</td>
                      <td className="om-type-cell">{o.type}</td>
                      <td className="om-items-cell">{o.items}</td>
                      <td className="om-total-cell">{peso(o.price)}</td>
                      <td>
                        <span className={`om-status-badge ${statusClass(o.status)}`}>
                          {o.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="om-actions-cell">
                          {['Confirm', 'Mark Ready'].includes(o.action) && (
                            <button
                              type="button"
                              className="om-primary-action-btn"
                              onClick={() => handleAction(o)}
                            >
                              {o.action}
                            </button>
                          )}
                          <button
                            type="button"
                            className="om-more-btn"
                            onClick={(e) =>
                              toggleMenu(e, `order-${o.db_id}`, { orderId: o.db_id })
                            }
                            aria-label="Actions"
                          >
                            <LuEllipsis size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="om-pagination-row">
              <span className="om-pagination-info">
                Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} orders
              </span>
              <div className="om-pagination-controls">
                <button
                  type="button"
                  className="om-page-btn arrow"
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
                    className={`om-page-btn${n === currentPage ? ' active' : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="om-page-btn arrow"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <LuChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Row Action Menu Popup */}
      {rowMenu && rowMenuOrder && (
        <RowActionMenuPopup menuRef={menuRef} top={rowMenu.top} left={rowMenu.left}>
          <button
            type="button"
            onClick={() => {
              setViewOrder(rowMenuOrder)
              closeRowMenu()
            }}
          >
            View Order Details
          </button>
        </RowActionMenuPopup>
      )}

      {/* POS Create Order Modal */}
      {createOpen && (
        <CreateOrderModal
          orderId={nextOrderId}
          menuCatalog={menuCatalog}
          onClose={() => setCreateOpen(false)}
          onPlace={handlePlace}
        />
      )}

      {/* Order Details Modal */}
      {viewOrder && (
        <div
          className="om-modal-backdrop"
          onClick={() => setViewOrder(null)}
          role="presentation"
        >
          <div
            className="om-detail-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="om-detail-head">
              <h2>Order Details</h2>
              <button
                type="button"
                className="om-modal-close"
                onClick={() => setViewOrder(null)}
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>
            <dl className="om-detail-grid">
              <div>
                <dt>Order ID</dt>
                <dd>{viewOrder.id}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`om-status-badge ${statusClass(viewOrder.status)}`}>
                    {viewOrder.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{viewOrder.customer}</dd>
              </div>
              <div>
                <dt>Order Type</dt>
                <dd>{viewOrder.type}</dd>
              </div>
              <div className="full">
                <dt>Items</dt>
                <dd>{viewOrder.items || '—'}</dd>
              </div>
              <div className="full">
                <dt>Delivery Address</dt>
                <dd>{viewOrder.address || '—'}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd className="om-total-cell">{peso(viewOrder.price)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>
                  {viewOrder.created_at
                    ? new Date(viewOrder.created_at).toLocaleString()
                    : '—'}
                </dd>
              </div>
            </dl>
            <div className="om-detail-foot">
              <button
                type="button"
                className="om-btn-ghost"
                onClick={() => setViewOrder(null)}
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
