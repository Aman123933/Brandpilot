import { useState } from 'react'

export function SvgLineChart({
  data = [],
  title = 'Violations Over Time',
  days = 30,
  onDaysChange = null,
}) {
  const [showTableFallback, setShowTableFallback] = useState(false)

  if (!data || data.length === 0) {
    return <p className="chart-empty">No trend data available.</p>
  }

  const width = 600
  const height = 220
  const paddingLeft = 45
  const paddingRight = 20
  const paddingTop = 25
  const paddingBottom = 35

  const chartInnerWidth = width - paddingLeft - paddingRight
  const chartInnerHeight = height - paddingTop - paddingBottom

  const maxVal = Math.max(...data.map(d => d.count || 0), 4)

  // Generate coordinates for points
  const points = data.map((d, i) => {
    const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * chartInnerWidth
    const y = paddingTop + chartInnerHeight - (d.count / maxVal) * chartInnerHeight
    return { x, y, date: d.date, count: d.count }
  })

  const pathD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`
  }, '')

  // Area under line
  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${paddingTop + chartInnerHeight} L ${points[0].x} ${paddingTop + chartInnerHeight} Z`
    : ''

  // Sample dates for X-axis (e.g. 5 ticks)
  const xTicks = points.filter((_, i) => {
    if (points.length <= 7) return true
    const step = Math.floor(points.length / 5)
    return i % step === 0 || i === points.length - 1
  })

  return (
    <div className="svg-chart-container">
      <div className="chart-header-row">
        <div>
          <h4 className="chart-title">{title}</h4>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {onDaysChange && (
            <div className="timeframe-selector" role="group" aria-label="Select timeframe">
              {[7, 30, 90].map(d => (
                <button
                  key={d}
                  type="button"
                  className={`timeframe-btn mono-font ${days === d ? 'active' : ''}`}
                  onClick={() => onDaysChange(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="table-fallback-toggle mono-font"
            onClick={() => setShowTableFallback(prev => !prev)}
            aria-expanded={showTableFallback}
          >
            {showTableFallback ? 'Show Visual Chart' : 'Show Data Table'}
          </button>
        </div>
      </div>

      {!showTableFallback ? (
        <div className="svg-wrapper" role="img" aria-label={title}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="line-chart-svg brand-svg-chart"
            width="100%"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Horizontal Grid lines */}
            {[0, 0.5, 1].map((pct, i) => {
              const yVal = paddingTop + chartInnerHeight * (1 - pct)
              const label = Math.round(maxVal * pct)
              return (
                <g key={i} className="grid-line">
                  <line
                    x1={paddingLeft}
                    y1={yVal}
                    x2={width - paddingRight}
                    y2={yVal}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={yVal + 4}
                    textAnchor="end"
                    className="chart-axis-label mono-font"
                    fill="var(--muted)"
                    fontSize="10"
                  >
                    {label}
                  </text>
                </g>
              )
            })}

            {/* Shaded Area */}
            {areaD && (
              <path
                d={areaD}
                fill="var(--vermilion)"
                opacity="0.08"
              />
            )}

            {/* Path Line */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="var(--vermilion)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data Points */}
            {points.map((pt, i) => (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={points.length <= 14 ? 3.5 : 2}
                fill="var(--paper)"
                stroke="var(--vermilion)"
                strokeWidth="1.8"
              >
                <title>{`${pt.date}: ${pt.count} violations`}</title>
              </circle>
            ))}

            {/* X Axis Labels */}
            {xTicks.map((pt, i) => (
              <text
                key={i}
                x={pt.x}
                y={height - 10}
                textAnchor="middle"
                className="chart-axis-label mono-font"
                fill="var(--muted)"
                fontSize="10"
              >
                {pt.date.slice(5)}
              </text>
            ))}
          </svg>
        </div>
      ) : (
        <div className="table-fallback-wrapper">
          <table className="editorial-table chart-fallback-table" aria-label={title}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" style={{ textAlign: 'right' }}>Violations Detected</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.date}</td>
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
