import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { ToastProvider } from './components/common/Toast'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { Shell } from './components/layout/Shell'

// Pages
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { FactsPage } from './pages/FactsPage'
import { GuidelinesPage } from './pages/GuidelinesPage'
import { GuidelineDetailPage } from './pages/GuidelineDetailPage'
import { AssetsPage } from './pages/AssetsPage'
import { AssetDetailPage } from './pages/AssetDetailPage'
import { ReviewsPage } from './pages/ReviewsPage'
import { InsightsPage } from './pages/InsightsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { PassportDetailPage } from './pages/PassportDetailPage'
import { PublicVerifyPage } from './pages/PublicVerifyPage'
import { NotFoundPage } from './pages/NotFoundPage'

import './App.css'

function RootRedirect() {
  const { currentUser, isLoadingUser } = useAuth()
  if (isLoadingUser) return null
  return <Navigate to={currentUser ? '/app/overview' : '/login'} replace />
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify/:code" element={<PublicVerifyPage />} />

            {/* Authenticated Application Routes under /app/* */}
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <Shell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/app/overview" replace />} />
              <Route path="overview" element={<OverviewPage />} />
              <Route path="facts" element={<FactsPage />} />
              <Route path="guidelines" element={<GuidelinesPage />} />
              <Route path="guidelines/:id" element={<GuidelineDetailPage />} />
              <Route path="assets" element={<AssetsPage />} />
              <Route path="assets/:id" element={<AssetDetailPage />} />
              <Route
                path="reviews"
                element={
                  <ProtectedRoute requiredRole="reviewer">
                    <ReviewsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="insights"
                element={
                  <ProtectedRoute
                    requiredCondition={user => user?.role === 'brand_manager' || user?.role === 'reviewer'}
                  >
                    <InsightsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="passports/:code" element={<PassportDetailPage />} />
            </Route>

            {/* Friendly In-App 404 for Unknown Non-API Paths */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
