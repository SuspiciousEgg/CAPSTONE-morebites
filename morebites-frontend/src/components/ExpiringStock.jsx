import { useCallback, useEffect, useState } from 'react'
import { LuCheck, LuChevronLeft, LuChevronRight, LuShieldCheck, LuTag, LuTrash2, LuTrendingUp, LuTriangleAlert } from 'react-icons/lu'
import {
  IconCalendar,
  IconCheck,
  IconClose,
  IconRefresh,
  IconWarning,
} from './Icons'
import { expiringStockApi } from '../api/client'
import EmptyState from './EmptyState'
import CustomSelect from './CustomSelect'
import { StatCardsSkeleton, TableRowsSkeleton } from './Skeleton'
import './ExpiringStock.css'

/* ============================================================================
 * PROMPT 60 DIAGNOSTIC REPORT:
 * 1. Where disposition actions are set in the backend:
 *    - Handled by `App\Http\Controllers\Api\ExpiringStockController.php` across 4 dedicated endpoints:
 *      • Waste (`markWaste` -> POST /api/inventory/{inventory}/expiring/waste):
 *        Zeroes stock (`inventory_items.stock = 0`, `status = 'Expired'`), logs a spoilage entry in
 *        `inventory_logs` with negative quantity and `action_label = 'Spoilage / Waste'`, resolves the disposition
 *        in `inventory_dispositions` (`disposition = 'waste'`, `resolved_at = now()`), and clears any active
 *        promo on linked menu items (`clearPromosForInventory`).
 *      • Kitchen (`setKitchenPriority` -> POST /api/inventory/{inventory}/expiring/kitchen-priority):
 *        Updates `inventory_dispositions` with `disposition = 'kitchen_priority'`, `resolved_at = null`, and `notes`.
 *        Leaves physical inventory stock intact as an internal kitchen priority indicator.
 *      • Promo (`setPromo` -> POST /api/inventory/{inventory}/expiring/promo):
 *        Updates `inventory_dispositions` with `disposition = 'promo'`, `promo_menu_item_id`, `promo_discount_percent`,
 *        and flags the linked `menu_items` with `promo_active = true`, `promo_discount_percent`, and `promo_label`.
 *      • Resolve (`resolve` -> POST /api/inventory/{inventory}/expiring/resolve):
 *        Sets `inventory_dispositions.disposition = 'resolved'`, `resolved_at = now()`, and clears promos.
 *
 * 2. Where the four action buttons are rendered on the Expiring Stock frontend page:
 *    - In `morebites-frontend/src/components/ExpiringStock.jsx` (within `.exp-actions`, lines 260–295):
 *      rendered as four buttons: Promo (`.exp-action.promo`), Kitchen (`.exp-action.kitchen`),
 *      Waste (`.exp-action.waste`), and Resolve (`.exp-action.resolve`).
 *
 * 3. What Resolve currently does and whether it depends on Promo/Kitchen/Waste:
 *    - Resolve is fully independent and non-destructive. It can be clicked at any time (even directly from
 *      'Pending review') without Promo, Kitchen, or Waste having been selected first. It updates the disposition
 *      to 'resolved' and sets `resolved_at = now()` while leaving physical stock unchanged.
 *    - Per Prompt 80: for a batch past its expiry date, Resolve is disabled in the UI and rejected on the
 *      backend with 422 ("This item is expired and can only be marked as Waste."), so overdue batches can
 *      only be cleared via Waste (with an Archive-style confirmation modal).
 * ============================================================================
 */

const PAGE_SIZE = 5

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

