import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuSearch,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuX,
  LuEye,
} from 'react-icons/lu'
import {
  IconChevronDown,
  IconClose,
  IconSearch,
  IconStarFill,
  IconUser,
} from './Icons'
import { driversApi } from '../api/client'
import './DriverManagement.css'

function Stars({ value }) {
  const full = Math.round(value)
  return (
    <span className="dm-stars" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'on' : ''}>
          <IconStarFill />
        </span>
      ))}
      <em>{value.toFixed(1)}</em>
    </span>
  )
}

function isExpired(dateStr) {
  return new Date(dateStr) < new Date()
}

export default function DriverManagement({ embedded = false }) {
  const [drivers, setDrivers] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    driversApi
      .list()
      .then((r) => setDrivers(r.data?.data || r.data || []))
      .catch(console.error)
  }, [])
  const [status, setStatus] = useState('All Status')
  const [sort, setSort] = useState('By: Rating High to Low')
  const [openFilter, setOpenFilter] = useState(null)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const statusRef = useRef(null)
  const sortRef = useRef(null)
  const pageSize = 5

  useEffect(() => {
    function onDoc(e) {
      if (
        statusRef.current &&
        !statusRef.current.contains(e.target) &&
        sortRef.current &&
        !sortRef.current.contains(e.target)
      ) {
        setOpenFilter(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    let list = [...drivers]
    const q = search.trim().toLowerCase()
    if (status !== 'All Status') list = list.filter((d) => d.status === status)
    if (q) {
      list = list.filter(
        (d) =>
          (d.name || '').toLowerCase().includes(q) ||
          (d.phone || '').toLowerCase().includes(q) ||
          (d.id || '').toLowerCase().includes(q),
      )
    }
    if (sort.includes('Rating')) list.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    if (sort.includes('Latest')) list.sort((a, b) => String(b.joined || '').localeCompare(String(a.joined || '')))
    return list
  }, [drivers, search, status, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="dm-page">
      {!embedded ? (
        <header className="dm-header">
          <h1>Driver Management</h1>
        </header>
      ) : null}

      <div className="dm-toolbar sa-card">
        <div className="dm-search">
          <LuSearch size={15} />
          <input
            type="search"
            placeholder="Search driver name or by contact..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="dm-filter" ref={statusRef}>
          <button type="button" className="dm-filter-btn" onClick={() => setOpenFilter((v) => (v === 'status' ? null : 'status'))}>
            {status}
            <LuChevronDown size={14} />
          </button>
          {openFilter === 'status' && (
            <div className="dm-menu">
              {['All Status', 'Active', 'Inactive'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={status === opt ? 'active' : ''}
                  onClick={() => {
                    setStatus(opt)
                    setOpenFilter(null)
                    setPage(1)
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dm-filter" ref={sortRef}>
          <button type="button" className="dm-filter-btn" onClick={() => setOpenFilter((v) => (v === 'sort' ? null : 'sort'))}>
            {sort}
            <LuChevronDown size={14} />
          </button>
          {openFilter === 'sort' && (
            <div className="dm-menu">
              {['By: Rating High to Low', 'By: Latest Added Driver'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={sort === opt ? 'active' : ''}
                  onClick={() => {
                    setSort(opt)
                    setOpenFilter(null)
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="dm-table-card sa-card">
        <div className="dm-table-wrap">
          <table className="dm-table">
            <thead>
              <tr>
                <th>Driver ID</th>
                <th>Name</th>
                <th>License Number</th>
                <th>Vehicle Type</th>
                <th>License Expiry</th>
                <th>Customer Rating</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="dm-id">{d.id}</td>
                  <td>{d.name}</td>
                  <td>{d.license}</td>
                  <td>{d.vehicle}</td>
                  <td className={isExpired(d.expiry) ? 'expired' : ''}>{d.expiry}</td>
                  <td><Stars value={d.rating} /></td>
                  <td>
                    <span className={`dm-badge ${d.status === 'Active' ? 'active' : 'inactive'}`}>
                      {d.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="dm-view" onClick={() => setSelected(d)}>
                      <LuEye size={13} />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dm-pagination">
          <span className="dm-pagination-info">
            Showing {(currentPage - 1) * pageSize + (filtered.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} drivers
          </span>
          <div className="dm-pages">
            <button
              type="button"
              className="dm-page-btn arrow"
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
                className={`dm-page-btn${n === currentPage ? ' active' : ''}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="dm-page-btn arrow"
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
        <>
          <div className="dm-backdrop" onClick={() => setSelected(null)} role="presentation" />
          <aside className="dm-drawer" role="dialog" aria-modal="true">
            <div className="dm-drawer-head">
              <h2>Driver Details</h2>
              <button type="button" className="dm-modal-close-circle" onClick={() => setSelected(null)} aria-label="Close">
                <LuX size={18} />
              </button>
            </div>

            <div className="dm-profile">
              <div className="dm-avatar"><IconUser /></div>
              <div>
                <div className="dm-name-row">
                  <strong>{selected.name}</strong>
                  <span className={`dm-badge ${selected.status === 'Active' ? 'active' : 'inactive'}`}>
                    {selected.status}
                  </span>
                </div>
                <div className="dm-meta">{selected.phone}</div>
                <div className="dm-meta">{selected.email}</div>
              </div>
            </div>

            <div className="dm-detail-block">
              <div><span>Driver ID</span><strong>{selected.id}</strong></div>
              <div><span>Plate No.</span><strong>{selected.plate}</strong></div>
              <div><span>Joining Date</span><strong>{selected.joined}</strong></div>
            </div>

            <h3>Performance Summary</h3>
            <div className="dm-perf">
              <div><strong>{selected.success}</strong><span>Success Rate</span></div>
              <div><strong>{selected.completed}</strong><span>Completed</span></div>
              <div><strong>{selected.years}</strong><span>Years</span></div>
            </div>

            <h3>Customer Reviews ({selected.rating}/5)</h3>
            <ul className="dm-reviews">
              {selected.reviews.map((r) => (
                <li key={`${r.date}-${r.text}`}>
                  <Stars value={r.rating} />
                  <p>{r.text}</p>
                  <span>{r.date}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="dm-suspend"
              onClick={async () => {
                if (!selected?.db_id) return
                try {
                  const { data } = await driversApi.suspend(selected.db_id)
                  const updated = data?.data || data
                  setDrivers((prev) => prev.map((d) => (d.db_id === selected.db_id ? updated : d)))
                  setSelected(updated)
                } catch (err) {
                  console.error(err)
                  alert(err.response?.data?.message || 'Failed to suspend driver.')
                }
              }}
            >
              SUSPEND
            </button>
          </aside>
        </>
      )}
    </div>
  )
}
