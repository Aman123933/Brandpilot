import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { assetsApi } from '../api/client'
import { formatDate } from '../utils/formatters'
import { Badge } from '../components/common/Badge'
import { SkeletonCard, SkeletonTable } from '../components/common/Skeleton'
import { useToast } from '../components/common/useToast'

export function AssetDetailPage() {
  const { id } = useParams()
  const { isCreator, isManager } = useAuth()
  const { addToast } = useToast()

  const [asset, setAsset] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Active view tab: 'audit' | 'redteam' | 'history'
  const [activeTab, setActiveTab] = useState('audit')

  // Pre-Flight Audit state
  const [findings, setFindings] = useState([])
  const [auditing, setAuditing] = useState(false)
  const [auditMeta, setAuditMeta] = useState(null) // holds ai_available, ai_message, summary
  const [resolvingFindingId, setResolvingFindingId] = useState(null)

  // Red Team state
  const [redTeamRisks, setRedTeamRisks] = useState([])
  const [redTeamMeta, setRedTeamMeta] = useState(null) // holds ai_available, ai_message
  const [redTeaming, setRedTeaming] = useState(false)

  // Submit for Approval state
  const [submitting, setSubmitting] = useState(false)

  // History timeline state
  const [history, setHistory] = useState([])

  const refreshAssetData = useCallback(async () => {
    try {
      const [ast, fnds] = await Promise.all([
        assetsApi.get(id),
        assetsApi.getFindings(id).catch(() => []),
      ])
      setAsset(ast)
      setFindings(fnds)
    } catch (err) {
      setError(err.message || 'Could not load asset details.')
    }
  }, [id])

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [ast, fnds] = await Promise.all([
          assetsApi.get(id),
          assetsApi.getFindings(id).catch(() => []),
        ])
        if (mounted) {
          setAsset(ast)
          setFindings(fnds)
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load asset details.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [id])

  // Run Pre-Flight Brand Audit
  async function handleRunAudit() {
    setAuditing(true)
    try {
      const res = await assetsApi.audit(id)
      setAuditMeta({
        ai_available: res.ai_available,
        ai_message: res.ai_message,
        summary: res.summary,
      })
      // Refresh findings and asset
      const [updatedFindings, updatedAsset] = await Promise.all([
        assetsApi.getFindings(id),
        assetsApi.get(id),
      ])
      setFindings(updatedFindings)
      setAsset(updatedAsset)

      const highCount = updatedFindings.filter(f => f.status === 'open' && f.severity === 'high').length
      addToast(
        `Pre-flight audit complete. ${updatedFindings.filter(f => f.status === 'open').length} open findings (${highCount} high severity).`,
        highCount > 0 ? 'warning' : 'success'
      )
    } catch (err) {
      addToast(err.message || 'Audit failed.', 'error')
    } finally {
      setAuditing(false)
    }
  }

  // Run Brand Red Team Adversarial Simulation
  async function handleRunRedTeam() {
    setRedTeaming(true)
    try {
      const res = await assetsApi.redteam(id)
      setRedTeamMeta({
        ai_available: res.ai_available,
        ai_message: res.ai_message,
      })
      setRedTeamRisks(res.risks || [])
      addToast(
        `Red team simulation complete across 3 personas. Generated ${res.risks?.length || 0} risk perspectives.`,
        'info'
      )
    } catch (err) {
      addToast(err.message || 'Red team simulation failed.', 'error')
    } finally {
      setRedTeaming(false)
    }
  }

  // Accept Finding Fix (Increments Revision)
  async function handleAcceptFinding(findingId) {
    setResolvingFindingId(findingId)
    try {
      await assetsApi.patchFinding(findingId, 'accepted')
      addToast('Suggested fix accepted. New revision created.', 'success')
      await refreshAssetData()
    } catch (err) {
      addToast(err.message || 'Failed to accept fix.', 'error')
    } finally {
      setResolvingFindingId(null)
    }
  }

  // Dismiss Finding
  async function handleDismissFinding(findingId) {
    setResolvingFindingId(findingId)
    try {
      await assetsApi.patchFinding(findingId, 'dismissed')
      addToast('Finding dismissed.', 'info')
      await refreshAssetData()
    } catch (err) {
      addToast(err.message || 'Failed to dismiss finding.', 'error')
    } finally {
      setResolvingFindingId(null)
    }
  }

  // Submit for Approval
  async function handleSubmitForApproval() {
    if (!asset) return
    setSubmitting(true)
    try {
      const updated = await assetsApi.submit(asset.id)
      setAsset(updated)
      addToast('Asset submitted to reviewer queue for human verification.', 'success')
    } catch (err) {
      addToast(err.message || 'Submission failed.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Load history when history tab opens
  const handleTabChange = tab => {
    setActiveTab(tab)
    if (tab === 'history' && history.length === 0) {
      assetsApi.getHistory(id).then(setHistory).catch(() => {})
    }
  }

  if (loading) {
    return (
      <main className="page-container">
        <SkeletonCard />
        <SkeletonTable rows={4} cols={4} />
      </main>
    )
  }

  if (error || !asset) {
    return (
      <main className="page-container">
        <div className="alert-box alert-vermilion" role="alert">
          {error || 'Asset not found.'}
        </div>
        <Link to="/app/assets" className="action-button secondary">
          ← Back to Content Assets
        </Link>
      </main>
    )
  }

  const openFindings = findings.filter(f => f.status === 'open')
  const openHigh = openFindings.filter(f => f.severity === 'high')
  const canSubmit = ['draft', 'changes_requested'].includes(asset.status) && (isCreator || isManager)

  return (
    <main className="page-container">
      {/* Header */}
      <header className="page-header">
        <div>
          <div className="breadcrumb-nav mono-font">
            <Link to="/app/assets">CONTENT ASSETS</Link> / <span>REVIEW DESK #{asset.id}</span>
          </div>
          <div className="asset-header-title-row">
            <h1 className="display-font">{asset.title}</h1>
            <Badge status={asset.status} />
          </div>
          <p className="page-subtitle mono-font">
            Revision {asset.current_revision || 1} • Ingested {formatDate(asset.created_at)}
          </p>
        </div>

        <div className="header-actions">
          {asset.passport_code && (
            <Link
              to={`/app/passports/${asset.passport_code}`}
              className="action-button secondary small mono-font"
            >
              View Passport ({asset.passport_code})
            </Link>
          )}

          {canSubmit && (
            <button
              type="button"
              className="action-button primary"
              onClick={handleSubmitForApproval}
              disabled={submitting}
              title={openHigh.length > 0 ? 'Warning: Open high severity findings' : ''}
            >
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
          )}
        </div>
      </header>

      {/* Main Review Desk Layout */}
      <div className="review-desk-grid">
        {/* Left Column: Live Copy Reader */}
        <section className="copy-editor-card" aria-labelledby="copy-reader-title">
          <div className="card-header-row">
            <h2 id="copy-reader-title" className="card-title display-font">
              Active Copy (Revision {asset.current_revision})
            </h2>
            <span className="mono-font" style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {asset.body?.length || 0} characters
            </span>
          </div>

          <div className="editorial-copy-view">
            <p className="copy-paragraph">{asset.body}</p>
          </div>

          {openHigh.length > 0 && (
            <div className="alert-box alert-amber" style={{ marginTop: '16px' }} role="status">
              <strong>{openHigh.length} high-severity issue(s) detected.</strong> Review and accept inline suggested replacements before submitting.
            </div>
          )}
        </section>

        {/* Right Column: Audit Desk Tabs */}
        <section className="findings-desk-card" aria-label="Review Desk Inspections">
          <div className="desk-tabs-bar" role="tablist">
            <button
              type="button"
              className={`desk-tab ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => handleTabChange('audit')}
              role="tab"
              aria-selected={activeTab === 'audit'}
            >
              Pre-Flight Audit ({openFindings.length})
            </button>
            <button
              type="button"
              className={`desk-tab ${activeTab === 'redteam' ? 'active' : ''}`}
              onClick={() => handleTabChange('redteam')}
              role="tab"
              aria-selected={activeTab === 'redteam'}
            >
              Risk Analysis (potential)
            </button>
            <button
              type="button"
              className={`desk-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => handleTabChange('history')}
              role="tab"
              aria-selected={activeTab === 'history'}
            >
              History & Trail
            </button>
          </div>

          {/* TAB 1: PRE-FLIGHT AUDIT */}
          {activeTab === 'audit' && (
            <div className="tab-panel">
              <div className="tab-actions-row">
                <span className="mono-font eyebrow">RULE & CLAIM INSPECTION</span>
                <button
                  type="button"
                  className="action-button primary small"
                  onClick={handleRunAudit}
                  disabled={auditing}
                >
                  {auditing ? 'Auditing Claims...' : '▶ Run Pre-Flight Audit'}
                </button>
              </div>

              {/* AI Unavailable Banner */}
              {auditMeta && auditMeta.ai_available === false && (
                <div className="alert-box alert-amber" role="alert">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>AI engine unavailable: </strong>
                      <span>{auditMeta.ai_message || 'Rule-based deterministic checks completed.'}</span>
                    </div>
                    <button
                      type="button"
                      className="text-button mono-font"
                      onClick={handleRunAudit}
                      disabled={auditing}
                    >
                      Retry AI
                    </button>
                  </div>
                </div>
              )}

              {/* Findings List */}
              {findings.length === 0 ? (
                <div className="clean-findings-box">
                  <p className="clean-findings-msg">
                    {auditMeta && auditMeta.ai_available === false
                      ? 'Rule-based checks passed. AI verification could not be completed.'
                      : '✓ No open rule violations or fact mismatches detected.'}
                  </p>
                  <button
                    type="button"
                    className="action-button secondary small"
                    onClick={handleRunAudit}
                    disabled={auditing}
                  >
                    Run Fresh Audit
                  </button>
                </div>
              ) : (
                <div className="findings-stream">
                  {findings.map(finding => {
                    const isResolving = resolvingFindingId === finding.id

                    return (
                      <article
                        key={finding.id}
                        className={`finding-card finding-${finding.severity} ${finding.status !== 'open' ? 'resolved' : ''}`}
                      >
                        <div className="finding-header">
                          <div className="finding-badges">
                            <Badge status={finding.severity} />
                            <span className="mono-font chip-source">
                              {finding.source_type?.toUpperCase()} {finding.rule_id ? `(${finding.rule_id})` : ''}
                            </span>
                            {finding.status !== 'open' && (
                              <Badge status={finding.status} />
                            )}
                          </div>
                        </div>

                        <blockquote className="finding-quote">
                          "<mark>{finding.quote}</mark>"
                        </blockquote>

                        <p className="finding-explanation">
                          {finding.explanation}
                        </p>

                        {finding.suggestion && (
                          <div className="finding-suggestion-box">
                            <span className="suggestion-label mono-font">SUGGESTED REPLACEMENT:</span>
                            <span className="suggestion-text">"{finding.suggestion}"</span>
                          </div>
                        )}

                        {finding.status === 'open' && (
                          <div className="finding-actions">
                            {finding.suggestion && (
                              <button
                                type="button"
                                className="action-button primary small"
                                onClick={() => handleAcceptFinding(finding.id)}
                                disabled={isResolving}
                              >
                                {isResolving ? 'Applying...' : 'Accept Fix & Revise'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="action-button secondary small"
                              onClick={() => handleDismissFinding(finding.id)}
                              disabled={isResolving}
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RISK ANALYSIS (RED TEAM) */}
          {activeTab === 'redteam' && (
            <div className="tab-panel">
              <div className="tab-actions-row">
                <div>
                  <span className="mono-font eyebrow">ADVERSARIAL PERSPECTIVES</span>
                  <p className="tab-subtext">Potential risks, not confirmed violations.</p>
                </div>
                <button
                  type="button"
                  className="action-button primary small"
                  onClick={handleRunRedTeam}
                  disabled={redTeaming}
                >
                  {redTeaming ? 'Simulating Personas...' : '▶ Run Brand Red Team'}
                </button>
              </div>

              {/* AI Unavailable Banner */}
              {redTeamMeta && redTeamMeta.ai_available === false && (
                <div className="alert-box alert-amber" role="alert">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>AI Red Team unavailable: </strong>
                      <span>{redTeamMeta.ai_message || 'Adversarial simulation could not connect to Gemini.'}</span>
                    </div>
                    <button
                      type="button"
                      className="text-button mono-font"
                      onClick={handleRunRedTeam}
                      disabled={redTeaming}
                    >
                      Retry Simulation
                    </button>
                  </div>
                </div>
              )}

              {/* Red Team Risks or Empty State */}
              {redTeamRisks.length === 0 ? (
                <div className="clean-findings-box">
                  {redTeamMeta && redTeamMeta.ai_available === false ? (
                    <p className="clean-findings-msg">
                      AI is currently unavailable. Red team simulation could not be executed.
                    </p>
                  ) : (
                    <>
                      <p className="clean-findings-msg">
                        No adversarial simulations have been executed for this revision yet.
                      </p>
                      <button
                        type="button"
                        className="action-button secondary small"
                        onClick={handleRunRedTeam}
                        disabled={redTeaming}
                      >
                        Simulate 3 Personas
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="redteam-stream">
                  {redTeamRisks.map((risk, idx) => (
                    <article key={idx} className="redteam-card">
                      <div className="redteam-persona-bar">
                        <span className="persona-badge mono-font">{risk.persona}</span>
                        <Badge status={risk.severity} />
                      </div>

                      {risk.quote && (
                        <p className="redteam-quote">
                          Target claim: <em>"{risk.quote}"</em>
                        </p>
                      )}

                      <p className="redteam-concern">
                        <strong>Adversarial Concern:</strong> {risk.concern}
                      </p>

                      <p className="redteam-recommendation">
                        <strong>Recommended Defense:</strong> {risk.recommendation}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HISTORY & TRAIL */}
          {activeTab === 'history' && (
            <div className="tab-panel">
              <h3 className="mono-font eyebrow" style={{ marginBottom: '16px' }}>REVISION & AUDIT LOG</h3>
              <ul className="history-timeline-list">
                {asset.revisions?.map((rev, i) => (
                  <li key={i} className="history-item">
                    <span className="history-mark mono-font">R{rev.revision}</span>
                    <div className="history-content">
                      <strong>Revision {rev.revision} created</strong>
                      <p className="history-body-snippet">"{rev.body.slice(0, 100)}…"</p>
                      <small className="mono-font">{formatDate(rev.created_at)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
