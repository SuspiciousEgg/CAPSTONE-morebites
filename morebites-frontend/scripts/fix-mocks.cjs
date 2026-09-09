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

function emptyArrayConst(s, name) {
  const re = new RegExp(`const ${name} = \\[[\\s\\S]*?\\r?\\n\\]\\r?\\n`)
  if (!re.test(s)) {
    console.warn('missing', name)
    return s
  }
  return s.replace(re, `const ${name} = []\n`)
}

function ensureUseEffectImport(s) {
  return s.replace(/import \{([^}]+)\} from 'react'/, (m, inner) => {
    if (inner.includes('useEffect')) return m
    return `import { useEffect,${inner} } from 'react'`.replace('useEffect,  ', 'useEffect, ')
  })
}

function ensureImport(s, importLine, marker) {
  if (s.includes(importLine)) return s
  if (s.includes("from '../api/client'")) return s
  return s.replace(marker, `${importLine}\n${marker}`)
}

const files = {
  InventoryStock: ['INITIAL', 'stockLogs'],
  DispatchManagement: ['PENDING', 'RIDERS', 'MONITORING'],
  RecordsReports: ['ALL_RECORDS', 'DELIVERY_RECORDS', 'CUSTOMER_RECORDS', 'TOP_ITEMS', 'EXPORTS'],
  CustomerManagement: ['CUSTOMERS', 'ORDER_HISTORY'],
  AccountManagement: ['INITIAL_ADMINS', 'INITIAL_DRIVERS'],
  ArchivePage: ['INITIAL_ADMINS', 'INITIAL_DRIVERS'],
  DriverManagement: ['DRIVERS'],
  BlacklistDrivers: ['BLACKLIST'],
  MenuManagement: ['INITIAL_ITEMS'],
}

for (const [file, names] of Object.entries(files)) {
  let s = read(`${file}.jsx`)
  for (const n of names) s = emptyArrayConst(s, n)
  write(`${file}.jsx`, s)
}

// Inventory: wire state + API
{
  let s = read('InventoryStock.jsx')
  s = ensureImport(s, "import { inventoryApi } from '../api/client'", "import './InventoryStock.css'")
  if (!s.includes('inventoryApi.list')) {
    s = s.replace(
      /const \[items, setItems\] = useState\(INITIAL\)\r?\n  const \[search, setSearch\] = useState\(''\)/,
      `const [items, setItems] = useState([])
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([inventoryApi.list(), inventoryApi.logs()])
      .then(([i, l]) => {
        setItems(i.data?.data || i.data || [])
        setLogs(l.data?.data || l.data || [])
      })
      .catch(console.error)
  }, [])`,
    )
    s = s.replace(/\bstockLogs\b/g, 'logs')
    // keep empty const if present
    s = s.replace(/const logs = \[\]/, 'const STOCK_LOGS_UNUSED = []')
  }
  write('InventoryStock.jsx', s)
}

// Dispatch
{
  let s = read('DispatchManagement.jsx')
  s = ensureUseEffectImport(s)
  s = ensureImport(s, "import { dispatchApi } from '../api/client'", "import './DispatchManagement.css'")
  if (!s.includes('dispatchApi.get')) {
    s = s.replace(
      /const \[pending, setPending\] = useState\(PENDING\)\r?\n  const \[page, setPage\] = useState\(1\)/,
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

// Reports
{
  let s = read('RecordsReports.jsx')
  s = ensureUseEffectImport(s)
  s = ensureImport(s, "import { reportsApi } from '../api/client'", "import './RecordsReports.css'")
  if (!s.includes('reportsApi.get')) {
    s = s.replace(
      /export default function RecordsReports\(\) \{\r?\n  const \[tab, setTab\] = useState\('all'\)/,
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

// Customers
{
  let s = read('CustomerManagement.jsx')
  s = ensureImport(s, "import { customersApi } from '../api/client'", "import './CustomerManagement.css'")
  if (!s.includes('customersApi.list')) {
    s = s.replace(
      /export default function CustomerManagement\(\) \{\r?\n  const \[search, setSearch\] = useState\(''\)/,
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

// Account
{
  let s = read('AccountManagement.jsx')
  s = ensureImport(s, "import { accountsApi } from '../api/client'", "import './AccountManagement.css'")
  if (!s.includes('accountsApi.list')) {
    s = s.replace(
      /const \[admins, setAdmins\] = useState\(INITIAL_ADMINS\)\r?\n  const \[drivers, setDrivers\] = useState\(INITIAL_DRIVERS\)/,
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

// Archive
{
  let s = read('ArchivePage.jsx')
  s = ensureUseEffectImport(s)
  s = ensureImport(s, "import { archiveApi } from '../api/client'", "import './ArchivePage.css'")
  if (!s.includes('archiveApi.list')) {
    s = s.replace(
      /const \[admins, setAdmins\] = useState\(INITIAL_ADMINS\)\r?\n  const \[drivers, setDrivers\] = useState\(INITIAL_DRIVERS\)/,
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

// Drivers
{
  let s = read('DriverManagement.jsx')
  s = ensureImport(s, "import { driversApi } from '../api/client'", "import './DriverManagement.css'")
  if (!s.includes('driversApi.list')) {
    s = s.replace(
      /export default function DriverManagement\(\) \{\r?\n  const \[search, setSearch\] = useState\(''\)/,
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

// Blacklist
{
  let s = read('BlacklistDrivers.jsx')
  s = ensureUseEffectImport(s)
  s = ensureImport(s, "import { blacklistApi } from '../api/client'", "import './BlacklistDrivers.css'")
  if (!s.includes('blacklistApi.list')) {
    s = s.replace(
      /export default function BlacklistDrivers\(\) \{\r?\n  const \[search, setSearch\] = useState\(''\)/,
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

// Menu - ensure fetch
{
  let s = read('MenuManagement.jsx')
  if (!s.includes('menuApi.list')) {
    s = ensureImport(s, "import { menuApi } from '../api/client'", "import './MenuManagement.css'")
    s = s.replace(
      /const \[items, setItems\] = useState\(INITIAL_ITEMS\)/,
      `const [items, setItems] = useState([])

  useEffect(() => {
    menuApi.list().then((r) => setItems(r.data?.data || r.data || [])).catch(console.error)
  }, [])`,
    )
    write('MenuManagement.jsx', s)
  }
}

// Fix OrderManagement CreateOrderModal menuCatalog prop
{
  let s = read('OrderManagement.jsx')
  s = s.replace(
    'function CreateOrderModal({ orderId, onClose, onPlace }) {',
    'function CreateOrderModal({ orderId, onClose, onPlace, menuCatalog = [] }) {',
  )
  // Find where CreateOrderModal is rendered and pass menuCatalog
  if (!s.includes('menuCatalog={menuCatalog}')) {
    s = s.replace(
      /<CreateOrderModal\s+([^>]*)\/>/,
      (m, attrs) => `<CreateOrderModal ${attrs.trim()} menuCatalog={menuCatalog} />`,
    )
    s = s.replace(
      /<CreateOrderModal\s+([^>]*)>/,
      (m, attrs) => {
        if (attrs.includes('menuCatalog=')) return m
        return `<CreateOrderModal ${attrs.trim()} menuCatalog={menuCatalog}>`
      },
    )
  }
  write('OrderManagement.jsx', s)
}

console.log('done')
