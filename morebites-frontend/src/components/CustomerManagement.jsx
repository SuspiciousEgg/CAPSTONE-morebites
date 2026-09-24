import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuSearch,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuX,
  LuEye,
  LuUsers,
  LuUserCheck,
  LuUserPlus,
  LuStar,
  LuShoppingCart,
  LuCalendar,
  LuCheck,
} from 'react-icons/lu'
import { customersApi, mediaUrl } from '../api/client'
import EmptyState from './EmptyState'
import './CustomerManagement.css'

const PAGE_SIZE = 8

function CustomerAvatar({ photo, name }) {
  const [failed, setFailed] = useState(false)
  const initials = name
    ? name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'CU'

  if (photo && !failed) {
    return (
      <div className="cm-avatar has-photo">
        <img
          src={mediaUrl(photo)}
          alt={name || 'Customer'}
          className="cm-avatar-img"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }

  return <div className="cm-avatar">{initials}</div>
}

function peso(n) {
  return `₱ ${Number(n).toLocaleString('en-PH')}`
}

function FilterSelect({ value, options, open, onToggle, onSelect, menuRef, icon: Icon }) {
  return (
    <div className="cm-filter" ref={menuRef}>
      <button type="button" className="cm-filter-btn" onClick={onToggle}>
        {Icon && <Icon size={14} />}
        {value}
        <LuChevronDown size={14} />
      </button>
      {open && (
        <div className="cm-menu">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`cm-option${value === opt ? ' active' : ''}`}
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

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([])
  const [orderHistory, setOrderHistory] = useState([])
  const [customerStats, setCustomerStats] = useState({
    total: 0,
    active: 0,
    new_month: 0,
    frequent: 0,
  })
  const [search, setSearch] = useState('')

  useEffect(() => {
    customersApi
      .list()
      .then((r) => {
        setCustomers(r.data?.data || r.data || [])
        setCustomerStats(
          r.data?.meta?.stats || {
            total: 0,
            active: 0,
            new_month: 0,
            frequent: 0,
          },
        )
      })
      .catch(console.error)
  }, [])
  const [sort, setSort] = useState('Highest Order')
  const [dateSort, setDateSort] = useState('Date Registered (Oldest)')
  const [status, setStatus] = useState('All Status')
  const [openFilter, setOpenFilter] = useState(null)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)

  const sortRef = useRef(null)
  const dateRef = useRef(null)
  const statusRef = useRef(null)

  useEffect(() => {
    if (!selected?.db_id) {
      setOrderHistory([])
      return
    }
    customersApi
      .show(selected.db_id)
      .then((r) => {
        setOrderHistory(r.data?.data?.order_history || [])
      })
      .catch(() => setOrderHistory([]))
  }, [selected?.db_id])

  useEffect(() => {
    function onDoc(e) {
      const refs = [sortRef, dateRef, statusRef]
      if (refs.every((r) => r.current && !r.current.contains(e.target))) setOpenFilter(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    let list = [...customers]
    const q = search.trim().toLowerCase()
    if (status !== 'All Status') {
      list = list.filter((c) => c.status === status)
    }
    if (q) {
      list = list.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.id && c.id.toLowerCase().includes(q)),
      )
    }
    if (sort === 'Highest Order') list.sort((a, b) => b.orders - a.orders)
    if (sort === 'Lowest Order') list.sort((a, b) => a.orders - b.orders)
    if (dateSort.includes('Oldest')) list.sort((a, b) => (a.registered || '').localeCompare(b.registered || ''))
    if (dateSort.includes('Newest')) list.sort((a, b) => (b.registered || '').localeCompare(a.registered || ''))
    return list
  }, [customers, search, sort, dateSort, status])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const stats = {
    total: customerStats.total ?? customers.length,
    active: customerStats.active ?? customers.filter((c) => c.status === 'ACTIVE').length,
    newMonth: customerStats.new_month ?? 0,
    frequent: customerStats.frequent ?? customers.filter((c) => c.orders >= 15).length,
  }

  return (
    <div className="cm-page">
      <header className="cm-header">
        <div>
          <p className="cm-eyebrow">Customer Management</p>
          <h1>Registered Customers</h1>
        </div>
      </header>

      <section className="cm-stats">
        <article className="cm-stat sa-card">
          <div className="cm-stat-icon purple"><LuUsers size={20} /></div>
          <div>
            <div className="cm-stat-label">Total Customers</div>
            <div className="cm-stat-value">{stats.total.toLocaleString()}</div>
          </div>
        </article>
        <article className="cm-stat sa-card">
          <div className="cm-stat-icon green"><LuUserCheck size={20} /></div>
          <div>
            <div className="cm-stat-label">Active Customers</div>
            <div className="cm-stat-value">{stats.active}</div>
          </div>
        </article>
        <article className="cm-stat sa-card">
          <div className="cm-stat-icon blue"><LuUserPlus size={20} /></div>
          <div>
            <div className="cm-stat-label">New Customers This Month</div>
            <div className="cm-stat-value">{stats.newMonth}</div>
          </div>
        </article>
        <article className="cm-stat sa-card">
          <div className="cm-stat-icon yellow"><LuStar size={20} /></div>
          <div>
            <div className="cm-stat-label">Frequent Buyers</div>
            <div className="cm-stat-value">{stats.frequent}</div>
          </div>
        </article>
      </section>

      <section className="cm-toolbar sa-card">
        <div className="cm-search">
          <LuSearch size={15} />
          <input
            type="search"
            placeholder="Search customer, categories..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <FilterSelect
          value={sort}
          options={['Highest Order', 'Lowest Order']}
          open={openFilter === 'sort'}
          onToggle={() => setOpenFilter((v) => (v === 'sort' ? null : 'sort'))}
          onSelect={(v) => {
            setSort(v)
            setOpenFilter(null)
          }}
          menuRef={sortRef}
        />
        <FilterSelect
          value={dateSort}
          options={['Date Registered (Oldest)', 'Date Registered (Newest)']}
          open={openFilter === 'date'}
          onToggle={() => setOpenFilter((v) => (v === 'date' ? null : 'date'))}
          onSelect={(v) => {
            setDateSort(v)
            setOpenFilter(null)
          }}
          menuRef={dateRef}
          icon={LuCalendar}
        />
        <FilterSelect
          value={status}
          options={['All Status', 'ACTIVE', 'INACTIVE']}
          open={openFilter === 'status'}
          onToggle={() => setOpenFilter((v) => (v === 'status' ? null : 'status'))}
          onSelect={(v) => {
            setStatus(v)
            setOpenFilter(null)
            setPage(1)
          }}
          menuRef={statusRef}
        />
      </section>

      <section className="cm-table-card sa-card">
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Full Name</th>
                <th>Contact Number</th>
                <th>Email Address</th>
                <th>Delivery Address</th>
                <th>Registration Date</th>
                <th>Total Orders</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '24px 16px', borderBottom: 'none' }}>
                    <EmptyState
                      icon="users"
                      title="No customer records found"
                      subtitle={
                        search
                          ? 'No customers match your active search query.'
                          : 'Registered customer profiles will appear here.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                <tr key={c.id}>
                  <td className="cm-id">{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.phone ? c.phone : <span className="cm-empty">Not provided yet</span>}</td>
                  <td>{c.email ? c.email : <span className="cm-empty">Not provided yet</span>}</td>
                  <td>{c.address ? c.address : <span className="cm-empty">Not provided yet</span>}</td>
                  <td>{c.registered || <span className="cm-empty">—</span>}</td>
                  <td>{c.orders}</td>
                  <td>
                    <span className={`cm-badge ${c.status === 'ACTIVE' ? 'active' : 'inactive'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="cm-view" onClick={() => setSelected(c)}>
                      <LuEye size={13} />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        <div className="cm-pagination">
          <span className="cm-pagination-info">
            Showing {(currentPage - 1) * PAGE_SIZE + (filtered.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} customers
          </span>
          {totalPages > 1 && (
            <div className="cm-pages">
              <button
                type="button"
                className="cm-page-btn arrow"
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
                  className={`cm-page-btn${n === currentPage ? ' active' : ''}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="cm-page-btn arrow"
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

      {selected && (
        <div className="cm-backdrop" onClick={() => setSelected(null)} role="presentation">
          <div className="cm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="cm-modal-head">
              <div className="cm-modal-title-wrap">
                <h2>Customer Details</h2>
                <span className="cm-modal-code">{selected.id}</span>
              </div>
              <button
                type="button"
                className="cm-modal-close-circle"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>

            <div className="cm-modal-body">
              {/* Profile Card */}
              <div className="cm-profile-card">
                <CustomerAvatar photo={selected.photo} name={selected.name} />
                <div className="cm-profile-info">
                  <div className="cm-profile-name-row">
                    <span className="cm-profile-name">{selected.name}</span>
                    <span className={`cm-badge ${selected.status === 'ACTIVE' ? 'active' : 'inactive'}`}>
                      {selected.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="cm-profile-meta">
                    Registered {selected.registeredFull || selected.registered || '—'}
                  </div>
                </div>
              </div>

              {/* Mini Stats */}
              <div className="cm-mini-stats">
                <div className="cm-mini">
                  <span className="cm-stat-icon yellow">
                    <LuShoppingCart size={18} />
                  </span>
                  <div>
                    <div className="cm-stat-label">Total Orders</div>
                    <strong>{selected.orders}</strong>
                  </div>
                </div>
                <div className="cm-mini">
                  <span className="cm-stat-icon green">
                    <LuCheck size={18} />
                  </span>
                  <div>
                    <div className="cm-stat-label">Total Spent</div>
                    <strong>{peso(selected.spent)}</strong>
                  </div>
                </div>
                <div className="cm-mini">
                  <span className="cm-stat-icon purple">
                    <LuCalendar size={18} />
                  </span>
                  <div>
                    <div className="cm-stat-label">Last Order</div>
                    <strong>{selected.lastOrder}</strong>
                  </div>
                </div>
              </div>

              {/* Customer Information */}
              <div className="cm-modal-section">
                <div className="cm-section-head">
                  <h3>Customer Information</h3>
                </div>
                <div className="cm-info-grid">
                  <div className="cm-info-card">
                    <span className="cm-info-label">Full Name</span>
                    <span className="cm-info-value">{selected.name || '—'}</span>
                  </div>
                  <div className="cm-info-card">
                    <span className="cm-info-label">Contact Number</span>
                    <span className={`cm-info-value${!selected.phone ? ' cm-empty' : ''}`}>
                      {selected.phone || 'Not provided yet'}
                    </span>
                  </div>
                  <div className="cm-info-card">
                    <span className="cm-info-label">Email Address</span>
                    <span className={`cm-info-value${!selected.email ? ' cm-empty' : ''}`}>
                      {selected.email || 'Not provided yet'}
                    </span>
                  </div>
                  <div className="cm-info-card">
                    <span className="cm-info-label">Date Registered</span>
                    <span className="cm-info-value">{selected.registered || '—'}</span>
                  </div>
                  <div className="cm-info-card cm-span-2">
                    <span className="cm-info-label">Delivery Address</span>
                    <span className={`cm-info-value${!selected.address ? ' cm-empty' : ''}`}>
                      {selected.address || 'Not provided yet'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order History */}
              <div className="cm-modal-section">
                <div className="cm-section-head">
                  <h3>Order History</h3>
                  <span className="cm-count-badge">
                    {orderHistory.length} {orderHistory.length === 1 ? 'order' : 'orders'}
                  </span>
                </div>
                <div className="cm-history-wrap">
                  <table className="cm-history-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Date &amp; Time</th>
                        <th>Items</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="cm-history-empty">
                            <EmptyState
                              icon="receipt"
                              title="No orders recorded yet"
                              subtitle="Customer purchase history will appear here."
                              style={{ padding: '20px 16px' }}
                            />
                          </td>
                        </tr>
                      ) : (
                        orderHistory.map((o) => (
                          <tr key={o.id}>
                            <td className="cm-history-id">{o.id}</td>
                            <td className="cm-history-date">{o.datetime}</td>
                            <td className="cm-history-items">{o.items}</td>
                            <td className="cm-history-total">{peso(o.total)}</td>
                            <td>
                              <span
                                className={`cm-status-pill status-${(o.status || '')
                                  .toLowerCase()
                                  .replace(/\s+/g, '-')}`}
                              >
                                {o.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
