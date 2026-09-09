const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'src', 'components')

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8')
}
function write(name, s) {
  fs.writeFileSync(path.join(root, name), s)
  console.log('updated', name)
}

function ensureImport(s, importLine, afterMarker) {
  if (s.includes(importLine.split(' from ')[0])) return s
  if (s.includes(afterMarker)) {
    return s.replace(afterMarker, `${importLine}\n${afterMarker}`)
  }
  return `${importLine}\n${s}`
}

function ensureUseEffectImport(s) {
  if (s.includes("from 'react'")) {
    return s.replace(/import \{([^}]+)\} from 'react'/, (m, inner) => {
      if (inner.includes('useEffect')) return m
      return `import {${inner.replace(/^\s*/, ' useEffect, ')} from 'react'`
    })
  }
  return s
}

function emptyArrayConst(s, name) {
  const re = new RegExp(`const ${name} = \\[[\\s\\S]*?\\n\\]\\n`, 'm')
  if (!re.test(s)) {
    console.warn('missing array', name)
    return s
  }
  return s.replace(re, `const ${name} = []\n`)
}

function emptyObjectConst(s, name) {
  const re = new RegExp(`const ${name} = \\{[\\s\\S]*?\\n\\}\\n`, 'm')
  if (!re.test(s)) {
    console.warn('missing object', name)
    return s
  }
  return s.replace(re, `const ${name} = {}\n`)
}

// ---------- Dashboard ----------
{
  let s = read('SuperAdminDashboard.jsx')
  s = ensureImport(s, "import { dashboardApi } from '../api/client'", "import './SuperAdminDashboard.css'")

  // Remove mock blocks
  s = s.replace(
    /const salesMap = \{[\s\S]*?\n\}\n\nconst salesTotals = \{[\s\S]*?\n\}\n\nconst orderStatus = \[[\s\S]*?\n\]\n\nconst orders = \[[\s\S]*?\n\]\n\nconst activityLog = \[[\s\S]*?\n\]\n\nconst lowStocks = \[[\s\S]*?\n\]\n\n/,
    `const PERIODS = ['Daily', 'Weekly', 'Monthly', 'Yearly']

const STATUS_COLORS = {
  Preparing: '#f0a020',
  Pending: '#2e9b4a',
  Completed: '#2f7de0',
  Cancelled: '#e53935',
  'Out for Delivery': '#7b61ff',
}

`,
  )

  // Empty notifications
  s = s.replace(/const notifications = \[[\s\S]*?\n\]\n\n/, 'const notifications = []\n\n')

  if (!s.includes('const [salesData, setSalesData]')) {
    s = s.replace(
      `const [activeNav, setActiveNav] = useState('Dashboard')
  const [salesPeriod, setSalesPeriod] = useState('Daily')
  const [periodOpen, setPeriodOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTab, setNotifTab] = useState('All')
  const notifRef = useRef(null)
  const periodRef = useRef(null)`,
      `const [activeNav, setActiveNav] = useState('Dashboard')
  const [salesPeriod, setSalesPeriod] = useState('Daily')
  const [periodOpen, setPeriodOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTab, setNotifTab] = useState('All')
  const [salesData, setSalesData] = useState([])
  const [salesTotalLabel, setSalesTotalLabel] = useState('₱0.00')
  const [totalOrdersToday, setTotalOrdersToday] = useState(0)
  const [activeOrders, setActiveOrders] = useState(0)
  const [orderStatus, setOrderStatus] = useState([])
  const [orders, setOrders] = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [lowStocks, setLowStocks] = useState([])
  const notifRef = useRef(null)
  const periodRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    dashboardApi
      .get(salesPeriod)
      .then((res) => {
        if (cancelled) return
        const d = res.data?.data || {}
        const stats = d.stats || {}
        setSalesTotalLabel(stats.total_sales_label || '₱0.00')
        setTotalOrdersToday(stats.total_orders || 0)
        setActiveOrders(stats.active_orders || 0)
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
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [salesPeriod])`,
    )
  }

  // Remove hardcoded period-based totals
  s = s.replace(
    /\n  const totalOrdersToday =\n    salesPeriod === 'Daily' \? 59 : salesPeriod === 'Weekly' \? 240 : salesPeriod === 'Monthly' \? 2100 : 12503\n  const activeOrders =\n    salesPeriod === 'Daily' \? 18 : salesPeriod === 'Weekly' \? 79 : salesPeriod === 'Monthly' \? 304 : 4604\n/,
    '\n',
  )

  s = s.replace(/\{salesTotals\[salesPeriod\]\}/g, '{salesTotalLabel}')
  s = s.replace(/Object\.keys\(salesMap\)/g, 'PERIODS')
  s = s.replace(/salesMap\[salesPeriod\]/g, 'salesData')
  s = s.replace(
    /<strong>\+6%<\/strong> vs\. yesterday/,
    '<strong>—</strong> vs. yesterday',
  )
  s = s.replace(
    /<strong>\+13<\/strong> vs\. yesterday/,
    '<strong>—</strong> vs. yesterday',
  )
  s = s.replace(/<div className="sa-stat-sub">3 on delivery<\/div>/, '<div className="sa-stat-sub">Live from database</div>')

  write('SuperAdminDashboard.jsx', s)
}

