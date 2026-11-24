import { LuChevronLeft, LuChevronRight, LuEllipsis } from 'react-icons/lu'
import './PaginationControls.css'

export function getPaginationItems(currentPage, totalPages) {
  const safeTotal = Math.max(1, Number(totalPages) || 1)
  const safeCurrent = Math.min(Math.max(1, Number(currentPage) || 1), safeTotal)

  if (safeTotal <= 6) {
    return Array.from({ length: safeTotal }, (_, i) => i + 1)
  }

  const pages = new Set([1, safeTotal])

  if (safeCurrent <= 3) {
    pages.add(2)
    pages.add(3)
    if (safeCurrent === 3) pages.add(4)
  } else if (safeCurrent >= safeTotal - 2) {
    pages.add(safeTotal - 2)
    pages.add(safeTotal - 1)
    if (safeCurrent === safeTotal - 2) pages.add(safeTotal - 3)
  } else {
    pages.add(safeCurrent - 1)
    pages.add(safeCurrent)
    pages.add(safeCurrent + 1)
  }

  const sorted = Array.from(pages)
    .filter((n) => n >= 1 && n <= safeTotal)
    .sort((a, b) => a - b)

  const items = []
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]
    const prev = sorted[i - 1]
    if (prev != null) {
      if (n - prev === 2) {
        items.push(prev + 1)
      } else if (n - prev > 2) {
        items.push(`ellipsis-${prev}-${n}`)
      }
    }
    items.push(n)
  }
  return items
}

export default function PaginationControls({ currentPage, totalPages, onPageChange }) {
  const safeTotal = Math.max(1, Number(totalPages) || 1)
  const safeCurrent = Math.min(Math.max(1, Number(currentPage) || 1), safeTotal)
  const items = getPaginationItems(safeCurrent, safeTotal)

  return (
    <div className="mb-pagination-controls" role="navigation" aria-label="Pagination">
      <button
        type="button"
        className="mb-page-btn arrow"
        disabled={safeCurrent <= 1}
        onClick={() => onPageChange(Math.max(1, safeCurrent - 1))}
        aria-label="Previous page"
      >
        <LuChevronLeft size={16} />
      </button>

      {items.map((item) =>
        typeof item === 'string' ? (
          <span key={item} className="mb-page-ellipsis" aria-hidden="true">
            <LuEllipsis size={15} />
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`mb-page-btn${item === safeCurrent ? ' active' : ''}`}
            disabled={safeTotal <= 1}
            aria-current={item === safeCurrent ? 'page' : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        className="mb-page-btn arrow"
        disabled={safeCurrent >= safeTotal}
        onClick={() => onPageChange(Math.min(safeTotal, safeCurrent + 1))}
        aria-label="Next page"
      >
        <LuChevronRight size={16} />
      </button>
    </div>
  )
}

