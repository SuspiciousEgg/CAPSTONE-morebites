import { useEffect, useState } from 'react'
import {
  LuPlus,
  LuX,
  LuShield,
  LuCar,
  LuUserCheck,
  LuUser,
  LuTriangleAlert,
  LuPencil,
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
import './AccountManagement.css'

const INITIAL_ADMINS = []

const INITIAL_DRIVERS = []

const BLOCK_REASONS = ['Broken inventory', 'Repeated tardiness', 'Unfair behavior', 'Other']

const ROLE_OPTIONS = [
  { id: 'admin', label: 'Admin' },
  { id: 'driver', label: 'Driver' },
  { id: 'cashier', label: 'Cashier' },
]

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

function emptyAdmin() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    confirm: '',
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
  }
}

function emptyCashier() {
  return {
    ...emptyAdmin(),
    roleAccess: ['cashier'],
  }
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

  function updateProfileField(key, value) {
    setProfile((prev) => ({ ...prev, item: { ...prev.item, [key]: value } }))
  }

  async function saveProfileEdits() {
    if (!profile?.item?.db_id) return
    const item = profile.item
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
          <button type="button" className="ac-btn-primary" onClick={() => { setFormError(''); setAddAdmin(true) }}>
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
              {admins.map((a) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ac-section sa-card">
        <div className="ac-section-head">
          <h2>Drivers</h2>
          <button type="button" className="ac-btn-primary" onClick={() => { setFormError(''); setAddDriver(true) }}>
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
              {drivers.map((d) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ac-section sa-card">
        <div className="ac-section-head">
          <h2>Cashiers</h2>
          <button type="button" className="ac-btn-primary" onClick={() => { setFormError(''); setAddCashier(true) }}>
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
              {cashiers.map((c) => (
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
              ))}
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
              <button type="button" className="ac-modal-close-circle" onClick={() => setAddAdmin(false)} aria-label="Close">
                <LuX size={18} />
              </button>
            </div>
            <div className="ac-upload-circle">
              <LuUser size={24} />
              <span>Upload Photo</span>
            </div>
            <div className="ac-form-grid">
              <label>
                First Name
                <input value={adminForm.firstName} onChange={(e) => setAdminForm((f) => ({ ...f, firstName: e.target.value }))} />
              </label>
              <label>
                Last Name
                <input value={adminForm.lastName} onChange={(e) => setAdminForm((f) => ({ ...f, lastName: e.target.value }))} />
              </label>
              <label className="full">
                Email Address
                <input type="email" value={adminForm.email} onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label>
                Username
                <input value={adminForm.username} onChange={(e) => setAdminForm((f) => ({ ...f, username: e.target.value }))} />
              </label>
              <label>
                Phone Number
                <input value={adminForm.phone} onChange={(e) => setAdminForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label>
                New Password
                <input type="password" value={adminForm.password} onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))} />
              </label>
              <label>
                Confirm Password
                <input type="password" value={adminForm.confirm} onChange={(e) => setAdminForm((f) => ({ ...f, confirm: e.target.value }))} />
              </label>
            </div>
            <RoleAccessEditor
              value={adminForm.roleAccess}
              onChange={(roleAccess) => setAdminForm((f) => ({ ...f, roleAccess }))}
            />
            {formError ? <p className="ac-form-error" style={{ color: '#c62828', margin: '0 0 12px', fontSize: 13 }}>{formError}</p> : null}
            <div className="ac-modal-foot">
              <button type="button" className="ac-btn-cancel" onClick={() => { setAddAdmin(false); setFormError('') }}>Cancel</button>
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
              <button type="button" className="ac-modal-close-circle" onClick={() => setAddDriver(false)} aria-label="Close">
                <LuX size={18} />
              </button>
            </div>
            <div className="ac-upload-circle">
              <LuUser size={24} />
              <span>Upload Photo</span>
            </div>
            <div className="ac-form-grid">
              <label>
                First Name
                <input value={driverForm.firstName} onChange={(e) => setDriverForm((f) => ({ ...f, firstName: e.target.value }))} />
              </label>
              <label>
                Last Name
                <input value={driverForm.lastName} onChange={(e) => setDriverForm((f) => ({ ...f, lastName: e.target.value }))} />
              </label>
              <label className="full">
                Email Address
                <input type="email" value={driverForm.email} onChange={(e) => setDriverForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label>
                Username
                <input value={driverForm.username} onChange={(e) => setDriverForm((f) => ({ ...f, username: e.target.value }))} />
              </label>
              <label>
                Phone Number
                <input value={driverForm.phone} onChange={(e) => setDriverForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label>
                New Password
                <input type="password" value={driverForm.password} onChange={(e) => setDriverForm((f) => ({ ...f, password: e.target.value }))} />
              </label>
              <label>
                Confirm Password
                <input type="password" value={driverForm.confirm} onChange={(e) => setDriverForm((f) => ({ ...f, confirm: e.target.value }))} />
              </label>
              <label className="full">
                License Number
                <input value={driverForm.license} onChange={(e) => setDriverForm((f) => ({ ...f, license: e.target.value }))} />
              </label>
              <label>
                Expiry Month
                <input placeholder="MM" value={driverForm.expiryMonth} onChange={(e) => setDriverForm((f) => ({ ...f, expiryMonth: e.target.value }))} />
              </label>
              <label>
                Expiry Day
                <input placeholder="DD" value={driverForm.expiryDay} onChange={(e) => setDriverForm((f) => ({ ...f, expiryDay: e.target.value }))} />
              </label>
              <label className="full">
                Expiry Year
                <input placeholder="YYYY" value={driverForm.expiryYear} onChange={(e) => setDriverForm((f) => ({ ...f, expiryYear: e.target.value }))} />
              </label>
            </div>
            <RoleAccessEditor
              value={driverForm.roleAccess}
              onChange={(roleAccess) => setDriverForm((f) => ({ ...f, roleAccess }))}
            />
            <div className="ac-dropzone">
              <IconImage />
              <span>Upload Documents / License</span>
            </div>
            {formError ? <p className="ac-form-error" style={{ color: '#c62828', margin: '0 0 12px', fontSize: 13 }}>{formError}</p> : null}
            <div className="ac-modal-foot">
              <button type="button" className="ac-btn-cancel" onClick={() => { setAddDriver(false); setFormError('') }}>Cancel</button>
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
              <button type="button" className="ac-modal-close-circle" onClick={() => setAddCashier(false)} aria-label="Close">
                <LuX size={18} />
              </button>
            </div>
            <div className="ac-upload-circle">
              <LuUser size={24} />
              <span>Upload Photo</span>
            </div>
            <div className="ac-form-grid">
              <label>
                First Name
                <input value={cashierForm.firstName} onChange={(e) => setCashierForm((f) => ({ ...f, firstName: e.target.value }))} />
              </label>
              <label>
                Last Name
                <input value={cashierForm.lastName} onChange={(e) => setCashierForm((f) => ({ ...f, lastName: e.target.value }))} />
              </label>
              <label className="full">
                Email Address
                <input type="email" value={cashierForm.email} onChange={(e) => setCashierForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label>
                Username
                <input value={cashierForm.username} onChange={(e) => setCashierForm((f) => ({ ...f, username: e.target.value }))} />
              </label>
              <label>
                Phone Number
                <input value={cashierForm.phone} onChange={(e) => setCashierForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label>
                New Password
                <input type="password" value={cashierForm.password} onChange={(e) => setCashierForm((f) => ({ ...f, password: e.target.value }))} />
              </label>
              <label>
                Confirm Password
                <input type="password" value={cashierForm.confirm} onChange={(e) => setCashierForm((f) => ({ ...f, confirm: e.target.value }))} />
              </label>
            </div>
            <RoleAccessEditor
              value={cashierForm.roleAccess}
              onChange={(roleAccess) => setCashierForm((f) => ({ ...f, roleAccess }))}
            />
            {formError ? <p className="ac-form-error" style={{ color: '#c62828', margin: '0 0 12px', fontSize: 13 }}>{formError}</p> : null}
            <div className="ac-modal-foot">
              <button type="button" className="ac-btn-cancel" onClick={() => { setAddCashier(false); setFormError('') }}>Cancel</button>
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
              <LuUser size={40} />
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
    </div>
  )
}
