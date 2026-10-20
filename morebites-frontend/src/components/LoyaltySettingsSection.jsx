import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LuCircleCheck,
  LuTriangleAlert,
  LuSearch,
  LuChevronLeft,
  LuChevronRight,
  LuRefreshCw,
} from 'react-icons/lu'
import { loyaltySettingsApi } from '../api/client'

/*
 * DIAGNOSIS REPORT — Loyalty UI vs. Existing System Design:
 *
 * 1. Web Reference Components Confirmed Correct:
 *    - Dashboard Stat Cards (`SuperAdminDashboard.css` `.sa-stat-card`) & Settings Cards (`DeliveryRatesSettings.css` `.dr-card`):
 *      `background: #FFFFFF; border: 1px solid #EDEDED; border-radius: 14px; padding: 20px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);`
 *      Headings (`.dr-card-head h2` / `p`) are plain `#1C1B18` (18px, weight 700) + `#6B7280` (13px) with no decorative icon boxes.
 *      Preview sub-cards (`.dr-quote div`) & Customer Details cards (`CustomerManagement.css` `.cm-info-card`) use flat
 *      `background: #F9FAFB; border: 1px solid #EDEDED; border-radius: 10px; padding: 12px 14px;` with `#6B7280` labels and `#1C1B18` values.
 *    - Low Stocks Alert Green Card (`SuperAdminDashboard.css` `.sa-healthy-card`):
 *      `background: #F0FDF4; border: 1.5px solid #BBF7D0; border-radius: 12px;` — uniform flat border, no left-edge accent bar or glow.
 *
 * 2. Mobile Reference Component Confirmed Correct:
 *    - Profile Section Cards (`morebites-customer/app/(customer)/(tabs)/profile.jsx` `infoCard` / `menuCard`):
 *      `backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12`, flat `#F0F0F0` row dividers,
 *      `#9CA3AF` 10px uppercase labels, `#121212` 14px bold values, `#6B7280` muted grey secondary text, and `#F97000` solid orange primary actions.
 *
 * 3. What Was Broken Across Loyalty Components & Fixed Here:
 *    - `LoyaltySettingsSection.jsx` + `DeliveryRatesSettings.css`: Removed `.loyalty-icon-badge` / `.loyalty-history-icon-badge` decorative
 *      tinted icon boxes next to section headers, removed the `.loyalty-example-banner` `#FFF9F0`/`#FFE4C2` callout with sparkles icon box,
 *      and restyled the Live Example and Ledger History table/badges to match `.dr-quote div`, `.dr-table`, `.reports-table`, and `.dr-badge`.
 *    - `CustomerManagement.jsx`: Removed inline `#EA580C` orange override on Loyalty Balance so it matches `.cm-info-value` (`#1C1B18`).
 *    - `OrderManagement.css`: Replaced dashed border on `.om-loyalty-not-found` and italic styling on `.om-loyalty-matched-note` with flat solid rules.
 *    - Mobile `profile.jsx`, `checkout.jsx`, `receipt.jsx`: Removed `#FFFBF7`/`#FFF4EB` cream backgrounds, `#FED7AA` orange borders,
 *      `#F97000` drop shadow/glow, `#FEF3C7` amber pills, and decorative icon circles so all cards match `infoCard`, `feeCard`, and `DetailRow`.
 */

const DEFAULT_LOYALTY = {
  spend_per_point: 2,
  peso_value_per_point: 0.1,
  minimum_points_to_redeem: 100,
  points_expiry_days: 30,
  enabled: true,
}