function WasteConfirmModal({ row, saving, onClose, onConfirm }) {
  const [step, setStep] = useState(1)
  const name = row?.name || 'this item'
  const batchLabel = row?.batch_no ? ` (Batch ${row.batch_no})` : ''
  const qtyLabel = `${row?.stock ?? 0} ${row?.unit || ''}`.trim()

  return (
    <div className="menu-modal-overlay" role="presentation">
      <div
        className="menu-modal-confirm-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`menu-confirm-icon-wrap ${step === 2 ? 'warn' : 'archive'}`}>
          {step === 2 ? <LuTriangleAlert size={28} /> : <LuTrash2 size={26} />}
        </div>
        <h2 className="menu-confirm-title">
          {step === 2 ? 'Are you sure?' : 'Mark Batch as Waste'}
        </h2>
        <p className="menu-confirm-subtext">
          {step === 1
            ? `Mark all remaining ${qtyLabel} of "${name}"${batchLabel} as waste? This zeroes out the batch stock, records a spoilage loss in the activity log, and cannot be undone.`
            : `Are you sure you really want to mark ${qtyLabel} of "${name}"${batchLabel} as waste? This action is permanent and cannot be undone.`}
        </p>
        <div className="menu-confirm-actions">
          <button type="button" className="menu-modal-btn cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {step === 1 ? (
            <button
              type="button"
              className="menu-modal-btn confirm-archive"
              onClick={() => setStep(2)}
              disabled={saving}
            >
              Confirm Waste
            </button>
          ) : (
            <button
              type="button"
              className="menu-modal-btn confirm-archive"
              onClick={onConfirm}
              disabled={saving}
            >
              {saving ? 'Marking as Waste…' : 'Confirm Waste'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const DISCOUNT_PRESETS = [10, 15, 20, 25, 30]
const PROMO_LABEL_PRESETS = ["Today's Special", 'Flash Deal', "Chef's Pick", 'Limited Deal']

function formatPeso(n) {
  const num = Number(n || 0)
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

function applyDiscount(price, pct) {
  const p = Number(price || 0)
  const d = Math.min(90, Math.max(0, Number(pct || 0)))
  return Math.round(Math.max(0, p * (1 - d / 100)) * 100) / 100
}

export default function ExpiringStock() {
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState({
    expiring_soon: 0,
    expires_today: 0,
    awaiting_action: 0,
    resolved_week: 0,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [wasteRow, setWasteRow] = useState(null)
  const [promoRow, setPromoRow] = useState(null)
  const [promoMenuIds, setPromoMenuIds] = useState([])
  const [promoDiscount, setPromoDiscount] = useState('15')
  const [promoLabel, setPromoLabel] = useState("Today's Special")

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

  function markWaste(row) {
    setWasteRow(row)
  }

  async function confirmWaste() {
    if (!wasteRow) return
    setSaving(true)
    try {
      await expiringStockApi.markWaste(wasteRow.id)
      setWasteRow(null)
      await afterAction()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to mark as waste.')
    } finally {
      setSaving(false)
    }
  }

  async function setKitchenPriority(row) {
    if (row.days_until_expiry != null && row.days_until_expiry < 0) {
      alert('This item is expired and can only be marked as Waste.')
      return
    }
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
    if (row.days_until_expiry != null && row.days_until_expiry < 0) {
      alert('This item is expired and can only be marked as Waste.')
      return
    }
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
    if (row.days_until_expiry != null && row.days_until_expiry < 0) {
      alert('This item is expired and can only be marked as Waste.')
      return
    }
    const menus = row.linked_menus || []
    const alreadyActiveIds = menus.filter((m) => m.promo_active).map((m) => Number(m.id))
    const recommendedMenu = menus.find((m) => m.recommended) || menus[0]
    const initialIds = alreadyActiveIds.length
      ? alreadyActiveIds
      : recommendedMenu
      ? [Number(recommendedMenu.id)]
      : []

    const activeLabel = menus.find((m) => m.promo_active && m.promo_label)?.promo_label
    const defaultDiscount =
      row.promo_discount_percent || row.suggested_discount_percent || 15
    const defaultLabel = activeLabel || row.suggested_promo_label || "Today's Special"

    setPromoRow(row)
    setPromoMenuIds(initialIds)
    setPromoDiscount(String(defaultDiscount))
    setPromoLabel(defaultLabel)
  }

  function togglePromoMenu(menuId) {
    const numId = Number(menuId)
    setPromoMenuIds((prev) =>
      prev.includes(numId) ? prev.filter((id) => id !== numId) : [...prev, numId],
    )
  }

  async function savePromo() {
    if (!promoRow) return
    if (promoRow.days_until_expiry != null && promoRow.days_until_expiry < 0) {
      alert('This item is expired and can only be marked as Waste.')
      setPromoRow(null)
      return
    }
    if (!promoMenuIds.length) {
      alert('Select at least one menu item for this promo.')
      return
    }
    const discountNum = Number(promoDiscount)
    if (!Number.isFinite(discountNum) || discountNum < 1 || discountNum > 90) {
      alert('Enter a valid discount between 1% and 90%.')
      return
    }
    setSaving(true)
    try {
      await expiringStockApi.setPromo(promoRow.id, {
        menu_item_id: promoMenuIds[0],
        menu_item_ids: promoMenuIds,
        discount_percent: discountNum,
        promo_label: promoLabel.trim() || "Today's Special",
      })
      setPromoRow(null)
      await afterAction()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create promo.')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="exp-page">
      <header className="exp-header">
        <div>
          <h1>Expiring Stock</h1>
          <p className="exp-sub">
            Review perishables before they spoil. Flag promos, prioritize kitchen use, or mark waste.
          </p>
        </div>
        <button
          type="button"
          className="exp-btn-ghost"
          onClick={() => {
            setLoading(true)
            reload().catch(console.error).finally(() => setLoading(false))
          }}
          disabled={loading}
        >
          <IconRefresh /> Refresh
        </button>
      </header>

      {loading ? (
        <StatCardsSkeleton
          count={4}
          gridClassName="exp-stats"
          cardClassName="exp-stat sa-card"
          labelFirst
        />
      ) : (
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
      )}

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
                <TableRowsSkeleton
                  rows={5}
                  shapes={['two-line', 'text', 'short', 'short', 'badge', 'text', 'badge', 'icon-actions']}
                />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="exp-empty">
                    <EmptyState
                      icon="box"
                      title="All stocks fresh"
                      subtitle="No inventory items are near their expiration thresholds."
                    />
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => {
                  const isOverdue = row.days_until_expiry != null && row.days_until_expiry < 0
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="exp-item-name">{row.name}</div>
                        {row.batch_no ? <div className="exp-item-batch">Batch: {row.batch_no}</div> : null}
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
                                <span>{m.name}</span>
                                {m.recommended ? (
                                  <span className="exp-best-tag" title="Highest usage of this ingredient per serving">
                                    Best match
                                  </span>
                                ) : null}
                                {m.promo_active ? (
                                  <span className="exp-promo-tag">
                                    {m.promo_discount_percent ? `${m.promo_discount_percent}% OFF` : 'Promo'}
                                  </span>
                                ) : null}
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
                            disabled={saving || isOverdue || !row.linked_menus?.length}
                            onClick={() => openPromo(row)}
                            title={
                              isOverdue
                                ? 'This item is expired and can only be marked as Waste.'
                                : row.linked_menus?.length
                                ? 'Flag for promo review'
                                : 'No linked menu items'
                            }
                          >
                            Promo
                          </button>
                          <button
                            type="button"
                            className="exp-action kitchen"
                            disabled={saving || isOverdue}
                            onClick={() => setKitchenPriority(row)}
                            title={
                              isOverdue
                                ? 'This item is expired and can only be marked as Waste.'
                                : 'Kitchen priority'
                            }
                          >
                            Kitchen
                          </button>
                          <button
                            type="button"
                            className="exp-action waste"
                            disabled={saving}
                            onClick={() => markWaste(row)}
                            title="Mark as waste"
                          >
                            Waste
                          </button>
                          <button
                            type="button"
                            className="exp-action resolve"
                            disabled={saving || isOverdue}
                            onClick={() => resolveRow(row)}
                            title={
                              isOverdue
                                ? 'This item is expired and can only be marked as Waste.'
                                : 'Resolve disposition'
                            }
                          >
                            Resolve
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="inv-pagination">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + (rows.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * PAGE_SIZE, rows.length)} of {rows.length} items
          </span>
          <div className="inv-pages">
            <button
              type="button"
              className="inv-page-btn arrow"
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
                className={`inv-page-btn${n === currentPage ? ' active' : ''}`}
                disabled={totalPages <= 1}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="inv-page-btn arrow"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {wasteRow && (
        <WasteConfirmModal
          row={wasteRow}
          saving={saving}
          onClose={() => setWasteRow(null)}
          onConfirm={confirmWaste}
        />
      )}

      {promoRow && (() => {
        const menus = promoRow.linked_menus || []
        const selectedMenus = menus.filter((m) => promoMenuIds.includes(Number(m.id)))
        const discountVal = Number(promoDiscount) || 0

        return (
          <div className="exp-backdrop" role="presentation">
            <div className="exp-modal exp-promo-modal" role="dialog" aria-modal="true">
              <div className="exp-modal-head">
                <div>
                  <h2>Expiring Stock Promo</h2>
                  <div className="exp-modal-meta-strip">
                    <span className="exp-batch-tag">{promoRow.batch_no}</span>
                    <span>
                      <strong>{promoRow.stock} {promoRow.unit}</strong> {promoRow.name}
                    </span>
                    <span className="exp-meta-dot" aria-hidden="true">·</span>
                    <span className="exp-meta-expiry">{formatDaysUntil(promoRow.days_until_expiry)}</span>
                  </div>
                </div>
                <button type="button" className="exp-icon-btn exp-close-btn" onClick={() => setPromoRow(null)} aria-label="Close">
                  <IconClose />
                </button>
              </div>

              <div className="exp-modal-body exp-promo-body">
                {/* 1. Dish Picker Ranked by Highest Ingredient Usage */}
                <div className="exp-promo-section">
                  <div className="exp-promo-section-head">
                    <span className="exp-section-label">1. Select Dish(es) to Promote</span>
                    <span className="exp-section-hint">Sorted by highest {promoRow.name} usage</span>
                  </div>

                  <div className="exp-dish-list">
                    {menus.map((m) => {
                      const checked = promoMenuIds.includes(Number(m.id))
                      const hasRange = m.min_price !== m.max_price
                      const origPriceStr = hasRange
                        ? `${formatPeso(m.min_price)}–${formatPeso(m.max_price)}`
                        : formatPeso(m.min_price)
                      const promoPriceStr = hasRange
                        ? `${formatPeso(applyDiscount(m.min_price, discountVal))}–${formatPeso(applyDiscount(m.max_price, discountVal))}`
                        : formatPeso(applyDiscount(m.min_price, discountVal))

                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`exp-dish-option${checked ? ' selected' : ''}`}
                          onClick={() => togglePromoMenu(m.id)}
                        >
                          <span className={`exp-custom-check${checked ? ' checked' : ''}`} aria-hidden="true">
                            {checked && <LuCheck size={12} strokeWidth={3} />}
                          </span>
                          <div className="exp-dish-main">
                            <div className="exp-dish-top">
                              <span className="exp-dish-name">{m.name}</span>
                              {m.recommended && (
                                <span className="exp-rec-pill">
                                  <LuTrendingUp size={11} /> Fastest clearance
                                </span>
                              )}
                            </div>
                            <div className="exp-dish-meta">
                              <span>Uses <strong>{m.usage_summary}</strong></span>
                              {m.orders_to_clear_label && (
                                <>
                                  <span className="exp-meta-dot" aria-hidden="true">·</span>
                                  <span className="exp-clear-text">
                                    {m.orders_to_clear_label} to clear
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          {discountVal > 0 && (
                            <div className="exp-dish-price-preview">
                              <span className="exp-price-orig">{origPriceStr}</span>
                              <span className="exp-price-promo">{promoPriceStr}</span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Per-Size Batch Clearance Breakdown */}
                {selectedMenus.length > 0 && (
                  <div className="exp-clearance-box">
                    <div className="exp-clearance-head">
                      <span className="exp-clearance-title">
                        Clearance Estimate · {promoRow.stock} {promoRow.unit} Batch
                      </span>
                      <span className="exp-autostop-pill">
                        <LuShieldCheck size={12} /> Auto-shutoff on depletion
                      </span>
                    </div>
                    {selectedMenus.map((m) => (
                      <div key={m.id} className="exp-clearance-dish">
                        <span className="exp-clearance-dish-name">{m.name}</span>
                        <div className="exp-size-pills">
                          {(m.size_estimates || []).map((sz, idx) => (
                            <span key={`${m.id}-${sz.size_id || idx}`} className="exp-size-pill">
                              {sz.size_name ? `${sz.size_name} (${sz.usage_label})` : sz.usage_label}
                              {' · '}
                              <strong>
                                {sz.orders_to_clear != null
                                  ? `~${sz.orders_to_clear} ${sz.orders_to_clear === 1 ? 'order' : 'orders'}`
                                  : '—'}
                              </strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="exp-autostop-note">
                      Promo ends automatically once Batch {promoRow.batch_no} reaches 0 stock or expires, so fresh batches sell at regular price.
                    </p>
                  </div>
                )}

                {/* 2. Discount % + 3. Customer-Facing Label */}
                <div className="exp-promo-row-2">
                  <div className="exp-field-block">
                    <div className="exp-field-top">
                      <span className="exp-section-label">
                        2. Discount (%)
                        {promoRow.suggested_discount_percent ? (
                          <em className="exp-suggest-inline"> · Suggested {promoRow.suggested_discount_percent}%</em>
                        ) : null}
                      </span>
                      <div className="exp-chip-row">
                        {DISCOUNT_PRESETS.map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            className={`exp-preset-chip${Number(promoDiscount) === pct ? ' active' : ''}`}
                            onClick={() => setPromoDiscount(String(pct))}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={promoDiscount}
                      onChange={(e) => setPromoDiscount(e.target.value)}
                      placeholder="Custom %"
                      aria-label="Discount percentage"
                    />
                  </div>

                  <div className="exp-field-block">
                    <div className="exp-field-top">
                      <span className="exp-section-label">3. Customer-Facing Label</span>
                      <div className="exp-chip-row">
                        {PROMO_LABEL_PRESETS.map((lbl) => (
                          <button
                            key={lbl}
                            type="button"
                            className={`exp-preset-chip${promoLabel === lbl ? ' active' : ''}`}
                            onClick={() => setPromoLabel(lbl)}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="text"
                      maxLength={60}
                      value={promoLabel}
                      onChange={(e) => setPromoLabel(e.target.value)}
                      placeholder="e.g. Today's Special"
                      aria-label="Customer-facing promo label"
                    />
                  </div>
                </div>

                <div className="exp-label-preview">
                  <span className="exp-preview-badge">
                    <LuTag size={12} />
                    {promoLabel.trim() || "Today's Special"} · {discountVal || 0}% OFF
                  </span>
                  <span className="exp-preview-note">
                    Shown to customers. Expiry &amp; batch details stay internal to staff.
                  </span>
                </div>
              </div>

              <div className="exp-modal-foot">
                <button type="button" className="exp-btn-cancel" onClick={() => setPromoRow(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="exp-btn-primary"
                  onClick={savePromo}
                  disabled={saving || promoMenuIds.length === 0}
                >
                  {saving
                    ? 'Activating…'
                    : `Activate Promo${promoMenuIds.length > 1 ? ` (${promoMenuIds.length} items)` : ''}`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
