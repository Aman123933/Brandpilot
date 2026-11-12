import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { passportsApi, API_BASE_URL } from '../api/client'
import { formatDate } from '../utils/formatters'
import { Badge } from '../components/common/Badge'

export function PublicVerifyPage() {
  const { code } = useParams()
  const [passport, setPassport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function fetchPassport() {
      setLoading(true)
      setError('')
      try {
        const data = await passportsApi.getPublic(code)
        if (isMounted) setPassport(data)
      } catch (err) {
        if (isMounted) {
          setError(
            err.message || `Passport '${code}' could not be verified or was not found in the public registry.`
          )
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    if (code) fetchPassport()
    return () => {
      isMounted = false
    }
  }, [code])

  const qrUrl = `${API_BASE_URL}/passports/${code}/qr.png`

  return (
    <div className="public-verify-shell">
      <header className="public-verify-header">
        <Link to="/" className="wordmark">
          brandpilot<span>.</span>
        </Link>
        <span className="verify-badge mono-font">PUBLIC VERIFICATION RECORD</span>
      </header>

      <main className="public-verify-container">
        {loading && (
          <div className="waking-server-card" role="status">
            <div className="spinner" />
            <h2 className="display-font">Verifying Brand Passport...</h2>
            <p className="mono-font" style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Retrieving public provenance credentials for {code}...
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="public-verify-error-card" role="alert">
            <div className="error-mark">!</div>
            <h2 className="display-font">Verification Unavailable</h2>
            <p>{error}</p>
            <div style={{ marginTop: '20px' }}>
              <Link to="/login" className="action-button secondary small">
                Sign in to BrandPilot
              </Link>
            </div>
          </div>
        )}

        {passport && !loading && (
          <article className={`public-passport-paper status-${passport.status}`}>
            {/* Status Stamp */}
            <div className={`public-stamp stamp-${passport.status}`}>
              <span className="stamp-text mono-font">
                {passport.status === 'valid'
                  ? 'VERIFIED VALID'
                  : passport.status === 'review_required'
                  ? 'REVIEW REQUIRED'
                  : 'WITHDRAWN'}
              </span>
            </div>

            <div className="public-passport-top">
              <div>
                <span className="mono-font eyebrow">BRAND PASSPORT</span>
                <h1 className="public-asset-title display-font">{passport.asset_title}</h1>
                <p className="public-passport-code mono-font">{passport.code}</p>
              </div>

              <div className="public-qr-box">
                <img
                  src={qrUrl}
                  alt={`Public verification QR code for ${passport.code}`}
                  width="78"
                  height="78"
                />
              </div>
            </div>

            {passport.status === 'review_required' && (
              <div className="recall-notice-box" role="status">
                <strong className="mono-font">RECALL NOTICE</strong>
                <p>
                  One or more underlying brand facts have evolved since this approval. Content claims require revalidation.
                </p>
              </div>
            )}

            {passport.status === 'withdrawn' && (
              <div className="withdrawal-notice-box" role="status">
                <strong className="mono-font">WITHDRAWN CERTIFICATE</strong>
                <p>
                  This verification certificate was formally withdrawn by brand management.
                </p>
              </div>
            )}

            {/* Public Provenance Data Points (strictly limited per contract) */}
            <div className="public-meta-grid">
              <div className="public-meta-cell">
                <span className="mono-font">CERTIFICATION STATUS</span>
                <Badge status={passport.status} />
              </div>

              <div className="public-meta-cell">
                <span className="mono-font">APPROVED AT</span>
                <strong>{formatDate(passport.approved_at)}</strong>
              </div>

              <div className="public-meta-cell">
                <span className="mono-font">REVIEWER SIGN-OFF</span>
                <strong>{passport.reviewer_name || 'Verified Reviewer'}</strong>
              </div>

              <div className="public-meta-cell">
                <span className="mono-font">GOVERNANCE STANDARD</span>
                <strong>v{passport.guideline_version || 1} Guidelines</strong>
              </div>

              <div className="public-meta-cell">
                <span className="mono-font">CERTIFIED CLAIMS</span>
                <strong>{passport.linked_fact_count || 0} Ground-Truth Facts</strong>
              </div>
            </div>

            <footer className="public-disclosure-box">
              <span className="mono-font eyebrow">AI & PROCESS DISCLOSURE</span>
              <p>
                {passport.ai_disclosure ||
                  'Content was audited using deterministic brand voice rules and Google Gemini models, followed by human reviewer verification and sign-off.'}
              </p>
            </footer>
          </article>
        )}
      </main>
    </div>
  )
}
