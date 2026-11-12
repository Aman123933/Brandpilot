import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function NotFoundPage() {
  const { currentUser } = useAuth()

  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <span className="mono-font eyebrow" style={{ color: 'var(--vermilion)' }}>
          404 / NOT FOUND
        </span>
        <h1 className="display-font">This page is not on the desk.</h1>
        <p>
          The link or path you entered does not exist in BrandPilot.
        </p>

        <div style={{ marginTop: '24px' }}>
          <Link
            to={currentUser ? '/app/overview' : '/login'}
            className="action-button primary"
          >
            {currentUser ? 'Return to Workspace Overview' : 'Go to Sign In'}
          </Link>
        </div>
      </div>
    </main>
  )
}