export default function LoyaltySettingsSection() {
  const [settings, setSettings] = useState(DEFAULT_LOYALTY)
  const [form, setForm] = useState(DEFAULT_LOYALTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  // Ledger History state (5 rows per page, search, type filter)
  const [historyList, setHistoryList] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)
  const [historyTotalCount, setHistoryTotalCount] = useState(0)
  const [historySearch, setHistorySearch] = useState('')
  const [historyType, setHistoryType] = useState('all')

  useEffect(() => {
    let active = true
    loyaltySettingsApi.get()
      .then((res) => {
        if (!active) return
        const d = res.data?.data || res.data
        if (d) {
          setSettings(d)
          setForm({
            spend_per_point: d.spend_per_point ?? 2,
            peso_value_per_point: d.peso_value_per_point ?? 0.1,
            minimum_points_to_redeem: d.minimum_points_to_redeem ?? 100,
            points_expiry_days: d.points_expiry_days ?? 30,
            enabled: d.enabled !== false,
          })
        }
      })
      .catch((err) => {
        if (!active) return
        setError(err.response?.data?.message || 'Failed to load loyalty settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await loyaltySettingsApi.history({
        page: historyPage,
        per_page: 5,
        search: historySearch.trim() || undefined,
        type: historyType !== 'all' ? historyType : undefined,
      })
      const items = res.data?.data || []
      const meta = res.data?.meta || {}
      setHistoryList(items)
      setHistoryTotalPages(meta.last_page || 1)
      setHistoryTotalCount(meta.total || 0)
    } catch (err) {
      console.error('Failed to load loyalty ledger history:', err)
      setHistoryList([])
    } finally {
      setHistoryLoading(false)
    }
  }, [historyPage, historySearch, historyType])

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      if (active) fetchHistory()
    }, 200)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [fetchHistory])

  function handleSearchChange(e) {
    setHistorySearch(e.target.value)
    setHistoryPage(1)
  }

  function handleTypeChange(e) {
    setHistoryType(e.target.value)
    setHistoryPage(1)
  }

  const exampleCalc = useMemo(() => {
    const spend = Number(form.spend_per_point)
    const pesoVal = Number(form.peso_value_per_point)
    if (!Number.isFinite(spend) || spend <= 0 || !Number.isFinite(pesoVal) || pesoVal <= 0) {
      return null
    }

    const testSpend = 200
    const points = Math.floor(testSpend / spend)
    const worth = points * pesoVal
    const percentBack = ((pesoVal / spend) * 100).toFixed(1).replace(/\.0$/, '')

    return {
      testSpend,
      points,
      worth: worth.toFixed(2),
      percentBack,
    }
  }, [form.spend_per_point, form.peso_value_per_point])

  async function handleSave(e) {
    e.preventDefault()
    setMessage(null)
    setError(null)

    const spend = Number(form.spend_per_point)
    const pesoVal = Number(form.peso_value_per_point)
    const minPts = Number(form.minimum_points_to_redeem)
    const expiry = Number(form.points_expiry_days)

    if (!Number.isFinite(spend) || spend <= 0) {
      setError('Spend per point must be greater than 0.')
      return
    }
    if (!Number.isFinite(pesoVal) || pesoVal <= 0) {
      setError('Peso value per point must be greater than 0.')
      return
    }
    if (!Number.isInteger(minPts) || minPts < 1) {
      setError('Minimum points to redeem must be a whole number of at least 1.')
      return
    }
    if (!Number.isInteger(expiry) || expiry < 0 || expiry > 365) {
      setError('Points expiry days must be a whole number between 0 and 365.')
      return
    }

    setSaving(true)
    try {
      const res = await loyaltySettingsApi.update({
        spend_per_point: spend,
        peso_value_per_point: pesoVal,
        minimum_points_to_redeem: minPts,
        points_expiry_days: expiry,
        enabled: Boolean(form.enabled),
      })
      const updated = res.data?.data || res.data
      setSettings(updated)
      setMessage(res.data?.message || 'Loyalty settings updated successfully.')
      setTimeout(() => setMessage(null), 5000)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save loyalty settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="dr-card sa-card loyalty-card">
      <div className="dr-card-head loyalty-card-head">
        <div className="loyalty-head-left">
          <div>
            <h2>Loyalty Program Settings</h2>
            <p>
              Configure customer reward rates, redemption thresholds, and expiration policy.
            </p>
          </div>
        </div>

        <div className="loyalty-status-toggle">
          <label className="loyalty-toggle-label">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              disabled={loading || saving}
            />
            <span className={`dr-badge ${form.enabled ? 'on' : 'off'}`}>
              {form.enabled ? 'Program Enabled' : 'Program Disabled'}
            </span>
          </label>
        </div>
      </div>

      {message && (
        <div className="loyalty-alert success">
          <LuCircleCheck size={16} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="loyalty-alert error">
          <LuTriangleAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="loyalty-form">
        <div className="loyalty-grid">
          <div className="loyalty-field">
            <label>
              Spend per Point (₱)
              <span className="loyalty-help">Amount spent to earn 1 point</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.spend_per_point}
              onChange={(e) => setForm((f) => ({ ...f, spend_per_point: e.target.value }))}
              disabled={loading || saving}
              required
            />
          </div>

          <div className="loyalty-field">
            <label>
              Peso Value per Point (₱)
              <span className="loyalty-help">Redemption value of 1 point</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.peso_value_per_point}
              onChange={(e) => setForm((f) => ({ ...f, peso_value_per_point: e.target.value }))}
              disabled={loading || saving}
              required
            />
          </div>

          <div className="loyalty-field">
            <label>
              Minimum Points to Redeem
              <span className="loyalty-help">Lowest points required for discount</span>
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.minimum_points_to_redeem}
              onChange={(e) => setForm((f) => ({ ...f, minimum_points_to_redeem: e.target.value }))}
              disabled={loading || saving}
              required
            />
          </div>

          <div className="loyalty-field">
            <label>
              Points Expiry (Days)
              <span className="loyalty-help">Days before inactive points expire (0 = never)</span>
            </label>
            <input
              type="number"
              min="0"
              max="365"
              step="1"
              value={form.points_expiry_days}
              onChange={(e) => setForm((f) => ({ ...f, points_expiry_days: e.target.value }))}
              disabled={loading || saving}
              required
            />
          </div>
        </div>

        {exampleCalc ? (
          <div className="loyalty-example-banner">
            <div className="loyalty-example-text">
              <span className="loyalty-example-title">Live Example</span>
              <strong className="loyalty-example-formula">
                Spend ₱{exampleCalc.testSpend} → {exampleCalc.points} points → worth ₱{exampleCalc.worth} ({exampleCalc.percentBack}% back)
              </strong>
              <span className="loyalty-example-sub">
                Percent back is computed as peso value ÷ spend per point (₱{Number(form.peso_value_per_point || 0).toFixed(2)} ÷ ₱{Number(form.spend_per_point || 0).toFixed(2)} = {exampleCalc.percentBack}%).
              </span>
            </div>
          </div>
        ) : null}

        <div className="loyalty-foot">
          <div className="loyalty-meta-note">
            {settings?.updated_at ? (
              <span>Last updated by <strong>{settings.updated_by_name || 'Owner'}</strong> on {new Date(settings.updated_at).toLocaleDateString()}</span>
            ) : (
              <span>Default system rates</span>
            )}
          </div>
          <button
            type="submit"
            className="dr-btn-primary loyalty-save-btn"
            disabled={loading || saving}
          >
            {saving ? 'Saving…' : 'Save Loyalty Settings'}
          </button>
        </div>
      </form>

      {/* View History Table */}
      <div className="loyalty-history-card">
        <div className="loyalty-history-header">
          <div className="loyalty-history-title-wrap">
            <div>
              <h3>Loyalty Ledger History</h3>
              <p>Audit log of all points earned, redeemed, refunded, and expired across members.</p>
            </div>
          </div>
          <button
            type="button"
            className="loyalty-history-refresh-btn"
            onClick={fetchHistory}
            disabled={historyLoading}
            title="Refresh history"
          >
            <LuRefreshCw size={14} className={historyLoading ? 'loyalty-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Toolbar: Search & Type Filter */}
        <div className="loyalty-history-toolbar">
          <div className="loyalty-history-search">
            <LuSearch size={15} />
            <input
              type="search"
              placeholder="Search member by name, code, phone..."
              value={historySearch}
              onChange={handleSearchChange}
            />
          </div>

          <div className="loyalty-history-filter">
            <label className="loyalty-history-filter-label">Filter by type:</label>
            <select
              value={historyType}
              onChange={handleTypeChange}
              className="loyalty-history-select"
            >
              <option value="all">All Types</option>
              <option value="earn">Earned (+)</option>
              <option value="redeem">Redeemed (-)</option>
              <option value="refund">Refunded (+)</option>
              <option value="expire">Expired (-)</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="loyalty-history-table-wrap">
          <table className="loyalty-history-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Points</th>
                <th>Order</th>
                <th>Date</th>
                <th>Balance After</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && historyList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="loyalty-history-empty">
                    Loading loyalty ledger history…
                  </td>
                </tr>
              ) : historyList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="loyalty-history-empty">
                    No loyalty history entries found.
                  </td>
                </tr>
              ) : (
                historyList.map((entry) => {
                  const type = entry.type || 'earn'
                  const pts = entry.points ?? 0
                  const isPositive = pts > 0
                  const isNegative = pts < 0
                  return (
                    <tr key={entry.id}>
                      <td>
                        <div className="loyalty-history-cust">
                          <strong>{entry.customer_name}</strong>
                          {entry.customer_code && entry.customer_code !== '—' && (
                            <span className="loyalty-history-code">{entry.customer_code}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`loyalty-type-badge ${type}`}>
                          {type === 'earn'
                            ? 'Earn'
                            : type === 'redeem'
                            ? 'Redeem'
                            : type === 'refund'
                            ? 'Refund'
                            : type === 'expire'
                            ? 'Expire'
                            : type}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`loyalty-history-pts ${
                            isPositive ? 'positive' : isNegative ? 'negative' : 'neutral'
                          }`}
                        >
                          {entry.signed_points || (pts > 0 ? `+${pts}` : pts)} pts
                        </span>
                      </td>
                      <td>
                        <span className="loyalty-history-order">
                          {entry.order_code || '—'}
                        </span>
                      </td>
                      <td className="loyalty-history-date">{entry.date || '—'}</td>
                      <td>
                        <strong className="loyalty-history-bal">
                          {(entry.balance_after ?? 0).toLocaleString()} pts
                        </strong>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5-rows-per-page Pagination */}
        <div className="loyalty-history-pagination">
          <span className="loyalty-history-count">
            Showing{' '}
            {historyTotalCount === 0
              ? '0'
              : `${(historyPage - 1) * 5 + 1}–${Math.min(historyPage * 5, historyTotalCount)}`}{' '}
            of {historyTotalCount} entries (5 rows per page)
          </span>

          <div className="loyalty-history-pages">
            <button
              type="button"
              className="loyalty-page-btn"
              disabled={historyPage <= 1 || historyLoading}
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
              <span>Previous</span>
            </button>
            <span className="loyalty-page-current">
              Page {historyPage} of {historyTotalPages}
            </span>
            <button
              type="button"
              className="loyalty-page-btn"
              disabled={historyPage >= historyTotalPages || historyLoading}
              onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
              aria-label="Next page"
            >
              <span>Next</span>
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
