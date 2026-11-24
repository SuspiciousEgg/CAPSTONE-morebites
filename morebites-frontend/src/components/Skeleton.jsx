import './Skeleton.css'

const WIDTH_CYCLE_TEXT = ['78%', '64%', '86%', '70%', '82%', '60%']
const WIDTH_CYCLE_SHORT = ['58px', '72px', '64px', '52px', '68px', '60px']

export function SkeletonBlock({
  width = '100%',
  height = 14,
  radius = 6,
  className = '',
  style = {},
}) {
  return (
    <span
      className={`mb-skel${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: typeof radius === 'number' ? `${radius}px` : radius,
        ...style,
      }}
    />
  )
}

export function StatCardsSkeleton({
  count = 4,
  gridClassName = '',
  cardClassName = '',
  showIcon = true,
  labelFirst = false,
}) {
  return (
    <section
      className={gridClassName}
      aria-busy="true"
      aria-label="Loading summary metrics"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <article
          key={idx}
          className={`${cardClassName} mb-skel-stat-card`.trim()}
        >
          {showIcon && (
            <SkeletonBlock
              className="mb-skel-stat-icon"
              width={44}
              height={44}
              radius={12}
            />
          )}
          <div className="mb-skel-stat-lines">
            {labelFirst ? (
              <>
                <SkeletonBlock width={idx % 2 === 0 ? 124 : 104} height={13} radius={6} />
                <SkeletonBlock width={idx === 0 ? 96 : 64} height={26} radius={7} />
              </>
            ) : (
              <>
                <SkeletonBlock width={idx === 0 ? 88 : 58} height={26} radius={7} />
                <SkeletonBlock width={idx % 2 === 0 ? 120 : 98} height={13} radius={6} />
              </>
            )}
          </div>
        </article>
      ))}
    </section>
  )
}

function renderCellShape(shape, rowIdx, colIdx) {
  const seed = (rowIdx + colIdx) % WIDTH_CYCLE_TEXT.length
  switch (shape) {
    case 'thumb':
      return <SkeletonBlock width={44} height={44} radius={10} />
    case 'id':
      return <SkeletonBlock width={76} height={14} radius={6} />
    case 'two-line':
      return (
        <div className="mb-skel-cell-stack">
          <SkeletonBlock width={WIDTH_CYCLE_TEXT[seed]} height={14} />
          <SkeletonBlock width="52%" height={11} />
        </div>
      )
    case 'avatar':
      return (
        <div className="mb-skel-cell-avatar">
          <SkeletonBlock width={34} height={34} radius={999} style={{ flexShrink: 0 }} />
          <div className="mb-skel-cell-stack" style={{ flex: 1 }}>
            <SkeletonBlock width="76%" height={13} />
            <SkeletonBlock width="56%" height={11} />
          </div>
        </div>
      )
    case 'money':
      return <SkeletonBlock width={70} height={15} radius={6} />
    case 'short':
      return <SkeletonBlock width={WIDTH_CYCLE_SHORT[seed]} height={14} radius={6} />
    case 'badge':
      return <SkeletonBlock width={82} height={24} radius={999} />
    case 'pills':
      return (
        <div className="mb-skel-cell-pills">
          <SkeletonBlock width={54} height={22} radius={999} />
          <SkeletonBlock width={48} height={22} radius={999} />
        </div>
      )
    case 'toggle':
      return <SkeletonBlock width={42} height={22} radius={999} />
    case 'stars':
      return <SkeletonBlock width={94} height={15} radius={6} />
    case 'action':
      return (
        <div className="mb-skel-cell-right">
          <SkeletonBlock width={86} height={30} radius={8} />
          <SkeletonBlock width={30} height={30} radius={8} />
        </div>
      )
    case 'action-btn':
      return (
        <div className="mb-skel-cell-right">
          <SkeletonBlock width={84} height={30} radius={8} />
        </div>
      )
    case 'icon-actions':
      return (
        <div className="mb-skel-cell-right">
          <SkeletonBlock width={30} height={30} radius={8} />
          <SkeletonBlock width={30} height={30} radius={8} />
        </div>
      )
    case 'icon-action':
      return (
        <div className="mb-skel-cell-right">
          <SkeletonBlock width={30} height={30} radius={8} />
        </div>
      )
    case 'text':
    default:
      return <SkeletonBlock width={WIDTH_CYCLE_TEXT[seed]} height={14} radius={6} />
  }
}

export function TableRowsSkeleton({ columns = 6, rows = 5, shapes = null }) {
  const resolvedShapes =
    Array.isArray(shapes) && shapes.length > 0
      ? shapes
      : Array.from({ length: columns }, (_, i) => {
          if (i === 0) return 'id'
          if (i === columns - 1) return 'action-btn'
          if (i === columns - 2) return 'badge'
          return 'text'
        })

  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={`skel-row-${rowIdx}`} className="mb-skel-row" aria-hidden="true">
          {resolvedShapes.map((shape, colIdx) => {
            const isRight =
              shape === 'action' ||
              shape === 'action-btn' ||
              shape === 'icon-actions' ||
              shape === 'icon-action'
            return (
              <td
                key={`skel-cell-${rowIdx}-${colIdx}`}
                style={isRight ? { textAlign: 'right' } : undefined}
              >
                {renderCellShape(shape, rowIdx, colIdx)}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

export function ListRowsSkeleton({ rows = 4, variant = 'default' }) {
  if (variant === 'stocks') {
    return (
      <div className="mb-skel-list" aria-busy="true" aria-label="Loading stock alerts">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="mb-skel-stock-row">
            <div className="mb-skel-stock-top">
              <SkeletonBlock width={idx % 2 === 0 ? '54%' : '42%'} height={13} />
              <SkeletonBlock width={58} height={13} />
            </div>
            <SkeletonBlock width="100%" height={8} radius={999} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mb-skel-list" aria-busy="true" aria-label="Loading list">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="mb-skel-list-row">
          <div className="mb-skel-list-left">
            <SkeletonBlock width={34} height={24} radius={8} style={{ flexShrink: 0 }} />
            <div className="mb-skel-cell-stack" style={{ flex: 1 }}>
              <SkeletonBlock width={idx % 2 === 0 ? '68%' : '56%'} height={13} />
              <SkeletonBlock width="40%" height={11} />
            </div>
          </div>
          <SkeletonBlock width={68} height={22} radius={999} />
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 260, bars = 9 }) {
  const heights = [38, 62, 48, 82, 54, 72, 90, 58, 44, 68, 52, 76]
  return (
    <div
      className="mb-skel-chart"
      style={{ height: `${height}px` }}
      aria-busy="true"
      aria-label="Loading sales chart"
    >
      <div className="mb-skel-chart-bars">
        {Array.from({ length: bars }).map((_, idx) => (
          <SkeletonBlock
            key={idx}
            className="mb-skel-chart-bar"
            width="100%"
            height={`${heights[idx % heights.length]}%`}
            radius={6}
          />
        ))}
      </div>
      <div className="mb-skel-chart-axis">
        {Array.from({ length: Math.min(bars, 7) }).map((_, idx) => (
          <SkeletonBlock key={idx} width={34} height={10} radius={4} />
        ))}
      </div>
    </div>
  )
}

export function DonutSkeleton({ rows = 5 }) {
  return (
    <div className="mb-skel-donut-wrap" aria-busy="true" aria-label="Loading order breakdown">
      <div className="mb-skel mb-skel-donut-ring">
        <div className="mb-skel-donut-hole" />
      </div>
      <div className="mb-skel-donut-legend">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="mb-skel-donut-legend-row">
            <SkeletonBlock width={idx % 2 === 0 ? '64%' : '54%'} height={12} />
            <SkeletonBlock width={24} height={12} />
          </div>
        ))}
      </div>
    </div>
  )
}

