import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LuSearch,
  LuPlus,
  LuPencil,
  LuArchive,
  LuUtensils,
  LuRotateCcw,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuX,
  LuImage,
  LuTrash2,
} from 'react-icons/lu'
import { inventoryApi, mediaUrl, menuApi } from '../api/client'
import './MenuManagement.css'

const CATEGORIES = ['Pizza', 'Pasta', 'Sides', 'Beverages', 'Desserts']
const PAGE_SIZE = 8

function peso(n) {
  return `₱${Number(n).toLocaleString('en-PH')}`
}

function formatPrice(item) {
  if (item.hasSizes && item.sizes && item.sizes.length) {
    const prices = item.sizes.map((s) => Number(s.price))
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return min === max ? peso(min) : `${peso(min)} - ${peso(max)}`
  }
  return peso(item.price || 0)
}

function emptyForm() {
  return {
    id: null,
    name: '',
    description: '',
    category: '',
    image: '',
    imageFile: null,
    hasSizes: false,
    sizes: [{ name: '', price: '' }],
    ingredients: [],
    price: '',
    available: true,
  }
}

function ItemFormModal({ mode, initial, inventoryOptions, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    ...initial,
    description: initial?.description || '',
    price: initial?.price ?? '',
    imageFile: null,
    sizes:
      initial?.hasSizes && initial?.sizes?.length
        ? initial.sizes.map((s) => ({ name: s.name, price: String(s.price) }))
        : [{ name: '', price: '' }],
    ingredients: (initial?.ingredients || []).map((row) => ({
      inventory_item_id: String(row.inventory_item_id || ''),
      qty_per_serving: row.qty_per_serving != null ? String(row.qty_per_serving) : '',
    })),
  }))
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onImagePick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setForm((prev) => ({ ...prev, image: url, imageFile: file }))
  }

  function updateSize(index, key, value) {
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }))
  }

  function addSizeRow() {
    setForm((prev) => ({
      ...prev,
      sizes: [...prev.sizes, { name: '', price: '' }],
    }))
  }

  function removeSizeRow(index) {
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.length <= 1 ? prev.sizes : prev.sizes.filter((_, i) => i !== index),
    }))
  }

  function updateIngredient(index, key, value) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((row, i) =>
        i === index ? { ...row, [key]: value } : row,
      ),
    }))
  }

  function addIngredientRow() {
    setForm((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { inventory_item_id: '', qty_per_serving: '' }],
    }))
  }

  function removeIngredientRow(index) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }))
  }

  async function submit(e) {
    e?.preventDefault()
    if (!String(form.name || '').trim()) {
      alert('Please enter an item name.')
      return
    }
    if (!form.category) {
      alert('Please select a category.')
      return
    }

    const recipeRows = form.ingredients.filter(
      (row) => row.inventory_item_id && row.qty_per_serving !== '',
    )
    for (const row of recipeRows) {
      if (Number(row.qty_per_serving) <= 0 || Number.isNaN(Number(row.qty_per_serving))) {
        alert('Each linked ingredient needs a quantity greater than 0.')
        return
      }
    }
    const ids = recipeRows.map((r) => r.inventory_item_id)
    if (new Set(ids).size !== ids.length) {
      alert('Each inventory item can only be linked once.')
      return
    }

    const ingredients = recipeRows.map((row) => ({
      inventory_item_id: Number(row.inventory_item_id),
      qty_per_serving: Number(row.qty_per_serving),
    }))

    const description = String(form.description || '').trim()
    let payload
    if (form.hasSizes) {
      const validSizes = form.sizes.filter((s) => s.name.trim() && s.price !== '')
      if (!validSizes.length) {
        alert('Please add at least one size with a price.')
        return
      }
      payload = {
        ...form,
        name: String(form.name).trim(),
        description,
        price: 0,
        sizes: validSizes.map((s) => ({ name: s.name.trim(), price: Number(s.price) })),
        ingredients,
      }
    } else {
      if (form.price === '' || Number.isNaN(Number(form.price))) {
        alert('Please enter a price.')
        return
      }
      payload = {
        ...form,
        name: String(form.name).trim(),
        description,
        price: Number(form.price),
        sizes: [],
        ingredients,
      }
    }

    setSaving(true)
    try {
      await onSave(payload)
    } finally {
      setSaving(false)
    }
  }

  const title = mode === 'edit' ? 'Edit Menu Item' : 'Add New Item'
  const primaryLabel = mode === 'edit' ? 'Save Changes' : 'Add Item'
  const selectedIds = new Set(
    form.ingredients.map((r) => r.inventory_item_id).filter(Boolean),
  )

  return (
    <div className="menu-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="menu-modal-content"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="menu-modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="menu-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <LuX size={18} />
          </button>
        </div>

        <form className="menu-form" onSubmit={submit}>
          {/* Image Upload */}
          <div className="menu-form-group">
            <label>Item Image</label>
            <div className="menu-image-upload-box">
              {form.image ? (
                <div className="menu-image-preview-wrap">
                  <img
                    className="menu-image-preview"
                    src={mediaUrl(form.image)}
                    alt="Preview"
                  />
                  <button
                    type="button"
                    className="menu-image-remove"
                    onClick={() => setForm((f) => ({ ...f, image: '', imageFile: null }))}
                    aria-label="Remove image"
                  >
                    <LuX size={14} />
                  </button>
                </div>
              ) : (
                <div
                  className="menu-image-dropzone"
                  onClick={() => fileRef.current?.click()}
                >
                  <LuImage size={28} />
                  <span>Click to upload item image</span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onImagePick}
              />
            </div>
          </div>

          {/* Item Name */}
          <div className="menu-form-group">
            <label htmlFor="form-item-name">Item Name *</label>
            <input
              id="form-item-name"
              type="text"
              placeholder="e.g. Hawaiian Overload"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <div className="menu-form-group">
            <label htmlFor="form-item-desc">Description</label>
            <textarea
              id="form-item-desc"
              rows={3}
              placeholder="Short description of the item"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="menu-form-group">
            <label htmlFor="form-item-cat">Category *</label>
            <select
              id="form-item-cat"
              value={form.category}
              onChange={(e) => setField('category', e.target.value)}
              required
            >
              <option value="" disabled>
                Select Category
              </option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Size Options Toggle */}
          <div className="menu-form-group-toggle">
            <span>This item has size options</span>
            <button
              type="button"
              className={`menu-form-switch ${form.hasSizes ? 'on' : 'off'}`}
              onClick={() => setField('hasSizes', !form.hasSizes)}
              aria-pressed={form.hasSizes}
            >
              <span className="menu-form-switch-knob" />
            </button>
          </div>

          {/* Fixed Price or Sizes */}
          {!form.hasSizes ? (
            <div className="menu-form-group">
              <label htmlFor="form-item-price">Fixed Price (₱) *</label>
              <input
                id="form-item-price"
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => setField('price', e.target.value)}
                required
              />
            </div>
          ) : (
            <div className="menu-sizes-section">
              <label>Size Options & Pricing *</label>
              <div className="menu-sizes-list">
                {form.sizes.map((row, i) => (
                  <div key={i} className="menu-size-input-row">
                    <input
                      type="text"
                      placeholder="e.g. Regular"
                      value={row.name}
                      onChange={(e) => updateSize(i, 'name', e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Price (₱)"
                      value={row.price}
                      onChange={(e) => updateSize(i, 'price', e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="menu-remove-size-btn"
                      onClick={() => removeSizeRow(i)}
                      aria-label="Remove size option"
                    >
                      <LuTrash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="menu-add-size-row-btn"
                  onClick={addSizeRow}
                >
                  <LuPlus size={14} /> Add Another Size
                </button>
              </div>
            </div>
          )}

          {/* Link Ingredients Section */}
          <div className="menu-recipe-section">
            <label style={{ fontSize: 14, fontWeight: 600, color: '#333333' }}>
              Link Ingredients (Optional)
            </label>
            <p className="menu-recipe-hint">
              Connect inventory stock used per serving. Orders deduct these amounts automatically.
            </p>
            <div className="menu-recipe-list">
              {form.ingredients.map((row, i) => (
                <div key={i} className="menu-recipe-row">
                  <select
                    value={row.inventory_item_id}
                    onChange={(e) =>
                      updateIngredient(i, 'inventory_item_id', e.target.value)
                    }
                  >
                    <option value="">Select ingredient</option>
                    {inventoryOptions.map((opt) => {
                      const taken =
                        selectedIds.has(String(opt.id)) &&
                        String(opt.id) !== String(row.inventory_item_id)
                      return (
                        <option key={opt.id} value={opt.id} disabled={taken}>
                          {opt.name} ({opt.stock} {opt.unit})
                        </option>
                      )
                    })}
                  </select>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="menu-recipe-qty-input"
                    placeholder="Qty/serving"
                    value={row.qty_per_serving}
                    onChange={(e) =>
                      updateIngredient(i, 'qty_per_serving', e.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="menu-remove-size-btn"
                    onClick={() => removeIngredientRow(i)}
                    aria-label="Remove ingredient"
                  >
                    <LuTrash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="menu-add-size-row-btn"
                onClick={addIngredientRow}
              >
                <LuPlus size={14} /> Link Another Ingredient
              </button>
            </div>
          </div>

          <div className="menu-modal-footer">
            <button
              type="button"
              className="menu-modal-btn cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="menu-modal-btn save"
              disabled={saving}
            >
              {saving ? 'Saving...' : primaryLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ConfirmModal({ type, title, message, confirmLabel, onClose, onConfirm }) {
  return (
    <div className="menu-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="menu-modal-confirm-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`menu-confirm-icon-wrap ${type}`}>
          {type === 'restore' ? <LuRotateCcw size={26} /> : <LuArchive size={26} />}
        </div>
        <h2 className="menu-confirm-title">{title}</h2>
        <p className="menu-confirm-subtext">{message}</p>
        <div className="menu-confirm-actions">
          <button type="button" className="menu-modal-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`menu-modal-btn confirm-${type}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MenuManagement() {
  const [items, setItems] = useState([])
  const [inventoryOptions, setInventoryOptions] = useState([])
  const [tab, setTab] = useState('active') // 'active' | 'archived' | 'all'
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All Categories')
  const [page, setPage] = useState(1)
  const [formState, setFormState] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const reloadMenu = useCallback(() => {
    menuApi
      .list({ tab: 'all' })
      .then((r) => setItems(r.data?.data || r.data || []))
      .catch(console.error)
  }, [])

  const reloadInventory = useCallback(() => {
    inventoryApi
      .list()
      .then((r) => setInventoryOptions(r.data?.data || r.data || []))
      .catch(console.error)
  }, [])

  useEffect(() => {
    reloadMenu()
    reloadInventory()
    const onInv = () => {
      reloadMenu()
      reloadInventory()
    }
    window.addEventListener('mb:inventory-changed', onInv)
    const timer = setInterval(reloadMenu, 15000)
    return () => {
      window.removeEventListener('mb:inventory-changed', onInv)
      clearInterval(timer)
    }
  }, [reloadMenu, reloadInventory])

  const activeCount = items.filter((i) => !i.archived).length
  const archivedCount = items.filter((i) => i.archived).length
  const allCount = items.length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (tab === 'active' && item.archived) return false
      if (tab === 'archived' && !item.archived) return false
      // In 'all' tab, include both active and archived
      if (category !== 'All Categories' && item.category !== category) return false
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q)
      ) {
        return false
      }
      return true
    })
  }, [items, tab, search, category])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  async function toggleAvailable(item) {
    if (item.archived) return
    if (item.stockOk === false) return
    try {
      const { data } = await menuApi.toggleAvailability(item.id)
      const updated = data?.data || data
      setItems((prev) => prev.map((row) => (row.id === item.id ? updated : row)))
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Could not update availability.')
    }
  }

  async function saveItem(data) {
    const payload = {
      name: data.name,
      description: data.description || null,
      category: data.category,
      image: data.imageFile ? null : data.image || null,
      imageFile: data.imageFile || null,
      has_sizes: Boolean(data.hasSizes),
      price: data.hasSizes ? 0 : data.price,
      sizes: data.hasSizes ? data.sizes : [],
      ingredients: data.ingredients || [],
    }
    try {
      if (formState?.mode === 'edit') {
        const { data: res } = await menuApi.update(data.id, payload)
        const updated = res?.data || res
        setItems((prev) => prev.map((item) => (item.id === data.id ? updated : item)))
      } else {
        const { data: res } = await menuApi.create(payload)
        const created = res?.data || res
        setItems((prev) => [created, ...prev])
        setTab('active')
        setPage(1)
      }
      setFormState(null)
      window.dispatchEvent(new CustomEvent('mb:inventory-changed'))
    } catch (err) {
      console.error(err)
      const errors = err.response?.data?.errors
      const firstError = errors ? Object.values(errors).flat()[0] : null
      alert(firstError || err.response?.data?.message || 'Failed to save menu item.')
    }
  }

  async function runConfirm() {
    if (!confirm) return
    try {
      if (confirm.type === 'archive') {
        const { data } = await menuApi.archive(confirm.item.id)
        const updated = data?.data || data
        setItems((prev) => prev.map((item) => (item.id === confirm.item.id ? updated : item)))
      }
      if (confirm.type === 'restore') {
        const { data } = await menuApi.restore(confirm.item.id)
        const updated = data?.data || data
        setItems((prev) => prev.map((item) => (item.id === confirm.item.id ? updated : item)))
      }
      setConfirm(null)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="menu-page">
      {/* Page Title */}
      <h1 className="menu-title">Menu Management</h1>

      {/* Top Controls Row */}
      <div className="menu-top-row">
        {/* Search Bar on the Left */}
        <div className="menu-search-wrapper">
          <LuSearch className="menu-search-icon" size={18} />
          <input
            type="search"
            className="menu-search-input"
            placeholder="Search menu items by name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>

        {/* Category Filter Dropdown */}
        <div className="menu-category-wrapper">
          <select
            className="menu-category-select"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setPage(1)
            }}
          >
            <option value="All Categories">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <LuChevronDown className="menu-select-arrow" size={16} />
        </div>

        {/* Add New Item Button */}
        <button
          type="button"
          className="menu-add-btn"
          onClick={() => {
            reloadInventory()
            setFormState({ mode: 'add', item: emptyForm() })
          }}
        >
          <LuPlus size={18} /> Add New Item
        </button>
      </div>

      {/* Tabs Row */}
      <div className="menu-tabs-row" role="tablist">
        <button
          type="button"
          role="tab"
          className={`menu-tab${tab === 'active' ? ' active' : ''}`}
          onClick={() => {
            setTab('active')
            setPage(1)
          }}
        >
          Active Items
          <span className="menu-tab-badge">{activeCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          className={`menu-tab${tab === 'archived' ? ' active' : ''}`}
          onClick={() => {
            setTab('archived')
            setPage(1)
          }}
        >
          Archived
          <span className="menu-tab-badge">{archivedCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          className={`menu-tab${tab === 'all' ? ' active' : ''}`}
          onClick={() => {
            setTab('all')
            setPage(1)
          }}
        >
          All Items
          <span className="menu-tab-badge">{allCount}</span>
        </button>
      </div>

      {/* Data Table Card Container */}
      <div className="menu-table-card">
        <div className="menu-table-wrapper">
          <table className="menu-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Size Options</th>
                <th>Availability</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 0 }}>
                    <div className="menu-empty-state">
                      <div className="menu-empty-icon-circle">
                        <LuUtensils size={32} />
                      </div>
                      <div className="menu-empty-title">No menu items found</div>
                      <p className="menu-empty-subtext">
                        {search || category !== 'All Categories'
                          ? 'Try adjusting your search query or category filter.'
                          : 'Click "+ Add New Item" above to add your first menu item.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const isArchived = Boolean(item.archived)
                  return (
                    <tr
                      key={item.id}
                      className={isArchived ? 'menu-row-archived' : ''}
                    >
                      {/* Image Thumbnail */}
                      <td>
                        <div className="menu-img-container">
                          {item.image ? (
                            <img
                              className="menu-img"
                              src={mediaUrl(item.image)}
                              alt={item.name}
                            />
                          ) : (
                            <LuImage className="menu-img-fallback" size={24} />
                          )}
                        </div>
                      </td>

                      {/* Item Name & Description */}
                      <td>
                        <div className="menu-item-info">
                          <span className="menu-item-name">{item.name}</span>
                          {item.description && (
                            <span className="menu-item-desc">{item.description}</span>
                          )}
                          {!isArchived && item.stockOk === false && (
                            <span
                              style={{
                                fontSize: 11,
                                color: '#EF4444',
                                marginTop: 3,
                                fontWeight: 500,
                              }}
                            >
                              Disabled — {item.stockReason === 'expired' ? 'expired ingredient' : 'insufficient ingredients'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category Pill */}
                      <td>
                        <span className="menu-category-badge">{item.category}</span>
                      </td>

                      {/* Price */}
                      <td>
                        <span className="menu-price-text">{formatPrice(item)}</span>
                      </td>

                      {/* Size Options */}
                      <td>
                        {item.hasSizes && item.sizes && item.sizes.length > 0 ? (
                          <div className="menu-sizes-container">
                            {item.sizes.map((s, idx) => (
                              <span key={idx} className="menu-size-pill">
                                {s.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="menu-no-sizes">—</span>
                        )}
                      </td>

                      {/* Availability Toggle */}
                      <td>
                        <button
                          type="button"
                          className={`menu-toggle-switch ${
                            item.available && !isArchived ? 'on' : 'off'
                          }`}
                          disabled={isArchived || item.stockOk === false}
                          onClick={() => toggleAvailable(item)}
                          aria-label={`Toggle availability for ${item.name}`}
                          title={
                            isArchived
                              ? 'Archived item (disabled)'
                              : item.stockOk === false
                              ? item.stockReason === 'expired'
                                ? 'Disabled: linked ingredient is expired'
                                : 'Disabled: ingredients insufficient'
                              : undefined
                          }
                        >
                          <span className="menu-toggle-knob" />
                        </button>
                      </td>

                      {/* Action Buttons */}
                      <td>
                        <div className="menu-actions-wrapper">
                          <button
                            type="button"
                            className="menu-action-btn"
                            onClick={() => {
                              reloadInventory()
                              setFormState({ mode: 'edit', item })
                            }}
                            aria-label={`Edit ${item.name}`}
                            title="Edit"
                          >
                            <LuPencil size={15} />
                          </button>

                          {isArchived ? (
                            <button
                              type="button"
                              className="menu-action-btn restore"
                              onClick={() =>
                                setConfirm({
                                  type: 'restore',
                                  item,
                                  title: 'Restore Menu Item',
                                  message: `Are you sure you want to restore "${item.name}"? This item will be moved back to Active Menu and visible to customers again.`,
                                  confirmLabel: 'Yes, Restore it',
                                })
                              }
                              aria-label={`Restore ${item.name}`}
                              title="Restore"
                            >
                              <LuRotateCcw size={15} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="menu-action-btn archive"
                              onClick={() =>
                                setConfirm({
                                  type: 'archive',
                                  item,
                                  title: 'Archive Item',
                                  message: `Are you sure you want to archive "${item.name}"? It will be removed from the active menu and moved to Archived.`,
                                  confirmLabel: 'Archive',
                                })
                              }
                              aria-label={`Archive ${item.name}`}
                              title="Archive"
                            >
                              <LuArchive size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination Bar */}
        <div className="menu-pagination-bar">
          <span className="menu-pagination-info">
            Showing {(currentPage - 1) * PAGE_SIZE + (filtered.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} items
          </span>
          <div className="menu-pagination-controls">
            <button
              type="button"
              className="menu-page-btn"
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
                className={`menu-page-btn${n === currentPage ? ' active' : ''}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="menu-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {formState && (
        <ItemFormModal
          mode={formState.mode}
          initial={formState.item}
          inventoryOptions={inventoryOptions}
          onClose={() => setFormState(null)}
          onSave={saveItem}
        />
      )}

      {/* Confirmation Modal */}
      {confirm && (
        <ConfirmModal
          type={confirm.type}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onClose={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      )}
    </div>
  )
}
