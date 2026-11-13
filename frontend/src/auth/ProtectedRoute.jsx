import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

export function ProtectedRoute({ children, requiredRole = null, requiredCondition = null }) {
  const { currentUser, isLoadingUser } = useAuth()
  const location = useLocation()

  if (isLoadingUser) {
    return (
      <div className="skeleton-loading-screen" role="status" aria-label="Loading workspace">
        <div className="spinner" />
        <p className="mono-font" style={{ marginTop: '16px', color: 'var(--muted)' }}>
          LOADING BRANDPILOT WORKSPACE...
        </p>
      </div>
    )
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredRole && currentUser.role !== requiredRole) {
    return (
      <main className="forbidden-screen">
        <div className="forbidden-box">
          <p className="eyebrow" style={{ color: 'var(--vermilion)' }}>ACCESS RESTRICTED</p>
          <h2 className="display-font">Role not permitted</h2>
          <p>
            This section requires the <strong>{requiredRole}</strong> role. You are signed in as{' '}
            <strong>{currentUser.name}</strong> ({currentUser.role}).
          </p>
          <a href="/app/overview" className="action-button primary" style={{ marginTop: '16px', display: 'inline-block' }}>
            Return to Overview
          </a>
        </div>
      </main>
    )
  }

  if (requiredCondition && !requiredCondition(currentUser)) {
    return (
      <main className="forbidden-screen">
        <div className="forbidden-box">
          <p className="eyebrow" style={{ color: 'var(--vermilion)' }}>ACCESS RESTRICTED</p>
          <h2 className="display-font">Access Restricted</h2>
          <p>
            Governance insights and organizational compliance analytics are restricted to Brand Managers and Reviewers.
          </p>
          <a href="/app/overview" className="action-button primary" style={{ marginTop: '16px', display: 'inline-block' }}>
            Return to Overview
          </a>
        </div>
      </main>
    )
  }

  return children
}
