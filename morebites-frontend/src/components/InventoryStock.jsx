import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LuSearch,
  LuPlus,
  LuClock,
  LuFilter,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuX,
  LuPencil,
  LuBoxes,
  LuTriangleAlert,
  LuCalendar,
  LuCircleCheck,
  LuRotateCcw,
  LuTrash2,
  LuShoppingCart,
  LuSlidersHorizontal,
  LuPackage,
} from 'react-icons/lu'
import {
  IconBox,
  IconCalendar,
  IconCart,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconClose,
  IconEdit,
  IconFilter,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSliders,
  IconTrash,
  IconUpload,
  IconWarning,
} from './Icons'
import { inventoryApi } from '../api/client'
import {
  getCategoryConfig,
  getSubcategoryDetailConfig,
  INVENTORY_CATEGORY_LIST,
  formatInventoryCategory,
} from '../data/inventoryCategories'
import './InventoryStock.css'

const CATEGORIES = INVENTORY_CATEGORY_LIST
const UNITS = [
  { value: 'pcs', label: 'pcs' },
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'grams' },
  { value: 'L', label: 'Liters' },
]
const STATUSES = [
  'All Status',
  'Out of Stock',
  'Low Stock',
  'Expiring Soon',
  'Expires Today',
  'Expired',
  'Sufficient',
]
const ACTIVITY_TYPES = [
  'All Activities',
  'New Stock',
  'Restocked',
  'Stock Deducted',
  'Manual Adjustment',
  'Expired',
]
const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]
const PAGE_SIZE = 5
const LOG_PAGE_SIZE = 7

function statusClass(s) {
  if (s === 'Out of Stock') return 'out'
  if (s === 'Expired' || s === 'Expires Today') return 'expired'
  if (s === 'Expiring Soon' || s === 'Low Stock') return 'expiring'
  return 'ok'
}

function daysLeftClass(days) {
  if (days == null) return ''
  if (days <= 0) return 'danger'
  if (days <= 7) return 'warn'
  return 'ok'
}

function actionClass(key) {
  if (key === 'new' || key === 'restock') return 'new'
  if (key === 'deduct' || key === 'expired') return 'deduct'
  if (key === 'adjust') return 'adjust'
  return 'new'
}

function qtyClass(qty) {
  if (qty == null) return ''
  if (qty > 0) return 'pos'
  if (qty < 0) return 'neg'
  return ''
}

function formatStock(value, unit = 'pcs') {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  const pretty = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
  return `${pretty} ${unit}`
}

function formatDaysLeft(days) {
  if (days == null) return '—'
  if (days < 0) return `${days}d`
  if (days === 0) return '0d'
  return `${days}d`
}

function notifyInventoryChanged() {
  window.dispatchEvent(new Event('mb:inventory-changed'))
}

