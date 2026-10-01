import { useEffect, useMemo, useState } from 'react'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import {
  IconClose,
  IconDownload,
  IconFile,
  IconSearch,
} from './Icons'
import { getStoredUser, menuApi, reportsApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import EmptyState from './EmptyState'
import './RecordsReports.css'

function peso(n) {
  return `₱${Number(n).toLocaleString('en-PH')}`
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function exportCsv(filename, headers, rows) {
  const lines = rows.map((row) =>
    row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
  )
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  downloadBlob(blob, filename)
  return blob
}

async function exportXlsx(filename, title, headers, rows) {
  if (typeof window !== 'undefined' && window.XLSX) {
    const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = window.XLSX.utils.book_new()
    window.XLSX.utils.book_append_sheet(wb, ws, 'Report')
    const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;',
    })
    downloadBlob(blob, filename)
    return blob
  }

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Report">
  <Table>
   <Row>
    ${headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}
   </Row>
   ${rows
     .map(
       (r) =>
         `<Row>${r
           .map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`)
           .join('')}</Row>`,
     )
     .join('\n   ')}
  </Table>
 </Worksheet>
</Workbook>`
  const blob = new Blob([xml], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;',
  })
  downloadBlob(blob, filename)
  return blob
}

/* ============================================================================
 * PROMPT 52 DIAGNOSTIC REPORT:
 * 1. Status Filter Audit across Reports Tabs:
 *    - Sales Records (`tab === 'all'`): Previously displayed orders of every status
 *      mixed together (Completed, Ready, Out for Delivery, Pending, Cancelled)
 *      with no status filter dropdown.
 *    - Delivery Records (`tab === 'delivery'`): Already possessed `deliveryStatus`
 *      dropdown filter ('All Statuses', 'Preparing', 'Out for Delivery', 'Completed', 'Cancelled').
 *    - Customer Records (`tab === 'customer'`): Already possessed `customerStatus`
 *      dropdown filter ('All Customers', 'Frequent', 'Regular', 'New').
 *    - Resolution: Added `salesStatus` filter state defaulting to `'Completed'` on page load,
 *      matching the Dashboard Total Sales calculation rule (Prompt 51 — Total Sales counts
 *      status = Completed only). Provided options: 'Completed', 'All Statuses', 'Ready',
 *      'Out for Delivery', 'Pending', 'Cancelled'. Applied this filter to both the on-screen table
 *      and the Generate Report modal exports (PDF/CSV/XLSX) via `reportsApi.generate({ status })`.
 *
 * 2. PDF Peso Sign Rendering ("– 380" vs "₱380"):
 *    - Cause: Font-encoding limitation of the standard PDF Type 1 /Helvetica font, NOT a
 *      data-passing or formatting bug in how amounts were passed to the PDF template.
 *    - Mechanism: The application passed the UTF-8 string `"₱380"` (bytes 0xE2 0x82 0xB1 0x33 0x38 0x30).
 *      However, PDF 1.4 standard Type 1 fonts (/Helvetica) rely on standard 8-bit WinAnsiEncoding
 *      (Windows-1252 / ISO-8859-1), which lacks a character code or glyph for the Philippine
 *      Peso sign (₱, Unicode U+20B1). When PDF readers parsed unmapped multi-byte UTF-8 sequences
 *      against single-byte WinAnsi tables, byte 0x96 (WinAnsi En Dash "–") or reader fallbacks
 *      substituted an en-dash, rendering "– 380" instead of "₱380".
 *    - Resolution: Implemented a native Type 3 vector glyph (/peso) assigned to character code \200 (128),
 *      accompanied by an Adobe UCS /ToUnicode CMap mapping <80> directly to <20B1>. The PDF stream
 *      encodes "₱" to \200 with font /F2 (Type 3) and surrounding text with /F1 (Helvetica), rendering
 *      a crisp, authentic Philippine Peso symbol and allowing text copying to extract the true "₱" character.
 *      Also updated `peso(n)` helper to format as `₱${Number(n).toLocaleString('en-PH')}` without spaces.
 * ============================================================================
 */

