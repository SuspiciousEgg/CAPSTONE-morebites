import { useEffect, useMemo, useState } from 'react'
import {
  IconClose,
  IconDownload,
  IconFile,
  IconSearch,
} from './Icons'
import { menuApi, reportsApi } from '../api/client'
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
    const blob = doc.output ? doc.output('blob') : new Blob([doc.output()], { type: 'application/pdf' })
    downloadBlob(blob, filename)
    return blob
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

  async function triggerFileDownload(fileName, formatType, periodValue, exportType) {
    const { title, headers, rows: reportRows } = getReportData(formatType, periodValue)
    const normalizedExport = (exportType || 'PDF').toUpperCase()
    let blob = null
    if (normalizedExport === 'CSV') {
      blob = exportCsv(fileName, headers, reportRows)
    } else if (normalizedExport === 'PDF') {
      blob = await exportPdf(fileName, title, headers, reportRows)
    } else {
      blob = await exportXlsx(fileName, title, headers, reportRows)
    }
    return blob
  }

  async function generateReport() {
    const selectedPeriod = period
    const selectedFormat = format
    const selectedExportAs = exportAs
    const ext = selectedExportAs.toLowerCase() === 'csv' ? 'csv' : selectedExportAs.toLowerCase() === 'pdf' ? 'pdf' : 'xlsx'
    const fileName = `${selectedFormat.replace(/\s+/g, '_')}_${selectedPeriod}.${ext}`

    let blob = null
    try {
      blob = await triggerFileDownload(fileName, selectedFormat, selectedPeriod, selectedExportAs)
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to generate report.')
      return
    }

    const calculatedSize = blob?.size ? formatBytes(blob.size) : '1.2 MB'

    try {
      const { data } = await reportsApi.logExport({
        name: fileName,
        format: selectedExportAs,
        size: calculatedSize,
        type: selectedFormat,
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
    triggerFileDownload(file.name, file.type || 'Sales Summary Report', 'Weekly', ext).catch(console.error)
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
                        <span className="reports-empty-pill">Transactions</span>
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
                        <span className="reports-empty-pill">Deliveries</span>
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
                          <span className="reports-empty-pill">Customers</span>
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
          {totalPages > 1 && (
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
          )}
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
              <div className="reports-empty-state-mini">No sales recorded for this period</div>
            ) : (
              topItems.slice(0, 5).map((item, idx) => {
                const isNeutral = !item.change || item.change === '—' || item.change === '-'
                const isTrendDown = String(item.change).startsWith('-') || String(item.change).includes('↓')
                const trendDisplay = isNeutral
                  ? '—'
                  : String(item.change).startsWith('-')
                  ? `↓ ${String(item.change).replace('-', '')}`
                  : String(item.change).startsWith('↑') || String(item.change).startsWith('↓')
                  ? item.change
                  : `↑ ${String(item.change).replace('+', '')}`

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
                      <span className={`reports-trend-badge ${isNeutral ? 'neutral' : isTrendDown ? 'down' : 'up'}`}>
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
              <div className="reports-empty-state-mini">No reports exported yet</div>
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
                      const isNeutral = !item.change || item.change === '—' || item.change === '-'
                      const isTrendDown = String(item.change).startsWith('-') || String(item.change).includes('↓')
                      const trendDisplay = isNeutral
                        ? '—'
                        : String(item.change).startsWith('-')
                        ? `↓ ${String(item.change).replace('-', '')}`
                        : String(item.change).startsWith('↑') || String(item.change).startsWith('↓')
                        ? item.change
                        : `↑ ${String(item.change).replace('+', '')}`

                      return (
                        <tr key={item.id || item.name}>
                          <td className="reports-top10-rank">#{rankNum}</td>
                          <td className="reports-top10-name">{item.name}</td>
                          <td className="reports-top10-category">{category}</td>
                          <td className="reports-top10-units">{item.units ?? item.units_sold ?? 0} units</td>
                          <td>
                            <span className={`reports-trend-badge ${isNeutral ? 'neutral' : isTrendDown ? 'down' : 'up'}`}>
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
                    item.change || '—',
                  ])
                  const fileName = 'Top_10_Selling_Items_Full_List.csv'
                  const blob = exportCsv(fileName, headers, reportRows)
                  try {
                    const sizeStr = blob?.size ? formatBytes(blob.size) : '1.0 KB'
                    const { data } = await reportsApi.logExport({
                      name: fileName,
                      format: 'CSV',
                      size: sizeStr,
                      type: 'Top Selling Items',
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
                  <div className="reports-empty-state">
                    <span className="reports-empty-pill">Exported Reports</span>
                    <div className="reports-empty-title">
                      {exportsList.length === 0 ? 'No reports exported yet' : 'No exported reports found'}
                    </div>
                    <div className="reports-empty-subtext">
                      {exportsList.length === 0
                        ? 'Generated PDF, CSV, and Excel exports will appear here.'
                        : 'Try changing your search query or format filter.'}
                    </div>
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
