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
import {
  IconCalendar,
  IconCart,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconCustomers,
  IconEdit,
  IconSearch,
  IconStar,
  IconUser,
} from './Icons'
import { customersApi } from '../api/client'
import './CustomerManagement.css'

const PAGE_SIZE = 8

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
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      )
    }
    if (sort === 'Highest Order') list.sort((a, b) => b.orders - a.orders)
    if (sort === 'Lowest Order') list.sort((a, b) => a.orders - b.orders)
    if (dateSort.includes('Oldest')) list.sort((a, b) => a.registered.localeCompare(b.registered))
    if (dateSort.includes('Newest')) list.sort((a, b) => b.registered.localeCompare(a.registered))
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
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="cm-id">{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.email}</td>
                  <td>{c.address}</td>
                  <td>{c.registered}</td>
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
              ))}
            </tbody>
          </table>
        </div>
        <div className="cm-pagination">
          <span className="cm-pagination-info">
            Showing {(currentPage - 1) * PAGE_SIZE + (filtered.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} customers
          </span>
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
        </div>
      </section>

      {selected && (
        <div className="cm-backdrop" onClick={() => setSelected(null)} role="presentation">
          <div className="cm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="cm-modal-head">
              <h2>Customer Details</h2>
              <button type="button" className="cm-modal-close-circle" onClick={() => setSelected(null)} aria-label="Close">
                <LuX size={18} />
              </button>
            </div>

            <div className="cm-profile">
              <div className="cm-avatar">{selected.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
              <div>
                <div className="cm-profile-name">
                  {selected.name}
                  <span className={`cm-badge ${selected.status === 'ACTIVE' ? 'active' : 'inactive'}`}>
                    {selected.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="cm-profile-meta">{selected.id} · Registered {selected.registeredFull}</div>
              </div>
            </div>

            <div className="cm-mini-stats">
              <div className="cm-mini">
                <span className="cm-stat-icon yellow"><IconCart /></span>
                <div>
                  <div className="cm-stat-label">Total Orders</div>
                  <strong>{selected.orders}</strong>
                </div>
              </div>
              <div className="cm-mini">
                <span className="cm-stat-icon green"><IconCheck /></span>
                <div>
                  <div className="cm-stat-label">Total Spent</div>
                  <strong>{peso(selected.spent)}</strong>
                </div>
              </div>
              <div className="cm-mini">
                <span className="cm-stat-icon purple"><IconCalendar /></span>
                <div>
                  <div className="cm-stat-label">Last Order</div>
                  <strong>{selected.lastOrder}</strong>
                </div>
              </div>
            </div>

            <div className="cm-details-grid">
              <div>
                <h3>Customer Information</h3>
                <dl className="cm-info">
                  <div><dt>Full Name</dt><dd>{selected.name}</dd></div>
                  <div><dt>Contact Number</dt><dd>{selected.phone}</dd></div>
                  <div><dt>Email Address</dt><dd>{selected.email}</dd></div>
                  <div><dt>Delivery Address</dt><dd>{selected.address}</dd></div>
                  <div><dt>Date Registered</dt><dd>{selected.registered}</dd></div>
                  <div>
                    <dt>Account Status</dt>
                    <dd className={selected.status === 'ACTIVE' ? 'ok' : ''}>{selected.status === 'ACTIVE' ? 'Active' : 'Inactive'}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3>Order History</h3>
                <table className="cm-history">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Date & Time</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderHistory.map((o) => (
                      <tr key={o.id}>
                        <td className="cm-id">{o.id}</td>
                        <td>{o.datetime}</td>
                        <td>{o.items}</td>
                        <td>{peso(o.total)}</td>
                        <td><span className="cm-badge active">{o.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="cm-modal-foot">
              <button type="button" className="cm-btn-cancel" onClick={() => setSelected(null)}>
                CLOSE
              </button>
              <button type="button" className="cm-btn-primary">
                <IconEdit /> Edit Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
