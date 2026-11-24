export const MANILA_TZ = 'Asia/Manila'

/**
 * Returns YYYY-MM-DD in Philippine Standard Time (Asia/Manila, UTC+8).
 */
export function getManilaDateYmd(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * Returns YYYY-MM in Philippine Standard Time (Asia/Manila, UTC+8).
 */
export function getManilaYearMonth(date = new Date()) {
  const ymd = getManilaDateYmd(date)
  return ymd ? ymd.slice(0, 7) : ''
}

/**
 * Returns Unix ms for 00:00:00 Asia/Manila of a given Date or YYYY-MM-DD string.
 */
export function getManilaStartOfDayMs(dateOrYmd = new Date()) {
  const ymd =
    typeof dateOrYmd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrYmd.trim())
      ? dateOrYmd.trim()
      : getManilaDateYmd(dateOrYmd)
  if (!ymd) return NaN
  return new Date(`${ymd}T00:00:00+08:00`).getTime()
}

/**
 * Returns Unix ms for 23:59:59.999 Asia/Manila of a given Date or YYYY-MM-DD string.
 */
export function getManilaEndOfDayMs(dateOrYmd = new Date()) {
  const ymd =
    typeof dateOrYmd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrYmd.trim())
      ? dateOrYmd.trim()
      : getManilaDateYmd(dateOrYmd)
  if (!ymd) return NaN
  return new Date(`${ymd}T23:59:59.999+08:00`).getTime()
}

/**
 * Signed whole calendar days between today in Asia/Manila and a target date.
 */
export function getManilaDaysUntil(dateValue) {
  if (!dateValue || dateValue === '—') return null
  let targetYmd = ''
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
    targetYmd = dateValue.trim()
  } else {
    const parsed = new Date(dateValue)
    if (Number.isNaN(parsed.getTime())) return null
    targetYmd = getManilaDateYmd(parsed)
  }
  const todayYmd = getManilaDateYmd(new Date())
  const targetMs = new Date(`${targetYmd}T00:00:00+08:00`).getTime()
  const todayMs = new Date(`${todayYmd}T00:00:00+08:00`).getTime()
  return Math.round((targetMs - todayMs) / 86400000)
}

export function formatManilaDate(value, options = {}) {
  if (!value) return '—'
  const d =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
      ? new Date(`${value.trim()}T12:00:00+08:00`)
      : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-US', {
    timeZone: MANILA_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  })
}

export function formatManilaDateTime(value, options = {}) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('en-US', {
    timeZone: MANILA_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  })
}

export function isSameManilaDay(a, b = new Date()) {
  const ymdA = getManilaDateYmd(a)
  const ymdB = getManilaDateYmd(b)
  return Boolean(ymdA && ymdB && ymdA === ymdB)
}

