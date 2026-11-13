import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { passportsApi, API_BASE_URL } from '../api/client'
import { formatDate, formatFactValue } from '../utils/formatters'
import { Badge } from '../components/common/Badge'
import { Modal } from '../components/common/Modal'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../components/common/useToast'

export function PassportDetailPage() {
  const { code } = useParams()
  const { isManager } = useAuth()
  const { addToast } = useToast()

  const [passport, setPassport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Withdraw Modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState('')

  const refreshPassport = useCallback(async () => {
    try {
      const data = await passportsApi.get(code)
      setPassport(data)
    } catch (err) {
      setError(err.message || `Passport ${code} could not be loaded.`)
    }
  }, [code])

  useEffect(() => {
    let mounted = true
    async function fetchPassport() {
      setLoading(true)
      setError('')
      try {
        const data = await passportsApi.get(code)
        if (mounted) setPassport(data)
      } catch (err) {
        if (mounted) setError(err.message || `Passport ${code} could not be loaded.`)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchPassport()
    return () => {
      mounted = false
    }
  }, [code])

  async function handleWithdrawSubmit(e) {
    e.preventDefault()
    if (!withdrawReason.trim() || withdrawReason.trim().length < 3) {
      setWithdrawError('A withdrawal reason of at least 3 characters is required.')
      return
    }

    setWithdrawing(true)
    setWithdrawError('')
    try {
      await passportsApi.withdraw(code, withdrawReason.trim())
      addToast(`Passport ${code} has been officially withdrawn.`, 'warning')
      setShowWithdrawModal(false)
      setWithdrawReason('')
      await refreshPassport()
    } catch (err) {
      setWithdrawError(err.message || 'Failed to withdraw passport.')
    } finally {
      setWithdrawing(false)
    }
  }

  if (loading) {
    return (
      <main className="page-container">
        <SkeletonCard />
      </main>
    )
  }

  if (error || !passport) {
    return (
      <main className="page-container">
        <div className="alert-box alert-vermilion" role="alert">
          {error || `Passport ${code} not found.`}
        </div>
        <Link to="/app/overview" className="action-button secondary">
          ← Back to Overview
        </Link>
      </main>
    )
  }

  const qrUrl = `${API_BASE_URL}/passports/${passport.code}/qr.png`
  const isWithdrawn = passport.status === 'withdrawn'
  const isReviewRequired = passport.status === 'review_required'

  return (
    <main className="page-container">
      {/* Header */}
      <header className="page-header">
        <div>
          <div className="breadcrumb-nav mono-font">
            <Link to="/app/overview">WORKSPACE</Link> / <span>PASSPORT {passport.code}</span>
          </div>
          <h1 className="display-font">Brand Trust Passport Detail</h1>
          <p className="page-subtitle">
            Authenticated governance certificate, provenance record, and linked ground-truth dependency tree.
          </p>
        </div>

        <div className="header-actions">
          <Link
            to={`/verify/${passport.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="action-button secondary small mono-font"
          >
            Public Verify Page ↗
          </Link>

          {isManager && !isWithdrawn && (
            <button
              type="button"
              className="action-button danger small"
              onClick={() => {
                setWithdrawError('')
                setShowWithdrawModal(true)
              }}
            >
              Withdraw Passport
            </button>
          )}
        </div>
      </header>

      {/* Main Passport Certificate Layout */}
      <div className="passport-certificate-wrapper">
        <div className={`passport-card-paper ${passport.status}`}>
          {/* Status Stamp */}
          <div className={`passport-stamp-seal seal-${passport.status}`}>
            <span className="seal-text mono-font">
              {passport.status === 'valid'
                ? 'PASSED & APPROVED'
                : passport.status === 'review_required'
                ? 'REVIEW REQUIRED'
                : 'OFFICIALLY WITHDRAWN'}
            </span>
          </div>

          <div className="passport-top-row">
            <div>
              <span className="mono-font passport-code-label">CERTIFICATE IDENTIFIER</span>
              <h2 className="passport-code-heading mono-font">{passport.code}</h2>
            </div>

            <div className="passport-qr-box">
              <img
                src={qrUrl}
                alt={`QR verification code for passport ${passport.code}`}
                className="passport-qr-img"
                width="84"
                height="84"
              />
              <span className="mono-font qr-caption">Scan to Verify</span>
            </div>
          </div>

          {/* Withdrawn Notice Banner */}
          {isWithdrawn && (
            <div className="withdrawal-notice-box" role="alert">
              <strong className="mono-font">WITHDRAWAL NOTICE</strong>
              <p className="withdrawn-reason-text">
                "{passport.withdrawn_reason || 'Revoked by brand management'}"
              </p>
              <small className="mono-font">
                Withdrawn by {passport.withdrawn_by || 'Brand Manager'} on {formatDate(passport.withdrawn_at)}
              </small>
            </div>
          )}

          {/* Review Required Recall Notice */}
          {isReviewRequired && (
            <div className="recall-notice-box" role="alert">
              <strong className="mono-font">RECALL IN EFFECT: REVIEW REQUIRED</strong>
              <p>
                One or more brand facts linked to this passport have evolved to a new version.
                Content claims must be revalidated against the updated ground truth.
              </p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="passport-meta-grid">
            <div className="meta-tile">
              <span className="mono-font">STATUS</span>
              <Badge status={passport.status} />
            </div>

            <div className="meta-tile">
              <span className="mono-font">APPROVED AT</span>
              <strong>{formatDate(passport.approved_at)}</strong>
            </div>

            <div className="meta-tile">
              <span className="mono-font">REVIEWER SIGN-OFF</span>
              <strong>{passport.approved_by_name || `User #${passport.approved_by}`}</strong>
            </div>

            <div className="meta-tile">
              <span className="mono-font">LINKED FACTS</span>
              <strong>{passport.linked_facts?.length || 0} claims verified</strong>
            </div>
          </div>

          {/* Linked Facts Ground-Truth Table */}
          <section className="passport-section" aria-labelledby="linked-facts-title">
            <h3 id="linked-facts-title" className="passport-section-title display-font">
              Linked Ground-Truth Facts ({passport.linked_facts?.length || 0})
            </h3>
            <p className="passport-section-sub">
              These approved specs and policies were bound to this asset at the moment of human review.
            </p>

            <table className="editorial-table" aria-label="Linked Facts">
              <thead>
                <tr>
                  <th scope="col">Fact Key</th>
                  <th scope="col">Certified Value</th>
                  <th scope="col">Version Stamped</th>
                </tr>
              </thead>
              <tbody>
                {passport.linked_facts?.map(lf => (
                  <tr key={lf.fact_id || lf.key}>
                    <td className="mono-font"><strong>{lf.key}</strong></td>
                    <td>{formatFactValue(lf)}</td>
                    <td className="mono-font">v{lf.version || 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Approvals Trail */}
          <section className="passport-section" aria-labelledby="approvals-trail-title">
            <h3 id="approvals-trail-title" className="passport-section-title display-font">
              Human Reviewer Trail
            </h3>

            <div className="approvals-trail-list">
              {passport.approvals?.map((appr, idx) => (
                <div key={idx} className="approval-trail-item">
                  <div className="trail-item-header">
                    <strong>{appr.reviewer_name || 'Reviewer'}</strong>
                    <Badge status={appr.decision} />
                    <span className="mono-font trail-date">{formatDate(appr.decided_at)}</span>
                  </div>
                  {appr.comment && (
                    <blockquote className="trail-comment">
                      "{appr.comment}"
                    </blockquote>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* AI Disclosure Notice */}
          <section className="passport-disclosure-footer">
            <span className="mono-font eyebrow">AI & TOOLS DISCLOSURE</span>
            <p className="disclosure-text">
              {passport.ai_disclosure ||
                'This asset was analyzed with deterministic brand rules and Google Gemini assisted verification, followed by human reviewer verification and sign-off.'}
            </p>
          </section>
        </div>
      </div>

      {/* Withdraw Modal */}
      <Modal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        title={`Withdraw Trust Passport ${code}`}
      >
        <form onSubmit={handleWithdrawSubmit} className="editorial-form" noValidate>
          <p className="reject-warning">
            Withdrawing a passport revokes its public verification status. This action is permanently recorded in the governance audit trail.
          </p>

          {withdrawError && (
            <div className="alert-box alert-vermilion" role="alert">{withdrawError}</div>
          )}

          <div className="form-group">
            <label htmlFor="withdraw-reason">
              Withdrawal Reason <span style={{ color: 'var(--vermilion)' }}>* (required, min 3 chars)</span>
            </label>
            <textarea
              id="withdraw-reason"
              rows={3}
              value={withdrawReason}
              onChange={e => setWithdrawReason(e.target.value)}
              placeholder="e.g. Recalled following updated legal disclaimer requirements"
              required
              disabled={withdrawing}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => setShowWithdrawModal(false)}
              disabled={withdrawing}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="action-button danger"
              disabled={withdrawing}
            >
              {withdrawing ? 'Withdrawing...' : 'Confirm Withdrawal'}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  )
}