function FilterSelect({ value, options, open, onToggle, onSelect, menuRef }) {
  return (
    <div className="inv-filter" ref={menuRef}>
      <button type="button" className="inv-filter-btn" onClick={onToggle}>
        {value}
        <LuChevronDown size={15} />
      </button>
      {open && (
        <div className="inv-menu">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`inv-option${value === opt ? ' active' : ''}`}
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

function UnitInput({ value, onChange, unit = 'pcs', min = '0', placeholder }) {
  return (
    <div className="inv-input-unit">
      <input
        type="number"
        min={min}
        step="any"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <span className="inv-unit-suffix">{unit}</span>
    </div>
  )
}

const EMPTY_FORM = {
  category: '',
  subcategory: '',
  subcategory_detail: '',
  name: '',
  stock: '0',
  reorder: '',
  unit: 'pcs',
  date_placed: '',
  expiry_date: '',
}

const EMPTY_LOG_STATS = {
  restock: 0,
  deductions: 0,
  adjustments: 0,
  expired: 0,
  total_today: 0,
}

export default function InventoryStock({ onOpenExpiring }) {
  const [items, setItems] = useState([])
  const [logs, setLogs] = useState([])
  const [logStats, setLogStats] = useState(EMPTY_LOG_STATS)
  const [pageStats, setPageStats] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All Categories')
  const [status, setStatus] = useState('All Status')
  const [page, setPage] = useState(1)
  const [openFilter, setOpenFilter] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [restockItem, setRestockItem] = useState(null)
  const [restockQty, setRestockQty] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedLog, setSelectedLog] = useState(null)
  const [logSearch, setLogSearch] = useState('')
  const [logCategory, setLogCategory] = useState('All Categories')
  const [logActivity, setLogActivity] = useState('All Activities')
  const [logRange, setLogRange] = useState('today')
  const [logPage, setLogPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const catRef = useRef(null)
  const statusRef = useRef(null)
  const logCatRef = useRef(null)
  const logActRef = useRef(null)
  const logRangeRef = useRef(null)

  const reload = useCallback(async () => {
    const [i, l] = await Promise.all([inventoryApi.list(), inventoryApi.logs({ range: 'all' })])
    setItems(i.data?.data || i.data || [])
    setLogs(l.data?.data || l.data || [])
    setLogStats(l.data?.meta?.stats || EMPTY_LOG_STATS)
    setPageStats(i.data?.meta?.stats || null)
  }, [])

  useEffect(() => {
    reload().catch(console.error)
  }, [reload])

  useEffect(() => {
    function onDoc(e) {
      const refs = [catRef, statusRef, logCatRef, logActRef, logRangeRef]
      const inside = refs.some((r) => r.current && r.current.contains(e.target))
      if (!inside) setOpenFilter(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (category !== 'All Categories' && item.category !== category) return false
      if (status !== 'All Status' && item.status !== status) return false
      if (q) {
        const hay = [item.name, item.category, item.batch_no]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, search, category, status])

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase()
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    return logs.filter((log) => {
      if (logCategory !== 'All Categories' && log.category !== logCategory) return false
      if (logActivity !== 'All Activities' && log.action !== logActivity) return false

      if (logRange !== 'all') {
        const dt = new Date(log.datetime)
        if (!Number.isNaN(dt.getTime())) {
          if (logRange === 'today' && dt < startOfToday) return false
          if (logRange === '7d' && dt < new Date(now.getTime() - 7 * 86400000)) return false
          if (logRange === '30d' && dt < new Date(now.getTime() - 30 * 86400000)) return false
        }
      }

      if (q) {
        const hay = [log.item, log.batch_no, log.reason, log.category, log.action]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [logs, logSearch, logCategory, logActivity, logRange])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const logTotalPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE))
  const logCurrentPage = Math.min(logPage, logTotalPages)
  const logRows = filteredLogs.slice(
    (logCurrentPage - 1) * LOG_PAGE_SIZE,
    logCurrentPage * LOG_PAGE_SIZE,
  )

  const computedStats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000
    return {
      total: items.length,
      low: items.filter((i) => i.status === 'Low Stock' || i.status === 'Out of Stock').length,
      expiring: items.filter(
        (i) => i.status === 'Expiring Soon' || i.status === 'Expires Today',
      ).length,
      ok: items.filter((i) => i.status === 'Sufficient').length,
      added_week: items.filter((i) => {
        const raw = i.date_placed_raw
        if (!raw) return false
        const t = new Date(raw).getTime()
        return !Number.isNaN(t) && t >= weekAgo
      }).length,
    }
  }, [items])

  const stats = {
    total: pageStats?.total ?? computedStats.total,
    low: pageStats?.low ?? computedStats.low,
    expiring: pageStats?.expiring ?? computedStats.expiring,
    ok: pageStats?.ok ?? computedStats.ok,
    added_week: pageStats?.added_week ?? computedStats.added_week,
  }

  async function afterMutation() {
    await reload()
    notifyInventoryChanged()
  }

  function openHistory() {
    setLogSearch('')
    setLogCategory('All Categories')
    setLogActivity('All Activities')
    setLogRange('today')
    setLogPage(1)
    setSelectedLog(null)
    setHistoryOpen(true)
    reload().catch(console.error)
  }

  function closeHistory() {
    setHistoryOpen(false)
    setSelectedLog(null)
  }

  function exportLogs() {
    const header = [
      'Date & Time',
      'Item',
      'Batch No',
      'Action',
      'Quantity',
      'New Stock',
      'Reason',
      'Performed By',
    ]
    const lines = filteredLogs.map((log) =>
      [
        log.datetime,
        log.item,
        log.batch_no || '',
        log.action,
        log.quantity_label || '',
        log.level || formatStock(log.new_stock, log.unit),
        log.reason || '',
        log.performed_by || '',
      ]
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-activity-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function buildPayload() {
    const config = getCategoryConfig(form.category)
    const trackExpiry = config?.trackExpiry !== false
    const detailConfig = getSubcategoryDetailConfig(form.category, form.subcategory)

    return {
      name: form.name.trim(),
      category: form.category,
      subcategory: form.subcategory || null,
      subcategory_detail: detailConfig ? form.subcategory_detail || null : null,
      stock: Number(form.stock),
      unit: form.unit || 'pcs',
      reorder_level: Number(form.reorder),
      date_placed: form.date_placed || null,
      expiry_date: trackExpiry ? form.expiry_date || null : null,
    }
  }

  function validateForm() {
    if (!form.category) {
      alert('Please select a category first.')
      return false
    }
    if (!form.subcategory) {
      alert('Please select a subcategory.')
      return false
    }
    const detailConfig = getSubcategoryDetailConfig(form.category, form.subcategory)
    if (detailConfig && !form.subcategory_detail) {
      alert(`Please select a ${detailConfig.label.toLowerCase()}.`)
      return false
    }
    if (!form.name.trim()) {
      alert('Item name is required.')
      return false
    }
    if (form.stock === '' || Number.isNaN(Number(form.stock))) {
      alert('Stock quantity is required.')
      return false
    }
    if (form.reorder === '' || Number.isNaN(Number(form.reorder))) {
      alert('Reorder point is required.')
      return false
    }
    return true
  }

  async function addStock() {
    if (!validateForm()) return
    setSaving(true)
    try {
      await inventoryApi.create(buildPayload())
      setForm(EMPTY_FORM)
      setAddOpen(false)
      setPage(1)
      await afterMutation()
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to add stock.')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit() {
    if (!editItem) return
    if (!validateForm()) return
    setSaving(true)
    try {
      await inventoryApi.update(editItem.id, buildPayload())
      setEditItem(null)
      setForm(EMPTY_FORM)
      await afterMutation()
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to update item.')
    } finally {
      setSaving(false)
    }
  }

  async function saveRestock() {
    if (!restockItem) return
    const qty = Number(restockQty)
    if (!qty || qty <= 0) {
      alert('Enter a quantity greater than 0.')
      return
    }
    setSaving(true)
    try {
      await inventoryApi.restock(restockItem.id, qty)
      setRestockItem(null)
      setRestockQty('')
      await afterMutation()
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to restock.')
    } finally {
      setSaving(false)
    }
  }

  async function removeItem(id) {
    if (!window.confirm('Delete this inventory item? Linked menu items will be disabled.')) {
      return
    }
    try {
      await inventoryApi.remove(id)
      await afterMutation()
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to delete item.')
    }
  }

  function openEdit(item) {
    const config = getCategoryConfig(item.category)
    setEditItem(item)
    setForm({
      category: item.category || '',
      subcategory: item.subcategory || '',
      subcategory_detail: item.subcategory_detail || '',
      name: item.name || '',
      stock: String(item.stock ?? '0'),
      reorder: String(item.reorder ?? ''),
      unit: item.unit || config?.defaultUnit || 'pcs',
      date_placed: item.date_placed_raw || '',
      expiry_date: item.expiry_date_raw || '',
    })
  }

  function handleCategoryChange(category) {
    const config = getCategoryConfig(category)
    setForm({
      ...EMPTY_FORM,
      category,
      unit: config?.defaultUnit || 'pcs',
    })
  }

  function openRestock(item) {
    setRestockItem(item)
    setRestockQty('')
  }

  function closeFormModal() {
    setAddOpen(false)
    setEditItem(null)
    setForm(EMPTY_FORM)
  }

  function renderStockForm({ title, subtitle, submitLabel, onSubmit }) {
    const isEdit = Boolean(editItem)
    const categoryConfig = getCategoryConfig(form.category)
    const detailConfig = getSubcategoryDetailConfig(form.category, form.subcategory)
    const showDetails = Boolean(form.category)
    const showExpiry = categoryConfig?.trackExpiry !== false

    return (
      <div className="inv-backdrop" onClick={closeFormModal} role="presentation">
        <div
          className="inv-modal inv-modal-form"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="inv-modal-head inv-modal-head-form">
            <div>
              <h2>{title}</h2>
              <p className="inv-modal-sub">{subtitle}</p>
            </div>
            <button type="button" className="inv-modal-close-circle" onClick={closeFormModal} aria-label="Close">
              <LuX size={18} />
            </button>
          </div>

          <div className="inv-modal-body inv-modal-body-form">
            <section className="inv-form-section">
              <h3 className="inv-form-section-title">CATEGORY</h3>
              <label>
                Category
                <select value={form.category} onChange={(e) => handleCategoryChange(e.target.value)}>
                  <option value="">Select category...</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {!showDetails ? (
                <p className="inv-field-hint">
                  Choose a category first to see the matching subcategories and item fields.
                </p>
              ) : null}
            </section>

            {showDetails ? (
              <>
                <section className="inv-form-section">
                  <h3 className="inv-form-section-title">ITEM INFORMATION</h3>
                  <label>
                    Subcategory
                    <select
                      value={form.subcategory}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          subcategory: e.target.value,
                          subcategory_detail: '',
                        }))
                      }
                    >
                      <option value="">Select subcategory...</option>
                      {(categoryConfig?.subcategories || []).map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </label>
                  {detailConfig ? (
                    <label>
                      {detailConfig.label}
                      <select
                        value={form.subcategory_detail}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, subcategory_detail: e.target.value }))
                        }
                      >
                        <option value="">Select {detailConfig.label.toLowerCase()}...</option>
                        {detailConfig.options.map((part) => (
                          <option key={part} value={part}>
                            {part}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label>
                    Item Name
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Frozen Fries"
                    />
                  </label>
                  <div className="inv-form-row">
                    <label>
                      Unit Type
                      <select
                        value={form.unit}
                        onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      >
                        {UNITS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {isEdit ? 'Current Stock' : 'Initial Stock'}
                      <UnitInput
                        value={form.stock}
                        unit={form.unit}
                        onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                      />
                    </label>
                  </div>
                </section>

                <section className="inv-form-section">
                  <h3 className="inv-form-section-title">STOCK THRESHOLD</h3>
                  <label>
                    Reorder Point
                    <UnitInput
                      value={form.reorder}
                      unit={form.unit}
                      onChange={(e) => setForm((f) => ({ ...f, reorder: e.target.value }))}
                      placeholder="e.g. 10"
                    />
                  </label>
                  <p className="inv-field-hint">
                    System will alert when stock falls below this number.
                  </p>
                </section>

                <section className="inv-form-section">
                  <h3 className="inv-form-section-title">DATE INFORMATION</h3>
                  <div className="inv-form-row">
                    <label>
                      Date Placed
                      <div className="inv-date-field">
                        <IconCalendar />
                        <input
                          type="date"
                          value={form.date_placed}
                          onChange={(e) => setForm((f) => ({ ...f, date_placed: e.target.value }))}
                        />
                      </div>
                    </label>
                    {showExpiry ? (
                      <label>
                        Expiry Date
                        <div className="inv-date-field">
                          <IconCalendar />
                          <input
                            type="date"
                            value={form.expiry_date}
                            onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
                          />
                        </div>
                      </label>
                    ) : null}
                  </div>
                  <p className="inv-field-hint">
                    {showExpiry
                      ? 'System will alert when item is near or past its expiry date.'
                      : 'Non-perishable items do not require an expiry date.'}
                  </p>
                </section>
              </>
            ) : null}
          </div>

          <div className="inv-modal-foot">
            <button type="button" className="inv-btn-cancel" onClick={closeFormModal}>
              Cancel
            </button>
            <button
              type="button"
              className="inv-btn-primary"
              onClick={onSubmit}
              disabled={saving || !showDetails}
            >
              {saving ? 'Saving…' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const rangeLabel = DATE_RANGES.find((r) => r.value === logRange)?.label || 'Today'

  return (
    <div className="inv-page">
      <header className="inv-header">
        <div className="inv-header-copy">
          <h1>Inventory Stock</h1>
          <p className="inv-subtitle">Manage and monitor your inventory items in real-time.</p>
        </div>
        <div className="inv-header-actions">
          <button type="button" className="inv-btn-outline" onClick={openHistory}>
            <LuClock size={16} /> Stock History
          </button>
          <button
            type="button"
            className="inv-btn-primary"
            onClick={() => {
              setForm(EMPTY_FORM)
              setAddOpen(true)
            }}
          >
            <LuPlus size={16} /> Add Stock
          </button>
        </div>
      </header>

      <section className="inv-stats">
        <article className="inv-stat">
          <div className="inv-stat-icon yellow">
            <LuPackage size={22} />
          </div>
          <div>
            <div className="inv-stat-label">Total Stock Items</div>
            <div className="inv-stat-value">{stats.total}</div>
          </div>
        </article>
        <article className="inv-stat">
          <div className="inv-stat-icon red">
            <LuTriangleAlert size={22} />
          </div>
          <div>
            <div className="inv-stat-label">Low Stock Alerts</div>
            <div className="inv-stat-value danger">{stats.low}</div>
          </div>
        </article>
        <article
          className={`inv-stat${onOpenExpiring ? ' inv-stat-clickable' : ''}`}
          onClick={onOpenExpiring}
          onKeyDown={
            onOpenExpiring
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenExpiring()
                  }
                }
              : undefined
          }
          role={onOpenExpiring ? 'button' : undefined}
          tabIndex={onOpenExpiring ? 0 : undefined}
        >
          <div className="inv-stat-icon orange">
            <LuCalendar size={22} />
          </div>
          <div>
            <div className="inv-stat-label">Expiring Soon</div>
            <div className="inv-stat-value warn">{stats.expiring}</div>
          </div>
        </article>
        <article className="inv-stat">
          <div className="inv-stat-icon green">
            <LuCircleCheck size={22} />
          </div>
          <div>
            <div className="inv-stat-label">Sufficient Items</div>
            <div className="inv-stat-value success">{stats.ok}</div>
          </div>
        </article>
      </section>

      <section className="inv-toolbar">
        <div className="inv-search">
          <LuSearch size={16} />
          <input
            type="search"
            placeholder="Search name, categories, batch no..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <FilterSelect
          value={category}
          options={['All Categories', ...CATEGORIES]}
          open={openFilter === 'cat'}
          onToggle={() => setOpenFilter((v) => (v === 'cat' ? null : 'cat'))}
          onSelect={(v) => {
            setCategory(v)
            setOpenFilter(null)
            setPage(1)
          }}
          menuRef={catRef}
        />
        <FilterSelect
          value={status}
          options={STATUSES}
          open={openFilter === 'status'}
          onToggle={() => setOpenFilter((v) => (v === 'status' ? null : 'status'))}
          onSelect={(v) => {
            setStatus(v)
            setOpenFilter(null)
            setPage(1)
          }}
          menuRef={statusRef}
        />
        <button
          type="button"
          className="inv-btn-filter"
          onClick={() => {
            setPage(1)
            setOpenFilter(null)
          }}
        >
          <LuFilter size={15} /> Filter
        </button>
      </section>

      <section className="inv-table-card">
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Reorder Point</th>
                <th>Date Placed</th>
                <th>Expiry Date</th>
                <th>Days Left</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="inv-empty">
                    No inventory items found.
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const sc = statusClass(item.status)
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="inv-name">{item.name}</div>
                      </td>
                      <td>
                        <span className="inv-category-text">
                          {item.category_label ||
                            formatInventoryCategory(
                              item.category,
                              item.subcategory,
                              item.subcategory_detail,
                            )}
                        </span>
                      </td>
                      <td>
                        <div className={`inv-stock-val ${item.status === 'Low Stock' ? 'low' : item.status === 'Out of Stock' ? 'out' : ''}`}>
                          <strong>{item.stock}</strong> <span className="inv-unit">{item.unit}</span>
                        </div>
                      </td>
                      <td>
                        <span className="inv-reorder-val">
                          {item.reorder} <span className="inv-unit">{item.unit}</span>
                        </span>
                      </td>
                      <td className="inv-date-cell">{item.date_placed || '—'}</td>
                      <td className="inv-date-cell">{item.expiry_date || '—'}</td>
                      <td>
                        <span className={`inv-days-pill ${daysLeftClass(item.days_left)}`}>
                          {formatDaysLeft(item.days_left)}
                        </span>
                      </td>
                      <td>
                        <span className={`inv-badge ${sc}`}>{item.status}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="inv-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="inv-icon-btn restock"
                            aria-label="Restock"
                            title="Restock"
                            onClick={() => openRestock(item)}
                          >
                            <LuRotateCcw size={15} />
                          </button>
                          <button
                            type="button"
                            className="inv-icon-btn edit"
                            aria-label="Edit"
                            title="Edit"
                            onClick={() => openEdit(item)}
                          >
                            <LuPencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="inv-icon-btn danger"
                            aria-label="Delete"
                            title="Delete"
                            onClick={() => removeItem(item.id)}
                          >
                            <LuTrash2 size={15} />
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
            Showing {(currentPage - 1) * PAGE_SIZE + (filtered.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} items
          </span>
          <div className="inv-pages">
            <button
              type="button"
              className="inv-page-btn arrow"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`inv-page-btn${n === currentPage ? ' active' : ''}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="inv-page-btn arrow"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {addOpen &&
        renderStockForm({
          title: 'Add Stock',
          subtitle: 'Add a new item to inventory',
          submitLabel: 'Add Stock',
          onSubmit: addStock,
        })}

      {editItem &&
        renderStockForm({
          title: 'Edit Stock',
          subtitle: 'Update inventory item details',
          submitLabel: 'Save Changes',
          onSubmit: saveEdit,
        })}

      {restockItem && (
        <div className="inv-backdrop" onClick={() => setRestockItem(null)} role="presentation">
          <div className="inv-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="inv-modal-head">
              <h2>Restock {restockItem.name}</h2>
              <button
                type="button"
                className="inv-modal-close-circle"
                onClick={() => setRestockItem(null)}
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>
            <div className="inv-modal-body">
              <p style={{ margin: '0 0 12px', color: '#666', fontSize: 13 }}>
                Current stock:{' '}
                <strong>
                  {restockItem.stock} {restockItem.unit}
                </strong>
              </p>
              <label>
                Quantity to add
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  placeholder={`e.g. 10 ${restockItem.unit}`}
                  autoFocus
                />
              </label>
            </div>
            <div className="inv-modal-foot">
              <button type="button" className="inv-btn-cancel" onClick={() => setRestockItem(null)}>
                Cancel
              </button>
              <button type="button" className="inv-btn-primary" onClick={saveRestock} disabled={saving}>
                {saving ? 'Saving…' : 'Restock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="inv-backdrop inv-activity-backdrop" onClick={closeHistory} role="presentation">
          <div className="inv-activity-shell" onClick={(e) => e.stopPropagation()}>
            <div
              className="inv-modal inv-activity"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inv-activity-title"
            >
              <div className="inv-modal-head inv-activity-head">
                <div>
                  <h2 id="inv-activity-title">Inventory Activity Log</h2>
                  <p className="inv-activity-sub">View and track all inventory movements and changes</p>
                </div>
                <button type="button" className="inv-modal-close-circle" onClick={closeHistory} aria-label="Close">
                  <LuX size={18} />
                </button>
              </div>

              <div className="inv-activity-stats">
                <article className="inv-activity-stat">
                  <div className="inv-activity-stat-icon green">
                    <LuBoxes size={20} />
                  </div>
                  <div>
                    <div className="inv-activity-stat-label">New Stock / Restock</div>
                    <div className="inv-activity-stat-value">{logStats.restock}</div>
                  </div>
                </article>
                <article className="inv-activity-stat">
                  <div className="inv-activity-stat-icon blue">
                    <LuShoppingCart size={20} />
                  </div>
                  <div>
                    <div className="inv-activity-stat-label">Stock Deductions</div>
                    <div className="inv-activity-stat-value">{logStats.deductions}</div>
                  </div>
                </article>
                <article className="inv-activity-stat">
                  <div className="inv-activity-stat-icon orange">
                    <LuSlidersHorizontal size={20} />
                  </div>
                  <div>
                    <div className="inv-activity-stat-label">Manual Adjustments</div>
                    <div className="inv-activity-stat-value">{logStats.adjustments}</div>
                  </div>
                </article>
                <article className="inv-activity-stat">
                  <div className="inv-activity-stat-icon red">
                    <LuTrash2 size={20} />
                  </div>
                  <div>
                    <div className="inv-activity-stat-label">Expired Items</div>
                    <div className="inv-activity-stat-value">{logStats.expired}</div>
                  </div>
                </article>
                <article className="inv-activity-stat total">
                  <div>
                    <div className="inv-activity-stat-label">Total Activities</div>
                    <div className="inv-activity-stat-value">
                      {logStats.total_today} <span>Today</span>
                    </div>
                  </div>
                </article>
              </div>

              <div className="inv-activity-toolbar">
                <div className="inv-search">
                  <LuSearch size={16} />
                  <input
                    type="search"
                    placeholder="Search item, batch no., reason..."
                    value={logSearch}
                    onChange={(e) => {
                      setLogSearch(e.target.value)
                      setLogPage(1)
                    }}
                  />
                </div>
                <FilterSelect
                  value={logCategory}
                  options={['All Categories', ...CATEGORIES]}
                  open={openFilter === 'logCat'}
                  onToggle={() => setOpenFilter((v) => (v === 'logCat' ? null : 'logCat'))}
                  onSelect={(v) => {
                    setLogCategory(v)
                    setOpenFilter(null)
                    setLogPage(1)
                  }}
                  menuRef={logCatRef}
                />
                <FilterSelect
                  value={logActivity}
                  options={ACTIVITY_TYPES}
                  open={openFilter === 'logAct'}
                  onToggle={() => setOpenFilter((v) => (v === 'logAct' ? null : 'logAct'))}
                  onSelect={(v) => {
                    setLogActivity(v)
                    setOpenFilter(null)
                    setLogPage(1)
                  }}
                  menuRef={logActRef}
                />
                <FilterSelect
                  value={rangeLabel}
                  options={DATE_RANGES.map((r) => r.label)}
                  open={openFilter === 'logRange'}
                  onToggle={() => setOpenFilter((v) => (v === 'logRange' ? null : 'logRange'))}
                  onSelect={(label) => {
                    const found = DATE_RANGES.find((r) => r.label === label)
                    setLogRange(found?.value || 'today')
                    setOpenFilter(null)
                    setLogPage(1)
                  }}
                  menuRef={logRangeRef}
                />
                <button
                  type="button"
                  className="inv-btn-filter"
                  onClick={() => {
                    setLogPage(1)
                    setOpenFilter(null)
                  }}
                >
                  <IconFilter /> Filter
                </button>
              </div>

              <div className="inv-table-wrap inv-activity-table-wrap">
                <table className="inv-table inv-activity-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Item / Batch No.</th>
                      <th>Action</th>
                      <th>Quantity</th>
                      <th>New Stock After Change</th>
                      <th>Date Placed / Expiry</th>
                      <th>Reason</th>
                      <th>Performed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="inv-empty">
                          No activity found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      logRows.map((log) => (
                        <tr
                          key={log.id}
                          className={selectedLog?.id === log.id ? 'selected' : ''}
                          onClick={() => setSelectedLog(log)}
                        >
                          <td className="inv-log-datetime">{log.datetime}</td>
                          <td>
                            <div className="inv-log-item">
                              <div>
                                <div className="inv-name">{log.item}</div>
                                <div className="inv-log-batch">
                                  {log.batch_no ? `Batch: ${log.batch_no}` : '—'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`inv-action-badge ${actionClass(log.action_key)}`}>
                              {log.action}
                            </span>
                            <div className="inv-action-label">{log.action_label}</div>
                          </td>
                          <td className={`inv-qty ${qtyClass(log.quantity)}`}>
                            {log.quantity_label || '—'}
                          </td>
                          <td>{log.level || formatStock(log.new_stock, log.unit)}</td>
                          <td>
                            <div>{log.date_placed || '—'}</div>
                            <div className="inv-log-expiry muted">
                              {log.expiry_date || 'No expiry'}
                            </div>
                          </td>
                          <td className="inv-log-reason">{log.reason || '—'}</td>
                          <td>{log.performed_by || 'System'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="inv-activity-foot">
                <span>
                  Showing {(logCurrentPage - 1) * LOG_PAGE_SIZE + (filteredLogs.length ? 1 : 0)} to{' '}
                  {Math.min(logCurrentPage * LOG_PAGE_SIZE, filteredLogs.length)} of{' '}
                  {filteredLogs.length} activities
                </span>
                <div className="inv-pages">
                  <button
                    type="button"
                    disabled={logCurrentPage <= 1}
                    onClick={() => setLogPage((p) => p - 1)}
                  >
                    {'<'}
                  </button>
                  {Array.from({ length: logTotalPages }, (_, i) => i + 1)
                    .filter((n) => {
                      if (logTotalPages <= 7) return true
                      if (n === 1 || n === logTotalPages) return true
                      return Math.abs(n - logCurrentPage) <= 1
                    })
                    .map((n, idx, arr) => {
                      const prev = arr[idx - 1]
                      const showEllipsis = prev != null && n - prev > 1
                      return (
                        <span key={n} className="inv-page-group">
                          {showEllipsis && <span className="inv-ellipsis">…</span>}
                          <button
                            type="button"
                            className={n === logCurrentPage ? 'active' : ''}
                            onClick={() => setLogPage(n)}
                          >
                            {n}
                          </button>
                        </span>
                      )
                    })}
                  <button
                    type="button"
                    disabled={logCurrentPage >= logTotalPages}
                    onClick={() => setLogPage((p) => p + 1)}
                  >
                    {'>'}
                  </button>
                </div>
                <button type="button" className="inv-btn-outline inv-btn-export" onClick={exportLogs}>
                  <LuUpload size={15} /> Export
                </button>
              </div>
            </div>

            {selectedLog && (
              <aside className="inv-activity-details" aria-label="Activity Details">
                <div className="inv-details-head">
                  <h3>Activity Details</h3>
                  <button
                    type="button"
                    className="inv-modal-close-circle"
                    onClick={() => setSelectedLog(null)}
                    aria-label="Close details"
                  >
                    <LuX size={18} />
                  </button>
                </div>
                <div className="inv-details-hero">
                  <span className={`inv-action-badge ${actionClass(selectedLog.action_key)}`}>
                    {selectedLog.action}
                  </span>
                  <div className="inv-details-item">
                    <div>
                      <div className="inv-name">{selectedLog.item}</div>
                      <div className="inv-log-batch">
                        {selectedLog.batch_no ? `Batch: ${selectedLog.batch_no}` : 'No batch'}
                      </div>
                    </div>
                  </div>
                </div>
                <dl className="inv-details-list">
                  <div>
                    <dt>Action</dt>
                    <dd>{selectedLog.action}</dd>
                  </div>
                  <div>
                    <dt>{(selectedLog.quantity ?? 0) >= 0 ? 'Quantity Added' : 'Quantity Deducted'}</dt>
                    <dd className={qtyClass(selectedLog.quantity)}>
                      {selectedLog.quantity_label || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Previous Stock</dt>
                    <dd>{formatStock(selectedLog.previous_stock, selectedLog.unit)}</dd>
                  </div>
                  <div>
                    <dt>New Stock (After Change)</dt>
                    <dd>
                      {selectedLog.level || formatStock(selectedLog.new_stock, selectedLog.unit)}
                    </dd>
                  </div>
                  <div>
                    <dt>Date Placed</dt>
                    <dd>{selectedLog.date_placed || '—'}</dd>
                  </div>
                  <div>
                    <dt>Expiry Date</dt>
                    <dd>{selectedLog.expiry_date || '—'}</dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{selectedLog.category || '—'}</dd>
                  </div>
                  <div>
                    <dt>Performed By</dt>
                    <dd>{selectedLog.performed_by || 'System'}</dd>
                  </div>
                  <div>
                    <dt>Date & Time</dt>
                    <dd>{selectedLog.datetime}</dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>{selectedLog.reason || '—'}</dd>
                  </div>
                  <div className="full">
                    <dt>Notes</dt>
                    <dd className="inv-details-notes">{selectedLog.notes || 'No notes.'}</dd>
                  </div>
                </dl>
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
