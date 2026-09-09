import { useEffect, useState } from 'react'
import {
  LuRotateCcw,
  LuTrash2,
  LuChevronLeft,
  LuChevronRight,
  LuShield,
  LuCar,
  LuX,
  LuTriangleAlert,
} from 'react-icons/lu'
import { IconCheck, IconTrash } from './Icons'
import { archiveApi } from '../api/client'
import './ArchivePage.css'

const INITIAL_ADMINS = []

const INITIAL_DRIVERS = []

export default function ArchivePage({ embedded = false }) {
  const [admins, setAdmins] = useState([])
  const [drivers, setDrivers] = useState([])
  const [stats, setStats] = useState({ active_admins: 0, active_drivers: 0 })
  const [confirm, setConfirm] = useState(null)
  const [adminPage, setAdminPage] = useState(1)
  const [driverPage, setDriverPage] = useState(1)

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

  async function restore(type, item) {
    const id = item.db_id
    if (!id) return
    try {
      await archiveApi.restore(id)
      await loadArchive()
    } catch (err) {
      console.error(err)
    }
  }

  function askDelete(type, item) {
    setConfirm({
      type,
      item,
      message:
        type === 'admin'
          ? `Are you sure you're going to permanently delete ${item.name} as admin?`
          : `Are you sure you're going to permanently delete ${item.name} as Driver?`,
    })
  }

  async function doDelete() {
    if (!confirm?.item?.db_id) return
    try {
      await archiveApi.destroy(confirm.item.db_id)
      await loadArchive()
      setConfirm(null)
    } catch (err) {
      console.error(err)
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
                  <td colSpan={5} className="ar-empty">No archived admins.</td>
                </tr>
              ) : (
                admins.map((a) => (
                  <tr key={a.id}>
                    <td className="ar-id">{a.id}</td>
                    <td>{a.name}</td>
                    <td>{a.email}</td>
                    <td><span className="ar-badge">{a.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="ar-actions" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="ar-icon restore" aria-label="Restore" onClick={() => restore('admin', a)}>
                          <LuRotateCcw size={15} />
                        </button>
                        <button type="button" className="ar-icon danger" aria-label="Delete" onClick={() => askDelete('admin', a)}>
                          <LuTrash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="ar-pagination">
          <div className="ar-pages">
            <button
              type="button"
              className="ar-page-btn arrow"
              disabled={adminPage <= 1}
              onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
            </button>
            <button type="button" className={`ar-page-btn${adminPage === 1 ? ' active' : ''}`} onClick={() => setAdminPage(1)}>1</button>
            <button type="button" className={`ar-page-btn${adminPage === 2 ? ' active' : ''}`} onClick={() => setAdminPage(2)}>2</button>
            <button
              type="button"
              className="ar-page-btn arrow"
              disabled={adminPage >= 2}
              onClick={() => setAdminPage((p) => p + 1)}
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
                  <td colSpan={5} className="ar-empty">No archived drivers.</td>
                </tr>
              ) : (
                drivers.map((d) => (
                  <tr key={d.id}>
                    <td className="ar-id">{d.id}</td>
                    <td>{d.name}</td>
                    <td>{d.email}</td>
                    <td><span className="ar-badge">{d.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="ar-actions" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="ar-icon restore" aria-label="Restore" onClick={() => restore('driver', d)}>
                          <LuRotateCcw size={15} />
                        </button>
                        <button type="button" className="ar-icon danger" aria-label="Delete" onClick={() => askDelete('driver', d)}>
                          <LuTrash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="ar-pagination">
          <div className="ar-pages">
            <button
              type="button"
              className="ar-page-btn arrow"
              disabled={driverPage <= 1}
              onClick={() => setDriverPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
            </button>
            <button type="button" className={`ar-page-btn${driverPage === 1 ? ' active' : ''}`} onClick={() => setDriverPage(1)}>1</button>
            <button type="button" className={`ar-page-btn${driverPage === 2 ? ' active' : ''}`} onClick={() => setDriverPage(2)}>2</button>
            <button
              type="button"
              className="ar-page-btn arrow"
              disabled={driverPage >= 2}
              onClick={() => setDriverPage((p) => p + 1)}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {confirm && (
        <div className="ar-backdrop" onClick={() => setConfirm(null)} role="presentation">
          <div className="ar-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ar-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LuTriangleAlert size={22} color="#EF4444" />
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1C1B18' }}>Warning</h2>
              </div>
              <button type="button" className="ar-modal-close-circle" onClick={() => setConfirm(null)} aria-label="Close">
                <LuX size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#4B5563', lineHeight: 1.5 }}>{confirm.message}</p>
            </div>
            <div className="ar-modal-foot">
              <button type="button" className="ar-btn-cancel" onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" className="ar-btn-yes" onClick={doDelete}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
