import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPublicPassport, API_BASE_URL } from './api'
import './App.css'

export default function PublicVerify() {
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
        const data = await getPublicPassport(code)
        if (isMounted) {
          setPassport(data)
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err.message ||
              `Passport with code '${code}' could not be verified or was not found.`
          )
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    if (code) {
      fetchPassport()
    }

    return () => {
      isMounted = false
    }
  }, [code])

  const formatStatusStamp = (status) => {
    switch (status) {
      case 'valid':
        return {
          text: 'VALID',
          className: 'stamp-valid',
          desc: 'Verified against living brand ground-truth facts & voice guidelines.',
        }
      case 'review_required':
        return {
          text: 'REVIEW REQUIRED',
          className: 'stamp-review-required',
          desc: 'One or more underlying brand facts have evolved since approval. Content requires revalidation.',
        }
      case 'withdrawn':
        return {
          text: 'WITHDRAWN',
          className: 'stamp-withdrawn',
          desc: 'This verification passport has been formally withdrawn by brand governance.',
        }
      default:
        return {
          text: (status || 'UNKNOWN').toUpperCase(),
          className: 'stamp-unknown',
          desc: 'Status unrecognized.',
        }
    }
  }

  const stampInfo = passport ? formatStatusStamp(passport.status) : null

  return (
    <div className="public-verify-shell">
      <header className="public-verify-header">
        <Link to="/" className="wordmark">
          Brand<span>Pilot</span>
        </Link>
        <span className="verify-badge">PUBLIC VERIFICATION RECORD</span>
      </header>

      <main className="public-verify-container">
        {loading && (
          <div className="waking-server-card">
            <div className="spinner" />
            <h3>Waking the server (about 30 seconds)...</h3>
            <p>
              Free-tier instances spin down when inactive. Retrieving verification
              passport <code>{code}</code> from the public registry...
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="public-verify-error-card">
            <div className="error-icon">!</div>
            <h2>Verification Failed</h2>
            <p>{error}</p>
            <Link to="/" className="primary-button" style={{ marginTop: '20px', display: 'inline-block' }}>
              Return to BrandPilot Home
            </Link>
          </div>
        )}

        {passport && !loading && (
          <div className="public-passport-certificate">
            <div className="certificate-top">
              <div className="certificate-meta-left">
                <span className="passport-code-label">VERIFICATION PASSPORT CODE</span>
                <span className="passport-code-value">{passport.code}</span>
              </div>
              <div className={`certificate-stamp ${stampInfo.className}`}>
                <span className="stamp-text">{stampInfo.text}</span>
              </div>
            </div>

            <p className="stamp-explanation">{stampInfo.desc}</p>

            <div className="certificate-divider" />

            <div className="certificate-section">
              <label>ASSET TITLE</label>
              <h1 className="certificate-asset-title">{passport.asset_title}</h1>
            </div>

            <div className="certificate-grid">
              <div className="certificate-field">
                <label>APPROVAL DATE</label>
                <span>
                  {passport.approved_at
                    ? new Date(passport.approved_at).toUTCString()
                    : 'Pending recorded date'}
                </span>
              </div>

              <div className="certificate-field">
                <label>REVIEWER</label>
                <span>{passport.reviewer_first_name || 'Independent Reviewer'}</span>
              </div>

              <div className="certificate-field">
                <label>GUIDELINE VERSION</label>
                <span>{passport.guideline_version_label}</span>
              </div>

              <div className="certificate-field">
                <label>LINKED BRAND FACTS</label>
                <span>{passport.linked_facts_count} ground-truth facts verified</span>
              </div>
            </div>

            <div className="certificate-divider" />

            <div className="certificate-section">
              <label>AI & GOVERNANCE DISCLOSURE</label>
              <p className="certificate-disclosure">
                {passport.ai_disclosure ||
                  'Content was audited using deterministic brand rules and evaluated against registered brand guidelines.'}
              </p>
            </div>

            <div className="certificate-footer">
              <div className="certificate-qr-box">
                <img
                  src={`${API_BASE_URL}/passports/${passport.code}/qr.png`}
                  alt={`QR Verification code for ${passport.code}`}
                  className="certificate-qr-img"
                />
                <span className="qr-caption">Scan to independently verify</span>
              </div>
              <div className="certificate-legal-note">
                <p>
                  <strong>Provenance Note:</strong> This public certificate confirms
                  compliance with brand governance guidelines and validated ground-truth
                  facts at approval time. In accordance with confidentiality policy,
                  raw asset copy and internal fact values are not published.
                </p>
                <Link to="/" className="secondary-link">
                  BrandPilot Workspace
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