// ---------- Orders ----------
{
  let s = read('OrderManagement.jsx')
  s = ensureImport(s, "import { ordersApi } from '../api/client'", "import './OrderManagement.css'")
  s = emptyArrayConst(s, 'INITIAL_ORDERS')
  s = emptyArrayConst(s, 'MENU_ITEMS')

  if (!s.includes('ordersApi.list')) {
    s = s.replace(
      `const [orders, setOrders] = useState(INITIAL_ORDERS)
  const [status, setStatus] = useState('All')`,
      `const [orders, setOrders] = useState([])
  const [menuCatalog, setMenuCatalog] = useState([])
  const [status, setStatus] = useState('All')

  useEffect(() => {
    Promise.all([ordersApi.list(), ordersApi.menuOptions()])
      .then(([o, m]) => {
        setOrders(o.data?.data || o.data || [])
        setMenuCatalog(m.data?.data || m.data || [])
      })
      .catch(console.error)
  }, [])`,
    )
    // Replace MENU_ITEMS references carefully - keep const name empty, use menuCatalog in component
    // CreateOrderModal may reference MENU_ITEMS - check
  }

  // If CreateOrderModal uses MENU_ITEMS at module level, pass menuCatalog
  if (s.includes('MENU_ITEMS') && s.includes('function CreateOrder')) {
    s = s.replace(/\bMENU_ITEMS\b/g, 'menuCatalog')
    // but empty const was MENU_ITEMS - rename
    s = s.replace('const menuCatalog = []', 'const MENU_ITEMS_UNUSED = []')
  }

  write('OrderManagement.jsx', s)
}

// ---------- Menu ----------
{
  let s = read('MenuManagement.jsx')
  s = ensureImport(s, "import { menuApi } from '../api/client'", "import './MenuManagement.css'")
  s = emptyArrayConst(s, 'INITIAL_ITEMS')
  if (!s.includes('menuApi.list')) {
    s = s.replace(
      `const [items, setItems] = useState(INITIAL_ITEMS)`,
      `const [items, setItems] = useState([])

  useEffect(() => {
    menuApi.list().then((r) => setItems(r.data?.data || r.data || [])).catch(console.error)
  }, [])`,
    )
  }
  write('MenuManagement.jsx', s)
}

// ---------- Inventory ----------
{
  let s = read('InventoryStock.jsx')
  s = ensureImport(s, "import { inventoryApi } from '../api/client'", "import './InventoryStock.css'")
  s = emptyArrayConst(s, 'INITIAL')
  s = emptyArrayConst(s, 'LOGS')
  if (!s.includes('inventoryApi.list')) {
    s = s.replace(
      `const [items, setItems] = useState(INITIAL)
  const [search, setSearch] = useState('')`,
      `const [items, setItems] = useState([])
  const [stockLogs, setStockLogs] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([inventoryApi.list(), inventoryApi.logs()])
      .then(([i, l]) => {
        setItems(i.data?.data || i.data || [])
        setStockLogs(l.data?.data || l.data || [])
      })
      .catch(console.error)
  }, [])`,
    )
    s = s.replace(/\bLOGS\b/g, 'stockLogs')
  }
  write('InventoryStock.jsx', s)
}

