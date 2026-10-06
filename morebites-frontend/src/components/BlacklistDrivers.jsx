import { useEffect, useMemo, useState } from 'react'
import {
  LuSearch,
  LuChevronLeft,
  LuChevronRight,
  LuX,
  LuEye,
  LuPencil,
  LuRotateCcw,
  LuCircleCheck,
} from 'react-icons/lu'
import {
  IconCalendar,
  IconClose,
  IconDownload,
  IconEdit,
  IconFile,
  IconId,
  IconPhone,
  IconSearch,
  IconUser,
} from './Icons'
import { blacklistApi } from '../api/client'
import EmptyState from './EmptyState'
import './BlacklistDrivers.css'

export default function BlacklistDrivers({ embedded = false }) {
  const [blacklist, setBlacklist] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    blacklistApi
      .list()
      .then((r) => setBlacklist(r.data?.data || r.data || []))
      .catch(console.error)
  }, [])
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [unblacklistTarget, setUnblacklistTarget] = useState(null)
  const [unblacklisting, setUnblacklisting] = useState(false)
  const pageSize = 5

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return blacklist.filter(
      (d) =>
        !q ||
        (d.name || '').toLowerCase().includes(q) ||
        (d.id || '').toLowerCase().includes(q) ||
        (d.license || '').toLowerCase().includes(q) ||
        (d.reason || '').toLowerCase().includes(q),
    )
  }, [blacklist, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function openDetails(driver) {
    setSelected(driver)
    setNotes(driver.notes || '')
  }

  async function saveNotes() {
    if (!selected?.db_id) return
    setSavingNotes(true)
    try {
      const { data } = await blacklistApi.updateNotes(selected.db_id, notes)
      const updated = data?.data || data
      setBlacklist((prev) => prev.map((d) => (d.db_id === selected.db_id ? updated : d)))
      setSelected(updated)
      return true
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to save notes.')
      return false
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleConfirmUnblacklist() {
    if (!unblacklistTarget?.db_id) return
    setUnblacklisting(true)
    try {
      await (blacklistApi.reinstate || blacklistApi.unblacklist)(unblacklistTarget.db_id)
      setBlacklist((prev) => prev.filter((d) => d.db_id !== unblacklistTarget.db_id))
      if (selected?.db_id === unblacklistTarget.db_id) {
        setSelected(null)
      }
      const restoredName = unblacklistTarget.name
      setUnblacklistTarget(null)
      alert(`Driver "${restoredName}" has been successfully reinstated and restored to Active status.`)
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to reinstate driver.')
    } finally {
      setUnblacklisting(false)
    }
  }

  return (
    <div className="bl-page">
      {!embedded ? (
        <header className="bl-header">
          <h1>Blocklisted Drivers</h1>
        </header>
      ) : null}

      <div className="bl-search-wrap">
        <div className="bl-search">
          <LuSearch size={15} />
          <input
            type="search"
            placeholder="Search driver name, ID, or reason..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      <section className="bl-table-card sa-card">
        <div className="bl-table-wrap">
          <table className="bl-table">
            <thead>
              <tr>
                <th>Driver ID</th>
                <th>Name</th>
                <th>License Number</th>
                <th>Reason for Blocklist</th>
                <th>Date Blocklisted</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="bl-empty">
                    <EmptyState
                      icon="shield"
                      title="No blocklisted drivers"
                      subtitle="Drivers restricted from deliveries will appear here."
                    />
                  </td>
                </tr>
              ) : (
                rows.map((d) => (
                <tr key={d.id}>
                  <td className="bl-id">{d.id}</td>
                  <td>{d.name}</td>
                  <td>{d.license}</td>
                  <td>{d.reason}</td>
                  <td>{d.date}</td>
                  <td>
                    <span className="bl-badge">Blocklisted</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="bl-table-actions">
                      <button type="button" className="bl-view" onClick={() => openDetails(d)} title="View Details">
                        <LuEye size={13} />
                        <span>View</span>
                      </button>
                      <button
                        type="button"
                        className="bl-unblacklist-btn"
                        onClick={() => setUnblacklistTarget(d)}
                        title="Reinstate Driver"
                      >
                        <LuRotateCcw size={13} />
                        <span>Reinstate</span>
                      </button>
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        <div className="bl-pagination">
          <span className="bl-pagination-info">
            Showing {(currentPage - 1) * pageSize + (filtered.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} drivers
          </span>
          <div className="bl-pages">
            <button
              type="button"
              className="bl-page-btn arrow"
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
                className={`bl-page-btn${n === currentPage ? ' active' : ''}`}
                disabled={totalPages <= 1}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="bl-page-btn arrow"
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
          <div className="bl-backdrop" onClick={() => setSelected(null)} role="presentation" />
          <aside className="bl-drawer" role="dialog" aria-modal="true" aria-label="Driver Details">
            <div className="bl-drawer-head">
              <h2>Driver Details</h2>
              <button type="button" className="bl-modal-close-circle" onClick={() => setSelected(null)} aria-label="Close">
                <LuX size={18} />
              </button>
            </div>

            <div className="bl-profile">
              <div className="bl-avatar">
                <IconUser />
              </div>
              <span className="bl-badge">Blocklisted</span>
              <strong>{selected.name}</strong>
            </div>

            <div className="bl-fields">
              <div className="bl-field">
                <IconId />
                <div>
                  <span>Driver ID</span>
                  <strong>{selected.id}</strong>
                </div>
              </div>
              <div className="bl-field">
                <IconPhone />
                <div>
                  <span>Phone Number</span>
                  <strong>{selected.phone}</strong>
                </div>
              </div>
              <div className="bl-field">
                <IconId />
                <div>
                  <span>License Number</span>
                  <strong>{selected.license}</strong>
                </div>
              </div>
              <div className="bl-field">
                <IconFile />
                <div>
                  <span>Reason for Blocklist</span>
                  <strong>{selected.reason}</strong>
                </div>
              </div>
              <div className="bl-field">
                <IconCalendar />
                <div>
                  <span>Date Blocklisted</span>
                  <strong>{selected.date}</strong>
                </div>
              </div>
            </div>

            {/* Attachment Card */}
            {selected.attachment && selected.attachment.name && selected.attachment.name !== 'No attachment' ? (
              <div className="bl-attachment-card">
                <div className="bl-file-icon active">
                  <IconFile />
                </div>
                <div className="bl-attachment-info">
                  <span>Attachment</span>
                  <strong>{selected.attachment.name}</strong>
                  {selected.attachment.meta && selected.attachment.meta !== '-' ? (
                    <small>{selected.attachment.meta}</small>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="bl-icon-btn"
                  aria-label="Download Attachment"
                  title="Download Attachment"
                  onClick={() => alert(`Downloading ${selected.attachment.name}...`)}
                >
                  <IconDownload />
                </button>
              </div>
            ) : (
              <div className="bl-attachment-card empty">
                <div className="bl-file-icon">
                  <IconFile />
                </div>
                <div className="bl-attachment-info">
                  <span>Attachment</span>
                  <strong>No attachment</strong>
                  <small>No supporting documents uploaded</small>
                </div>
              </div>
            )}

            {/* Notes Section */}
            <div className="bl-notes-section">
              <div className="bl-notes-head">
                <div className="bl-notes-title">
                  <IconEdit />
                  <span>Notes</span>
                </div>
              </div>
              <textarea
                className="bl-notes-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter notes or updates regarding this blocklisted driver..."
                rows={4}
              />
            </div>

            {/* Drawer Footer Buttons */}
            <div className="bl-drawer-footer">
              <button
                type="button"
                className="bl-drawer-unblacklist-btn"
                onClick={() => setUnblacklistTarget(selected)}
              >
                <LuRotateCcw size={15} />
                <span>REINSTATE DRIVER</span>
              </button>
              <button
                type="button"
                className="bl-save-close-btn"
                disabled={savingNotes}
                onClick={async () => {
                  const ok = await saveNotes()
                  if (ok !== false) {
                    setSelected(null)
                  }
                }}
              >
                {savingNotes ? 'SAVING...' : 'SAVE & CLOSE'}
              </button>
            </div>
          </aside>
        </>
      )}

      {unblacklistTarget && (
        <div className="bl-modal-overlay" onClick={() => !unblacklisting && setUnblacklistTarget(null)}>
          <div className="bl-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="bl-modal-header">
              <div className="bl-modal-icon-badge restore">
                <LuRotateCcw size={22} />
              </div>
              <div className="bl-modal-title-wrap">
                <h3 className="bl-modal-title">Reinstate Driver</h3>
                <p className="bl-modal-sub">Confirm driver account reinstatement</p>
              </div>
              <button
                type="button"
                className="bl-modal-close"
                onClick={() => !unblacklisting && setUnblacklistTarget(null)}
                aria-label="Close modal"
              >
                <LuX size={18} />
              </button>
            </div>

            <div className="bl-modal-body">
              <p className="bl-modal-desc">
                Are you sure you want to reinstate this driver: <strong>{unblacklistTarget.name}</strong> ({unblacklistTarget.id})?
              </p>
              <div className="bl-confirm-notice">
                This will reinstate the driver's account to <strong>Active</strong> status and remove their blocklist restriction. The driver will be able to log back into the MoreBites Driver app and accept deliveries again.
              </div>
            </div>

            <div className="bl-modal-footer">
              <button
                type="button"
                className="bl-btn bl-btn-secondary"
                disabled={unblacklisting}
                onClick={() => setUnblacklistTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bl-btn bl-btn-restore"
                disabled={unblacklisting}
                onClick={handleConfirmUnblacklist}
              >
                {unblacklisting ? 'Reinstating...' : 'Yes, Reinstate Driver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
