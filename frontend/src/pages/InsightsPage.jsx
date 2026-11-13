import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { insightsApi } from '../api/client'
import { SvgBarChart } from '../components/charts/SvgBarChart'
import { SvgLineChart } from '../components/charts/SvgLineChart'
import { Badge } from '../components/common/Badge'
import { SkeletonCard, SkeletonTable } from '../components/common/Skeleton'

export function InsightsPage() {
  const { isCreator, canInsights } = useAuth()

  const [overview, setOverview] = useState(null)
  const [violations, setViolations] = useState(null)
  const [disputedRules, setDisputedRules] = useState([])
  const [assetCompliance, setAssetCompliance] = useState([])
  const [days, setDays] = useState(30)
  const [complianceFilter, setComplianceFilter] = useState('all')
  const [sortBy, setSortBy] = useState('title')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canInsights) return

    let mounted = true
    async function loadData() {
      setLoading(true)
      setError('')
      try {
        const [ov, viol, disp, asts] = await Promise.all([
          insightsApi.getOverview(),
          insightsApi.getViolations(days),
          insightsApi.getDisputedRules(),
          insightsApi.getAssets(),
        ])
        if (!mounted) return
        setOverview(ov)
        setViolations(viol)
        setDisputedRules(disp)
        setAssetCompliance(asts)
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load insights data.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadData()
    return () => {
      mounted = false
    }
  }, [canInsights, days])

  // Creator Role Block Screen
  if (isCreator) {
    return (
      <main className="page-container">
        <div className="forbidden-box">
          <p className="eyebrow" style={{ color: 'var(--vermilion)' }}>ACCESS RESTRICTED</p>
          <h2 className="display-font">Access Restricted</h2>
          <p>
            Governance insights and organizational compliance analytics are restricted to Brand Managers and Reviewers.
          </p>
          <Link to="/app/overview" className="action-button primary" style={{ marginTop: '16px', display: 'inline-block' }}>
            Return to Overview
          </Link>
        </div>
      </main>
    )
  }

  // Filter & Sort Asset Compliance Table
  const filteredAssets = assetCompliance
    .filter(a => (complianceFilter === 'all' ? true : a.compliance === complianceFilter))
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'open_high') return b.open_high - a.open_high
      if (sortBy === 'open_total') return b.open_total - a.open_total
      return 0
    })

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">GOVERNANCE / EXECUTIVE ANALYTICS</p>
          <h1 className="display-font">Governance Insights</h1>
          <p className="page-subtitle">
            Longitudinal monitoring of brand rule health, claim disputes, and fleet-wide content compliance.
          </p>
        </div>
      </header>

      {error && <div className="alert-box alert-vermilion" role="alert">{error}</div>}

      {/* KPI Tiles */}
      <section className="stats-grid" aria-label="Governance Metrics Overview">
        <div className="stat-block">
          <span className="mono-font">FLEET COMPLIANCE</span>
          <strong style={{ color: 'var(--olive)' }}>
            {overview?.compliance_rate !== undefined
              ? `${Math.round(overview.compliance_rate * 100)}%`
              : '—'}
          </strong>
          <small>Approved assets with valid passports</small>
        </div>

        <div className="stat-block">
          <span className="mono-font">PENDING REVIEWS</span>
          <strong style={{ color: overview?.pending_approvals > 0 ? 'var(--amber)' : 'inherit' }}>
            {overview?.pending_approvals ?? '—'}
          </strong>
          <small>Awaiting human sign-off</small>
        </div>

        <div className="stat-block">
          <span className="mono-font">AVG DECISION TIME</span>
          <strong>{overview?.avg_hours_to_decision ? `${overview.avg_hours_to_decision}h` : '—'}</strong>
          <small>Submission to passport issue</small>
        </div>

        <div className="stat-block">
          <span className="mono-font">OUTDATED CONTENT</span>
          <strong style={{ color: overview?.totals?.review_required > 0 ? 'var(--vermilion)' : 'inherit' }}>
            {overview?.totals?.review_required ?? 0}
          </strong>
          <small>Passports recalled by fact updates</small>
        </div>
      </section>

      {loading ? (
        <div style={{ marginTop: '24px' }}>
          <SkeletonCard />
          <SkeletonTable rows={4} cols={4} />
        </div>
      ) : (
        <>
          {/* Charts Row: Hand-built SVG Bar & Line Charts */}
          <div className="insights-charts-grid">
            {/* Top Violated Rules (Bar Chart) */}
            <section className="chart-card" aria-label="Top Violated Rules Bar Chart">
              <SvgBarChart
                data={violations?.top_rules || []}
                title="Top Violated Rules (30 Days)"
              />
            </section>

            {/* Violations Over Time (Line Chart) */}
            <section className="chart-card" aria-label="Violations Over Time Line Chart">
              <SvgLineChart
                data={violations?.by_day || []}
                title="Violations Over Time"
                days={days}
                onDaysChange={newDays => setDays(newDays)}
              />
            </section>
          </div>

          {/* Most Disputed Rules Table */}
          <section className="insights-section-card" aria-labelledby="disputed-rules-title">
            <div className="card-header-row">
              <div>
                <span className="mono-font eyebrow">RULE FRICTION ANALYSIS</span>
                <h2 id="disputed-rules-title" className="card-title display-font">
                  Most Disputed Brand Rules
                </h2>
                <p className="card-subtitle">
                  Rules that creators most frequently dismiss during pre-flight review. High dispute rates signal ambiguous guidelines.
                </p>
              </div>
            </div>

            {disputedRules.length === 0 ? (
              <p className="card-empty mono-font">No rule disputes recorded in this period.</p>
            ) : (
              <div className="table-responsive">
                <table className="editorial-table" aria-label="Most Disputed Rules">
                  <thead>
                    <tr>
                      <th scope="col">Rule ID</th>
                      <th scope="col">Rule Label / Term</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Times Raised</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Times Dismissed</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Dispute Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputedRules.map((r, i) => (
                      <tr key={r.rule_id || i}>
                        <td className="mono-font"><strong>{r.rule_id || '—'}</strong></td>
                        <td>{r.label}</td>
                        <td style={{ textAlign: 'right' }} className="mono-font">{r.raised}</td>
                        <td style={{ textAlign: 'right' }} className="mono-font">{r.dismissed}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span
                            className="mono-font"
                            style={{
                              color: r.dispute_rate > 0.5 ? 'var(--vermilion)' : 'var(--amber)',
                              fontWeight: 600,
                            }}
                          >
                            {Math.round(r.dispute_rate * 100)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Asset Compliance Table */}
          <section className="insights-section-card compliance-breakdown-card" aria-labelledby="asset-compliance-title">
            <div className="card-header-row">
              <div>
                <span className="mono-font eyebrow">FLEET INVENTORY</span>
                <h2 id="asset-compliance-title" className="card-title display-font">
                  Asset Compliance Status
                </h2>
              </div>

              {/* Filter & Sort Controls */}
              <div className="compliance-controls">
                <label className="mono-font control-label">
                  Filter:
                  <select
                    value={complianceFilter}
                    onChange={e => setComplianceFilter(e.target.value)}
                    className="select-input"
                  >
                    <option value="all">All Assets</option>
                    <option value="compliant">Compliant</option>
                    <option value="at_risk">At Risk</option>
                    <option value="non_compliant">Non-Compliant</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>

                <label className="mono-font control-label">
                  Sort:
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    className="select-input"
                  >
                    <option value="title">Title (A-Z)</option>
                    <option value="open_high">Open High Severity</option>
                    <option value="open_total">Total Open Findings</option>
                  </select>
                </label>
              </div>
            </div>

            {filteredAssets.length === 0 ? (
              <p className="card-empty mono-font">No assets match the selected filter.</p>
            ) : (
              <div className="table-responsive">
                <table className="editorial-table" aria-label="Asset Compliance Table">
                  <thead>
                    <tr>
                      <th scope="col">Asset Title</th>
                      <th scope="col">Compliance Status</th>
                      <th scope="col">Passport Status</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Open High Findings</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Total Open</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map(ast => (
                      <tr key={ast.asset_id}>
                        <td>
                          <Link to={`/app/assets/${ast.asset_id}`} className="item-title-link">
                            <strong>{ast.title}</strong>
                          </Link>
                        </td>
                        <td>
                          <Badge status={ast.compliance} />
                        </td>
                        <td>
                          {ast.passport_status ? (
                            <Badge status={ast.passport_status} />
                          ) : (
                            <span className="mono-font" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                              None
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono-font">
                          {ast.open_high > 0 ? (
                            <strong style={{ color: 'var(--vermilion)' }}>{ast.open_high}</strong>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono-font">
                          {ast.open_total}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            to={`/app/assets/${ast.asset_id}`}
                            className="action-button secondary small"
                          >
                            Inspect Desk →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
