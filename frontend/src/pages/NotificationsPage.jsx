import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { notificationsApi } from '../api/client'
import { formatDate } from '../utils/formatters'
import { SkeletonCard } from '../components/common/Skeleton'
import { EmptyState } from '../components/common/EmptyState'

export function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const data = await notificationsApi.list()
        if (mounted) setNotifications(Array.isArray(data) ? data : [])
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load notifications.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => {
      mounted = false
    }
  }, [])

  async function handleMarkRead(id) {
    try {
      await notificationsApi.markAsRead(id)
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      )
    } catch {
      // quiet fallback
    }
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">ACTIVITY / NOTIFICATIONS</p>
          <h1 className="display-font">Notifications</h1>
          <p className="page-subtitle">
            System updates, recall notices, reviewer decisions, and passport status changes.
          </p>
        </div>
      </header>

      {error && <div className="alert-box alert-vermilion" role="alert">{error}</div>}

      {loading ? (
        <div className="cards-grid">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="You are completely caught up. New updates regarding your assets and guidelines will appear here."
        />
      ) : (
        <ul className="notifications-list" aria-label="Notifications list">
          {notifications.map(n => (
            <li
              key={n.id}
              className={`notification-item ${!n.read ? 'unread' : ''}`}
            >
              <div className="notification-indicator" aria-hidden="true">
                {!n.read ? '●' : '○'}
              </div>

              <div className="notification-content">
                <p className="notification-message">{n.message}</p>
                <div className="notification-meta mono-font">
                  <span>{formatDate(n.created_at)}</span>
                  {n.asset_id && (
                    <Link
                      to={`/app/assets/${n.asset_id}`}
                      className="notification-link"
                      onClick={() => !n.read && handleMarkRead(n.id)}
                    >
                      View Asset #{n.asset_id} →
                    </Link>
                  )}
                </div>
              </div>

              {!n.read && (
                <button
                  type="button"
                  className="action-button secondary small"
                  onClick={() => handleMarkRead(n.id)}
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
