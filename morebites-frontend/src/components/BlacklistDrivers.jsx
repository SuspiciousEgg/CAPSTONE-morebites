import { useEffect, useMemo, useState } from 'react'
import {
  LuSearch,
  LuChevronLeft,
  LuChevronRight,
  LuX,
  LuEye,
  LuPencil,
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
    setNotes(driver.notes)
  }

  async function saveNotes() {
    if (!selected?.db_id) return
    try {
      const { data } = await blacklistApi.updateNotes(selected.db_id, notes)
      const updated = data?.data || data
      setBlacklist((prev) => prev.map((d) => (d.db_id === selected.db_id ? updated : d)))
      setSelected(updated)
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to save notes.')
    }
  }

  return (
    <div className="bl-page">
      {!embedded ? (
        <header className="bl-header">
          <h1>Blacklisted Driver</h1>
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
                <th>Reason for Blacklist</th>
                <th>Date Blacklisted</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="bl-id">{d.id}</td>
                  <td>{d.name}</td>
                  <td>{d.license}</td>
                  <td>{d.reason}</td>
                  <td>{d.date}</td>
                  <td>
                    <span className="bl-badge">Blacklisted</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="bl-view" onClick={() => openDetails(d)}>
                      <LuEye size={13} />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              ))}
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
              <span className="bl-badge">Blacklisted</span>
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
                  <span>Reason for Blacklist</span>
                  <strong>{selected.reason}</strong>
                </div>
              </div>
              <div className="bl-field">
                <IconCalendar />
                <div>
                  <span>Date Blacklisted</span>
                  <strong>{selected.date}</strong>
                </div>
              </div>
            </div>

            <div className="bl-attachment">
              <div className="bl-file-icon">
                <IconFile />
              </div>
              <div>
                <strong>{selected.attachment.name}</strong>
                <span>{selected.attachment.meta}</span>
              </div>
              <button type="button" className="bl-icon-btn" aria-label="Download">
                <IconDownload />
              </button>
            </div>

            <div className="bl-notes">
              <div className="bl-notes-head">
                <span>Notes</span>
                <IconEdit />
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </div>

            <button
              type="button"
              className="bl-close-btn"
              onClick={async () => {
                await saveNotes()
                setSelected(null)
              }}
            >
              SAVE & CLOSE
            </button>
          </aside>
        </>
      )}
    </div>
  )
}