// ---------- Dispatch ----------
{
  let s = read('DispatchManagement.jsx')
  s = ensureUseEffectImport(s)
  s = ensureImport(s, "import { dispatchApi } from '../api/client'", "import './DispatchManagement.css'")
  s = emptyArrayConst(s, 'PENDING')
  s = emptyArrayConst(s, 'RIDERS')
  s = emptyArrayConst(s, 'MONITORING')
  if (!s.includes('dispatchApi.get')) {
    s = s.replace(
      `const [pending, setPending] = useState(PENDING)
  const [page, setPage] = useState(1)`,
      `const [pending, setPending] = useState([])
  const [riders, setRiders] = useState([])
  const [monitoring, setMonitoring] = useState([])
  const [page, setPage] = useState(1)

  useEffect(() => {
    dispatchApi
      .get()
      .then((r) => {
        const d = r.data?.data || r.data || {}
        setPending(d.pending || [])
        setRiders(d.riders || [])
        setMonitoring(d.monitoring || [])
      })
      .catch(console.error)
  }, [])`,
    )
    s = s.replace(/\bRIDERS\b/g, 'riders')
    s = s.replace(/\bMONITORING\b/g, 'monitoring')
  }
  write('DispatchManagement.jsx', s)
}

// ---------- Reports ----------
{
  let s = read('RecordsReports.jsx')
  s = ensureUseEffectImport(s)
  s = ensureImport(s, "import { reportsApi } from '../api/client'", "import './RecordsReports.css'")
  s = emptyArrayConst(s, 'ALL_RECORDS')
  s = emptyArrayConst(s, 'DELIVERY_RECORDS')
  s = emptyArrayConst(s, 'CUSTOMER_RECORDS')
  s = emptyArrayConst(s, 'TOP_ITEMS')
  s = emptyArrayConst(s, 'EXPORTS')
  if (!s.includes('reportsApi.get')) {
    s = s.replace(
      `export default function RecordsReports() {
  const [tab, setTab] = useState('all')`,
      `export default function RecordsReports() {
  const [allRecords, setAllRecords] = useState([])
  const [deliveryRecords, setDeliveryRecords] = useState([])
  const [customerRecords, setCustomerRecords] = useState([])
  const [topItems, setTopItems] = useState([])
  const [exportsList, setExportsList] = useState([])
  const [tab, setTab] = useState('all')

  useEffect(() => {
    reportsApi
      .get()
      .then((r) => {
        const d = r.data?.data || r.data || {}
        setAllRecords(d.all_records || d.records || [])
        setDeliveryRecords(d.delivery_records || [])
        setCustomerRecords(d.customer_records || [])
        setTopItems(d.top_items || [])
        setExportsList(d.exports || [])
      })
      .catch(console.error)
  }, [])`,
    )
    s = s.replace(/\bALL_RECORDS\b/g, 'allRecords')
    s = s.replace(/\bDELIVERY_RECORDS\b/g, 'deliveryRecords')
    s = s.replace(/\bCUSTOMER_RECORDS\b/g, 'customerRecords')
    s = s.replace(/\bTOP_ITEMS\b/g, 'topItems')
    s = s.replace(/\bEXPORTS\b/g, 'exportsList')
  }
  write('RecordsReports.jsx', s)
}

// ---------- Customers ----------
{
  let s = read('CustomerManagement.jsx')
  s = ensureImport(s, "import { customersApi } from '../api/client'", "import './CustomerManagement.css'")
  s = emptyArrayConst(s, 'CUSTOMERS')
  s = emptyArrayConst(s, 'ORDER_HISTORY')
  if (!s.includes('customersApi.list')) {
    s = s.replace(
      `export default function CustomerManagement() {
  const [search, setSearch] = useState('')`,
      `export default function CustomerManagement() {
  const [customers, setCustomers] = useState([])
  const [orderHistory, setOrderHistory] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    customersApi
      .list()
      .then((r) => setCustomers(r.data?.data || r.data || []))
      .catch(console.error)
  }, [])`,
    )
    s = s.replace(/\[\.\.\.CUSTOMERS\]/g, '[...customers]')
    s = s.replace(/\bCUSTOMERS\b/g, 'customers')
    s = s.replace(/\bORDER_HISTORY\b/g, 'orderHistory')
  }
  write('CustomerManagement.jsx', s)
}

