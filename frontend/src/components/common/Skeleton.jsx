export function Skeleton({ width = '100%', height = '20px', style = {} }) {
  return (
    <div
      className="skeleton-pulse"
      style={{
        width,
        height,
        ...style,
      }}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <Skeleton width="40%" height="16px" style={{ marginBottom: '12px' }} />
      <Skeleton width="80%" height="24px" style={{ marginBottom: '8px' }} />
      <Skeleton width="100%" height="14px" style={{ marginBottom: '6px' }} />
      <Skeleton width="60%" height="14px" />
    </div>
  )
}

export function SkeletonTable({ rows = 4, cols = 4 }) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      <div className="skeleton-table-header">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${80 / cols}%`} height="18px" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="skeleton-table-row">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} width={`${70 / cols}%`} height="16px" />
          ))}
        </div>
      ))}
    </div>
  )
}