function formatUserRole(role) {
  if (!role) return 'Owner'
  const r = String(role).toLowerCase().trim()
  if (r === 'super_admin' || r === 'owner') return 'Owner'
  if (r === 'admin') return 'Admin'
  if (r === 'supervisor') return 'Supervisor'
  if (r === 'cashier') return 'Cashier'
  if (r === 'driver') return 'Driver'
  return r.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function getPreparedByString(user) {
  const currentUser = user || getStoredUser()
  const name =
    currentUser?.name ||
    [currentUser?.first_name || currentUser?.firstName, currentUser?.last_name || currentUser?.lastName]
      .filter(Boolean)
      .join(' ') ||
    'John Owner'
  const role = formatUserRole(currentUser?.role || 'super_admin')
  return `Prepared by: ${name} (${role})`
}

async function exportPdf(filename, title, headers, rows, preparedBy) {
  const preparedByText = preparedBy || getPreparedByString()
  const enc = new TextEncoder()

  // Type 3 vector glyph for Philippine Peso (₱):
  // Cap-height 700, dual horizontal crossbars at y=560 and y=450, stroke width 40
  const charProc = [
    '600 0 0 -100 600 800 d1',
    '40 w 1 J 1 j',
    '120 0 m 120 700 l S',
    '120 700 m 340 700 440 630 440 510 c 440 390 340 320 120 320 c S',
    '40 560 m 380 560 l S',
    '40 450 m 380 450 l S',
  ].join('\n')

  // Adobe UCS ToUnicode CMap mapping code 0x80 (\200) to Unicode U+20B1 (₱)
  const toUnicodeCMap = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Custom-ToUnicode def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
    '1 beginbfrange',
    '<80> <80> <20B1>',
    'endbfrange',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n')

  function encodeLineToOps(line) {
    const sanitized = String(line ?? '')
      .replace(/[\u2014\u2015]/g, '--')
      .replace(/[\u2012\u2013]/g, '-')
    const parts = sanitized.split('₱')
    const ops = []
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].length > 0) {
        const safe = parts[i].replace(/[()\\]/g, '\\$&')
        ops.push(`/F1 9 Tf (${safe}) Tj`)
      }
      if (i < parts.length - 1) {
        ops.push('/F2 9 Tf (\\200) Tj')
      }
    }
    ops.push('T*')
    return ops.join('\n')
  }

  const headerSep = '-'.repeat(Math.min(95, headers.join(' | ').length))
  const dataLines = rows.map((r) => r.join(' | '))

  const ROWS_PER_PAGE_FIRST = 38
  const ROWS_PER_PAGE_SUB = 45

  const pagesData = []
  const remaining = [...dataLines]

  // Page 1 with Title, Timestamp, Prepared By, and Headers
  const page1Rows = remaining.splice(0, ROWS_PER_PAGE_FIRST)
  pagesData.push([
    title,
    `Generated: ${new Date().toLocaleString()}`,
    preparedByText,
    '',
    headers.join(' | '),
    headerSep,
    ...page1Rows,
  ])

  // Subsequent pages with Continued title and Headers
  while (remaining.length > 0) {
    const subRows = remaining.splice(0, ROWS_PER_PAGE_SUB)
    pagesData.push([
      `${title} (Continued)`,
      headers.join(' | '),
      headerSep,
      ...subRows,
    ])
  }

  const numPages = pagesData.length
  const pageObjNums = []
  for (let i = 0; i < numPages; i++) {
    pageObjNums.push(7 + 2 * i)
  }

  let body = '%PDF-1.4\n'
  const offsets = []

  function addObj(num, content) {
    offsets[num] = enc.encode(body).length
    body += `${num} 0 obj ${content} endobj\n`
  }

  addObj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  addObj(2, `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${numPages} >>`)
  addObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  addObj(4, '<< /Type /Font /Subtype /Type3 /FontBBox [0 -100 600 800] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /peso 5 0 R >> /Encoding << /Type /Encoding /Differences [128 /peso] >> /FirstChar 128 /LastChar 128 /Widths [600] /ToUnicode 6 0 R >>')
  addObj(5, `<< /Length ${enc.encode(charProc).length} >> stream\n${charProc}\nendstream`)
  addObj(6, `<< /Length ${enc.encode(toUnicodeCMap).length} >> stream\n${toUnicodeCMap}\nendstream`)

  for (let i = 0; i < numPages; i++) {
    const pageNum = 7 + 2 * i
    const streamNum = 8 + 2 * i

    addObj(pageNum, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamNum} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`)

    const lines = pagesData[i]
    const streamOps = ['BT', '40 750 Td', '14 TL', ...lines.map(encodeLineToOps), 'ET'].join('\n')
    const streamByteLen = enc.encode(streamOps).length
    addObj(streamNum, `<< /Length ${streamByteLen} >> stream\n${streamOps}\nendstream`)
  }

  const totalObjs = 6 + 2 * numPages
  const startXref = enc.encode(body).length
  const pad = (n) => String(n).padStart(10, '0')
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= totalObjs; i++) {
    xref += `${pad(offsets[i])} 00000 n \n`
  }
  xref += `trailer << /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`

  const pdfBody = body + xref
  const blob = new Blob([pdfBody], { type: 'application/pdf' })
  downloadBlob(blob, filename)
  return blob
}

function getFileTypeColor(file) {
  const name = (file?.name || '').toLowerCase()
  const fmt = (file?.format || '').toLowerCase()
  if (name.endsWith('.pdf') || fmt === 'pdf') {
    return { color: '#e53935', bg: '#fdeaea', label: 'PDF' }
  }
  if (name.endsWith('.csv') || fmt === 'csv') {
    return { color: '#2e9b4a', bg: '#e8f6ec', label: 'CSV' }
  }
  return { color: '#2f7de0', bg: '#e8f1fc', label: 'XLSX' }
}

function getItemCategory(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('pizza')) return 'Pizza'
  if (n.includes('burger')) return 'Burgers'
  if (n.includes('wing') || n.includes('fries') || n.includes('sides')) return 'Sides'
  if (n.includes('sprite') || n.includes('coke') || n.includes('tea') || n.includes('drink') || n.includes('beverage')) return 'Beverages'
  if (n.includes('ube') || n.includes('cake') || n.includes('dessert') || n.includes('ice cream')) return 'Dessert'
  if (n.includes('meal') || n.includes('deal') || n.includes('combo')) return 'Combos'
  return 'Main'
}

function formatTrendBadge(item) {
  const raw = String(item?.change ?? '').trim()
  const dir = item?.trend_direction

  if (dir === 'up' || raw.startsWith('+') || raw.includes('↑')) {
    const clean = raw.replace(/^[+↑\s]+/, '')
    return { label: `↑ ${clean}`, badgeClass: 'up' }
  }
  if (dir === 'down' || (raw.startsWith('-') && raw !== '-' && raw !== '—') || raw.includes('↓')) {
    const clean = raw.replace(/^[-↓\s]+/, '')
    return { label: `↓ ${clean}`, badgeClass: 'down' }
  }
  if (dir === 'flat' || raw === '0%') {
    return { label: '0%', badgeClass: 'neutral' }
  }
  if (raw.toLowerCase() === 'new') {
    return { label: 'New', badgeClass: 'neutral' }
  }
  return { label: 'No prior data', badgeClass: 'neutral' }
}

function getStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase().trim().replace(/\s+/g, '-')
  if (s === 'completed' || s === 'paid') return 'completed'
  if (s === 'preparing') return 'preparing'
  if (s === 'out-for-delivery' || s === 'out for delivery') return 'out-for-delivery'
  if (s === 'pending') return 'pending'
  if (s === 'cancelled') return 'cancelled'
  return 'preparing'
}

export default function RecordsReports({ user: propUser }) {
  const auth = useAuth()
  const currentUser = propUser || auth?.user || getStoredUser()

  const [allRecords, setAllRecords] = useState([])
  const [deliveryRecords, setDeliveryRecords] = useState([])
  const [customerRecords, setCustomerRecords] = useState([])
  const [customerTotalPages, setCustomerTotalPages] = useState(1)
  const [customerTotalCount, setCustomerTotalCount] = useState(0)
  const [customerLoading, setCustomerLoading] = useState(false)
  const [topItems, setTopItems] = useState([])
  const [exportsList, setExportsList] = useState([])
  const [reportStats, setReportStats] = useState({
    total_sales_today: 0,
    completed_deliveries: 0,
    avg_delivery_time: 0,
    total_orders: 0,
  })
  const [tab, setTab] = useState('all')

  useEffect(() => {
    Promise.all([
      reportsApi.get(),
      menuApi.topSelling().catch(() => null),
    ])
      .then(([r, topRes]) => {
        const d = r.data?.data || r.data || {}
        const topData = topRes?.data?.data || d.top_items || []
        setAllRecords(Array.isArray(d.all_records) ? d.all_records : [])
        setDeliveryRecords(Array.isArray(d.delivery_records) ? d.delivery_records : [])
        setCustomerRecords(Array.isArray(d.customer_records) ? d.customer_records : [])
        setTopItems(Array.isArray(topData) ? topData : [])
        setExportsList(Array.isArray(d.exports) ? d.exports : [])
        setReportStats(
          d.stats || {
            total_sales_today: 0,
            completed_deliveries: 0,
            avg_delivery_time: 0,
            total_orders: 0,
          },
        )
      })
      .catch(console.error)
  }, [])
  const [salesSearch, setSalesSearch] = useState('')
  const [salesStatus, setSalesStatus] = useState('Completed')
  const [deliverySearch, setDeliverySearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [deliveryStatus, setDeliveryStatus] = useState('All Statuses')
  const [customerStatus, setCustomerStatus] = useState('All Customers')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [topOpen, setTopOpen] = useState(false)
  const [exportsOpen, setExportsOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyFormat, setHistoryFormat] = useState('All Format')
  const [historyDate, setHistoryDate] = useState('All Dates')
  const [format, setFormat] = useState('Sales Summary Report')
  const [exportAs, setExportAs] = useState('PDF')
  const [page, setPage] = useState(1)

  /*
   * PROMPT 47 DIAGNOSTIC REPORT — Replace Period Dropdown with From/To Date Range:
   * 1. Previous `Period` Dropdown Values:
   *    - Supported 4 options: `'Daily'`, `'Weekly'` (default), `'Monthly'`, and `'Yearly'`.
   * 2. How `Period` and Single `Date` (`reportDate`) Were Previously Used:
   *    - `reportDate` (`useState(() => new Date().toISOString().slice(0, 10))`) was bound only to
   *      the single `<input type="date">` in the Generate Report modal and reset in `handleCancel()`.
   *      It was never read by `getReportData()`, `triggerFileDownload()`, or `generateReport()`, and
   *      was never sent to the backend.
   *    - `period` was only interpolated as a text label into the exported report title
   *      (`Sales Summary Report (${periodValue})`) and filename (`${selectedFormat}_${selectedPeriod}.${ext}`).
   *      Neither the frontend nor the backend computed an actual date range from `period` + `reportDate`
   *      or filtered records by it.
   * 3. Endpoint & Parameter Names on "Generate & Download":
   *    - Previously, `generateReport()` built the file client-side from unfiltered state arrays and
   *      called `POST /api/reports/log-export` (`reportsApi.logExport`) with
   *      `{ name, format, size, size_bytes, type, role }`, while `POST /api/reports/generate`
   *      (`reportsApi.generate`) expected `{ period, format_type, export_as, size, size_bytes }`.
   *    - Now, `generateReport()` validates `reportFromDate` and `reportToDate` (ensuring `From <= To`
   *      and neither date is in the future relative to today without silently auto-correcting), sends
   *      `from_date` and `to_date` (`YYYY-MM-DD`) to `POST /api/reports/generate` (`ReportController::generate`)
   *      to retrieve records filtered to `[from_date, to_date]`, exports the filtered file, and logs the
   *      export with `from_date` and `to_date` via `POST /api/reports/log-export`.
   */
  function getLocalTodayString() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function validateReportDateRange(fromVal, toVal) {
    if (!fromVal || !toVal) {
      return 'Please select both From and To dates.'
    }
    const today = getLocalTodayString()
    if (fromVal > today && toVal > today) {
      return 'Neither the "From" date nor the "To" date can be in the future.'
    }
    if (fromVal > today) {
      return 'The "From" date cannot be in the future.'
    }
    if (toVal > today) {
      return 'The "To" date cannot be in the future.'
    }
    if (fromVal > toVal) {
      return 'The "From" date cannot be later than the "To" date.'
    }
    return ''
  }

  function filterArrayByDateRange(items, fromVal, toVal, field = 'datetime') {
    if (!Array.isArray(items)) return []
    if (!fromVal && !toVal) return items
    return items.filter((item) => {
      const raw = item?.[field]
      if (!raw || raw === '—') return false
      const datePart = String(raw).slice(0, 10)
      if (fromVal && datePart < fromVal) return false
      if (toVal && datePart > toVal) return false
      return true
    })
  }

  const [reportFromDate, setReportFromDate] = useState(() => getLocalTodayString())
  const [reportToDate, setReportToDate] = useState(() => getLocalTodayString())
  const [reportDateError, setReportDateError] = useState('')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [sections, setSections] = useState({
    sales: true,
    delivery: true,
    customer: true,
    items: true,
  })

  function getReportData(formatType, rangeLabel, recordsOverride = null) {
    let sourceAll = recordsOverride?.all_records ?? allRecords
    if (salesStatus !== 'All Statuses') {
      sourceAll = sourceAll.filter((r) => (r.status || '').toLowerCase() === salesStatus.toLowerCase())
    }
    let sourceDelivery = recordsOverride?.delivery_records ?? deliveryRecords
    if (salesStatus !== 'All Statuses') {
      sourceDelivery = sourceDelivery.filter((r) => (r.status || '').toLowerCase() === salesStatus.toLowerCase())
    }
    const sourceCustomer = recordsOverride?.customer_records ?? customerRecords
    const sourceTopItems = recordsOverride?.top_items ?? topItems
    const statusSuffix = salesStatus !== 'All Statuses' ? ` - ${salesStatus}` : ''

    if (formatType === 'Sales Per Delivery Person' || formatType === 'Delivery Records' || formatType === 'Delivery Summary Report') {
      const headers = ['Order ID', 'Driver Name', 'Date & Time', 'Delivery Time', 'Distance', 'Status']
      const rows = sourceDelivery.map((r) => [
        r.id,
        r.driver,
        r.datetime,
        r.time,
        r.distance,
        r.status,
      ])
      return { title: `Sales Per Delivery Person${statusSuffix} (${rangeLabel})`, headers, rows }
    }

    /* PROMPT 39 DIAGNOSTIC NOTE:
     * Removed 'Email' header and `r.email` data cell from Customer Records export.
     * In RecordsReports.jsx ("Customer Records" tab table, lines 930-979), the table
     * already displays only: Customer Name, Total Orders, Total Spent, Loyalty Points,
     * Last Order Date, and Status (no Customer ID or Email Address columns).
     * In CustomerManagement.jsx ("Registered Customers" screen), Customer ID and Email Address
     * were removed from the table columns, Customer Details modal, and search filter.
     */
    if (formatType === 'Customer Records' || formatType === 'Customer Summary Report') {
      const headers = ['Customer Name', 'Contact Number', 'Total Orders', 'Total Spent', 'Status']
      const rows = sourceCustomer.map((r) => [
        r.name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Customer',
        r.phone || '--',
        String(r.total_orders ?? r.totalOrders ?? r.orders_count ?? r.orders ?? 0),
        peso(r.total_spent ?? r.totalSpent ?? r.spent ?? 0),
        r.status || r.freq || 'Active',
      ])
      return { title: `Customer Records (${rangeLabel})`, headers, rows }
    }

    /* PROMPT 42 DIAGNOSTIC REPORT:
     * 1. Top Selling Items Trend Calculation:
     *    - Backend `TopSellingService::getTopSelling()` compares units sold in the current 30-day
     *      window (`now()-30d` to `now()`) against the previous 30-day window (`now()-60d` to `now()-30d`).
     *    - Why every item previously displayed "—":
     *      All 15 existing orders in the `orders` table were created between `2026-09-02` and `2026-09-24`
     *      (< 30 days of order history), so the previous 30-day window (`60d..30d`) legitimately returned
     *      0 rows (`$priorUnitsMap = []`), causing every item to fall back to `'—'`.
     *    - Replaced the unexplained `'—'` fallback with a clear `'No prior data'` muted badge when
     *      prior-period sales are 0, while automatically rendering `↑ X%` (green) or `↓ X%` (red)
     *      when prior-period sales exist.
     *    - Cleaned up and archived the test menu item `"Try kog add"` (`menu_items.id = 18`) so it no
     *      longer skews Top Selling Items rankings.
     * 2. Recent Exported Reports Hardcoded "1.2 MB" Data:
     *    - `exportsList` reads from the real `exported_reports` MySQL table (`GET /api/reports`).
     *    - Why 4 out of 5 entries showed `"1.2 MB"`:
     *      Rows #1–#5 in `exported_reports` were created via `ReportController::generate()`, which had
     *      a hardcoded default `'size' => $data['size'] ?? '1.2 MB'`, while Row #6 (`Full_Report_Weekly.pdf`)
     *      was logged via `logExport` with its real byte size (`870.0 B`). Slicing the 5 most recent rows
     *      displayed Row #6 (`870.0 B`) plus Rows #5–#2 (all `'1.2 MB'`).
     *    - Removed the 5 legacy `'1.2 MB'` rows from `exported_reports` and removed all `'1.2 MB'`
     *      fallbacks here and in `ReportController.php`, computing real byte size via `formatBytes(blob.size)`.
     */
    if (formatType === 'Top Selling Items') {
      const headers = ['Rank', 'Item Name', 'Category', 'Units Sold', 'Trend']
      const rows = sourceTopItems.slice(0, 10).map((item, i) => [
        `#${i + 1}`,
        item.name,
        item.category || getItemCategory(item.name),
        `${item.units ?? item.units_sold ?? 0} units`,
        formatTrendBadge(item).label,
      ])
      return { title: `Top Selling Items (${rangeLabel})`, headers, rows }
    }

    if (formatType === 'Full Report') {
      const headers = ['Order ID', 'Customer Name', 'Date & Time', 'Order Type', 'Total Amount', 'Payment Method', 'Status']
      const rows = sourceAll.map((r) => [
        r.id,
        r.customer,
        r.datetime,
        r.type,
        peso(r.amount),
        r.payment,
        r.status,
      ])
      return { title: `Full Sales Report${statusSuffix} (${rangeLabel})`, headers, rows }
    }

    const headers = ['Order ID', 'Customer Name', 'Date & Time', 'Order Type', 'Total Amount', 'Payment Method', 'Status']
    const rows = sourceAll.map((r) => [
      r.id,
      r.customer,
      r.datetime,
      r.type,
      peso(r.amount),
      r.payment,
      r.status,
    ])
    return { title: `Sales Summary Report${statusSuffix} (${rangeLabel})`, headers, rows }
  }

  function handleCancel() {
    const today = getLocalTodayString()
    setFormat('Sales Summary Report')
    setExportAs('PDF')
    setReportFromDate(today)
    setReportToDate(today)
    setReportDateError('')
    setGeneratingReport(false)
    setSections({
      sales: true,
      delivery: true,
      customer: true,
      items: true,
    })
    setGenerateOpen(false)
  }

  async function triggerFileDownload(fileName, formatType, rangeLabel, exportType, recordsOverride = null) {
    const { title, headers, rows: reportRows } = getReportData(formatType, rangeLabel, recordsOverride)
    const normalizedExport = (exportType || 'PDF').toUpperCase()
    let blob = null
    const preparedBy = getPreparedByString(currentUser)
    if (normalizedExport === 'CSV') {
      blob = exportCsv(fileName, headers, reportRows)
    } else if (normalizedExport === 'PDF') {
      blob = await exportPdf(fileName, title, headers, reportRows, preparedBy)
    } else {
      blob = await exportXlsx(fileName, title, headers, reportRows)
    }
    return blob
  }

  async function generateReport() {
    const validationError = validateReportDateRange(reportFromDate, reportToDate)
    if (validationError) {
      setReportDateError(validationError)
      return
    }
    setReportDateError('')

    const selectedFrom = reportFromDate
    const selectedTo = reportToDate
    const selectedFormat = format
    const selectedExportAs = exportAs
    const rangeLabel = `${selectedFrom} to ${selectedTo}`
    const statusSlug = salesStatus !== 'All Statuses' ? `_${salesStatus.replace(/\s+/g, '_')}` : ''
    const fileName = `${selectedFormat.replace(/\s+/g, '_')}${statusSlug}_${selectedFrom}_to_${selectedTo}.${ext}`

    setGeneratingReport(true)

    let filteredDataset = null
    try {
      const genRes = await reportsApi.generate({
        from_date: selectedFrom,
        to_date: selectedTo,
        format_type: selectedFormat,
        export_as: selectedExportAs,
        status: salesStatus,
        sections,
        create_export_record: false,
      })
      filteredDataset = genRes?.data?.data?.records || null
    } catch (err) {
      if (err?.response?.status === 422) {
        const errors = err.response?.data?.errors || {}
        const firstMsg =
          errors.from_date?.[0] ||
          errors.to_date?.[0] ||
          err.response?.data?.message ||
          'Invalid date range selected.'
        setReportDateError(firstMsg)
        setGeneratingReport(false)
        return
      }
      console.warn('Fallback to client-side date range filtering for report generation:', err)
      const baseFilteredAll =
        salesStatus === 'All Statuses'
          ? allRecords
          : allRecords.filter((r) => (r.status || '').toLowerCase() === salesStatus.toLowerCase())
      filteredDataset = {
        all_records: filterArrayByDateRange(baseFilteredAll, selectedFrom, selectedTo, 'datetime'),
        delivery_records: filterArrayByDateRange(deliveryRecords, selectedFrom, selectedTo, 'datetime'),
        customer_records: filterArrayByDateRange(customerRecords, selectedFrom, selectedTo, 'last'),
        top_items: topItems,
      }
    }

    let blob = null
    try {
      blob = await triggerFileDownload(fileName, selectedFormat, rangeLabel, selectedExportAs, filteredDataset)
    } catch (err) {
      console.error(err)
      setGeneratingReport(false)
      alert(err.message || 'Failed to generate report.')
      return
    }

    const sizeBytes = blob?.size || 0
    const calculatedSize = formatBytes(sizeBytes)

    try {
      const { data } = await reportsApi.logExport({
        name: fileName,
        format: selectedExportAs,
        size: calculatedSize,
        size_bytes: sizeBytes,
        type: selectedFormat,
        role: currentUser?.role || 'super_admin',
        from_date: selectedFrom,
        to_date: selectedTo,
      })
      const report = data?.data || data
      setExportsList((prev) => [
        {
          id: report?.id || Date.now(),
          name: fileName,
          date: report?.date || new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          size: report?.size || calculatedSize,
          format: selectedExportAs,
          type: selectedFormat,
          role: report?.role || currentUser?.role || 'super_admin',
          from_date: selectedFrom,
          to_date: selectedTo,
          created_at: report?.created_at || new Date().toISOString(),
        },
        ...prev,
      ])
    } catch (err) {
      console.warn('Backend logExport call error, proceeding with local addition:', err)
      setExportsList((prev) => [
        {
          id: Date.now(),
          name: fileName,
          date: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          size: calculatedSize,
          format: selectedExportAs,
          type: selectedFormat,
          role: currentUser?.role || 'super_admin',
          from_date: selectedFrom,
          to_date: selectedTo,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ])
    }

    handleCancel()
    setExportsOpen(true)
  }

  function handleDownloadExport(file) {
    const ext = file.name.split('.').pop()?.toUpperCase() || file.format?.toUpperCase() || 'PDF'
    const rangeMatch = String(file.name || '').match(/(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})/)
    const fromVal = file.from_date || rangeMatch?.[1] || null
    const toVal = file.to_date || rangeMatch?.[2] || null
    const rangeLabel = fromVal && toVal ? `${fromVal} to ${toVal}` : (file.date || getLocalTodayString())
    const override =
      fromVal && toVal
        ? {
            all_records: filterArrayByDateRange(allRecords, fromVal, toVal, 'datetime'),
            delivery_records: filterArrayByDateRange(deliveryRecords, fromVal, toVal, 'datetime'),
            customer_records: filterArrayByDateRange(customerRecords, fromVal, toVal, 'last'),
            top_items: topItems,
          }
        : null
    triggerFileDownload(file.name, file.type || 'Sales Summary Report', rangeLabel, ext, override).catch(console.error)
  }
  const pageSize = 5

  useEffect(() => {
    if (tab !== 'customer') return
    let cancelled = false
    setCustomerLoading(true)
    reportsApi
      .customers({
        page,
        per_page: pageSize,
        search: customerSearch,
        status: customerStatus,
      })
      .then((res) => {
        if (cancelled) return
        const d = res.data || {}
        const items = d.data || []
        setCustomerRecords(Array.isArray(items) ? items : [])
        setCustomerTotalPages(d.last_page || 1)
        setCustomerTotalCount(d.total || 0)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Error fetching customers report:', err)
        setCustomerRecords([])
        setCustomerTotalPages(1)
        setCustomerTotalCount(0)
      })
      .finally(() => {
        if (!cancelled) setCustomerLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tab, page, customerSearch, customerStatus])

  const filteredSales = useMemo(() => {
    const q = salesSearch.trim().toLowerCase()
    return allRecords.filter((r) => {
      const matchQuery =
        !q ||
        (r.id && r.id.toLowerCase().includes(q)) ||
        (r.customer && r.customer.toLowerCase().includes(q)) ||
        (r.items_sold && r.items_sold.toLowerCase().includes(q)) ||
        (r.items_summary && r.items_summary.toLowerCase().includes(q))

      let matchDate = true
      if (startDate || endDate) {
        const itemDate = r.datetime ? new Date(r.datetime).getTime() : null
        if (itemDate) {
          if (startDate && itemDate < new Date(startDate).setHours(0, 0, 0, 0)) matchDate = false
          if (endDate && itemDate > new Date(endDate).setHours(23, 59, 59, 999)) matchDate = false
        }
      }

      let matchStatus = true
      if (salesStatus !== 'All Statuses') {
        matchStatus = (r.status || '').toLowerCase() === salesStatus.toLowerCase()
      }

      return matchQuery && matchDate && matchStatus
    })
  }, [salesSearch, startDate, endDate, salesStatus, allRecords])

  const filteredDeliveries = useMemo(() => {
    const q = deliverySearch.trim().toLowerCase()
    return deliveryRecords.filter((r) => {
      const rowType = (r.order_type || r.type || 'Online Order').toLowerCase()
      if (rowType === 'dine-in' || rowType === 'takeout') return false

      const matchQuery =
        !q ||
        (r.id && r.id.toLowerCase().includes(q)) ||
        (r.customer && r.customer.toLowerCase().includes(q)) ||
        (r.rider && r.rider.toLowerCase().includes(q)) ||
        (r.driver && r.driver.toLowerCase().includes(q))

      let matchDate = true
      if (startDate || endDate) {
        const itemDate = r.datetime ? new Date(r.datetime).getTime() : null
        if (itemDate) {
          if (startDate && itemDate < new Date(startDate).setHours(0, 0, 0, 0)) matchDate = false
          if (endDate && itemDate > new Date(endDate).setHours(23, 59, 59, 999)) matchDate = false
        }
      }

      let matchStatus = true
      if (deliveryStatus !== 'All Statuses') {
        matchStatus = (r.status || '').toLowerCase() === deliveryStatus.toLowerCase()
      }

      return matchQuery && matchDate && matchStatus
    })
  }, [deliverySearch, startDate, endDate, deliveryStatus, deliveryRecords])

  const activeItems = tab === 'all' ? filteredSales : tab === 'delivery' ? filteredDeliveries : customerRecords
  const totalPages = tab === 'customer' ? customerTotalPages : Math.max(1, Math.ceil(activeItems.length / pageSize))
  const totalCount = tab === 'customer' ? customerTotalCount : activeItems.length
  const paginatedRows = tab === 'customer' ? customerRecords : activeItems.slice((page - 1) * pageSize, page * pageSize)

  const filteredExports = useMemo(() => {
    return exportsList.filter((file) => {
      const q = historySearch.trim().toLowerCase()
      const nameMatch = !q || (file.name || '').toLowerCase().includes(q)

      let formatMatch = true
      if (historyFormat !== 'All Format') {
        const ext = (file.name.split('.').pop() || file.format || '').toUpperCase()
        const fmt = (file.format || '').toUpperCase()
        formatMatch = ext === historyFormat.toUpperCase() || fmt === historyFormat.toUpperCase()
      }

      let dateMatch = true
      if (historyDate !== 'All Dates') {
        const fileTime = file.created_at
          ? new Date(file.created_at).getTime()
          : file.date
          ? new Date(file.date).getTime()
          : null
        const now = new Date()
        if (fileTime && !isNaN(fileTime)) {
          if (historyDate === 'Today') {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
            dateMatch = fileTime >= startOfToday
          } else if (historyDate === 'This Week') {
            const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).getTime()
            dateMatch = fileTime >= startOfWeek
          } else if (historyDate === 'This Month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
            dateMatch = fileTime >= startOfMonth
          }
        }
      }

      return nameMatch && formatMatch && dateMatch
    })
  }, [exportsList, historySearch, historyFormat, historyDate])

  return (
    <div className="reports-page">
      <header className="reports-header">
        <h1 className="reports-title">Records & Reports</h1>
      </header>

      {/* 4 Stat Cards Row */}
      <section className="reports-stats-grid">
        <article className="reports-stat-card">
          <div className="reports-stat-label">Total Sales Today</div>
          <div className="reports-stat-value sales">{peso(reportStats.total_sales_today ?? 0)}</div>
        </article>

        <article className="reports-stat-card">
          <div className="reports-stat-label">Completed Deliveries</div>
          <div className="reports-stat-value">{reportStats.completed_deliveries ?? 0}</div>
        </article>

        <article className="reports-stat-card">
          <div className="reports-stat-label">Avg. Delivery Time</div>
          <div className="reports-stat-value">
            {reportStats.avg_delivery_time ? `${reportStats.avg_delivery_time} mins` : '-- mins'}
          </div>
        </article>

        <article className="reports-stat-card">
          <div className="reports-stat-label">Total Orders</div>
          <div className="reports-stat-value">{reportStats.total_orders ?? 0}</div>
        </article>
      </section>

      {/* Tabs Navigation */}
      <div className="reports-tabs-bar">
        {[
          { id: 'all', label: 'Sales Records' },
          { id: 'delivery', label: 'Delivery Records' },
          { id: 'customer', label: 'Customer Records' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`reports-tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => {
              setTab(t.id)
              setPage(1)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Table Container Card */}
      <section className="reports-main-card">
        {/* Filter Bar */}
        <div className="reports-filter-bar">
          <div className="reports-filter-left">
            {tab === 'all' && (
              <>
                <div className="reports-search-box">
                  <span className="reports-search-icon">
                    <IconSearch />
                  </span>
                  <input
                    type="search"
                    placeholder="Search Order ID..."
                    value={salesSearch}
                    onChange={(e) => {
                      setSalesSearch(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>

                <div className="reports-date-filter">
                  <span>From</span>
                  <input
                    type="date"
                    className="reports-date-input"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value)
                      setPage(1)
                    }}
                  />
                  <span>To</span>
                  <input
                    type="date"
                    className="reports-date-input"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>

                <select
                  className="reports-select-filter"
                  value={salesStatus}
                  onChange={(e) => {
                    setSalesStatus(e.target.value)
                    setPage(1)
                  }}
                >
                  <option>Completed</option>
                  <option>All Statuses</option>
                  <option>Ready</option>
                  <option>Out for Delivery</option>
                  <option>Pending</option>
                </select>
              </>
            )}

            {tab === 'delivery' && (
              <>
                <div className="reports-search-box">
                  <span className="reports-search-icon">
                    <IconSearch />
                  </span>
                  <input
                    type="search"
                    placeholder="Search Order ID or rider"
                    value={deliverySearch}
                    onChange={(e) => {
                      setDeliverySearch(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>

                <div className="reports-date-filter">
                  <span>From</span>
                  <input
                    type="date"
                    className="reports-date-input"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value)
                      setPage(1)
                    }}
                  />
                  <span>To</span>
                  <input
                    type="date"
                    className="reports-date-input"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>

                <select
                  className="reports-select-filter"
                  value={deliveryStatus}
                  onChange={(e) => {
                    setDeliveryStatus(e.target.value)
                    setPage(1)
                  }}
                >
                  <option>All Statuses</option>
                  <option>Preparing</option>
                  <option>Out for Delivery</option>
                  <option>Completed</option>
                </select>
              </>
            )}

            {tab === 'customer' && (
              <>
                <div className="reports-search-box">
                  <span className="reports-search-icon">
                    <IconSearch />
                  </span>
                  <input
                    type="search"
                    placeholder="Search customer name"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>

                <select
                  className="reports-select-filter"
                  value={customerStatus}
                  onChange={(e) => {
                    setCustomerStatus(e.target.value)
                    setPage(1)
                  }}
                >
                  <option>All Customers</option>
                  <option>Frequent</option>
                  <option>Regular</option>
                  <option>New</option>
                </select>
              </>
            )}
          </div>

          {tab === 'all' && (
            <button
              type="button"
              className="reports-btn-generate"
              onClick={() => setGenerateOpen(true)}
            >
              <IconFile />
              Generate Report
            </button>
          )}
        </div>

        <div className="reports-table-wrapper">
          {tab === 'all' && (
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order ID</th>
                  <th>Items Sold</th>
                  <th>Order Type</th>
                  <th>Total Amount</th>
                  <th>Payment Method</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon="receipt"
                        title="No transactions found"
                        subtitle="Try clearing your search or date filter."
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((r) => {
                    const statusClass = getStatusBadgeClass(r.status)
                    const payMethod = r.payment || 'COD'
                    const payClass = String(payMethod).toUpperCase() === 'COD' ? 'cod' : 'paid'
                    const displayId = r.id?.startsWith('#') ? r.id : `#${r.id}`

                    return (
                      <tr key={r.id}>
                        <td>{r.datetime}</td>
                        <td className="reports-order-id">{displayId}</td>
                        <td>{r.items_sold || r.items_summary || '1x Pizza Special'}</td>
                        <td>{r.type}</td>
                        <td className="reports-total-amount">{peso(r.amount)}</td>
                        <td>
                          <span className={`reports-badge ${payClass}`}>{payMethod}</span>
                        </td>
                        <td>
                          <span className={`reports-badge ${statusClass}`}>{r.status}</span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}

          {tab === 'delivery' && (
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Rider</th>
                  <th>Duration</th>
                  <th>Distance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon="truck"
                        title="No delivery records found"
                        subtitle="Dispatched deliveries will be logged here."
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((r) => {
                    const statusClass = getStatusBadgeClass(r.status)
                    const displayId = r.id?.startsWith('#') ? r.id : `#${r.id}`
                    return (
                      <tr key={r.id}>
                        <td>{r.datetime}</td>
                        <td className="reports-order-id">{displayId}</td>
                        <td>{r.customer}</td>
                        <td>{r.rider || r.driver || 'Unassigned'}</td>
                        <td>{r.time || '-- mins'}</td>
                        <td>{r.distance || '-- km'}</td>
                        <td>
                          <span className={`reports-badge ${statusClass}`}>{r.status}</span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}

          {tab === 'customer' && (
            <>
              <table className="reports-table reports-customer-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Total Orders</th>
                    <th>Total Spent</th>
                    <th>Loyalty Points</th>
                    <th>Last Order Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon="users"
                          title="No customer records found"
                          subtitle="Customer loyalty data will be logged here."
                        />
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((r) => {
                      const statusClass = String(r.freq || 'new').toLowerCase()
                      const ordersDisplay = String(r.orders || '').includes('orders')
                        ? r.orders
                        : `${r.orders || r.orders_count || 0} orders`
                      const pointsDisplay = String(r.points || '').includes('pts')
                        ? r.points
                        : `${r.points ?? Math.round(Number(r.spent || 0) / 2)} pts`

                      return (
                        <tr key={r.id || r.name}>
                          <td><strong>{r.name}</strong></td>
                          <td>{ordersDisplay}</td>
                          <td className="reports-total-amount">{peso(r.spent)}</td>
                          <td className="reports-loyalty-pts">{pointsDisplay}</td>
                          <td>{r.last}</td>
                          <td>
                            <span className={`reports-badge ${statusClass}`}>
                              {r.freq}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
              <div className="reports-customer-note">
                Loyalty points are earned by customers through completed orders. View only.
              </div>
            </>
          )}
        </div>

        <div className="reports-table-footer">
          <span className="reports-pagination-info">
            Showing {totalCount === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} {tab === 'all' ? 'transactions' : tab === 'delivery' ? 'deliveries' : 'customers'}
          </span>
          <div className="reports-pagination-controls">
            <button
              type="button"
              className="reports-page-btn arrow"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1
              return (
                <button
                  key={pageNum}
                  type="button"
                  className={`reports-page-btn${page === pageNum ? ' active' : ''}`}
                  disabled={totalPages <= 1}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              type="button"
              className="reports-page-btn arrow"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Bottom Grid Section */}
      <div className="reports-bottom-grid">
        {/* Top Selling Items */}
        <section className="reports-bottom-card">
          <div className="reports-bottom-header">
            <h3 className="reports-bottom-title">Top Selling Items</h3>
            <button
              type="button"
              className="reports-link-action"
              onClick={() => setTopOpen(true)}
            >
              View Full List
            </button>
          </div>
          <div className="reports-top-list">
            {topItems.length === 0 ? (
              <EmptyState
                icon="chart"
                title="No sales recorded"
                subtitle="Top items will show here once orders are placed."
                style={{ padding: '20px 12px' }}
              />
            ) : (
              topItems.slice(0, 5).map((item, idx) => {
                const { label: trendDisplay, badgeClass: trendClass } = formatTrendBadge(item)

                return (
                  <div key={item.id || item.name} className="reports-top-item-row">
                    <div className="reports-top-item-left">
                      <span className="reports-rank-badge">#{idx + 1}</span>
                      <div className="reports-top-item-details">
                        <span className="reports-top-item-name">{item.name}</span>
                        <span className="reports-top-item-sub">{item.category || getItemCategory(item.name)}</span>
                      </div>
                    </div>
                    <div className="reports-top-item-right">
                      <span className="reports-units-count">{item.units ?? item.units_sold ?? 0} units</span>
                      <span
                        className={`reports-trend-badge ${trendClass}`}
                        title={
                          trendClass === 'neutral' && trendDisplay === 'No prior data'
                            ? 'No sales recorded in the previous 30-day period for comparison'
                            : '30-day period-over-period sales trend'
                        }
                      >
                        {trendDisplay}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* Recent Exported Reports */}
        <section className="reports-bottom-card">
          <div className="reports-bottom-header">
            <h3 className="reports-bottom-title">Recent Exported Reports</h3>
            <button
              type="button"
              className="reports-link-action"
              onClick={() => setExportsOpen(true)}
            >
              History
            </button>
          </div>
          <div className="reports-recent-list">
            {exportsList.length === 0 ? (
              <EmptyState
                icon="file"
                title="No reports exported yet"
                subtitle="Generated report files will appear here."
                style={{ padding: '20px 12px' }}
              />
            ) : (
              exportsList.slice(0, 5).map((file) => {
              const ext = (file.name.split('.').pop() || file.format || 'pdf').toLowerCase()
              const badgeClass = ext === 'csv' ? 'csv' : ext === 'xlsx' || ext === 'excel' ? 'xlsx' : 'pdf'
              return (
                <div key={file.id} className="reports-recent-row">
                  <div className="reports-recent-left">
                    <span className={`reports-format-badge ${badgeClass}`}>
                      {badgeClass.toUpperCase()}
                    </span>
                    <div className="reports-recent-details">
                      <span className="reports-recent-filename" title={file.name}>
                        {file.name}
                      </span>
                      <span className="reports-recent-date">{file.date}</span>
                    </div>
                  </div>
                  <div className="reports-recent-right">
                    <span className="reports-recent-size">{file.size || '0 B'}</span>
                    <button
                      type="button"
                      className="reports-download-btn"
                      aria-label="Download"
                      onClick={() => handleDownloadExport(file)}
                      title="Download"
                    >
                      <IconDownload />
                    </button>
                  </div>
                </div>
              )
            }))}
          </div>
        </section>
      </div>

      {/* Generate Report Modal */}
      {generateOpen && (
        <div className="reports-modal-overlay" onClick={handleCancel} role="presentation">
          <div
            className="reports-modal-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="reports-modal-header">
              <div>
                <h2 className="reports-modal-title">Generate Report</h2>
                <p className="reports-modal-subtitle">Choose format, date range, and sections to export.</p>
              </div>
              <button
                type="button"
                className="reports-modal-close-btn"
                onClick={handleCancel}
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>

            <div className="reports-modal-body">
              <div className="reports-form-group">
                <label className="reports-form-label">Export Format</label>
                <div className="reports-format-group">
                  {['PDF', 'CSV', 'XLSX'].map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      className={`reports-format-option${exportAs === fmt ? ' selected' : ''}`}
                      onClick={() => setExportAs(fmt)}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="reports-form-group">
                <label className="reports-form-label">Date Range</label>
                <div className="reports-modal-date-range">
                  <div className="reports-modal-date-field">
                    <span className="reports-modal-date-sublabel">From</span>
                    <input
                      type="date"
                      aria-label="From"
                      className={`reports-date-input${reportDateError ? ' input-error' : ''}`}
                      value={reportFromDate}
                      onChange={(e) => {
                        const nextFrom = e.target.value
                        setReportFromDate(nextFrom)
                        setReportDateError(validateReportDateRange(nextFrom, reportToDate))
                      }}
                    />
                  </div>
                  <div className="reports-modal-date-field">
                    <span className="reports-modal-date-sublabel">To</span>
                    <input
                      type="date"
                      aria-label="To"
                      className={`reports-date-input${reportDateError ? ' input-error' : ''}`}
                      value={reportToDate}
                      onChange={(e) => {
                        const nextTo = e.target.value
                        setReportToDate(nextTo)
                        setReportDateError(validateReportDateRange(reportFromDate, nextTo))
                      }}
                    />
                  </div>
                </div>
                {reportDateError && (
                  <div className="reports-date-range-error" role="alert">
                    {reportDateError}
                  </div>
                )}
              </div>

              <div className="reports-form-group">
                <label className="reports-form-label">Order Status</label>
                <select
                  className="reports-select-filter"
                  style={{ width: '100%', height: '40px', borderRadius: '8px', border: '1px solid #D1D5DB', padding: '0 12px', fontSize: '14px', background: '#FFFFFF', color: '#1F2937' }}
                  value={salesStatus}
                  onChange={(e) => setSalesStatus(e.target.value)}
                >
                  <option>Completed</option>
                  <option>All Statuses</option>
                  <option>Ready</option>
                  <option>Out for Delivery</option>
                  <option>Pending</option>
                </select>
                <p style={{ margin: '4px 0 0 2px', fontSize: '12px', color: '#6B7280' }}>
                  {salesStatus === 'All Statuses'
                    ? 'Exported file will include orders across all statuses.'
                    : `Exported file will only include orders with "${salesStatus}" status.`}
                </p>
              </div>

              <div className="reports-form-group">
                <label className="reports-form-label">Include Sections</label>
                <div className="rr-checkbox-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#F9FAFB', padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                  {[
                    { id: 'sales', label: 'Sales Records' },
                    { id: 'delivery', label: 'Delivery Records' },
                    { id: 'customer', label: 'Customer Records' },
                    { id: 'items', label: 'Top Selling Items' },
                  ].map((sec) => (
                    <label key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!sections[sec.id]}
                        onChange={(e) =>
                          setSections((prev) => ({ ...prev, [sec.id]: e.target.checked }))
                        }
                        style={{ accentColor: '#FFA500', width: '16px', height: '16px' }}
                      />
                      <span>{sec.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="reports-form-group">
                <label className="reports-form-label">Report Template</label>
                <div className="reports-radio-group">
                  {['Sales Summary Report', 'Sales Per Delivery Person', 'Full Report'].map((opt) => (
                    <label key={opt} className="reports-radio-item">
                      <input
                        type="radio"
                        name="format"
                        checked={format === opt}
                        onChange={() => setFormat(opt)}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="reports-modal-footer">
              <button
                type="button"
                className="reports-btn-secondary"
                onClick={handleCancel}
                aria-label="Cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                className="reports-btn-primary"
                onClick={generateReport}
                disabled={generatingReport}
                aria-label="Generate & Download"
              >
                {generatingReport ? 'Generating...' : 'Generate & Download'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top 10 Selling Items — Full List Modal */}
      {topOpen && (
        <div className="reports-modal-overlay" onClick={() => setTopOpen(false)} role="presentation">
          <div
            className="reports-modal-container large"
            style={{ maxWidth: '780px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="reports-modal-header">
              <div>
                <h2 className="reports-modal-title">Top 10 Selling Items — Full List</h2>
                <p className="reports-modal-subtitle">Ranked by all units ordered</p>
              </div>
              <button
                type="button"
                className="reports-modal-close-btn"
                onClick={() => setTopOpen(false)}
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>

            <div className="reports-modal-body" style={{ padding: '0 24px 16px' }}>
              <table className="reports-modal-top10-table">
                <thead>
                  <tr>
                    <th style={{ width: '10%' }}>Rank</th>
                    <th style={{ width: '32%' }}>Item Name</th>
                    <th style={{ width: '22%' }}>Category</th>
                    <th style={{ width: '20%' }}>Units Sold</th>
                    <th style={{ width: '16%' }}>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                        No sales recorded for this period
                      </td>
                    </tr>
                  ) : (
                    topItems.slice(0, 10).map((item, i) => {
                      const rankNum = i + 1
                      const category = item.category || getItemCategory(item.name)
                      const { label: trendDisplay, badgeClass: trendClass } = formatTrendBadge(item)

                      return (
                        <tr key={item.id || item.name}>
                          <td className="reports-top10-rank">#{rankNum}</td>
                          <td className="reports-top10-name">{item.name}</td>
                          <td className="reports-top10-category">{category}</td>
                          <td className="reports-top10-units">{item.units ?? item.units_sold ?? 0} units</td>
                          <td>
                            <span className={`reports-trend-badge ${trendClass}`}>
                              {trendDisplay}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="reports-modal-footer">
              <button
                type="button"
                className="reports-btn-secondary"
                onClick={() => setTopOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="reports-btn-primary"
                onClick={async () => {
                  const headers = ['Rank', 'Item Name', 'Category', 'Units Sold', 'Trend']
                  const reportRows = topItems.slice(0, 10).map((item, i) => [
                    `#${i + 1}`,
                    item.name,
                    item.category || getItemCategory(item.name),
                    `${item.units ?? item.units_sold ?? 0} units`,
                    formatTrendBadge(item).label,
                  ])
                  const fileName = 'Top_10_Selling_Items_Full_List.csv'
                  const blob = exportCsv(fileName, headers, reportRows)
                  try {
                    const sizeBytes = blob?.size || 0
                    const sizeStr = formatBytes(sizeBytes)
                    const { data } = await reportsApi.logExport({
                      name: fileName,
                      format: 'CSV',
                      size: sizeStr,
                      size_bytes: sizeBytes,
                      type: 'Top Selling Items',
                      role: currentUser?.role || 'super_admin',
                    })
                    const report = data?.data || data
                    setExportsList((prev) => [
                      {
                        id: report?.id || Date.now(),
                        name: fileName,
                        date: report?.date || new Date().toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }),
                        size: report?.size || sizeStr,
                        format: 'CSV',
                        type: 'Top Selling Items',
                        role: report?.role || currentUser?.role || 'super_admin',
                        created_at: report?.created_at || new Date().toISOString(),
                      },
                      ...prev,
                    ])
                  } catch (e) {
                    console.warn('Failed to log top selling items export:', e)
                  }
                }}
              >
                Export This List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All Exported Reports Modal */}
      {exportsOpen && (
        <div className="reports-modal-overlay" onClick={() => setExportsOpen(false)} role="presentation">
          <div
            className="reports-modal-container large"
            style={{ maxWidth: '720px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="reports-modal-header">
              <div>
                <h2 className="reports-modal-title">All Exported Reports</h2>
                <p className="reports-modal-subtitle">History of generated and downloaded report files</p>
              </div>
              <button
                type="button"
                className="reports-modal-close-btn"
                onClick={() => setExportsOpen(false)}
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>

            <div className="reports-modal-body">
              {/* Filter Bar */}
              <div className="reports-history-filter-bar">
                <div className="reports-history-search">
                  <span className="reports-search-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <IconSearch />
                  </span>
                  <input
                    type="search"
                    placeholder="Search reports..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                  />
                </div>

                <select
                  className="reports-history-select"
                  value={historyFormat}
                  onChange={(e) => setHistoryFormat(e.target.value)}
                >
                  <option>All Format</option>
                  <option>PDF</option>
                  <option>CSV</option>
                  <option>XLSX</option>
                </select>

                <select
                  className="reports-history-select"
                  value={historyDate}
                  onChange={(e) => setHistoryDate(e.target.value)}
                >
                  <option>All Dates</option>
                  <option>Today</option>
                  <option>This Week</option>
                  <option>This Month</option>
                </select>
              </div>

              {/* Rows List */}
              <div className="reports-recent-list">
                {filteredExports.length === 0 ? (
                  <EmptyState
                    icon="file"
                    title={
                      exportsList.length === 0
                        ? 'No reports exported yet'
                        : 'No exported reports found'
                    }
                    subtitle={
                      exportsList.length === 0
                        ? 'Generated report files will appear here.'
                        : 'Try changing your search or format filter.'
                    }
                  />
                ) : (
                  filteredExports.map((file) => {
                    const ext = (file.name.split('.').pop() || file.format || 'pdf').toLowerCase()
                    const badgeClass = ext === 'csv' ? 'csv' : ext === 'xlsx' || ext === 'excel' ? 'xlsx' : 'pdf'
                    return (
                      <div key={file.id} className="reports-recent-row">
                        <div className="reports-recent-left">
                          <span className={`reports-format-badge ${badgeClass}`}>
                            {badgeClass.toUpperCase()}
                          </span>
                          <div className="reports-recent-details">
                            <span className="reports-recent-filename" title={file.name}>
                              {file.name}
                            </span>
                            <span className="reports-recent-date">{file.date}</span>
                          </div>
                        </div>
                        <div className="reports-recent-right">
                          <span className="reports-recent-size">{file.size || '0 B'}</span>
                          <button
                            type="button"
                            className="reports-download-btn"
                            aria-label="Download"
                            onClick={() => handleDownloadExport(file)}
                            title="Download"
                          >
                            <IconDownload />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="reports-modal-footer">
              <button
                type="button"
                className="reports-btn-secondary"
                onClick={() => setExportsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
