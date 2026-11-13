import { useState } from 'react'

export function SvgBarChart({ data = [], title = 'Top Violated Rules' }) {
  const [showTableFallback, setShowTableFallback] = useState(false)

  if (!data || data.length === 0) {
    return <p className="chart-empty">No violation data available for this range.</p>
  }

  const maxCount = Math.max(...data.map(d => d.count || 0), 1)
  const chartWidth = 500
  const barHeight = 24
  const gap = 14
  const startY = 20
  const labelWidth = 140
  const maxBarLength = chartWidth - labelWidth - 60

  return (
    <div className="svg-chart-container">
      <div className="chart-header-row">
        <h4 className="chart-title">{title}</h4>
        <button
          type="button"
          className="table-fallback-toggle mono-font"
          onClick={() => setShowTableFallback(prev => !prev)}
          aria-expanded={showTableFallback}
        >
          {showTableFallback ? 'Show Visual Chart' : 'Show Data Table'}
        </button>
      </div>

      {!showTableFallback ? (
        <div className="svg-wrapper" role="img" aria-label={title}>
          <svg
            viewBox={`0 0 ${chartWidth} ${data.length * (barHeight + gap) + 30}`}
            className="bar-chart-svg brand-svg-chart"
            width="100%"
            preserveAspectRatio="xMidYMid meet"
          >
            {data.map((item, index) => {
              const y = startY + index * (barHeight + gap)
              const barWidth = Math.max(4, (item.count / maxCount) * maxBarLength)
              const label = item.rule_id ? `${item.rule_id}: ${item.label}` : item.label

              return (
                <g key={item.rule_id || item.label || index} className="bar-group">
                  <text
                    x={labelWidth - 10}
                    y={y + barHeight / 2 + 4}
                    textAnchor="end"
                    className="chart-axis-label mono-font"
                    fill="var(--ink)"
                    fontSize="11"
                  >
                    {label.length > 18 ? label.substring(0, 18) + '…' : label}
                  </text>
                  <rect
                    x={labelWidth}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx="2"
                    fill="var(--vermilion)"
                    opacity="0.85"
                  />
                  <text
                    x={labelWidth + barWidth + 8}
                    y={y + barHeight / 2 + 4}
                    className="chart-value-label mono-font"
                    fill="var(--ink)"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {item.count}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      ) : (
        <div className="table-fallback-wrapper">
          <table className="editorial-table chart-fallback-table" aria-label={title}>
            <thead>
              <tr>
                <th scope="col">Rule / Term</th>
                <th scope="col">Kind</th>
                <th scope="col" style={{ textAlign: 'right' }}>Violations</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <strong>{item.rule_id || '—'}</strong> {item.label}
                  </td>
                  <td>{item.kind || 'rule_violation'}</td>
                  <td style={{ textAlign: 'right' }}>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
