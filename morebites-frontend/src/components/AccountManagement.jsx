import { useEffect, useRef, useState } from 'react'
import {
  LuPlus,
  LuX,
  LuShield,
  LuCar,
  LuUserCheck,
  LuUser,
  LuTriangleAlert,
  LuPencil,
  LuArchive,
  LuCamera,
  LuCloudUpload,
  LuFileText,
  LuTrash2,
  LuEye,
  LuEyeOff,
} from 'react-icons/lu'
import {
  IconClose,
  IconEdit,
  IconImage,
  IconPlus,
  IconUser,
  IconWarning,
} from './Icons'
import { accountsApi } from '../api/client'
import { MoreButton, RowActionMenuPopup, useRowActionMenu } from './RowActionMenu'
import ArchivePage from './ArchivePage'
import DriverManagement from './DriverManagement'
import BlacklistDrivers from './BlacklistDrivers'
import EmptyState from './EmptyState'
import './AccountManagement.css'

const INITIAL_ADMINS = []

const INITIAL_DRIVERS = []

const BLOCK_REASONS = ['Broken inventory', 'Repeated tardiness', 'Unfair behavior', 'Other']

const ROLE_OPTIONS = [
  { id: 'admin', label: 'Admin' },
  { id: 'driver', label: 'Driver' },
  { id: 'cashier', label: 'Cashier' },
]

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function PhotoUploader({ photo, onChange, disabled = false }) {
  const fileInputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WEBP).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be less than 5MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result)
    reader.readAsDataURL(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please drop an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be less than 5MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result)
    reader.readAsDataURL(file)
  }

  return (
    <div className="ac-avatar-uploader-wrap">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFile}
        accept="image/png,image/jpeg,image/webp,image/jpg"
        style={{ display: 'none' }}
        disabled={disabled}
      />
      <div
        className={`ac-avatar-uploader${photo ? ' has-photo' : ''}`}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label="Upload photo"
      >
        {photo ? (
          <div className="ac-avatar-preview">
            <img src={photo} alt="Avatar Preview" className="ac-avatar-img" />
            <div className="ac-avatar-overlay">
              <LuCamera size={18} />
              <span>Change</span>
            </div>
          </div>
        ) : (
          <div className="ac-avatar-placeholder">
            <div className="ac-avatar-icon-circle">
              <LuCamera size={20} />
            </div>
            <span className="ac-avatar-prompt">Upload Photo</span>
            <span className="ac-avatar-subtext">JPG, PNG under 5MB</span>
          </div>
        )}
      </div>
      {photo && (
        <button
          type="button"
          className="ac-avatar-remove-btn"
          onClick={(e) => {
            e.stopPropagation()
            onChange(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
        >
          Remove Photo
        </button>
      )}
    </div>
  )
}

function DocumentUploader({ document, meta, onChange, disabled = false }) {
  const docInputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Document size must be less than 10MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      onChange(reader.result, { name: file.name, size: file.size, type: file.type })
    }
    reader.readAsDataURL(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Document size must be less than 10MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      onChange(reader.result, { name: file.name, size: file.size, type: file.type })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="ac-doc-uploader-wrap">
      <input
        type="file"
        ref={docInputRef}
        onChange={handleFile}
        accept="image/png,image/jpeg,image/webp,image/jpg,application/pdf"
        style={{ display: 'none' }}
        disabled={disabled}
      />
      {document ? (
        <div className="ac-doc-card">
          <div className="ac-doc-card-main">
            <div className="ac-doc-thumb">
              {meta?.type?.startsWith('image/') || (typeof document === 'string' && document.startsWith('data:image/')) ? (
                <img src={document} alt="Document preview" className="ac-doc-thumb-img" />
              ) : (
                <LuFileText size={22} color="#FFA500" />
              )}
            </div>
            <div className="ac-doc-details">
              <span className="ac-doc-name" title={meta?.name || 'Driver License Document'}>
                {meta?.name || 'Driver License Document'}
              </span>
              <span className="ac-doc-meta">
                {meta?.size ? formatFileSize(meta.size) : 'Ready to upload'}
              </span>
            </div>
          </div>
          <div className="ac-doc-actions">
            <button
              type="button"
              className="ac-doc-btn"
              onClick={() => docInputRef.current?.click()}
              title="Change file"
            >
              <LuPencil size={14} />
              <span>Change</span>
            </button>
            <button
              type="button"
              className="ac-doc-btn danger"
              onClick={() => {
                onChange(null, null)
                if (docInputRef.current) docInputRef.current.value = ''
              }}
              title="Remove file"
            >
              <LuTrash2 size={14} />
              <span>Remove</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className="ac-doc-dropzone"
          onClick={() => !disabled && docInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload Driver Documents or License"
        >
          <div className="ac-doc-dropzone-icon">
            <LuCloudUpload size={24} />
          </div>
          <div className="ac-doc-dropzone-text">
            <span className="ac-doc-dropzone-title">Upload Documents / License</span>
            <span className="ac-doc-dropzone-sub">Click to browse or drag &amp; drop (PDF, PNG, JPG up to 10MB)</span>
          </div>
        </div>
      )}
    </div>
  )
}

function RoleAccessEditor({ value = [], onChange, disabled = false }) {
  function toggle(role) {
    if (disabled) return
    if (value.includes(role)) {
      if (value.length === 1) return
      onChange(value.filter((r) => r !== role))
    } else {
      onChange([...value, role])
    }
  }

  return (
    <div className="ac-role-access">
      <span className="ac-role-access-label">Role Access</span>
      <div className="ac-role-checks">
        {ROLE_OPTIONS.map(({ id, label }) => (
          <label key={id} className="ac-role-check">
            <input type="checkbox" checked={value.includes(id)} onChange={() => toggle(id)} disabled={disabled} />
            {label}
          </label>
        ))}
      </div>
    </div>
  )
}

function AccessBadges({ roles = [] }) {
  if (!roles.length) return <span className="ac-muted">—</span>
  return (
    <div className="ac-access-badges">
      {roles.map((r) => (
        <span key={r} className="ac-access-badge">
          {r}
        </span>
      ))}
    </div>
  )
}

function PasswordInput({ value, onChange, placeholder = '••••••••', disabled = false, ...rest }) {
  const [show, setShow] = useState(false)
  return (
    <div className="ac-password-input-wrap">
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        {...rest}
      />
      <button
        type="button"
        className="ac-password-toggle-btn"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        disabled={disabled}
      >
        {show ? <LuEyeOff size={16} /> : <LuEye size={16} />}
      </button>
    </div>
  )
}

function emptyAdmin() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    confirm: '',
    photo: null,
    roleAccess: ['admin'],
  }
}

