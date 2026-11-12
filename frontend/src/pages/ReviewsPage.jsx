import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { reviewsApi, assetsApi } from '../api/client'
import { formatDate } from '../utils/formatters'
import { SkeletonTable } from '../components/common/Skeleton'
import { EmptyState } from '../components/common/EmptyState'
import { useToast } from '../components/common/useToast'

export function ReviewsPage() {
  const { addToast } = useToast()

  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Selected asset for decision
  const [selectedAssetId, setSelectedAssetId] = useState(null)
  const [selectedAssetDetail, setSelectedAssetDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Decision form state
  const [decision, setDecision] = useState('approved')
  const [comment, setComment] = useState('')
  const [deciding, setDeciding] = useState(false)
  const [decisionError, setDecisionError] = useState('')

  const selectAsset = useCallback(async assetId => {
    setSelectedAssetId(assetId)
    setLoadingDetail(true)
    setDecisionError('')
    try {
      const [ast, findings] = await Promise.all([
        assetsApi.get(assetId),
        assetsApi.getFindings(assetId).catch(() => []),
      ])
      setSelectedAssetDetail({ ...ast, findings })
      setComment('')
      setDecision('approved')
    } catch (err) {
      setDecisionError(err.message || 'Could not load asset details.')
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const loadQueue = useCallback(async () => {
    try {
      const data = await reviewsApi.getQueue()
      setQueue(Array.isArray(data) ? data : [])
      if (data && data.length > 0 && !selectedAssetId) {
        selectAsset(data[0].id)
      }
    } catch (err) {
      setError(err.message || 'Could not load reviewer queue.')
    } finally {
      setLoading(false)
    }
  }, [selectAsset, selectedAssetId])

  useEffect(() => {
    let mounted = true
    async function initQueue() {
      try {
        const data = await reviewsApi.getQueue()
        if (mounted) {
          setQueue(Array.isArray(data) ? data : [])
          if (data && data.length > 0) {
            selectAsset(data[0].id)
          }
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load reviewer queue.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    initQueue()
    return () => {
      mounted = false
    }
  }, [selectAsset])

  async function handleDecisionSubmit(e) {
    e.preventDefault()
    setDecisionError('')

    if (['rejected', 'changes_requested'].includes(decision) && !comment.trim()) {
      setDecisionError('A comment is required when rejecting or requesting changes.')
      return
    }

    setDeciding(true)
    try {
      const res = await reviewsApi.recordDecision(selectedAssetId, {
        decision,
        comment: comment.trim(),
      })
      addToast(
        decision === 'approved'
          ? `Passport issued! Code: ${res.passport_code}`
          : `Decision '${decision.replace('_', ' ')}' recorded.`,
        'success'
      )
      setSelectedAssetDetail(null)
      setSelectedAssetId(null)
      await loadQueue()
    } catch (err) {
      setDecisionError(err.message || 'Failed to record decision.')
    } finally {
      setDeciding(false)
    }
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">HUMAN IN THE LOOP / GOVERNANCE</p>
          <h1 className="display-font">Reviewer Queue</h1>
          <p className="page-subtitle">
            Inspect pending submissions, review claim substantiation findings, and issue Brand Passports.
          </p>
        </div>
      </header>

      {error && <div className="alert-box alert-vermilion" role="alert">{error}</div>}

      {loading ? (
        <SkeletonTable rows={4} cols={4} />
      ) : queue.length === 0 ? (
        <EmptyState
          title="Review queue is clear"
          description="All submitted assets have been reviewed. New submissions from creators will appear here automatically."
        />
      ) : (
        <div className="reviewer-desk-layout">
          {/* Queue List Table */}
          <section className="queue-list-section" aria-label="Pending Review Submissions">
            <h2 className="display-font" style={{ fontSize: '18px', marginBottom: '14px' }}>
              Pending Items ({queue.length})
            </h2>

            <div className="queue-items-list">
              {queue.map(item => {
                const isSelected = item.id === selectedAssetId
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`queue-item-card review-queue-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectAsset(item.id)}
                  >
                    <div className="queue-card-top">
                      <strong className="queue-card-title">{item.title}</strong>
                      <span className="mono-font rev-tag">Rev {item.current_revision}</span>
                    </div>

                    <div className="queue-card-meta mono-font">
                      <span>By {item.creator_name || 'Creator'}</span>
                      <span>{formatDate(item.submitted_at)}</span>
                    </div>

                    <div className="queue-findings-pills">
                      {item.open_high_findings > 0 ? (
                        <span className="queue-pill high mono-font">
                          {item.open_high_findings} High Findings
                        </span>
                      ) : (
                        <span className="queue-pill clean mono-font">0 High</span>
                      )}
                      <span className="queue-pill total mono-font">
                        {item.open_total_findings} Total Open
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Decision Desk & Asset Inspector */}
          <section className="decision-inspector-section" aria-label="Review Decision Inspector">
            {loadingDetail ? (
              <p className="mono-font">Loading submission details...</p>
            ) : selectedAssetDetail ? (
              <div className="decision-card">
                <header className="decision-card-header">
                  <div>
                    <span className="mono-font eyebrow">DECISION DESK</span>
                    <h3 className="display-font" style={{ fontSize: '20px' }}>
                      {selectedAssetDetail.title}
                    </h3>
                    <p className="mono-font" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Revision {selectedAssetDetail.current_revision} • Ingested by {selectedAssetDetail.creator_id ? `User #${selectedAssetDetail.creator_id}` : 'Creator'}
                    </p>
                  </div>

                  <Link
                    to={`/app/assets/${selectedAssetDetail.id}`}
                    className="text-button mono-font"
                  >
                    Open in Full Review Desk ↗
                  </Link>
                </header>

                {/* Submitted Copy View */}
                <div className="decision-copy-preview">
                  <span className="mono-font preview-label">SUBMITTED COPY:</span>
                  <p className="copy-text">{selectedAssetDetail.body}</p>
                </div>

                {/* Open Findings Alert */}
                {selectedAssetDetail.findings?.filter(f => f.status === 'open').length > 0 && (
                  <div className="alert-box alert-amber" style={{ marginTop: '14px' }}>
                    <strong>Notice:</strong> This asset has{' '}
                    {selectedAssetDetail.findings.filter(f => f.status === 'open').length} open finding(s).
                  </div>
                )}

                {/* Decision Form */}
                <form onSubmit={handleDecisionSubmit} className="editorial-form decision-form">
                  {decisionError && (
                    <div className="alert-box alert-vermilion" role="alert">{decisionError}</div>
                  )}

                  <div className="form-group">
                    <label>Review Decision</label>
                    <div className="decision-options-group" role="radiogroup" aria-label="Select Decision">
                      {[
                        { val: 'approved', label: 'Approve & Issue Passport', desc: 'Stamps official Brand Passport' },
                        { val: 'changes_requested', label: 'Request Changes', desc: 'Sends back to creator with notes' },
                        { val: 'rejected', label: 'Reject Asset', desc: 'Permanently declines copy' },
                      ].map(opt => (
                        <label
                          key={opt.val}
                          className={`decision-option-label ${decision === opt.val ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name="decision_choice"
                            value={opt.val}
                            checked={decision === opt.val}
                            onChange={() => setDecision(opt.val)}
                          />
                          <div>
                            <strong>{opt.label}</strong>
                            <small>{opt.desc}</small>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="decision-comment">
                      Reviewer Justification / Comment{' '}
                      {decision !== 'approved' && <span style={{ color: 'var(--vermilion)' }}>* (Required)</span>}
                    </label>
                    <textarea
                      id="decision-comment"
                      rows={3}
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder={
                        decision === 'approved'
                          ? 'Optional notes for audit trail (e.g. Verified against Q4 specs)...'
                          : 'Mandatory feedback explaining the decision and required corrections...'
                      }
                      required={decision !== 'approved'}
                      disabled={deciding}
                    />
                  </div>

                  <button
                    type="submit"
                    className="action-button primary full-width"
                    disabled={deciding}
                  >
                    {deciding ? 'Recording Decision...' : 'Confirm Review Decision'}
                  </button>
                </form>
              </div>
            ) : (
              <p className="card-empty">Select a submission from the queue on the left to begin review.</p>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