// ---------- Account ----------
{
  let s = read('AccountManagement.jsx')
  s = ensureImport(s, "import { accountsApi } from '../api/client'", "import './AccountManagement.css'")
  s = emptyArrayConst(s, 'INITIAL_ADMINS')
  s = emptyArrayConst(s, 'INITIAL_DRIVERS')
  if (!s.includes('accountsApi.list')) {
    s = s.replace(
      `const [admins, setAdmins] = useState(INITIAL_ADMINS)
  const [drivers, setDrivers] = useState(INITIAL_DRIVERS)`,
      `const [admins, setAdmins] = useState([])
  const [drivers, setDrivers] = useState([])

  useEffect(() => {
    accountsApi
      .list()
      .then((r) => {
        const d = r.data?.data || r.data || {}
        setAdmins(d.admins || [])
        setDrivers(d.drivers || [])
      })
      .catch(console.error)
  }, [])`,
    )
  }
  write('AccountManagement.jsx', s)
}

// ---------- Archive ----------
{
  let s = read('ArchivePage.jsx')
  s = ensureUseEffectImport(s)
  s = ensureImport(s, "import { archiveApi } from '../api/client'", "import './ArchivePage.css'")
  s = emptyArrayConst(s, 'INITIAL_ADMINS')
  s = emptyArrayConst(s, 'INITIAL_DRIVERS')
  if (!s.includes('archiveApi.list')) {
    s = s.replace(
      `const [admins, setAdmins] = useState(INITIAL_ADMINS)
  const [drivers, setDrivers] = useState(INITIAL_DRIVERS)`,
      `const [admins, setAdmins] = useState([])
  const [drivers, setDrivers] = useState([])

  useEffect(() => {
    archiveApi
      .list()
      .then((r) => {
        const d = r.data?.data || r.data || {}
        setAdmins(d.admins || [])
        setDrivers(d.drivers || [])
      })
      .catch(console.error)
  }, [])`,
    )
  }
  write('ArchivePage.jsx', s)
}

// ---------- Drivers ----------
{
  let s = read('DriverManagement.jsx')
  s = ensureImport(s, "import { driversApi } from '../api/client'", "import './DriverManagement.css'")
  s = emptyArrayConst(s, 'DRIVERS')
  if (!s.includes('driversApi.list')) {
    s = s.replace(
      `export default function DriverManagement() {
  const [search, setSearch] = useState('')`,
      `export default function DriverManagement() {
  const [drivers, setDrivers] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    driversApi
      .list()
      .then((r) => setDrivers(r.data?.data || r.data || []))
      .catch(console.error)
  }, [])`,
    )
    s = s.replace(/\[\.\.\.DRIVERS\]/g, '[...drivers]')
    s = s.replace(/\bDRIVERS\b/g, 'drivers')
  }
  write('DriverManagement.jsx', s)
}

// ---------- Blacklist ----------
{
  let s = read('BlacklistDrivers.jsx')
  s = ensureUseEffectImport(s)
  s = ensureImport(s, "import { blacklistApi } from '../api/client'", "import './BlacklistDrivers.css'")
  s = emptyArrayConst(s, 'BLACKLIST')
  if (!s.includes('blacklistApi.list')) {
    s = s.replace(
      `export default function BlacklistDrivers() {
  const [search, setSearch] = useState('')`,
      `export default function BlacklistDrivers() {
  const [blacklist, setBlacklist] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    blacklistApi
      .list()
      .then((r) => setBlacklist(r.data?.data || r.data || []))
      .catch(console.error)
  }, [])`,
    )
    s = s.replace(/\bBLACKLIST\b/g, 'blacklist')
  }
  write('BlacklistDrivers.jsx', s)
}

console.log('done')
