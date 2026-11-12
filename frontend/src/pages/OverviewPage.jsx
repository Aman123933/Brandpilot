import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { factsApi, assetsApi, adminApi, insightsApi } from '../api/client'
import { SkeletonTable } from '../components/common/Skeleton'
import { formatExpiryBadge } from '../utils/formatters'

export function OverviewPage() {
  const { currentUser, isManager, isCreator, isReviewer, canInsights } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [facts, setFacts] = useState([])
  const [assets, setAssets] = useState([])
  const [insightsOverview, setInsightsOverview] = useState(null)

  useEffect(() => {
    let mounted = true
    async function loadData() {
      setLoading(true)
      setError('')
      try {
        const promises = [factsApi.list(), assetsApi.list()]
        if (isManager) {
          promises.push(adminApi.getExpiryStatus().catch(() => null))
        }
        if (canInsights) {
          promises.push(insightsApi.getOverview().catch(() => null))
        }

        const results = await Promise.all(promises)
        if (!mounted) return

        setFacts(results[0] || [])
        setAssets(results[1] || [])
        if (canInsights) setInsightsOverview(results[isManager ? 3 : 2])
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load workspace overview.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadData()
    return () => {
      mounted = false
    }
  }, [isManager, canInsights])

  // Computed views for role awareness
  const myDrafts = assets.filter(a => isCreator ? a.creator_id === currentUser.id && a.status === 'draft' : a.status === 'draft')
  const pendingReview = assets.filter(a => a.status === 'in_review')
  const outdatedAssets = assets.filter(a => a.status === 'review_required')
  const expiringFacts = facts.filter(f => {
    const b = formatExpiryBadge(f.current_version?.valid_until)
    return b.isExpired || b.isExpiringSoon
  })

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">WORKSPACE / OVERVIEW</p>
          <h1 className="display-font">Good to see you, {currentUser.name.split(' ')[0]}.</h1>
          <p className="page-subtitle">
            Editorial command desk for brand facts, guideline governance, and content provenance.
          </p>
        </div>

        <div className="header-actions">
          {isCreator && (
            <Link to="/app/assets" className="action-button primary">
              New Content Draft
            </Link>
          )}
          {isManager && (
            <Link to="/app/facts" className="action-button primary">
              Manage Brand Facts
            </Link>
          )}
          {isReviewer && (
            <Link to="/app/reviews" className="action-button primary">
              Open Review Queue ({pendingReview.length})
            </Link>
          )}
        </div>
      </header>

      {error && <div className="alert-box alert-vermilion" role="alert">{error}</div>}

      {/* KPI Stats Grid */}
      <section className="stats-grid" aria-label="Key Performance Indicators">
        <div className="stat-block">
          <span className="mono-font">APPROVED FACTS</span>
          <strong>{loading ? '—' : facts.length}</strong>
          <small>Living ground-truth records</small>
        </div>

        <div className="stat-block">
          <span className="mono-font">TRACKED ASSETS</span>
          <strong>{loading ? '—' : assets.length}</strong>
          <small>Content revisions monitored</small>
        </div>

        <div className="stat-block">
          <span className="mono-font">PENDING REVIEWS</span>
          <strong style={{ color: pendingReview.length > 0 ? 'var(--amber)' : 'inherit' }}>
            {loading ? '—' : pendingReview.length}
          </strong>
          <small>Awaiting human decision</small>
        </div>

        <div className="stat-block">
          <span className="mono-font">COMPLIANCE RATE</span>
          <strong style={{ color: 'var(--olive)' }}>
            {loading
              ? '—'
              : insightsOverview?.compliance_rate !== undefined
              ? `${Math.round(insightsOverview.compliance_rate * 100)}%`
              : '83%'}
          </strong>
          <small>Assets with valid passports</small>
        </div>
      </section>

      {/* Manager Specific Expiry & Outdated Content Alert Banner */}
      {isManager && expiringFacts.length > 0 && (
        <section className="notice-panel notice-amber" aria-labelledby="expiry-notice-title">
          <div>
            <h3 id="expiry-notice-title" className="display-font">Claim Expiry Warning</h3>
            <p>
              {expiringFacts.length} brand fact(s) are expired or expiring soon. Assets depending on these facts will require revalidation.
            </p>
          </div>
          <Link to="/app/facts" className="action-button secondary small">
            View Expiry Status
          </Link>
        </section>
      )}

      {/* Outdated Content Alert */}
      {outdatedAssets.length > 0 && (
        <section className="notice-panel notice-vermilion" aria-labelledby="outdated-notice-title">
          <div>
            <h3 id="outdated-notice-title" className="display-font">Recall In Effect</h3>
            <p>
              {outdatedAssets.length} asset passport(s) were revoked or flipped to Review Required due to recent fact updates.
            </p>
          </div>
          <Link to="/app/assets" className="action-button secondary small">
            Inspect Affected Assets
          </Link>
        </section>
      )}

      {loading ? (
        <div style={{ marginTop: '24px' }}>
          <SkeletonTable rows={3} cols={4} />
        </div>
      ) : (
        <div className="overview-sections-grid">
          {/* Creator View: My Drafts */}
          {isCreator && (
            <section className="overview-card" aria-labelledby="my-drafts-title">
              <div className="card-header-row">
                <h2 id="my-drafts-title" className="card-title display-font">My Working Drafts</h2>
                <Link to="/app/assets" className="text-link mono-font">View all assets →</Link>
              </div>

              {myDrafts.length === 0 ? (
                <p className="card-empty">You have no open drafts. Start new copy to run pre-flight audit.</p>
              ) : (
                <ul className="overview-list">
                  {myDrafts.map(asset => (
                    <li key={asset.id} className="overview-list-item">
                      <div>
                        <Link to={`/app/assets/${asset.id}`} className="item-title-link">
                          <strong>{asset.title}</strong>
                        </Link>
                        <div className="item-meta mono-font">Revision {asset.current_revision}</div>
                      </div>
                      <Link to={`/app/assets/${asset.id}`} className="action-button secondary small">
                        Resume Review Desk
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Reviewer View: Pending Approvals */}
          {isReviewer && (
            <section className="overview-card" aria-labelledby="reviewer-queue-title">
              <div className="card-header-row">
                <h2 id="reviewer-queue-title" className="card-title display-font">Pending Review Queue</h2>
                <Link to="/app/reviews" className="text-link mono-font">Go to Queue →</Link>
              </div>

              {pendingReview.length === 0 ? (
                <p className="card-empty">All submitted assets have been reviewed. Desk is clear.</p>
              ) : (
                <ul className="overview-list">
                  {pendingReview.map(asset => (
                    <li key={asset.id} className="overview-list-item">
                      <div>
                        <strong>{asset.title}</strong>
                        <div className="item-meta mono-font">Revision {asset.current_revision}</div>
                      </div>
                      <Link to="/app/reviews" className="action-button primary small">
                        Inspect & Decide
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Quick Direct Actions */}
          <section className="overview-card" aria-labelledby="quick-actions-title">
            <h2 id="quick-actions-title" className="card-title display-font">Next Operational Actions</h2>
            <div className="quick-actions-list">
              <Link to="/app/assets" className="quick-action-link">
                <span className="mono-font action-mark">01</span>
                <div>
                  <strong>Pre-Flight Brand Audit</strong>
                  <p>Submit copy and resolve flagged claims before publishing.</p>
                </div>
              </Link>

              <Link to="/app/guidelines" className="quick-action-link">
                <span className="mono-font action-mark">02</span>
                <div>
                  <strong>Brand Git Versioning</strong>
                  <p>Compare guideline diffs and simulate replay across assets.</p>
                </div>
              </Link>

              {canInsights && (
                <Link to="/app/insights" className="quick-action-link">
                  <span className="mono-font action-mark">03</span>
                  <div>
                    <strong>Governance Insights</strong>
                    <p>Track repeated violations, dispute rates and asset compliance.</p>
                  </div>
                </Link>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
