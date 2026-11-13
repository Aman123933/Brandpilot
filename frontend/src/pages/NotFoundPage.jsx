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
        <h1 className="display-font">404: Page Not Found</h1>
        <p>
          The page you are looking for does not exist on the BrandPilot desk.
        </p>

        <div style={{ marginTop: '24px' }}>
          <Link
            to={currentUser ? '/app/overview' : '/login'}
            className="action-button primary"
          >
            {currentUser ? 'Return to Overview' : 'Go to Sign In'}
          </Link>
        </div>
      </div>
    </main>
  )
}
