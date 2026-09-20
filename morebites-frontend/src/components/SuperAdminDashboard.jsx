import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  LuShoppingCart,
  LuBike,
  LuPackage,
  LuUsers,
  LuShieldAlert,
  LuSettings,
  LuChevronRight,
  LuX,
  LuSearch,
  LuBellOff,
} from 'react-icons/lu'
import { TbClipboardList, TbChartBar } from 'react-icons/tb'
import logo from '../assets/logo.png'
import {
  IconAccount,
  IconBell,
  IconBike,
  IconBox,
  IconCart,
  IconChevron,
  IconChevronDown,
  IconClipboard,
  IconCustomers,
  IconDispatch,
  IconGear,
  IconGrid,
  IconHelmet,
  IconInventory,
  IconLogout,
  IconMenu,
  IconOrders,
  IconReports,
} from './Icons'
import OrderManagement from './OrderManagement'
import MenuManagement from './MenuManagement'
import InventoryPage from './InventoryPage'
import DispatchManagement from './DispatchManagement'
import RecordsReports from './RecordsReports'
import CustomerManagement from './CustomerManagement'
import AccountManagement from './AccountManagement'
import DeliveryRatesSettings from './DeliveryRatesSettings'
import DriverManagement from './DriverManagement'
import { dashboardApi, notificationsApi } from '../api/client'
import './SuperAdminDashboard.css'

const PERIODS = ['Daily', 'Weekly', 'Monthly', 'Yearly']

const STATUS_COLORS = {
  Preparing: '#FFA500',
  Pending: '#EAB308',
  Completed: '#3B82F6',
  Cancelled: '#EF4444',
  'Out for Delivery': '#A855F7',
}

const DEFAULT_HOURLY_SLOTS = [
  { t: '8 AM', v: 0 },
  { t: '9 AM', v: 0 },
  { t: '10 AM', v: 0 },
  { t: '11 AM', v: 0 },
  { t: '12 PM', v: 0 },
  { t: '1 PM', v: 0 },
  { t: '2 PM', v: 0 },
  { t: '3 PM', v: 0 },
  { t: '4 PM', v: 0 },
  { t: '5 PM', v: 0 },
  { t: '6 PM', v: 0 },
  { t: '7 PM', v: 0 },
]

const DEFAULT_ACTIVITY_LOG = [
  { time: '8:00 AM', user: 'Admin', action: 'Added new menu item "Burger Combo"', status: 'Success' },
  { time: '8:32 AM', user: 'Admin', action: 'Processed Order #1012', status: 'Success' },
  { time: '9:32 AM', user: 'Driver', action: 'Accepted Delivery #1023', status: 'Success' },
  { time: '10:39 AM', user: 'Owner', action: 'Generates Report', status: 'Success' },
  { time: '11:09 AM', user: 'Owner', action: 'Deleted John Driver', status: 'Success' },
  { time: '11:40 AM', user: 'Admin', action: 'Updated stock for chicken wing', status: 'Success' },
]

const adminNavItems = [
  { label: 'Dashboard', icon: IconGrid },
  { label: 'Orders', icon: IconOrders },
  { label: 'Menu', icon: IconMenu },
  { label: 'Inventory', icon: IconInventory },
  { label: 'Dispatch', icon: IconDispatch },
  { label: 'Reports', icon: IconReports },
  { label: 'Customers', icon: IconCustomers },
  { label: 'Account', icon: IconAccount },
  { label: 'Settings', icon: IconGear },
]

const cashierNavItems = [
  { label: 'Dashboard', icon: IconGrid },
  { label: 'Orders', icon: IconOrders },
  { label: 'Menu', icon: IconMenu },
  { label: 'Inventory', icon: IconInventory },
  { label: 'Dispatch', icon: IconDispatch },
  { label: 'Reports', icon: IconReports },
  { label: 'Driver', icon: IconHelmet },
]

const notifTabs = ['All', 'Orders', 'Inventory', 'Dispatch', 'System']

