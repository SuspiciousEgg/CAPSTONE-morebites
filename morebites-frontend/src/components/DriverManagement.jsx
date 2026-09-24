import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuSearch,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuX,
  LuEye,
  LuShieldAlert,
  LuCircleCheck,
  LuBan,
} from 'react-icons/lu'

const BLACKLIST_REASONS = [
  'Broken inventory',
  'Repeated tardiness',
  'Unfair behavior',
  'Misconduct / Policy Violation',
  'Failure to complete deliveries',
  'Other',
]
import {
  IconChevronDown,
  IconClose,
  IconSearch,
  IconStarFill,
  IconUser,
} from './Icons'
import { driversApi } from '../api/client'
import EmptyState from './EmptyState'
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
  const [confirmModal, setConfirmModal] = useState(null)
  const [blacklistModal, setBlacklistModal] = useState(null)
  const [blacklistReason, setBlacklistReason] = useState(BLACKLIST_REASONS[0])
  const [blacklistNotes, setBlacklistNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const statusRef = useRef(null)
  const sortRef = useRef(null)
  const pageSize = 5

  const handleConfirmStatus = async () => {
    if (!confirmModal?.driver?.db_id) return
    setActionLoading(true)
    const isSuspend = confirmModal.type === 'suspend'
    try {
      const apiCall = isSuspend ? driversApi.suspend : driversApi.reactivate
      const { data } = await apiCall(confirmModal.driver.db_id)
      const updated = data?.data || data
      setDrivers((prev) => prev.map((d) => (d.db_id === confirmModal.driver.db_id ? updated : d)))
      if (selected?.db_id === confirmModal.driver.db_id) {
        setSelected(updated)
      }
      setConfirmModal(null)
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || `Failed to ${isSuspend ? 'suspend' : 'reactivate'} driver.`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmBlacklist = async () => {
    if (!blacklistModal?.driver?.db_id) return
    const reasonText =
      blacklistReason === 'Other'
        ? blacklistNotes.trim()
        : (blacklistNotes.trim() ? `${blacklistReason}: ${blacklistNotes.trim()}` : blacklistReason)

    if (!reasonText) {
      alert('Please specify a reason for blacklisting.')
      return
    }

    setActionLoading(true)
    try {
      await driversApi.blacklist(blacklistModal.driver.db_id, reasonText)
      // Driver moved to Blacklist view; remove from active Drivers table
      setDrivers((prev) => prev.filter((d) => d.db_id !== blacklistModal.driver.db_id))
      setBlacklistModal(null)
      setSelected(null)
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to blacklist driver.')
    } finally {
      setActionLoading(false)
    }
  }

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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="dm-empty">
                    <EmptyState
                      icon="driver"
                      title="No drivers found"
                      subtitle="Registered delivery drivers will appear here."
                    />
                  </td>
                </tr>
              ) : (
                rows.map((d) => (
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
              )))}
            </tbody>
          </table>
        </div>
        <div className="dm-pagination">
          <span className="dm-pagination-info">
            Showing {(currentPage - 1) * pageSize + (filtered.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} drivers
          </span>
          {totalPages > 1 && (
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
          )}
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

            <div className="dm-drawer-actions">
              {selected.status === 'Active' ? (
                <button
                  type="button"
                  className="dm-action-btn dm-btn-suspend"
                  onClick={() => setConfirmModal({ type: 'suspend', driver: selected })}
                >
                  <LuShieldAlert size={16} />
                  <span>SUSPEND</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="dm-action-btn dm-btn-reactivate"
                  onClick={() => setConfirmModal({ type: 'reactivate', driver: selected })}
                >
                  <LuCircleCheck size={16} />
                  <span>REACTIVATE</span>
                </button>
              )}

              <button
                type="button"
                className="dm-action-btn dm-btn-blacklist"
                onClick={() => {
                  setBlacklistModal({ driver: selected })
                  setBlacklistReason(BLACKLIST_REASONS[0])
                  setBlacklistNotes('')
                }}
              >
                <LuBan size={16} />
                <span>BLACKLIST</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Confirmation Modal for Suspend / Reactivate */}
      {confirmModal && (
        <div
          className="dm-modal-overlay"
          onClick={() => !actionLoading && setConfirmModal(null)}
          role="presentation"
        >
          <div className="dm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className={`dm-modal-icon-wrap ${confirmModal.type}`}>
              {confirmModal.type === 'suspend' ? (
                <LuShieldAlert size={28} />
              ) : (
                <LuCircleCheck size={28} />
              )}
            </div>
            <h3 className="dm-modal-title">
              {confirmModal.type === 'suspend'
                ? `Suspend Driver: ${confirmModal.driver.name}?`
                : `Reactivate Driver: ${confirmModal.driver.name}?`}
            </h3>
            <p className="dm-modal-subtext">
              {confirmModal.type === 'suspend'
                ? `This will change ${confirmModal.driver.name}'s status to Inactive. They will not be able to accept delivery orders until reactivated.`
                : `This will restore ${confirmModal.driver.name}'s status back to Active, allowing them to accept delivery orders again.`}
            </p>
            <div className="dm-modal-actions">
              <button
                type="button"
                className="dm-modal-btn cancel"
                onClick={() => setConfirmModal(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`dm-modal-btn confirm-${confirmModal.type}`}
                onClick={handleConfirmStatus}
                disabled={actionLoading}
              >
                {actionLoading
                  ? 'Processing...'
                  : confirmModal.type === 'suspend'
                    ? 'Confirm Suspend'
                    : 'Confirm Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Blacklist Modal */}
      {blacklistModal && (
        <div
          className="dm-modal-overlay"
          onClick={() => !actionLoading && setBlacklistModal(null)}
          role="presentation"
        >
          <div className="dm-modal-card blacklist" onClick={(e) => e.stopPropagation()}>
            <div className="dm-modal-icon-wrap blacklist">
              <LuBan size={28} />
            </div>
            <h3 className="dm-modal-title">Blacklist Driver</h3>
            <p className="dm-modal-subtext">
              Blacklisting is a severe trust-and-safety decision. This driver will be moved to the Blacklist tab with this reason recorded.
            </p>

            <div className="dm-driver-summary-chip">
              <div className="dm-driver-summary-name">{blacklistModal.driver.name}</div>
              <div className="dm-driver-summary-meta">
                <span>ID: {blacklistModal.driver.id}</span>
                <span>•</span>
                <span>Plate: {blacklistModal.driver.plate || 'N/A'}</span>
              </div>
            </div>

            <div className="dm-form-group">
              <label className="dm-form-label">Reason for Blacklist *</label>
              <select
                className="dm-form-select"
                value={blacklistReason}
                onChange={(e) => setBlacklistReason(e.target.value)}
                disabled={actionLoading}
              >
                {BLACKLIST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="dm-form-group">
              <label className="dm-form-label">
                {blacklistReason === 'Other' ? 'Specify Reason *' : 'Additional Notes (Optional)'}
              </label>
              <textarea
                className="dm-form-textarea"
                rows={3}
                placeholder={
                  blacklistReason === 'Other'
                    ? 'Enter specific reason for blacklisting...'
                    : 'Enter any additional details or context...'
                }
                value={blacklistNotes}
                onChange={(e) => setBlacklistNotes(e.target.value)}
                disabled={actionLoading}
              />
            </div>

            <div className="dm-modal-actions">
              <button
                type="button"
                className="dm-modal-btn cancel"
                onClick={() => setBlacklistModal(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dm-modal-btn confirm-blacklist"
                onClick={handleConfirmBlacklist}
                disabled={actionLoading}
              >
                {actionLoading ? 'Blacklisting...' : 'Confirm Blacklist'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
