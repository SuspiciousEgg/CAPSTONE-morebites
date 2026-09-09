import { useEffect, useMemo, useState } from 'react'
import {
  IconClose,
  IconDownload,
  IconFile,
  IconSearch,
  IconTrash,
} from './Icons'
import { reportsApi } from '../api/client'
import './RecordsReports.css'

function peso(n) {
  return `₱ ${Number(n).toLocaleString('en-PH')}`
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

function exportCsv(filename, headers, rows) {
  const lines = rows.map((row) =>
    row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
  )
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  downloadBlob(blob, filename)
}

async function exportXlsx(filename, title, headers, rows) {
  if (typeof window !== 'undefined' && window.XLSX) {
    const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = window.XLSX.utils.book_new()
    window.XLSX.utils.book_append_sheet(wb, ws, 'Report')
    window.XLSX.writeFile(wb, filename)
    return
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
}

async function exportPdf(filename, title, headers, rows) {
  if (typeof window !== 'undefined' && (window.jsPDF || window.jspdf?.jsPDF)) {
    const JsPdf = window.jsPDF || window.jspdf.jsPDF
    const doc = new JsPdf()
    doc.text(title, 14, 16)
    let y = 26
    doc.text(headers.join('  |  '), 14, y)
    y += 8
    rows.slice(0, 30).forEach((r) => {
      if (y > 280) {
        doc.addPage()
        y = 20
      }
      doc.text(r.join('  |  '), 14, y)
      y += 7
    })
    doc.save(filename)
    return
  }

  const lines = [
    title,
    `Generated: ${new Date().toLocaleString()}`,
    '',
    headers.join(' | '),
    '-'.repeat(Math.min(80, headers.join(' | ').length)),
    ...rows.map((r) => r.join(' | ')),
  ]

  const pdfStream = [
    'BT',
    '/F1 10 Tf',
    '40 760 Td',
    '14 TL',
    ...lines.map((l) => `(${String(l).replace(/[()\\]/g, '\\$&')}) '`),
    'ET',
  ].join('\n')

  const pdfBody = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${pdfStream.length} >> stream\n${pdfStream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'xref',
    '0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000244 00000 n ',
    '0000000350 00000 n ',
    'trailer << /Size 6 /Root 1 0 R >>',
    'startxref',
    '450',
    '%%EOF',
  ].join('\n')

  const blob = new Blob([pdfBody], { type: 'application/pdf' })
  downloadBlob(blob, filename)
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

const DEFAULT_TOP_ITEMS = [
  { name: 'Pepperoni Pizza', category: 'Pizza', units: 143, change: '↑ 12%' },
  { name: 'Full House (Pizza)', category: 'Pizza', units: 98, change: '↑ 5%' },
  { name: 'Heavenly Ube', category: 'Dessert', units: 76, change: '↓ 2%' },
  { name: 'Supreme Pizza', category: 'Pizza', units: 64, change: '↑ 18%' },
  { name: 'Cheese Overload', category: 'Pizza', units: 51, change: '↑ 8%' },
  { name: 'Burger Combo', category: 'Burgers', units: 47, change: '↑ 10%' },
  { name: 'Chicken Wings', category: 'Sides', units: 41, change: '↑ 4%' },
  { name: 'Sprite 1.5L', category: 'Beverages', units: 32, change: '↓ 1%' },
  { name: 'Cheeseburger Combo', category: 'Burgers', units: 31, change: '↑ 6%' },
  { name: 'Family Meal Deal', category: 'Combos', units: 25, change: '↑ 15%' },
]

const DEFAULT_EXPORTS = [
  { id: 'exp-1', name: 'Weekly_Sales_May_W2.pdf', date: 'Apr 14, 2026', size: '1.2 MB', format: 'PDF' },
  { id: 'exp-2', name: 'Monthly_Delivery_Stats_April....', date: 'Apr 01, 2026', size: '840 KB', format: 'PDF' },
  { id: 'exp-3', name: 'Inventory_Audit_Log.xlsx', date: 'Apr 28, 2026', size: '2.4 MB', format: 'XLSX' },
  { id: 'exp-4', name: 'Daily_Sales_Report_Apr27.csv', date: 'Apr 27, 2026', size: '560 KB', format: 'CSV' },
]

const DEFAULT_SALES_RECORDS = [
  {
    id: '#ORD-00040',
    datetime: '2026-05-30',
    customer: 'John Customer',
    items_sold: '2x Burger Combo',
    type: 'Online Order',
    amount: 540.00,
    payment: 'COD',
    status: 'Preparing',
  },
  {
    id: '#ORD-00041',
    datetime: '2026-05-30',
    customer: 'John Buyer',
    items_sold: '3x Chicken Wings',
    type: 'Online Order',
    amount: 540.00,
    payment: 'COD',
    status: 'Preparing',
  },
  {
    id: '#ORD-00042',
    datetime: '2026-05-30',
    customer: 'John Loan',
    items_sold: '1x Pizza Special',
    type: 'Online Order',
    amount: 540.00,
    payment: 'COD',
    status: 'Preparing',
  },
  {
    id: '#ORD-001',
    datetime: '2026-05-25',
    customer: 'Mark Customer',
    items_sold: '1x Pepperoni Pizza',
    type: 'Online Order',
    amount: 350.00,
    payment: 'COD',
    status: 'Out for Delivery',
  },
  {
    id: '#ORD-002',
    datetime: '2026-05-25',
    customer: 'John Buyer 2',
    items_sold: '2x Cheeseburger Combo',
    type: 'Online Order',
    amount: 440.00,
    payment: 'COD',
    status: 'Out for Delivery',
  },
  {
    id: '#ORD-003',
    datetime: '2026-05-24',
    customer: 'Benny Sean',
    items_sold: '1x Family Meal Deal',
    type: 'Dine-in',
    amount: 620.00,
    payment: 'Cash',
    status: 'Completed',
  },
]

const DEFAULT_DELIVERY_RECORDS = [
  {
    id: '#ORD-00040',
    datetime: '2026-05-30',
    customer: 'John Customer',
    rider: 'Unassigned',
    time: '-- mins',
    distance: '-- km',
    status: 'Preparing',
  },
  {
    id: '#ORD-00041',
    datetime: '2026-05-30',
    customer: 'John Buyer',
    rider: 'Unassigned',
    time: '-- mins',
    distance: '-- km',
    status: 'Preparing',
  },
  {
    id: '#ORD-00042',
    datetime: '2026-05-30',
    customer: 'John Loan',
    rider: 'Unassigned',
    time: '-- mins',
    distance: '-- km',
    status: 'Preparing',
  },
  {
    id: '#ORD-001',
    datetime: '2026-05-25',
    customer: 'Mark Customer',
    rider: 'Mark',
    time: '-- mins',
    distance: '-- km',
    status: 'Out for Delivery',
  },
  {
    id: '#ORD-002',
    datetime: '2026-05-25',
    customer: 'John Buyer 2',
    rider: 'John',
    time: '-- mins',
    distance: '-- km',
    status: 'Out for Delivery',
  },
  {
    id: '#ORD-003',
    datetime: '2026-05-24',
    customer: 'Benny Sean',
    rider: 'John Driver',
    time: '18 mins',
    distance: '2.5 km',
    status: 'Completed',
  },
]

const DEFAULT_CUSTOMER_RECORDS = [
  { name: 'Benny Sean', orders: '21 orders', spent: 935.00, points: '450 pts', last: '2026-05-25', freq: 'Frequent' },
  { name: 'Sean Sean', orders: '19 orders', spent: 1120.00, points: '380 pts', last: '2026-05-25', freq: 'Frequent' },
  { name: 'Benny QT', orders: '18 orders', spent: 890.00, points: '320 pts', last: '2026-05-25', freq: 'Frequent' },
  { name: 'Benedict', orders: '15 orders', spent: 750.00, points: '210 pts', last: '2026-05-25', freq: 'Regular' },
  { name: 'Ben Seanix', orders: '9 orders', spent: 1450.00, points: '90 pts', last: '2026-05-25', freq: 'New' },
  { name: 'Ana Customer', orders: '8 orders', spent: 680.00, points: '80 pts', last: '2026-05-24', freq: 'New' },
  { name: 'John Buyer', orders: '7 orders', spent: 540.00, points: '70 pts', last: '2026-05-23', freq: 'New' },
  { name: 'Maria Santos', orders: '16 orders', spent: 820.00, points: '240 pts', last: '2026-05-22', freq: 'Regular' },
  { name: 'Carlos Reyes', orders: '17 orders', spent: 910.00, points: '270 pts', last: '2026-05-21', freq: 'Regular' },
  { name: 'David Lim', orders: '20 orders', spent: 1050.00, points: '400 pts', last: '2026-05-20', freq: 'Frequent' },
  { name: 'Grace Tan', orders: '6 orders', spent: 490.00, points: '50 pts', last: '2026-05-19', freq: 'New' },
  { name: 'Kevin Yu', orders: '14 orders', spent: 710.00, points: '190 pts', last: '2026-05-18', freq: 'Regular' },
  { name: 'Lisa Cruz', orders: '22 orders', spent: 1280.00, points: '480 pts', last: '2026-05-17', freq: 'Frequent' },
  { name: 'Mark Bautista', orders: '11 orders', spent: 630.00, points: '140 pts', last: '2026-05-16', freq: 'Regular' },
  { name: 'Nina Lopez', orders: '5 orders', spent: 420.00, points: '40 pts', last: '2026-05-15', freq: 'New' },
  { name: 'Oliver Ramos', orders: '13 orders', spent: 690.00, points: '170 pts', last: '2026-05-14', freq: 'Regular' },
  { name: 'Patricia Gomez', orders: '23 orders', spent: 1340.00, points: '510 pts', last: '2026-05-13', freq: 'Frequent' },
  { name: 'Quinn Dizon', orders: '4 orders', spent: 350.00, points: '30 pts', last: '2026-05-12', freq: 'New' },
]

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

function getStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase().trim().replace(/\s+/g, '-')
  if (s === 'completed' || s === 'paid') return 'completed'
  if (s === 'preparing') return 'preparing'
  if (s === 'out-for-delivery' || s === 'out for delivery') return 'out-for-delivery'
  if (s === 'pending') return 'pending'
  if (s === 'cancelled') return 'cancelled'
  return 'preparing'
}

export default function RecordsReports() {
  const [allRecords, setAllRecords] = useState(DEFAULT_SALES_RECORDS)
  const [deliveryRecords, setDeliveryRecords] = useState(DEFAULT_DELIVERY_RECORDS)
  const [customerRecords, setCustomerRecords] = useState(DEFAULT_CUSTOMER_RECORDS)
  const [topItems, setTopItems] = useState(DEFAULT_TOP_ITEMS)
  const [exportsList, setExportsList] = useState(DEFAULT_EXPORTS)
  const [reportStats, setReportStats] = useState({
    total_sales_today: 0,
    completed_deliveries: 0,
    avg_delivery_time: 0,
    total_orders: 0,
  })
  const [tab, setTab] = useState('all')

  useEffect(() => {
    reportsApi
      .get()
      .then((r) => {
        const d = r.data?.data || r.data || {}
        setAllRecords(d.all_records && d.all_records.length > 0 ? d.all_records : DEFAULT_SALES_RECORDS)
        setDeliveryRecords(d.delivery_records && d.delivery_records.length > 0 ? d.delivery_records : DEFAULT_DELIVERY_RECORDS)
        setCustomerRecords(d.customer_records && d.customer_records.length > 0 ? d.customer_records : DEFAULT_CUSTOMER_RECORDS)
        setTopItems(d.top_items && d.top_items.length > 0 ? d.top_items : DEFAULT_TOP_ITEMS)
        setExportsList(d.exports && d.exports.length > 0 ? d.exports : DEFAULT_EXPORTS)
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
  const [period, setPeriod] = useState('Weekly')
  const [format, setFormat] = useState('Sales Summary Report')
  const [exportAs, setExportAs] = useState('PDF')
  const [page, setPage] = useState(1)
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [sections, setSections] = useState({
    sales: true,
    delivery: true,
    customer: true,
    items: true,
  })

  function getReportData(formatType, periodValue) {
    if (formatType === 'Sales Per Delivery Person') {
      const headers = ['Order ID', 'Driver Name', 'Date & Time', 'Delivery Time', 'Distance', 'Status']
      const rows = deliveryRecords.map((r) => [
        r.id,
        r.driver,
        r.datetime,
        r.time,
        r.distance,
        r.status,
      ])
      return { title: `Sales Per Delivery Person (${periodValue})`, headers, rows }
    }

    if (formatType === 'Full Report') {
      const headers = ['Order ID', 'Customer Name', 'Date & Time', 'Order Type', 'Total Amount', 'Payment Method', 'Status']
      const rows = allRecords.map((r) => [
        r.id,
        r.customer,
        r.datetime,
        r.type,
        peso(r.amount),
        r.payment,
        r.status,
      ])
      return { title: `Full Sales Report (${periodValue})`, headers, rows }
    }

    const headers = ['Order ID', 'Customer Name', 'Date & Time', 'Order Type', 'Total Amount', 'Payment Method', 'Status']
    const rows = allRecords.map((r) => [
      r.id,
      r.customer,
      r.datetime,
      r.type,
      peso(r.amount),
      r.payment,
      r.status,
    ])
    return { title: `Sales Summary Report (${periodValue})`, headers, rows }
  }

  function handleCancel() {
    setPeriod('Weekly')
    setFormat('Sales Summary Report')
    setExportAs('PDF')
    setReportDate(new Date().toISOString().slice(0, 10))
    setSections({
      sales: true,
      delivery: true,
      customer: true,
      items: true,
    })
    setGenerateOpen(false)
  }

  async function handleDeleteExport(id) {
    if (window.confirm && !window.confirm('Are you sure you want to delete this report?')) return
    try {
      await reportsApi.delete(id)
    } catch (err) {
      console.warn('Backend delete error, updating state locally:', err)
    }
    setExportsList((prev) => prev.filter((item) => item.id !== id))
  }

  async function triggerFileDownload(fileName, formatType, periodValue, exportType) {
    const { title, headers, rows: reportRows } = getReportData(formatType, periodValue)
    const normalizedExport = (exportType || 'PDF').toUpperCase()
    if (normalizedExport === 'CSV') {
      exportCsv(fileName, headers, reportRows)
    } else if (normalizedExport === 'PDF') {
      await exportPdf(fileName, title, headers, reportRows)
    } else {
      await exportXlsx(fileName, title, headers, reportRows)
    }
  }

  async function generateReport() {
    const selectedPeriod = period
    const selectedFormat = format
    const selectedExportAs = exportAs
    const ext = selectedExportAs.toLowerCase() === 'csv' ? 'csv' : selectedExportAs.toLowerCase() === 'pdf' ? 'pdf' : 'xlsx'
    const fallbackName = `${selectedFormat.replace(/\s+/g, '_')}_${selectedPeriod}.${ext}`

    let report = null
    try {
      const { data } = await reportsApi.generate({
        period: selectedPeriod,
        format_type: selectedFormat,
        export_as: selectedExportAs,
      })
      report = data?.data || data
    } catch (err) {
      console.warn('Backend generate call error, proceeding with download:', err)
    }

    const fileName = report?.name || fallbackName

    try {
      await triggerFileDownload(fileName, selectedFormat, selectedPeriod, selectedExportAs)

      setExportsList((prev) => [
        {
          id: report?.id || Date.now(),
          name: fileName,
          date: report?.created_at
            ? new Date(report.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Today',
          size: report?.size || '1.2 MB',
          format: selectedExportAs,
        },
        ...prev,
      ])
      handleCancel()
      setExportsOpen(true)
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to generate report.')
    }
  }

  function handleDownloadExport(file) {
    const ext = file.name.split('.').pop()?.toUpperCase() || file.format?.toUpperCase() || 'PDF'
    triggerFileDownload(file.name, 'Sales Summary Report', 'Weekly', ext).catch(console.error)
  }
  const pageSize = 5

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

      return matchQuery && matchDate
    })
  }, [salesSearch, startDate, endDate, allRecords])

  const filteredDeliveries = useMemo(() => {
    const q = deliverySearch.trim().toLowerCase()
    return deliveryRecords.filter((r) => {
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

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    return customerRecords.filter((r) => {
      const matchQuery = !q || (r.name && r.name.toLowerCase().includes(q))

      let matchStatus = true
      if (customerStatus !== 'All Customers') {
        matchStatus = (r.freq || '').toLowerCase() === customerStatus.toLowerCase()
      }

      return matchQuery && matchStatus
    })
  }, [customerSearch, customerStatus, customerRecords])

  const activeItems = tab === 'all' ? filteredSales : tab === 'delivery' ? filteredDeliveries : filteredCustomers
  const totalPages = Math.max(1, Math.ceil(activeItems.length / pageSize))
  const paginatedRows = activeItems.slice((page - 1) * pageSize, page * pageSize)

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
        const d = (file.date || '').toLowerCase()
        if (historyDate === 'Today') {
          dateMatch = d.includes('today')
        } else if (historyDate === 'This Week') {
          dateMatch = d.includes('may') || d.includes('today')
        } else if (historyDate === 'This Month') {
          dateMatch = d.includes('may') || d.includes('apr')
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
          <div className="reports-stat-value sales">{peso(reportStats.total_sales_today || 890)}</div>
        </article>

        <article className="reports-stat-card">
          <div className="reports-stat-label">Completed Deliveries</div>
          <div className="reports-stat-value">{reportStats.completed_deliveries || 1}</div>
        </article>

        <article className="reports-stat-card">
          <div className="reports-stat-label">Avg. Delivery Time</div>
          <div className="reports-stat-value">
            {reportStats.avg_delivery_time ? `${reportStats.avg_delivery_time} mins` : '14 mins'}
          </div>
        </article>

        <article className="reports-stat-card">
          <div className="reports-stat-label">Total Orders</div>
          <div className="reports-stat-value">{reportStats.total_orders || 6}</div>
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
                  <option>Cancelled</option>
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
                      <div className="reports-empty-state">
                        <div className="reports-empty-title">No transactions found</div>
                        <div className="reports-empty-subtext">Try clearing your search or date range filter.</div>
                      </div>
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
                      <div className="reports-empty-state">
                        <div className="reports-empty-title">No delivery records found</div>
                        <div className="reports-empty-subtext">Dispatched deliveries will be logged here.</div>
                      </div>
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
              <table className="reports-table">
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
                        <div className="reports-empty-state">
                          <div className="reports-empty-title">No customer records found</div>
                          <div className="reports-empty-subtext">Customer loyalty data will be logged here.</div>
                        </div>
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
                        <tr key={r.name}>
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
            Showing {activeItems.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, activeItems.length)} of {activeItems.length} {tab === 'all' ? 'transactions' : tab === 'delivery' ? 'deliveries' : 'customers'}
          </span>
          <div className="reports-pagination-controls">
            <button
              type="button"
              className="reports-page-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1
              return (
                <button
                  key={pageNum}
                  type="button"
                  className={`reports-page-btn${page === pageNum ? ' active' : ''}`}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              type="button"
              className="reports-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
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
            {topItems.map((item, idx) => {
              const isTrendDown = String(item.change).startsWith('-')
              const trendDisplay = String(item.change).startsWith('-')
                ? `↓ ${String(item.change).replace('-', '')}`
                : String(item.change).startsWith('↑') || String(item.change).startsWith('↓')
                ? item.change
                : `↑ ${String(item.change).replace('+', '')}`

              return (
                <div key={item.name} className="reports-top-item-row">
                  <div className="reports-top-item-left">
                    <span className="reports-rank-badge">#{idx + 1}</span>
                    <span className="reports-top-item-name">{item.name}</span>
                  </div>
                  <div className="reports-top-item-right">
                    <span className="reports-units-count">{item.units} units</span>
                    <span className={`reports-trend-badge ${isTrendDown ? 'down' : 'up'}`}>
                      {trendDisplay}
                    </span>
                  </div>
                </div>
              )
            })}
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
            {exportsList.map((file) => {
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
                    <span className="reports-recent-size">{file.size || '1.2 MB'}</span>
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
            })}
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
                <label className="reports-form-label">Period</label>
                <select
                  className="reports-select-filter"
                  style={{ width: '100%' }}
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                  <option>Yearly</option>
                </select>
              </div>

              <div className="reports-form-group">
                <label className="reports-form-label">Date</label>
                <input
                  type="date"
                  className="reports-date-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
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
                aria-label="Generate & Download"
              >
                Generate & Download
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
                  {topItems.slice(0, 10).map((item, i) => {
                    const rankNum = i + 1
                    const category = item.category || getItemCategory(item.name)
                    const isTrendDown = String(item.change).startsWith('-') || String(item.change).includes('↓')
                    const trendDisplay = String(item.change).startsWith('-')
                      ? `↓ ${String(item.change).replace('-', '')}`
                      : String(item.change).startsWith('↑') || String(item.change).startsWith('↓')
                      ? item.change
                      : `↑ ${String(item.change).replace('+', '')}`

                    return (
                      <tr key={item.name}>
                        <td className="reports-top10-rank">#{rankNum}</td>
                        <td className="reports-top10-name">{item.name}</td>
                        <td className="reports-top10-category">{category}</td>
                        <td className="reports-top10-units">{item.units} units</td>
                        <td>
                          <span className={`reports-trend-badge ${isTrendDown ? 'down' : 'up'}`}>
                            {trendDisplay}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
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
                onClick={() => {
                  const headers = ['Rank', 'Item Name', 'Category', 'Units Sold', 'Trend']
                  const reportRows = topItems.slice(0, 10).map((item, i) => [
                    `#${i + 1}`,
                    item.name,
                    item.category || getItemCategory(item.name),
                    `${item.units} units`,
                    item.change,
                  ])
                  exportCsv('Top_10_Selling_Items_Full_List.csv', headers, reportRows)
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
                  <div className="reports-empty-state">
                    <div className="reports-empty-title">No exported reports found</div>
                    <div className="reports-empty-subtext">Try changing your search query or format filter.</div>
                  </div>
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
                          <span className="reports-recent-size">{file.size || '1.2 MB'}</span>
                          <button
                            type="button"
                            className="reports-download-btn"
                            aria-label="Download"
                            onClick={() => handleDownloadExport(file)}
                            title="Download"
                          >
                            <IconDownload />
                          </button>
                          <button
                            type="button"
                            className="reports-download-btn"
                            style={{ color: '#EF4444', borderColor: '#FCA5A5' }}
                            aria-label="Delete"
                            onClick={() => handleDeleteExport(file.id)}
                            title="Delete"
                          >
                            <IconTrash />
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