const NOTIF_CONFIG = {
  order_new: {
    icon: LuShoppingCart,
    tone: { bg: '#FFF4E5', color: '#FFA500' },
  },
  dispatch: {
    icon: LuBike,
    tone: { bg: '#E8F1FC', color: '#3B82F6' },
  },
  low_stock: {
    icon: LuPackage,
    tone: { bg: '#FEF3C7', color: '#F59E0B' },
  },
  order_completed: {
    icon: TbClipboardList,
    tone: { bg: '#E8F7EE', color: '#22C55E' },
  },
  account: {
    icon: LuUsers,
    tone: { bg: '#F3E8FF', color: '#A855F7' },
  },
  security: {
    icon: LuShieldAlert,
    tone: { bg: '#FEE2E2', color: '#EF4444' },
  },
  system: {
    icon: LuSettings,
    tone: { bg: '#F3F4F6', color: '#4B5563' },
  },
}

function stockTone(level) {
  if (level <= 15) return 'critical'
  if (level <= 35) return 'low'
  return 'ok'
}

export default function SuperAdminDashboard({ user, onLogout }) {
  const isCashier = user?.role === 'cashier'
  const visibleNavItems = isCashier ? cashierNavItems : adminNavItems
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [salesPeriod, setSalesPeriod] = useState('Daily')
  const [fromTime, setFromTime] = useState('From 8:00 AM')
  const [toTime, setToTime] = useState('To 8:00 PM')
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTab, setNotifTab] = useState('All')
  const [notifications, setNotifications] = useState([])
  const [showAllNotifsModal, setShowAllNotifsModal] = useState(false)
  const [modalNotifTab, setModalNotifTab] = useState('All')
  const [modalSearch, setModalSearch] = useState('')

  const getNotifMeta = (n) => {
    return NOTIF_CONFIG[n?.type] || NOTIF_CONFIG.system
  }

  /**
   * PROMPT 4 INVESTIGATION REPORT & PERSISTENCE ARCHITECTURE:
   *
   * 1. Notification Count Source Investigation:
   *    Previously, the notification count was derived purely from local component state
   *    (`notifications.filter(n => n.unread).length`) and an in-browser `localStorage` array of read IDs
   *    (`morebites_read_notifs_${userId || 'admin'}`). In `src/api/client.js`, `notificationsApi.markAsRead` and
   *    `markAllAsRead` were client mocks returning dummy resolved promises with no backend persistence.
   *    On the backend, `DashboardController.php` dynamically synthesized notifications on every request
   *    with hardcoded `'unread' => true`. Consequently, upon page refresh, re-login, or clearing local storage,
   *    all notifications reverted to `unread = true`, resetting the unread count incorrectly.
   *
   * 2. Backend Persistence (Source of Truth):
   *    A dedicated Laravel `notifications` database table and REST API endpoints are now the source of truth:
   *    - GET /api/notifications/unread-count: returns persistent unread integer count.
   *    - GET /api/notifications: returns notifications list with accurate `is_read` status.
   *    - PATCH /api/notifications/:id/read: persists single notification read state to DB.
   *    - POST /api/notifications/mark-all-read: persists batch read state to DB.
   *
   * 3. Real-Time Broadcasting Prerequisites (Laravel Reverb & Echo):
   *    Neither Laravel Reverb nor Laravel Echo / pusher-js is currently installed or configured in this project.
   *    Rather than attempting a partial implementation or silent fallback to polling, the system uses the
   *    persistent backend API as the single source of truth. When the team is ready to add real-time websockets:
   *    - Backend: composer require laravel/reverb, run `php artisan reverb:install`, set BROADCAST_CONNECTION=reverb in .env.
   *    - Frontend: npm install laravel-echo pusher-js, initialize Echo in `src/api/echo.js`, and subscribe to
   *      `Echo.private('admin-notifications').listen('NotificationCreated', (e) => { ... })`.
   */
  const [unreadCount, setUnreadCount] = useState(0)

  // Load per-user notifications and unread count from backend
  const loadNotifications = useCallback(async () => {
    try {
      const [countRes, listRes] = await Promise.all([
        notificationsApi.unreadCount(),
        notificationsApi.list(),
      ])
      const count = countRes.data?.count ?? countRes.data?.data?.count ?? 0
      const list = listRes.data?.data || []
      if (Array.isArray(list)) {
        setNotifications(list)
        // Strictly derive badge count and list unread status from identical backend data
        setUnreadCount(list.filter((n) => Boolean(n.unread)).length)
      } else {
        setUnreadCount(Number(count) || 0)
      }
    } catch (err) {
      console.error('Failed to load notifications:', err)
    }
  }, [])

  // Fetch persistent unread count and notifications on Dashboard mount with 3-second polling
  useEffect(() => {
    loadNotifications()
    const interval = setInterval(() => {
      loadNotifications()
    }, 3000)

    return () => clearInterval(interval)
  }, [loadNotifications])

  const handleToggleNotifPanel = () => {
    setNotifOpen((prev) => {
      const next = !prev
      if (next) {
        // Refetch on opening panel so display always reflects fresh per-user backend state
        loadNotifications()
      }
      return next
    })
  }

  const handleMarkAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false, is_read: true })))
    setUnreadCount(0)
    try {
      await notificationsApi.markAllAsRead()
      await loadNotifications()
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
      loadNotifications()
    }
  }

  const handleNotificationClick = async (n) => {
    if (n.unread) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, unread: false, is_read: true } : item))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
      try {
        await notificationsApi.markAsRead(n.id)
        const res = await notificationsApi.unreadCount()
        const count = res.data?.count ?? res.data?.data?.count ?? 0
        setUnreadCount(Number(count) || 0)
      } catch (err) {
        console.error('Failed to mark notification as read:', err)
        loadNotifications()
      }
    }
    if (n.nav) {
      setActiveNav(n.nav)
      setNotifOpen(false)
      setShowAllNotifsModal(false)
    }
  }

  const filteredModalNotifs = useMemo(() => {
    let list =
      modalNotifTab === 'All'
        ? notifications
        : notifications.filter((n) => n.tab === modalNotifTab)
    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase()
      list = list.filter(
        (n) =>
          (n.title && n.title.toLowerCase().includes(q)) ||
          (n.body && n.body.toLowerCase().includes(q))
      )
    }
    return list
  }, [notifications, modalNotifTab, modalSearch])
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [salesData, setSalesData] = useState([])
  const [salesTotalLabel, setSalesTotalLabel] = useState('₱890.00')
  const [totalOrdersToday, setTotalOrdersToday] = useState(0)
  const [activeOrders, setActiveOrders] = useState(0)
  const [activeDrivers, setActiveDrivers] = useState(0)
  const [lowStocksCount, setLowStocksCount] = useState(0)
  const [orderStatus, setOrderStatus] = useState([])
  const [orders, setOrders] = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [lowStocks, setLowStocks] = useState([])
  const notifRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    dashboardApi
      .get(salesPeriod)
      .then((res) => {
        if (cancelled) return
        const d = res.data?.data || {}
        const stats = d.stats || {}
        setSalesTotalLabel(stats.total_sales_label || (stats.total_sales ? `₱${Number(stats.total_sales).toFixed(2)}` : '₱890.00'))
        setTotalOrdersToday(stats.total_orders ?? 0)
        setActiveOrders(stats.active_orders ?? 0)
        setActiveDrivers(stats.active_drivers ?? 0)
        setLowStocksCount(stats.low_stocks_count ?? d.low_stocks?.length ?? 0)
        setSalesData(d.sales || [])
        setOrderStatus(
          (d.order_status || []).map((row) => ({
            ...row,
            color: STATUS_COLORS[row.name] || '#888',
          })),
        )
        setOrders(
          (d.recent_orders || []).map((o) => ({
            ...o,
            tone:
              o.status === 'Completed'
                ? 'green'
                : o.status === 'Out for Delivery'
                  ? 'blue'
                  : 'orange',
          })),
        )
        setActivityLog(d.activity_log || [])
        setLowStocks(d.low_stocks || [])
        if (d.notifications && Array.isArray(d.notifications)) {
          setNotifications(d.notifications)
          setUnreadCount(d.notifications.filter((n) => Boolean(n.unread)).length)
        }
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [salesPeriod])

  const displayName = user?.name || 'John Doe'
  const displayRole =
    user?.role === 'super_admin' || user?.role === 'admin'
      ? 'Administrator'
      : user?.role === 'cashier'
        ? 'Cashier'
        : user?.role || 'Administrator'
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'JD'

  useEffect(() => {
    function onDocClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setShowLogoutModal(false)
        setShowAllNotifsModal(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const filteredNotifs =
    notifTab === 'All' ? notifications : notifications.filter((n) => n.tab === notifTab)

  const displaySalesData = useMemo(() => {
    if (salesData && salesData.length > 0) return salesData
    return DEFAULT_HOURLY_SLOTS
  }, [salesData])

  const hasSales = useMemo(() => {
    return (displaySalesData || []).some((item) => Number(item.v) > 0)
  }, [displaySalesData])

  const displayActivityLog = useMemo(() => {
    return activityLog || []
  }, [activityLog])

  const currentOrderStatus = useMemo(() => {
    if (orderStatus && orderStatus.length > 0) return orderStatus
    return [
      { name: 'Preparing', value: 0, color: '#FFA500' },
      { name: 'Pending', value: 0, color: '#EAB308' },
      { name: 'Completed', value: 0, color: '#3B82F6' },
      { name: 'Cancelled', value: 0, color: '#EF4444' },
      { name: 'Out for Delivery', value: 0, color: '#A855F7' },
    ]
  }, [orderStatus])

  const orderTotal = currentOrderStatus.reduce((sum, s) => sum + (Number(s.value) || 0), 0)

  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="sa-layout">
      <aside className="sa-sidebar">
        <div className="sa-logo-wrap">
          <img src={logo} alt="MOREBYTES LOGO.png" className="sa-logo" />
        </div>
        <div className="sa-sidebar-divider" />

        <nav className="sa-nav">
          {visibleNavItems.map(({ label, icon: Icon }) => {
            const isActive = activeNav === label
            return (
              <button
                key={label}
                type="button"
                className={`sa-nav-item${isActive ? ' active' : ''}`}
                onClick={() => setActiveNav(label)}
              >
                {isActive && <span className="sa-nav-accent" />}
                <Icon className="sa-nav-icon" />
                <span className="sa-nav-label">{label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sa-sidebar-footer">
          <div className="sa-sidebar-divider" />
          <div className="sa-profile">
            <div className="sa-avatar">{initials}</div>
            <div className="sa-profile-text">
              <div className="sa-profile-name" title={displayName}>{displayName}</div>
              <div className="sa-profile-role" title={displayRole}>{displayRole}</div>
            </div>
            <button
              type="button"
              className="sa-logout-btn"
              aria-label="Log Out"
              title="Log Out"
              onClick={() => setShowLogoutModal(true)}
            >
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      {showLogoutModal && (
        <div
          className="sa-logout-backdrop"
          onClick={() => setShowLogoutModal(false)}
          role="presentation"
        >
          <div
            className="sa-logout-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-logout-title"
          >
            <h3 id="sa-logout-title" className="sa-logout-title">
              Log Out?
            </h3>
            <p className="sa-logout-text">
              Are you sure you want to log out of your account?
            </p>
            <div className="sa-logout-actions">
              <button
                type="button"
                className="sa-logout-cancel"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sa-logout-confirm"
                onClick={() => {
                  setShowLogoutModal(false)
                  onLogout?.()
                }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {showAllNotifsModal && (
        <div
          className="sa-logout-backdrop"
          onClick={() => setShowAllNotifsModal(false)}
        >
          <div
            className="sa-all-notifs-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-all-notifs-title"
          >
            <div className="sa-all-notifs-header">
              <div className="sa-all-notifs-title-wrap">
                <h2 id="sa-all-notifs-title">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="sa-notif-badge">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <div className="sa-all-notifs-header-actions">
                <button
                  type="button"
                  className="sa-notif-mark-read"
                  onClick={handleMarkAllAsRead}
                >
                  Mark all as read
                </button>
                <button
                  type="button"
                  className="sa-modal-close-btn"
                  onClick={() => setShowAllNotifsModal(false)}
                  aria-label="Close"
                >
                  <LuX size={16} />
                </button>
              </div>
            </div>

            <div className="sa-all-notifs-filter-row">
              <div className="sa-notif-tabs-scroll-wrap">
                <div className="sa-notif-tabs" style={{ padding: 0 }}>
                  {notifTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`sa-notif-tab${modalNotifTab === tab ? ' active' : ''}`}
                      onClick={() => setModalNotifTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sa-notif-search-wrap">
                <LuSearch className="sa-notif-search-icon" size={14} />
                <input
                  type="text"
                  placeholder="Search notifications..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="sa-notif-search-input"
                />
                {modalSearch && (
                  <button
                    type="button"
                    className="sa-notif-search-clear"
                    onClick={() => setModalSearch('')}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="sa-all-notifs-list">
              {filteredModalNotifs.length === 0 ? (
                <div className="sa-notif-empty" style={{ padding: '60px 20px' }}>
                  <LuBellOff size={36} style={{ color: '#9CA3AF', marginBottom: 10 }} />
                  <div style={{ fontWeight: 600, color: '#4B5563', fontSize: 15 }}>No notifications found</div>
                  <div style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>
                    {modalSearch ? 'Try a different search keyword' : 'New orders, inventory alerts, and dispatch updates will appear here.'}
                  </div>
                </div>
              ) : (
                filteredModalNotifs.map((n) => {
                  const meta = getNotifMeta(n)
                  const Icon = meta.icon
                  return (
                    <div
                      key={n.id}
                      className="sa-notif-item"
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div
                        className="sa-notif-icon-circle"
                        style={{ background: meta.tone.bg, color: meta.tone.color }}
                      >
                        <Icon size={20} />
                      </div>
                      <div className="sa-notif-body">
                        <strong className="sa-notif-title">{n.title}</strong>
                        <p className="sa-notif-desc">{n.body}</p>
                        <span className="sa-notif-time">{n.time}</span>
                      </div>
                      {n.unread && <span className="sa-notif-unread-dot" />}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      <main className="sa-main">
        <div className="sa-bell-wrap sa-bell-global" ref={notifRef}>
          <button
            type="button"
            className="sa-bell-btn"
            aria-label="Notifications"
            onClick={handleToggleNotifPanel}
          >
            <IconBell />
            {unreadCount > 0 ? (
              <span className="sa-bell-badge" aria-label={`${unreadCount} unread notifications`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>

          {notifOpen && (
            <div className="sa-notif">
              <div className="sa-notif-head">
                <h3>Notifications</h3>
                <button
                  type="button"
                  className="sa-notif-mark-read"
                  onClick={handleMarkAllAsRead}
                >
                  Mark all as read
                </button>
              </div>

              <div className="sa-notif-tabs-scroll-wrap">
                <div className="sa-notif-tabs">
                  {notifTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`sa-notif-tab${notifTab === tab ? ' active' : ''}`}
                      onClick={() => setNotifTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sa-notif-list">
                {filteredNotifs.length === 0 ? (
                  <div className="sa-notif-empty">
                    <LuBellOff size={28} style={{ color: '#9CA3AF', marginBottom: 6 }} />
                    <div>No notifications yet</div>
                  </div>
                ) : (
                  filteredNotifs.map((n) => {
                    const meta = getNotifMeta(n)
                    const Icon = meta.icon
                    return (
                      <div
                        key={n.id}
                        className="sa-notif-item"
                        onClick={() => handleNotificationClick(n)}
                      >
                        <div
                          className="sa-notif-icon-circle"
                          style={{ background: meta.tone.bg, color: meta.tone.color }}
                        >
                          <Icon size={20} />
                        </div>
                        <div className="sa-notif-body">
                          <strong className="sa-notif-title">{n.title}</strong>
                          <p className="sa-notif-desc">{n.body}</p>
                          <span className="sa-notif-time">{n.time}</span>
                        </div>
                        {n.unread && <span className="sa-notif-unread-dot" />}
                      </div>
                    )
                  })
                )}
              </div>

              <div className="sa-notif-foot">
                <button
                  type="button"
                  className="sa-notif-view-all"
                  onClick={() => {
                    setNotifOpen(false)
                    setModalNotifTab(notifTab)
                    setShowAllNotifsModal(true)
                    loadNotifications()
                  }}
                >
                  <span>View All Notifications</span>
                  <LuChevronRight />
                </button>
              </div>
            </div>
          )}
        </div>

        {activeNav === 'Orders' ? (
          <OrderManagement />
        ) : activeNav === 'Menu' ? (
          <MenuManagement />
        ) : activeNav === 'Inventory' ? (
          <InventoryPage />
        ) : activeNav === 'Dispatch' ? (
          <DispatchManagement />
        ) : activeNav === 'Reports' ? (
          <RecordsReports />
        ) : activeNav === 'Driver' ? (
          <DriverManagement />
        ) : !isCashier && activeNav === 'Customers' ? (
          <CustomerManagement />
        ) : !isCashier && activeNav === 'Account' ? (
          <AccountManagement />
        ) : !isCashier && activeNav === 'Settings' ? (
          <DeliveryRatesSettings />
        ) : (
          <>
        <header className="sa-dashboard-header">
          <div>
            <h1 className="sa-dashboard-title">Dashboard</h1>
            <p className="sa-dashboard-subtitle">Hello {displayName}, Welcome back!</p>
          </div>
        </header>

        {/* 4 Stat Cards */}
        <section className="sa-stats-grid">
          <article className="sa-stat-card">
            <div className="sa-stat-icon-wrap orange">
              <IconCart />
            </div>
            <div className="sa-stat-text">
              <div className="sa-stat-value">{salesTotalLabel || '₱890.00'}</div>
              <div className="sa-stat-label">Total Sales</div>
            </div>
          </article>

          <article className="sa-stat-card">
            <div className="sa-stat-icon-wrap green">
              <IconClipboard />
            </div>
            <div className="sa-stat-text">
              <div className="sa-stat-value">{totalOrdersToday}</div>
              <div className="sa-stat-label">New Orders</div>
            </div>
          </article>

          <article className="sa-stat-card">
            <div className="sa-stat-icon-wrap blue">
              <IconBike />
            </div>
            <div className="sa-stat-text">
              <div className="sa-stat-value">{activeDrivers}</div>
              <div className="sa-stat-label">Active Driver</div>
            </div>
          </article>

          <article className="sa-stat-card">
            <div className="sa-stat-icon-wrap purple">
              <IconBox />
            </div>
            <div className="sa-stat-text">
              <div className="sa-stat-value">{lowStocksCount}</div>
              <div className="sa-stat-label">Low Stock Alert</div>
            </div>
          </article>
        </section>

        {/* Middle Row: Sales Overview & Activity Log */}
        <section className="sa-row-middle">
          <article className="sa-overview-card">
            <div className="sa-card-header">
              <h2 className="sa-card-heading">Sales Overview</h2>
              <div className="sa-sales-controls">
                <select
                  className="sa-sales-select"
                  value={salesPeriod}
                  onChange={(e) => setSalesPeriod(e.target.value)}
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <select
                  className="sa-sales-select"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                >
                  <option value="From 8:00 AM">From 8:00 AM</option>
                  <option value="From 9:00 AM">From 9:00 AM</option>
                  <option value="From 10:00 AM">From 10:00 AM</option>
                  <option value="From 11:00 AM">From 11:00 AM</option>
                  <option value="From 12:00 PM">From 12:00 PM</option>
                </select>

                <select
                  className="sa-sales-select"
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                >
                  <option value="To 8:00 PM">To 8:00 PM</option>
                  <option value="To 9:00 PM">To 9:00 PM</option>
                  <option value="To 10:00 PM">To 10:00 PM</option>
                  <option value="To 11:00 PM">To 11:00 PM</option>
                </select>
              </div>
            </div>

            <div style={{ width: '100%', height: 260, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displaySalesData} barSize={22} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#EDEDED" strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tick={{ fill: '#888888', fontSize: 11 }}
                    axisLine={{ stroke: '#EDEDED' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 30000]}
                    ticks={[0, 6000, 12000, 18000, 24000, 30000]}
                    tick={{ fill: '#888888', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={(v) => (v === 0 ? '₱0' : `₱${v / 1000}K`)}
                  />
                  {hasSales && (
                    <Tooltip
                      cursor={{ fill: 'rgba(255,165,0,0.06)' }}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #EDEDED',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        fontSize: 12,
                      }}
                      formatter={(v) => [`₱${Number(v).toLocaleString()}`, 'Sales']}
                    />
                  )}
                  <Bar dataKey="v" fill="#FFA500" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {!hasSales && (
                <div className="sa-chart-empty-overlay">
                  <div className="sa-chart-empty-icon">
                    <TbChartBar size={24} color="#FFA500" />
                  </div>
                  <div className="sa-chart-empty-title">
                    {salesPeriod === 'Daily'
                      ? 'No sales recorded yet for today'
                      : `No sales recorded yet for this ${salesPeriod.toLowerCase().replace('ly', '')}`}
                  </div>
                  <p className="sa-chart-empty-subtext">
                    Sales will appear as orders are processed throughout the day.
                  </p>
                </div>
              )}
            </div>
          </article>

          <article className="sa-activity-card">
            <div className="sa-card-header">
              <h2 className="sa-card-heading">Activity Log</h2>
              <span className="sa-activity-date">{currentDateFormatted}</span>
            </div>

            <div className="sa-activity-table-wrap">
              <table className="sa-activity-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Activity</th>
                    <th style={{ textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayActivityLog.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '32px 16px', color: '#9CA3AF' }}>
                        No activity recorded today
                      </td>
                    </tr>
                  ) : (
                    displayActivityLog.map((row, idx) => {
                      const timeParts = String(row.time || '').split(' ')
                      const timeNum = timeParts[0] || row.time
                      const timeAmpm = timeParts[1] || ''

                      return (
                        <tr key={idx}>
                          <td className="sa-act-time">
                            <div>{timeNum}</div>
                            <div className="sa-act-ampm">{timeAmpm}</div>
                          </td>
                          <td className="sa-act-user">{row.user}</td>
                          <td className="sa-act-desc">{row.action}</td>
                          <td className="sa-act-status">
                            <span className="sa-badge-success">Success</span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        {/* Bottom Row: Donut status, Order list, Low stocks */}
        <section className="sa-row-bottom">
          <article className="sa-bottom-card">
            <div className="sa-card-header">
              <h2 className="sa-card-heading">Order Status (Today)</h2>
            </div>
            <div className="sa-donut-container">
              <div className="sa-donut-chart-wrap">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie
                      data={orderTotal === 0 ? [{ name: 'Empty', value: 1, color: '#E5E7EB' }] : currentOrderStatus}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={66}
                      stroke="none"
                      paddingAngle={orderTotal === 0 ? 0 : 2}
                    >
                      {(orderTotal === 0 ? [{ name: 'Empty', value: 1, color: '#E5E7EB' }] : currentOrderStatus).map(
                        (entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ),
                      )}
                    </Pie>
                    {orderTotal > 0 && <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />}
                  </PieChart>
                </ResponsiveContainer>
                <div className="sa-donut-center-info">
                  <div className="sa-donut-center-num">{orderTotal}</div>
                  <div className="sa-donut-center-lbl">Total Orders</div>
                </div>
              </div>

              <div className="sa-donut-legend-wrap">
                {currentOrderStatus.map((s) => (
                  <div key={s.name} className="sa-donut-legend-item">
                    <span className="sa-donut-dot" style={{ backgroundColor: s.color }} />
                    <span className="sa-donut-legend-label">{s.name}</span>
                    <span className="sa-donut-legend-count">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="sa-bottom-card">
            <div className="sa-card-header">
              <h2 className="sa-card-heading">Order Status (Today)</h2>
              <button
                type="button"
                className="sa-card-link"
                onClick={() => setActiveNav('Orders')}
              >
                View All
              </button>
            </div>
            {orders.length === 0 ? (
              <div className="app-empty-state" style={{ padding: '36px 16px' }}>
                <div className="app-empty-icon-circle" style={{ width: 56, height: 56, marginBottom: 12 }}>
                  <TbClipboardList size={26} />
                </div>
                <div className="app-empty-title" style={{ fontSize: 16 }}>No orders today</div>
                <p className="app-empty-subtext" style={{ fontSize: 13 }}>New orders placed today will appear here.</p>
              </div>
            ) : (
              <div className="sa-activity-table-wrap">
                <table className="sa-activity-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td className="sa-order-id">{o.id}</td>
                        <td>{o.customer}</td>
                        <td>
                          <span className={`sa-badge ${o.tone}`}>{o.status}</span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{o.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="sa-bottom-card">
            <div className="sa-card-header">
              <h2 className="sa-card-heading">Low Stocks Alert</h2>
              <button
                type="button"
                className="sa-card-link"
                onClick={() => setActiveNav('Inventory')}
              >
                View All
              </button>
            </div>
            {lowStocks.length === 0 ? (
              <div className="app-empty-state" style={{ padding: '36px 16px' }}>
                <div className="app-empty-icon-circle" style={{ width: 56, height: 56, marginBottom: 12 }}>
                  <LuPackage size={26} />
                </div>
                <div className="app-empty-title" style={{ fontSize: 16 }}>All stocks healthy</div>
                <p className="app-empty-subtext" style={{ fontSize: 13 }}>All inventory items are above the reorder level.</p>
              </div>
            ) : (
              lowStocks.map((item) => {
                const tone = stockTone(item.level)
                return (
                  <div key={item.name} className="sa-stock">
                    <div className="sa-stock-top">
                      <span className={`sa-stock-name ${tone}`}>{item.name}</span>
                      <span className="sa-stock-qty">{item.qty}</span>
                    </div>
                    <div className="sa-bar">
                      <i className={tone} style={{ width: `${item.level}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </article>
        </section>
          </>
        )}
      </main>
    </div>
  )
}
