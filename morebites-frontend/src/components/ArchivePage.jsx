import { useEffect, useState } from 'react'
import {
  LuRotateCcw,
  LuChevronLeft,
  LuChevronRight,
  LuShield,
  LuCar,
  LuX,
} from 'react-icons/lu'
import { IconCheck } from './Icons'
import { archiveApi } from '../api/client'
import EmptyState from './EmptyState'
import './ArchivePage.css'

const PAGE_SIZE = 5

function ArchiveRestoreModal({ target, saving, onClose, onConfirm }) {
  const [step, setStep] = useState(1)
  const roleLabel = target?.type === 'admin' ? 'Admin' : 'Driver'
  const name = target?.item?.name || 'this account'

  return (
    <div className="menu-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="menu-modal-confirm-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="menu-confirm-icon-wrap restore">
          <LuRotateCcw size={26} />
        </div>
        <h2 className="menu-confirm-title">
          {step === 2 ? 'Are you sure?' : `Restore ${roleLabel}`}
        </h2>
        <p className="menu-confirm-subtext">
          {step === 1
            ? `Restore "${name}" back to active status?`
            : `Are you sure you really want to restore "${name}" back to active status?`}
        </p>
        <div className="menu-confirm-actions">
          <button type="button" className="menu-modal-btn cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {step === 1 ? (
            <button
              type="button"
              className="menu-modal-btn confirm-restore"
              onClick={() => setStep(2)}
              disabled={saving}
            >
              Confirm Restore
            </button>
          ) : (
            <button
              type="button"
              className="menu-modal-btn confirm-restore"
              onClick={onConfirm}
              disabled={saving}
            >
              {saving ? 'Restoring…' : 'Confirm Restore'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ArchivePage({ embedded = false }) {
  const [admins, setAdmins] = useState([])
  const [drivers, setDrivers] = useState([])
  const [stats, setStats] = useState({ active_admins: 0, active_drivers: 0 })
  const [restoreTarget, setRestoreTarget] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [adminPage, setAdminPage] = useState(1)
  const [driverPage, setDriverPage] = useState(1)

  const totalAdminPages = Math.max(1, Math.ceil(admins.length / PAGE_SIZE))
  const currentAdminPage = Math.min(Math.max(1, adminPage), totalAdminPages)
  const pagedAdmins = admins.slice((currentAdminPage - 1) * PAGE_SIZE, currentAdminPage * PAGE_SIZE)

  const totalDriverPages = Math.max(1, Math.ceil(drivers.length / PAGE_SIZE))
  const currentDriverPage = Math.min(Math.max(1, driverPage), totalDriverPages)
  const pagedDrivers = drivers.slice((currentDriverPage - 1) * PAGE_SIZE, currentDriverPage * PAGE_SIZE)

  async function loadArchive() {
    const r = await archiveApi.list()
    const d = r.data?.data || r.data || {}
    setAdmins(d.admins || [])
    setDrivers(d.drivers || [])
    setStats(d.stats || { active_admins: 0, active_drivers: 0 })
  }

  useEffect(() => {
    loadArchive().catch(console.error)
  }, [])

  async function doRestore() {
    if (!restoreTarget?.item?.db_id) return
    setRestoring(true)
    try {
      await archiveApi.restore(restoreTarget.item.db_id)
      await loadArchive()
      setRestoreTarget(null)
    } catch (err) {
      console.error(err)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="ar-page">
      {!embedded ? (
        <header className="ar-header">
          <h1>Archive</h1>
        </header>
      ) : null}

      <section className="ar-stats">
        <article className="ar-stat sa-card">
          <div className="ar-stat-icon blue"><LuShield size={20} /></div>
          <div>
            <div className="ar-stat-label">Active Admin</div>
            <div className="ar-stat-value">{stats.active_admins ?? 0}</div>
          </div>
        </article>
        <article className="ar-stat sa-card">
          <div className="ar-stat-icon green"><LuCar size={20} /></div>
          <div>
            <div className="ar-stat-label">Active Drivers</div>
            <div className="ar-stat-value">{stats.active_drivers ?? 0}</div>
          </div>
        </article>
      </section>

      <section className="ar-section sa-card">
        <h2>Admin Archives</h2>
        <div className="ar-table-wrap">
          <table className="ar-table">
            <thead>
              <tr>
                <th>Admin ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ar-empty">
                    <EmptyState
                      icon="archive"
                      title="No archived admins"
                      subtitle="Archived administrator accounts will appear here."
                    />
                  </td>
                </tr>
              ) : (
                pagedAdmins.map((a) => (
                  <tr key={a.id}>
                    <td className="ar-id">{a.id}</td>
                    <td>{a.name}</td>
                    <td>{a.email}</td>
                    <td><span className="ar-badge">{a.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="ar-actions" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="ar-icon restore" aria-label="Restore" onClick={() => setRestoreTarget({ type: 'admin', item: a })}>
                          <LuRotateCcw size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="dm-pagination">
          <span className="dm-pagination-info">
            Showing {(currentAdminPage - 1) * PAGE_SIZE + (admins.length ? 1 : 0)} to{' '}
            {Math.min(currentAdminPage * PAGE_SIZE, admins.length)} of {admins.length} archived admins
          </span>
          <div className="ar-pages">
            <button
              type="button"
              className="ar-page-btn arrow"
              disabled={currentAdminPage <= 1}
              onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
            </button>
            {Array.from({ length: totalAdminPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`ar-page-btn${currentAdminPage === n ? ' active' : ''}`}
                disabled={totalAdminPages <= 1}
                onClick={() => setAdminPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="ar-page-btn arrow"
              disabled={currentAdminPage >= totalAdminPages}
              onClick={() => setAdminPage((p) => Math.min(totalAdminPages, p + 1))}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <section className="ar-section sa-card">
        <h2>Driver Archives</h2>
        <div className="ar-table-wrap">
          <table className="ar-table">
            <thead>
              <tr>
                <th>Driver ID</th>
                <th>Driver Name</th>
                <th>Email</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ar-empty">
                    <EmptyState
                      icon="archive"
                      title="No archived drivers"
                      subtitle="Archived driver accounts will appear here."
                    />
                  </td>
                </tr>
              ) : (
                pagedDrivers.map((d) => (
                  <tr key={d.id}>
                    <td className="ar-id">{d.id}</td>
                    <td>{d.name}</td>
                    <td>{d.email}</td>
                    <td><span className="ar-badge">{d.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="ar-actions" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="ar-icon restore" aria-label="Restore" onClick={() => setRestoreTarget({ type: 'driver', item: d })}>
                          <LuRotateCcw size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="dm-pagination">
          <span className="dm-pagination-info">
            Showing {(currentDriverPage - 1) * PAGE_SIZE + (drivers.length ? 1 : 0)} to{' '}
            {Math.min(currentDriverPage * PAGE_SIZE, drivers.length)} of {drivers.length} archived drivers
          </span>
          <div className="ar-pages">
            <button
              type="button"
              className="ar-page-btn arrow"
              disabled={currentDriverPage <= 1}
              onClick={() => setDriverPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
            </button>
            {Array.from({ length: totalDriverPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`ar-page-btn${currentDriverPage === n ? ' active' : ''}`}
                disabled={totalDriverPages <= 1}
                onClick={() => setDriverPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="ar-page-btn arrow"
              disabled={currentDriverPage >= totalDriverPages}
              onClick={() => setDriverPage((p) => Math.min(totalDriverPages, p + 1))}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {restoreTarget && (
        <ArchiveRestoreModal
          target={restoreTarget}
          saving={restoring}
          onClose={() => setRestoreTarget(null)}
          onConfirm={doRestore}
        />
      )}
    </div>
  )
}
