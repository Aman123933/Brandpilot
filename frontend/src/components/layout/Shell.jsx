import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { notificationsApi, subscribeWakingServer } from '../../api/client'
import { ROLE_LABELS } from '../../utils/roles'

export function Shell() {
  const { currentUser, logout, isReviewer, canInsights } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [isWaking, setIsWaking] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const unsub = subscribeWakingServer(status => {
      setIsWaking(status)
    })
    return unsub
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadNotifications() {
      try {
        const notifs = await notificationsApi.list()
        if (mounted) {
          const unread = notifs.filter(n => !n.read).length
          setUnreadCount(unread)
        }
      } catch {
        // quiet failure
      }
    }
    loadNotifications()
    const timer = setInterval(loadNotifications, 30000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const closeMobile = () => setMobileMenuOpen(false)

  return (
    <div className="dashboard-shell">
      {/* Mobile Top Bar */}
      <header className="mobile-header">
        <a className="wordmark" href="/app/overview">
          brandpilot<span>.</span>
        </a>
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(prev => !prev)}
          aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Sidebar navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <a className="wordmark" href="/app/overview" onClick={closeMobile}>
          brandpilot<span>.</span>
        </a>

        <p className="sidebar-label">WORKSPACE</p>

        <nav className="sidebar-nav" aria-label="Main Navigation">
          <NavLink
            to="/app/overview"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            Overview
          </NavLink>

          <NavLink
            to="/app/facts"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            Brand facts
          </NavLink>

          <NavLink
            to="/app/guidelines"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            Guidelines
          </NavLink>

          {isReviewer && (
            <NavLink
              to="/app/reviews"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={closeMobile}
            >
              Reviewer queue
            </NavLink>
          )}

          <NavLink
            to="/app/assets"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            Content assets
          </NavLink>

          {canInsights && (
            <NavLink
              to="/app/insights"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={closeMobile}
            >
              Governance insights
            </NavLink>
          )}

          <NavLink
            to="/app/notifications"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="unread-pill mono-font">{unreadCount}</span>
            )}
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-info">
            <div className="user-avatar" aria-hidden="true">
              {currentUser?.name?.charAt(0) || 'U'}
            </div>
            <div>
              <strong>{currentUser?.name || 'User'}</strong>
              <span>{ROLE_LABELS[currentUser?.role] || currentUser?.role}</span>
            </div>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
            aria-label="Sign out of BrandPilot"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main page content */}
      <div className="dashboard-content-area">
        {isWaking && (
          <div className="waking-server-banner" role="status" aria-live="polite">
            <div className="spinner" />
            <div>
              <strong>Waking the server, this can take up to a minute</strong>
              <div className="waking-subtext">Free-tier hosting spins down when idle. Your request is in flight.</div>
            </div>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  )
}