function emptyDriver() {
  return {
    ...emptyAdmin(),
    roleAccess: ['driver'],
    license: '',
    expiryMonth: '',
    expiryDay: '',
    expiryYear: '',
    photo: null,
    licenseDoc: null,
    licenseDocMeta: null,
  }
}

function emptyCashier() {
  return {
    ...emptyAdmin(),
    roleAccess: ['cashier'],
    photo: null,
  }
}

function AccountConfirmModal({ target, saving, onClose, onConfirm }) {
  const [step, setStep] = useState(1)
  const roleLabel =
    target?.type === 'admin'
      ? 'Admin'
      : target?.type === 'driver'
        ? 'Driver'
        : 'Cashier'
  const name = target?.item
    ? `${target.item.firstName || ''} ${target.item.lastName || ''}`.trim() || 'this account'
    : 'this account'

  return (
    <div className="menu-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="menu-modal-confirm-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`menu-confirm-icon-wrap ${step === 2 ? 'warn' : 'archive'}`}>
          {step === 2 ? (
            <LuTriangleAlert size={28} />
          ) : (
            <LuArchive size={26} />
          )}
        </div>
        <h2 className="menu-confirm-title">
          {step === 2 ? 'Are you sure?' : `Archive ${roleLabel}`}
        </h2>
        <p className="menu-confirm-subtext">
          {step === 1
            ? `Archive "${name}"? This action can be undone by restoring it from the Archived tab later.`
            : `Are you sure you really want to archive "${name}"?`}
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
              Confirm Archive
            </button>
          ) : (
            <button
              type="button"
              className="menu-modal-btn confirm-archive"
              onClick={onConfirm}
              disabled={saving}
            >
              {saving ? 'Archiving…' : 'Confirm Archive'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AccountManagement() {
  const [section, setSection] = useState('accounts')
  const [admins, setAdmins] = useState([])
  const [drivers, setDrivers] = useState([])
  const [cashiers, setCashiers] = useState([])
  const [addAdmin, setAddAdmin] = useState(false)
  const [addDriver, setAddDriver] = useState(false)
  const [addCashier, setAddCashier] = useState(false)
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [blockTarget, setBlockTarget] = useState(null)
  const [blockReason, setBlockReason] = useState(BLOCK_REASONS[0])
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [adminForm, setAdminForm] = useState(emptyAdmin())
  const [driverForm, setDriverForm] = useState(emptyDriver())
  const [cashierForm, setCashierForm] = useState(emptyCashier())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const { menuRef, menu, toggleMenu, closeMenu } = useRowActionMenu()

  async function loadAccounts() {
    const r = await accountsApi.list()
    const d = r.data?.data || r.data || {}
    setAdmins(d.admins || [])
    setDrivers(d.drivers || [])
    setCashiers(d.cashiers || [])
  }

  useEffect(() => {
    loadAccounts().catch(console.error)
  }, [])

  async function saveAdmin() {
    if (!adminForm.firstName || !adminForm.lastName || !adminForm.email) return
    if (adminForm.phone && !/^09\d{9}$/.test(adminForm.phone.trim())) {
      setFormError('Enter a valid 11-digit Philippine mobile number starting with 09')
      return
    }
    if (!adminForm.password || adminForm.password.length < 6) {
      setFormError('Password must be at least 6 characters.')
      return
    }
    if (adminForm.password !== adminForm.confirm) {
      setFormError('Passwords do not match.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await accountsApi.createAdmin({
        first_name: adminForm.firstName,
        last_name: adminForm.lastName,
        email: adminForm.email,
        username: adminForm.username || adminForm.firstName.toLowerCase(),
        phone: adminForm.phone || null,
        password: adminForm.password,
        role_access: adminForm.roleAccess,
        photo: adminForm.photo || null,
      })
      await loadAccounts()
      setAdminForm(emptyAdmin())
      setAddAdmin(false)
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        Object.values(err.response?.data?.errors || {})?.[0]?.[0] ||
        'Failed to create admin.'
      setFormError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function saveDriver() {
    if (!driverForm.firstName || !driverForm.lastName || !driverForm.email) return
    if (driverForm.phone && !/^09\d{9}$/.test(driverForm.phone.trim())) {
      setFormError('Enter a valid 11-digit Philippine mobile number starting with 09')
      return
    }
    if (!driverForm.password || driverForm.password.length < 6) {
      setFormError('Password must be at least 6 characters.')
      return
    }
    if (driverForm.password !== driverForm.confirm) {
      setFormError('Passwords do not match.')
      return
    }
    const expiryParts = [driverForm.expiryYear, driverForm.expiryMonth, driverForm.expiryDay].filter(Boolean)
    const expiry =
      expiryParts.length === 3
        ? `${driverForm.expiryYear}-${String(driverForm.expiryMonth).padStart(2, '0')}-${String(driverForm.expiryDay).padStart(2, '0')}`
        : null
    setSaving(true)
    setFormError('')
    try {
      await accountsApi.createDriver({
        first_name: driverForm.firstName,
        last_name: driverForm.lastName,
        email: driverForm.email,
        username: driverForm.username || driverForm.firstName.toLowerCase(),
        phone: driverForm.phone || null,
        password: driverForm.password,
        license_number: driverForm.license || null,
        license_expiry: expiry || null,
        role_access: driverForm.roleAccess,
        photo: driverForm.photo || null,
        license_document: driverForm.licenseDoc || null,
      })
      await loadAccounts()
      setDriverForm(emptyDriver())
      setAddDriver(false)
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        Object.values(err.response?.data?.errors || {})?.[0]?.[0] ||
        'Failed to create driver.'
      setFormError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function saveCashier() {
    if (!cashierForm.firstName || !cashierForm.lastName || !cashierForm.email) return
    if (cashierForm.phone && !/^09\d{9}$/.test(cashierForm.phone.trim())) {
      setFormError('Enter a valid 11-digit Philippine mobile number starting with 09')
      return
    }
    if (!cashierForm.password || cashierForm.password.length < 6) {
      setFormError('Password must be at least 6 characters.')
      return
    }
    if (cashierForm.password !== cashierForm.confirm) {
      setFormError('Passwords do not match.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await accountsApi.createCashier({
        first_name: cashierForm.firstName,
        last_name: cashierForm.lastName,
        email: cashierForm.email,
        username: cashierForm.username || cashierForm.firstName.toLowerCase(),
        phone: cashierForm.phone || null,
        password: cashierForm.password,
        role_access: cashierForm.roleAccess,
        photo: cashierForm.photo || null,
      })
      await loadAccounts()
      setCashierForm(emptyCashier())
      setAddCashier(false)
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        Object.values(err.response?.data?.errors || {})?.[0]?.[0] ||
        'Failed to create cashier.'
      setFormError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function confirmBlock() {
    if (!blockTarget?.item?.db_id) return
    setSaving(true)
    try {
      await accountsApi.block(blockTarget.item.db_id, blockReason)
      await loadAccounts()
      setBlockTarget(null)
      setProfile(null)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function confirmArchiveAccount() {
    if (!archiveTarget?.item?.db_id) return
    setSaving(true)
    try {
      await accountsApi.block(archiveTarget.item.db_id, 'Archived')
      await loadAccounts()
      setArchiveTarget(null)
      setProfile(null)
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.message || 'Failed to archive account.')
    } finally {
      setSaving(false)
    }
  }

  function updateProfileField(key, value) {
    setProfile((prev) => ({ ...prev, item: { ...prev.item, [key]: value } }))
  }

  async function saveProfileEdits() {
    if (!profile?.item?.db_id) return
    const item = profile.item
    if (item.phone && !/^09\d{9}$/.test(String(item.phone).trim())) {
      alert('Enter a valid 11-digit Philippine mobile number starting with 09')
      return
    }
    setSaving(true)
    try {
      await accountsApi.update(item.db_id, {
        first_name: item.firstName,
        last_name: item.lastName,
        email: item.email,
        username: item.username,
        phone: item.phone,
        gender: item.gender || null,
        birthday: item.birthday || null,
        license_number: item.license || null,
        license_expiry: item.expiry || null,
      })
      await loadAccounts()
      setEditing(false)
      setProfile(null)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function saveRoleAccess() {
    if (!profile?.item?.db_id || profile.item.canEditAccess === false) return
    setSaving(true)
    setFormError('')
    try {
      await accountsApi.updateRoleAccess(profile.item.db_id, profile.item.roleAccess || [])
      await loadAccounts()
      setProfile(null)
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        Object.values(err.response?.data?.errors || {})?.[0]?.[0] ||
        'Failed to update role access.'
      setFormError(msg)
    } finally {
      setSaving(false)
    }
  }

  function profileTitle(type) {
    if (type === 'admin') return 'Admin Profile'
    if (type === 'driver') return 'Driver Profile'
    return 'Cashier Profile'
  }

  return (
    <div className="ac-page">
      <header className="ac-header">
        <h1>Account Management</h1>
      </header>

      <div className="ac-tabs">
        {[
          { id: 'accounts', label: 'Accounts' },
          { id: 'drivers', label: 'Drivers' },
          { id: 'archive', label: 'Archive' },
          { id: 'blacklist', label: 'Blacklist' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`ac-tab${section === tab.id ? ' active' : ''}`}
            onClick={() => setSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {section === 'drivers' ? <DriverManagement embedded /> : null}
      {section === 'archive' ? <ArchivePage embedded /> : null}
      {section === 'blacklist' ? <BlacklistDrivers embedded /> : null}

      {section === 'accounts' ? (
      <>
      <section className="ac-stats ac-stats-3">
        <article className="ac-stat sa-card">
          <div className="ac-stat-icon blue"><LuShield size={20} /></div>
          <div>
            <div className="ac-stat-label">Active Admins</div>
            <div className="ac-stat-value">{admins.length}</div>
          </div>
        </article>
        <article className="ac-stat sa-card">
          <div className="ac-stat-icon green"><LuCar size={20} /></div>
          <div>
            <div className="ac-stat-label">Active Drivers</div>
            <div className="ac-stat-value">{drivers.length}</div>
          </div>
        </article>
        <article className="ac-stat sa-card">
          <div className="ac-stat-icon yellow"><LuUserCheck size={20} /></div>
          <div>
            <div className="ac-stat-label">Active Cashiers</div>
            <div className="ac-stat-value">{cashiers.length}</div>
          </div>
        </article>
      </section>

      <section className="ac-section sa-card">
        <div className="ac-section-head">
          <h2>Admins</h2>
          <button type="button" className="ac-btn-primary" onClick={() => { setFormError(''); setAdminForm(emptyAdmin()); setAddAdmin(true) }}>
            <LuPlus size={16} /> Add Admin
          </button>
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Admin ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Access</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="ac-empty">
                    <EmptyState
                      icon="users"
                      title="No admin accounts found"
                      subtitle="Registered administrators will appear here."
                    />
                  </td>
                </tr>
              ) : (
                admins.map((a) => (
                <tr key={a.id}>
                  <td className="ac-id">{a.id}</td>
                  <td>
                    {a.firstName} {a.lastName}
                  </td>
                  <td>{a.email}</td>
                  <td>
                    <AccessBadges roles={a.roleAccess} />
                  </td>
                  <td>
                    <span className="ac-badge active">{a.status}</span>
                  </td>
                  <td className="ac-action-cell">
                    <MoreButton
                      onClick={(e) =>
                        toggleMenu(e, `admin-${a.id}`, { type: 'admin', item: a })
                      }
                    />
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ac-section sa-card">
        <div className="ac-section-head">
          <h2>Drivers</h2>
          <button type="button" className="ac-btn-primary" onClick={() => { setFormError(''); setDriverForm(emptyDriver()); setAddDriver(true) }}>
            <LuPlus size={16} /> Add Driver
          </button>
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Driver ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Contact No.</th>
                <th>Access</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ac-empty">
                    <EmptyState
                      icon="driver"
                      title="No driver accounts found"
                      subtitle="Registered driver logins will appear here."
                    />
                  </td>
                </tr>
              ) : (
                drivers.map((d) => (
                <tr key={d.id}>
                  <td className="ac-id">{d.id}</td>
                  <td>
                    {d.firstName} {d.lastName}
                  </td>
                  <td>{d.email}</td>
                  <td>{d.phone}</td>
                  <td>
                    <AccessBadges roles={d.roleAccess} />
                  </td>
                  <td>
                    <span className="ac-badge active">{d.status}</span>
                  </td>
                  <td className="ac-action-cell">
                    <MoreButton
                      onClick={(e) =>
                        toggleMenu(e, `driver-${d.id}`, { type: 'driver', item: d })
                      }
                    />
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ac-section sa-card">
        <div className="ac-section-head">
          <h2>Cashiers</h2>
          <button type="button" className="ac-btn-primary" onClick={() => { setFormError(''); setCashierForm(emptyCashier()); setAddCashier(true) }}>
            <LuPlus size={16} /> Add Cashier
          </button>
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Cashier ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Contact No.</th>
                <th>Access</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {cashiers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ac-empty">
                    <EmptyState
                      icon="user"
                      title="No cashier accounts found"
                      subtitle="Registered cashier logins will appear here."
                    />
                  </td>
                </tr>
              ) : (
                cashiers.map((c) => (
                <tr key={c.id}>
                  <td className="ac-id">{c.id}</td>
                  <td>
                    {c.firstName} {c.lastName}
                  </td>
                  <td>{c.email}</td>
                  <td>{c.phone}</td>
                  <td>
                    <AccessBadges roles={c.roleAccess} />
                  </td>
                  <td>
                    <span className="ac-badge active">{c.status}</span>
                  </td>
                  <td className="ac-action-cell">
                    <MoreButton
                      onClick={(e) =>
                        toggleMenu(e, `cashier-${c.id}`, { type: 'cashier', item: c })
                      }
                    />
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </section>
      </>
      ) : null}

      {menu?.item && (
        <RowActionMenuPopup menuRef={menuRef} top={menu.top} left={menu.left}>
          <button
            type="button"
            onClick={() => {
              setProfile({ type: menu.type, item: menu.item })
              setEditing(false)
              closeMenu()
            }}
          >
            View Profile
          </button>
          {menu.type === 'admin' ? (
            <button
              type="button"
              onClick={() => {
                setProfile({ type: 'admin', item: menu.item })
                setEditing(true)
                closeMenu()
              }}
            >
              Edit Admin
            </button>
          ) : null}
          <button
            type="button"
            className="danger"
            onClick={() => {
              setArchiveTarget({ type: menu.type, item: menu.item })
              closeMenu()
            }}
          >
            {menu.type === 'driver'
              ? 'Archive Driver'
              : menu.type === 'cashier'
                ? 'Archive Cashier'
                : 'Archive Admin'}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setBlockTarget({ type: menu.type, item: menu.item })
              closeMenu()
            }}
          >
            {menu.type === 'driver'
              ? 'Blocklist Driver'
              : menu.type === 'cashier'
                ? 'Blocklist Cashier'
                : 'Blocklist'}
          </button>
        </RowActionMenuPopup>
      )}

      {addAdmin && (
        <div className="ac-backdrop" onClick={() => setAddAdmin(false)} role="presentation">
          <div className="ac-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ac-modal-head">
              <h2>Add New Admin</h2>
              <button
                type="button"
                className="ac-modal-close-circle"
                onClick={() => { setAddAdmin(false); setFormError('') }}
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>
            <div className="ac-modal-body">
              <PhotoUploader
                photo={adminForm.photo}
                onChange={(photo) => setAdminForm((f) => ({ ...f, photo }))}
                disabled={saving}
              />
              <div className="ac-form-grid">
                <label>
                  First Name
                  <input
                    value={adminForm.firstName}
                    placeholder="e.g. John"
                    onChange={(e) => setAdminForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </label>
                <label>
                  Last Name
                  <input
                    value={adminForm.lastName}
                    placeholder="e.g. Doe"
                    onChange={(e) => setAdminForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </label>
                <label className="full">
                  Email Address
                  <input
                    type="email"
                    placeholder="e.g. admin@morebites.com"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <label>
                  Username
                  <input
                    placeholder="e.g. johndoe"
                    value={adminForm.username}
                    onChange={(e) => setAdminForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </label>
                <label>
                  Phone Number
                  <input
                    type="tel"
                    maxLength={11}
                    placeholder="09XX XXX XXXX"
                    value={adminForm.phone}
                    onChange={(e) => setAdminForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                  />
                </label>
                <label>
                  New Password
                  <PasswordInput
                    value={adminForm.password}
                    onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                <label>
                  Confirm Password
                  <PasswordInput
                    value={adminForm.confirm}
                    onChange={(e) => setAdminForm((f) => ({ ...f, confirm: e.target.value }))}
                    disabled={saving}
                  />
                </label>
              </div>
              <RoleAccessEditor
                value={adminForm.roleAccess}
                onChange={(roleAccess) => setAdminForm((f) => ({ ...f, roleAccess }))}
                disabled={saving}
              />
              {formError ? <p className="ac-form-error">{formError}</p> : null}
            </div>
            <div className="ac-modal-foot">
              <button
                type="button"
                className="ac-btn-cancel"
                onClick={() => { setAddAdmin(false); setFormError('') }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="button" className="ac-btn-primary" onClick={saveAdmin} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addDriver && (
        <div className="ac-backdrop" onClick={() => setAddDriver(false)} role="presentation">
          <div className="ac-modal ac-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ac-modal-head">
              <h2>Add New Driver</h2>
              <button
                type="button"
                className="ac-modal-close-circle"
                onClick={() => { setAddDriver(false); setFormError('') }}
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>
            <div className="ac-modal-body">
              <PhotoUploader
                photo={driverForm.photo}
                onChange={(photo) => setDriverForm((f) => ({ ...f, photo }))}
                disabled={saving}
              />
              <div className="ac-form-grid">
                <label>
                  First Name
                  <input
                    value={driverForm.firstName}
                    placeholder="e.g. Alex"
                    onChange={(e) => setDriverForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </label>
                <label>
                  Last Name
                  <input
                    value={driverForm.lastName}
                    placeholder="e.g. Cruz"
                    onChange={(e) => setDriverForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </label>
                <label className="full">
                  Email Address
                  <input
                    type="email"
                    placeholder="e.g. driver@morebites.com"
                    value={driverForm.email}
                    onChange={(e) => setDriverForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <label>
                  Username
                  <input
                    placeholder="e.g. alexcruz"
                    value={driverForm.username}
                    onChange={(e) => setDriverForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </label>
                <label>
                  Phone Number
                  <input
                    type="tel"
                    maxLength={11}
                    placeholder="09XX XXX XXXX"
                    value={driverForm.phone}
                    onChange={(e) => setDriverForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                  />
                </label>
                <label>
                  New Password
                  <PasswordInput
                    value={driverForm.password}
                    onChange={(e) => setDriverForm((f) => ({ ...f, password: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                <label>
                  Confirm Password
                  <PasswordInput
                    value={driverForm.confirm}
                    onChange={(e) => setDriverForm((f) => ({ ...f, confirm: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                <label className="full">
                  License Number
                  <input
                    placeholder="e.g. N01-12-345678"
                    value={driverForm.license}
                    onChange={(e) => setDriverForm((f) => ({ ...f, license: e.target.value }))}
                  />
                </label>
                <div className="ac-expiry-container full">
                  <span className="ac-field-label">License Expiry Date</span>
                  <div className="ac-expiry-row">
                    <div className="ac-expiry-col">
                      <span className="ac-expiry-sub">Month</span>
                      <input
                        placeholder="MM"
                        maxLength={2}
                        value={driverForm.expiryMonth}
                        onChange={(e) => setDriverForm((f) => ({ ...f, expiryMonth: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                      />
                    </div>
                    <div className="ac-expiry-col">
                      <span className="ac-expiry-sub">Day</span>
                      <input
                        placeholder="DD"
                        maxLength={2}
                        value={driverForm.expiryDay}
                        onChange={(e) => setDriverForm((f) => ({ ...f, expiryDay: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                      />
                    </div>
                    <div className="ac-expiry-col">
                      <span className="ac-expiry-sub">Year</span>
                      <input
                        placeholder="YYYY"
                        maxLength={4}
                        value={driverForm.expiryYear}
                        onChange={(e) => setDriverForm((f) => ({ ...f, expiryYear: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <RoleAccessEditor
                value={driverForm.roleAccess}
                onChange={(roleAccess) => setDriverForm((f) => ({ ...f, roleAccess }))}
                disabled={saving}
              />
              <div className="ac-doc-section">
                <span className="ac-field-label">Driver Documents / License</span>
                <DocumentUploader
                  document={driverForm.licenseDoc}
                  meta={driverForm.licenseDocMeta}
                  onChange={(doc, meta) => setDriverForm((f) => ({ ...f, licenseDoc: doc, licenseDocMeta: meta }))}
                  disabled={saving}
                />
              </div>
              {formError ? <p className="ac-form-error">{formError}</p> : null}
            </div>
            <div className="ac-modal-foot">
              <button
                type="button"
                className="ac-btn-cancel"
                onClick={() => { setAddDriver(false); setFormError('') }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="button" className="ac-btn-primary" onClick={saveDriver} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addCashier && (
        <div className="ac-backdrop" onClick={() => setAddCashier(false)} role="presentation">
          <div className="ac-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ac-modal-head">
              <h2>Add New Cashier</h2>
              <button
                type="button"
                className="ac-modal-close-circle"
                onClick={() => { setAddCashier(false); setFormError('') }}
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>
            <div className="ac-modal-body">
              <PhotoUploader
                photo={cashierForm.photo}
                onChange={(photo) => setCashierForm((f) => ({ ...f, photo }))}
                disabled={saving}
              />
              <div className="ac-form-grid">
                <label>
                  First Name
                  <input
                    value={cashierForm.firstName}
                    placeholder="e.g. Maria"
                    onChange={(e) => setCashierForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </label>
                <label>
                  Last Name
                  <input
                    value={cashierForm.lastName}
                    placeholder="e.g. Santos"
                    onChange={(e) => setCashierForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </label>
                <label className="full">
                  Email Address
                  <input
                    type="email"
                    placeholder="e.g. cashier@morebites.com"
                    value={cashierForm.email}
                    onChange={(e) => setCashierForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <label>
                  Username
                  <input
                    placeholder="e.g. mariasantos"
                    value={cashierForm.username}
                    onChange={(e) => setCashierForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </label>
                <label>
                  Phone Number
                  <input
                    type="tel"
                    maxLength={11}
                    placeholder="09XX XXX XXXX"
                    value={cashierForm.phone}
                    onChange={(e) => setCashierForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                  />
                </label>
                <label>
                  New Password
                  <PasswordInput
                    value={cashierForm.password}
                    onChange={(e) => setCashierForm((f) => ({ ...f, password: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                <label>
                  Confirm Password
                  <PasswordInput
                    value={cashierForm.confirm}
                    onChange={(e) => setCashierForm((f) => ({ ...f, confirm: e.target.value }))}
                    disabled={saving}
                  />
                </label>
              </div>
              <RoleAccessEditor
                value={cashierForm.roleAccess}
                onChange={(roleAccess) => setCashierForm((f) => ({ ...f, roleAccess }))}
                disabled={saving}
              />
              {formError ? <p className="ac-form-error">{formError}</p> : null}
            </div>
            <div className="ac-modal-foot">
              <button
                type="button"
                className="ac-btn-cancel"
                onClick={() => { setAddCashier(false); setFormError('') }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="button" className="ac-btn-primary" onClick={saveCashier} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {profile && (
        <>
          <div className="ac-backdrop" onClick={() => setProfile(null)} role="presentation" />
          <aside className="ac-drawer" role="dialog" aria-modal="true">
            <div className="ac-drawer-head">
              <div>
                <h2>{profileTitle(profile.type)}</h2>
                <span className="ac-status-dot">Active</span>
              </div>
              <div className="ac-drawer-actions">
                <button type="button" className="ac-modal-close-circle" onClick={() => (editing ? saveProfileEdits() : setEditing(true))} aria-label="Edit">
                  <LuPencil size={15} />
                </button>
                <button type="button" className="ac-modal-close-circle" onClick={() => setProfile(null)} aria-label="Close">
                  <LuX size={18} />
                </button>
              </div>
            </div>
            <div className="ac-drawer-photo">
              {profile.item.photo ? (
                <img src={profile.item.photo} alt={profile.item.firstName} className="ac-drawer-img" />
              ) : (
                <LuUser size={40} />
              )}
            </div>
            <dl className="ac-profile-list">
              {[
                ['Full Name', `${profile.item.firstName} ${profile.item.lastName}`, 'name'],
                ['Email address', profile.item.email, 'email'],
                ['Username', profile.item.username, 'username'],
                ['Birthday', profile.item.birthday || '-', 'birthday'],
                ['Gender', profile.item.gender || '-', 'gender'],
                ['Phone Number', profile.item.phone, 'phone'],
                ['Join Date', profile.item.joinDate, 'joinDate'],
                ...(profile.type === 'driver'
                  ? [
                      ["Driver's License Number", profile.item.license || '-', 'license'],
                      ['Expiry Date', profile.item.expiry || '-', 'expiry'],
                    ]
                  : []),
              ].map(([label, value, key]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {editing && key !== 'joinDate' ? (
                      <input
                        type={key === 'phone' ? 'tel' : 'text'}
                        maxLength={key === 'phone' ? 11 : undefined}
                        placeholder={key === 'phone' ? '09XX XXX XXXX' : ''}
                        value={
                          key === 'name'
                            ? `${profile.item.firstName} ${profile.item.lastName}`
                            : profile.item[key] || ''
                        }
                        onChange={(e) => {
                          if (key === 'name') {
                            const [firstName, ...rest] = e.target.value.split(' ')
                            updateProfileField('firstName', firstName || '')
                            updateProfileField('lastName', rest.join(' '))
                          } else if (key === 'phone') {
                            updateProfileField(key, e.target.value.replace(/\D/g, '').slice(0, 11))
                          } else {
                            updateProfileField(key, e.target.value)
                          }
                        }}
                      />
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
              {profile.type === 'driver' && profile.item.license_document && (
                <div className="ac-profile-doc-item">
                  <dt>License Document</dt>
                  <dd>
                    <a
                      href={profile.item.license_document}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ac-doc-link-btn"
                    >
                      <LuFileText size={15} />
                      <span>View Document</span>
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            <div className="ac-drawer-access">
              <RoleAccessEditor
                value={profile.item.roleAccess || []}
                onChange={(roleAccess) =>
                  setProfile((prev) => ({ ...prev, item: { ...prev.item, roleAccess } }))
                }
                disabled={profile.item.canEditAccess === false}
              />
              {profile.item.canEditAccess !== false ? (
                <button type="button" className="ac-btn-primary ac-save-access" onClick={saveRoleAccess} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Access'}
                </button>
              ) : (
                <p className="ac-access-note">Super admin has full access to all roles.</p>
              )}
            </div>
          </aside>
        </>
      )}

      {blockTarget && (
        <div className="ac-backdrop" onClick={() => setBlockTarget(null)} role="presentation">
          <div className="ac-modal ac-block" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ac-modal-head" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div className="ac-block-title">
                <LuTriangleAlert size={22} color="#EF4444" />
                <h2>Blocklist</h2>
              </div>
              <button type="button" className="ac-modal-close-circle" onClick={() => setBlockTarget(null)} aria-label="Close">
                <LuX size={18} />
              </button>
            </div>
            <div style={{ padding: '0 24px 20px' }}>
              <p style={{ margin: '8px 0 14px', fontSize: 14, color: '#4B5563' }}>Reason for blocklisting:</p>
              <div className="ac-radios">
                {BLOCK_REASONS.map((r) => (
                  <label key={r}>
                    <input
                      type="radio"
                      name="block-reason"
                      checked={blockReason === r}
                      onChange={() => setBlockReason(r)}
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>
            <div className="ac-modal-foot">
              <button type="button" className="ac-btn-cancel" onClick={() => setBlockTarget(null)}>Cancel</button>
              <button type="button" className="ac-btn-primary" onClick={confirmBlock}>
                Confirm Blocklisting
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <AccountConfirmModal
          target={archiveTarget}
          saving={saving}
          onClose={() => setArchiveTarget(null)}
          onConfirm={confirmArchiveAccount}
        />
      )}
    </div>
  )
}
