import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { authApi } from '../api/client'

export function LoginPage() {
  const { login, currentUser, sessionExpiredMessage, clearExpiredMessage } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [demoAccounts, setDemoAccounts] = useState([])
  const [loadingDemos, setLoadingDemos] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Redirect to overview if already logged in
  useEffect(() => {
    if (currentUser) {
      const destination = location.state?.from?.pathname || '/app/overview'
      navigate(destination, { replace: true })
    }
  }, [currentUser, navigate, location])

  // Fetch demo credentials from GET /auth/demo-credentials (never hardcoded)
  useEffect(() => {
    async function fetchDemoAccounts() {
      try {
        const data = await authApi.getDemoCredentials()
        setDemoAccounts(Array.isArray(data) ? data : [])
      } catch {
        setDemoAccounts([])
      } finally {
        setLoadingDemos(false)
      }
    }
    fetchDemoAccounts()
  }, [])

  const handleSubmit = async e => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setErrorMessage('Please provide both email and password.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    clearExpiredMessage()

    try {
      await login({ email: email.trim(), password })
      const destination = location.state?.from?.pathname || '/app/overview'
      navigate(destination, { replace: true })
    } catch (err) {
      setErrorMessage(err.message || 'Invalid email or password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUseDemo = acc => {
    setEmail(acc.email)
    setPassword(acc.password)
    setErrorMessage('')
    clearExpiredMessage()
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <header className="login-header">
          <h1 className="wordmark" style={{ fontSize: '32px' }}>
            brandpilot<span>.</span>
          </h1>
          <p className="login-tagline">
            The standard, held. Enterprise brand governance & verifiable provenance.
          </p>
        </header>

        {sessionExpiredMessage && (
          <div className="alert-box alert-amber" role="alert">
            {sessionExpiredMessage}
          </div>
        )}

        {errorMessage && (
          <div className="alert-box alert-vermilion" role="alert">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="form-group">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. maya@kestrelaudio.com"
              required
              disabled={isSubmitting}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={isSubmitting}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="action-button primary full-width"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in to BrandPilot'}
          </button>
        </form>

        {/* Demo Accounts Panel */}
        {!loadingDemos && demoAccounts.length > 0 && (
          <section className="demo-accounts-panel" aria-labelledby="demo-accounts-title">
            <div className="demo-accounts-header">
              <span className="mono-font eyebrow">ONE-CLICK ACCESS</span>
              <h2 id="demo-accounts-title" className="demo-panel-title">Demo Accounts</h2>
            </div>
            <p className="demo-panel-desc">
              Select an account to pre-fill credentials for judge verification.
            </p>

            <div className="demo-accounts-list">
              {demoAccounts.map((account, idx) => (
                <div key={idx} className="demo-account-item">
                  <div className="demo-account-info">
                    <strong>{account.name}</strong>
                    <span className="demo-account-role">
                      {account.role.replace('_', ' ')}
                    </span>
                    <span className="demo-account-desc">{account.description}</span>
                  </div>
                  <button
                    type="button"
                    className="action-button secondary small"
                    onClick={() => handleUseDemo(account)}
                    disabled={isSubmitting}
                  >
                    Use these
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
