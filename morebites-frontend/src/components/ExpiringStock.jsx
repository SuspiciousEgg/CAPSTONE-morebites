import { useCallback, useEffect, useState } from 'react'
import {
  IconCalendar,
  IconCheck,
  IconClose,
  IconRefresh,
  IconWarning,
} from './Icons'
import { expiringStockApi } from '../api/client'
import './ExpiringStock.css'

const DISPOSITION_BADGE = {
  pending: 'pending',
  promo: 'promo',
  kitchen_priority: 'kitchen',
  waste: 'waste',
  resolved: 'resolved',
}

function daysLeftClass(days) {
  if (days == null) return ''
  if (days < 0) return 'danger'
  if (days === 0) return 'danger'
  if (days <= 7) return 'warn'
  return 'ok'
}

function formatDaysUntil(days) {
  if (days == null) return '—'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  return `${days}d left`
}

export default function ExpiringStock() {
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({
    expiring_soon: 0,
    expires_today: 0,
    awaiting_action: 0,
    resolved_week: 0,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [promoRow, setPromoRow] = useState(null)
  const [promoMenuId, setPromoMenuId] = useState('')
  const [promoDiscount, setPromoDiscount] = useState('15')

  const reload = useCallback(async () => {
    const res = await expiringStockApi.list()
    setRows(res.data?.data || [])
    setStats(res.data?.meta?.stats || {})
  }, [])

  useEffect(() => {
    reload()
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [reload])

  async function afterAction() {
    await reload()
    window.dispatchEvent(new Event('mb:inventory-changed'))
  }

  async function markWaste(row) {
    if (!window.confirm(`Mark all remaining ${row.stock} ${row.unit} of "${row.name}" as waste?`)) {
      return
    }
    setSaving(true)
    try {
      await expiringStockApi.markWaste(row.id)
      await afterAction()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to mark as waste.')
    } finally {
      setSaving(false)
    }
  }

  async function setKitchenPriority(row) {
    setSaving(true)
    try {
      await expiringStockApi.setKitchenPriority(row.id)
      await afterAction()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update.')
    } finally {
      setSaving(false)
    }
  }

  async function resolveRow(row) {
    setSaving(true)
    try {
      await expiringStockApi.resolve(row.id)
      await afterAction()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to resolve.')
    } finally {
      setSaving(false)
    }
  }

  function openPromo(row) {
    setPromoRow(row)
    setPromoMenuId(row.linked_menus?.[0]?.id ? String(row.linked_menus[0].id) : '')
    setPromoDiscount(String(row.promo_discount_percent || 15))
  }

  async function savePromo() {
    if (!promoRow) return
    if (!promoMenuId) {
      alert('Select a menu item for this promo.')
      return
    }
    setSaving(true)
    try {
      await expiringStockApi.setPromo(promoRow.id, {
        menu_item_id: Number(promoMenuId),
        discount_percent: Number(promoDiscount),
      })
      setPromoRow(null)
      await afterAction()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create promo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="exp-page">
      <header className="exp-header">
        <div>
          <h1>Expiring Stock</h1>
          <p className="exp-sub">
            Review perishables before they spoil. Flag promos, prioritize kitchen use, or mark waste.
          </p>
        </div>
        <button type="button" className="exp-btn-ghost" onClick={() => reload()} disabled={loading}>
          <IconRefresh /> Refresh
        </button>
      </header>

      <section className="exp-stats">
        <article className="exp-stat sa-card">
          <div className="exp-stat-icon orange">
            <IconCalendar />
          </div>
          <div>
            <div className="exp-stat-label">Expiring Soon</div>
            <div className="exp-stat-value warn">{stats.expiring_soon}</div>
          </div>
        </article>
        <article className="exp-stat sa-card">
          <div className="exp-stat-icon red">
            <IconWarning />
          </div>
          <div>
            <div className="exp-stat-label">Expires Today</div>
            <div className="exp-stat-value danger">{stats.expires_today}</div>
          </div>
        </article>
        <article className="exp-stat sa-card">
          <div className="exp-stat-icon yellow">
            <IconWarning />
          </div>
          <div>
            <div className="exp-stat-label">Awaiting Action</div>
            <div className="exp-stat-value">{stats.awaiting_action}</div>
          </div>
        </article>
        <article className="exp-stat sa-card">
          <div className="exp-stat-icon green">
            <IconCheck />
          </div>
          <div>
            <div className="exp-stat-label">Resolved This Week</div>
            <div className="exp-stat-value success">{stats.resolved_week}</div>
          </div>
        </article>
      </section>

      <section className="exp-table-card sa-card">
        <div className="exp-table-wrap">
          <table className="exp-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Expiry</th>
                <th>Days Left</th>
                <th>Linked Menu</th>
                <th>Disposition</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="exp-empty">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="exp-empty">
                    No expiring perishables in the queue right now.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="exp-item-name">{row.name}</div>
                    </td>
                    <td>{row.category_label || row.category}</td>
                    <td>
                      {row.stock} {row.unit}
                    </td>
                    <td>{row.expiry_date || '—'}</td>
                    <td className={`exp-days ${daysLeftClass(row.days_until_expiry)}`}>
                      {formatDaysUntil(row.days_until_expiry)}
                    </td>
                    <td>
                      {row.linked_menus?.length ? (
                        <ul className="exp-menu-list">
                          {row.linked_menus.map((m) => (
                            <li key={m.id}>
                              {m.name}
                              {m.promo_active ? <span className="exp-promo-tag">Promo</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="exp-muted">No linked menu</span>
                      )}
                    </td>
                    <td>
                      <span className={`exp-badge ${DISPOSITION_BADGE[row.disposition] || 'pending'}`}>
                        {row.disposition_label}
                      </span>
                    </td>
                    <td>
                      <div className="exp-actions">
                        <button
                          type="button"
                          className="exp-action promo"
                          disabled={saving || !row.linked_menus?.length}
                          onClick={() => openPromo(row)}
                          title={row.linked_menus?.length ? 'Create promo' : 'No linked menu items'}
                        >
                          Promo
                        </button>
                        <button
                          type="button"
                          className="exp-action kitchen"
                          disabled={saving}
                          onClick={() => setKitchenPriority(row)}
                        >
                          Kitchen
                        </button>
                        <button
                          type="button"
                          className="exp-action waste"
                          disabled={saving}
                          onClick={() => markWaste(row)}
                        >
                          Waste
                        </button>
                        <button
                          type="button"
                          className="exp-action resolve"
                          disabled={saving}
                          onClick={() => resolveRow(row)}
                        >
                          Resolve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {promoRow && (
        <div className="exp-backdrop" onClick={() => setPromoRow(null)} role="presentation">
          <div className="exp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="exp-modal-head">
              <h2>Create Use-It-Up Promo</h2>
              <button type="button" className="exp-icon-btn" onClick={() => setPromoRow(null)} aria-label="Close">
                <IconClose />
              </button>
            </div>
            <div className="exp-modal-body">
              <p className="exp-modal-lead">
                Feature a menu item that uses <strong>{promoRow.name}</strong> on the customer app with a limited-time
                discount.
              </p>
              <label>
                Menu item
                <select value={promoMenuId} onChange={(e) => setPromoMenuId(e.target.value)}>
                  <option value="">Select menu item…</option>
                  {(promoRow.linked_menus || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Discount (%)
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={promoDiscount}
                  onChange={(e) => setPromoDiscount(e.target.value)}
                />
              </label>
            </div>
            <div className="exp-modal-foot">
              <button type="button" className="exp-btn-cancel" onClick={() => setPromoRow(null)}>
                Cancel
              </button>
              <button type="button" className="exp-btn-primary" onClick={savePromo} disabled={saving}>
                {saving ? 'Saving…' : 'Activate Promo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
