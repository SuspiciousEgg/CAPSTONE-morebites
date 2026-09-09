const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'src', 'components')

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8')
}
function write(name, s) {
  fs.writeFileSync(path.join(root, name), s.replace(/\r\n/g, '\n'), 'utf8')
  console.log('wrote', name)
}

function stripConstArray(s, name) {
  const marker = `const ${name} = [`
  const start = s.indexOf(marker)
  if (start < 0) {
    console.warn('not found', name)
    return s
  }
  let i = start + marker.length - 1 // at [
  let depth = 0
  let inStr = null
  let escape = false
  for (; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        i++ // past ]
        while (i < s.length && (s[i] === '\r' || s[i] === '\n' || s[i] === ' ' || s[i] === ';')) i++
        return s.slice(0, start) + s.slice(i)
      }
    }
  }
  console.warn('unclosed', name)
  return s
}

function fixReactImport(s) {
  return s.replace(/import \{([\s\S]*?)\} from 'react'/, (m, inner) => {
    const parts = inner
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    return `import { ${[...new Set(parts)].join(', ')} } from 'react'`
  }).replace(/import \{([^}]*?)\s+from 'react'/, (m, inner) => {
    // broken missing }
    const parts = inner
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    return `import { ${[...new Set(parts)].join(', ')} } from 'react'`
  })
}

const jobs = {
  'DispatchManagement.jsx': ['PENDING', 'riders', 'monitoring'],
  'RecordsReports.jsx': ['allRecords', 'deliveryRecords', 'customerRecords', 'topItems', 'exportsList'],
  'CustomerManagement.jsx': ['customers', 'orderHistory', 'CUSTOMERS', 'ORDER_HISTORY'],
  'DriverManagement.jsx': ['drivers', 'DRIVERS'],
  'BlacklistDrivers.jsx': ['blacklist', 'BLACKLIST'],
}

for (const [file, names] of Object.entries(jobs)) {
  let s = read(file)
  s = fixReactImport(s)
  for (const n of names) s = stripConstArray(s, n)
  write(file, s)
}

// Fix other files' imports + ensure Menu fetch
for (const file of [
  'InventoryStock.jsx',
  'MenuManagement.jsx',
  'ArchivePage.jsx',
  'AccountManagement.jsx',
  'OrderManagement.jsx',
  'SuperAdminDashboard.jsx',
]) {
  let s = read(file)
  s = fixReactImport(s)
  if (file === 'MenuManagement.jsx' && !s.includes('menuApi.list()')) {
    s = s.replace(
      'const [items, setItems] = useState(INITIAL_ITEMS)',
      `const [items, setItems] = useState([])

  useEffect(() => {
    menuApi.list().then((r) => setItems(r.data?.data || r.data || [])).catch(console.error)
  }, [])`,
    )
  }
  if (file === 'InventoryStock.jsx') {
    // ensure logs state exists
    if (!s.includes('const [logs, setLogs]') && s.includes("useState('')")) {
      if (s.includes('useState(INITIAL)')) {
        s = s.replace(
          'const [items, setItems] = useState(INITIAL)',
          `const [items, setItems] = useState([])
  const [logs, setLogs] = useState([])

  useEffect(() => {
    Promise.all([inventoryApi.list(), inventoryApi.logs()])
      .then(([i, l]) => {
        setItems(i.data?.data || i.data || [])
        setLogs(l.data?.data || l.data || [])
      })
      .catch(console.error)
  }, [])`,
        )
      }
    }
  }
  write(file, s)
}

console.log('done')
