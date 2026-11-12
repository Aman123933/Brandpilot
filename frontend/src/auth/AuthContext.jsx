import { useState, useEffect, useCallback } from 'react'
import { authApi } from '../api/client'
import { AuthContext } from './authContextDef'
import {
  isBrandManager,
  isCreator,
  isReviewer,
  canAccessInsights,
} from '../utils/roles'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('brandpilot_token') || null)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('brandpilot_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [isLoadingUser, setIsLoadingUser] = useState(true)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('')

  const logout = useCallback((message = '') => {
    localStorage.removeItem('brandpilot_token')
    localStorage.removeItem('brandpilot_user')
    setToken(null)
    setCurrentUser(null)
    if (message) {
      setSessionExpiredMessage(message)
    }
  }, [])

  const clearExpiredMessage = useCallback(() => {
    setSessionExpiredMessage('')
  }, [])

  const login = useCallback(async ({ email, password }) => {
    setSessionExpiredMessage('')
    const result = await authApi.login({ email, password })
    localStorage.setItem('brandpilot_token', result.access_token)
    localStorage.setItem('brandpilot_user', JSON.stringify(result.user))
    setToken(result.access_token)
    setCurrentUser(result.user)
    return result.user
  }, [])

  // Verify token on initial load
  useEffect(() => {
    let mounted = true
    async function verifyAuth() {
      if (!token) {
        setIsLoadingUser(false)
        return
      }
      try {
        const user = await authApi.getMe()
        if (mounted) {
          setCurrentUser(user)
          localStorage.setItem('brandpilot_user', JSON.stringify(user))
        }
      } catch (err) {
        if (mounted && err.status === 401) {
          logout('Your session expired. Please sign in again.')
        }
      } finally {
        if (mounted) {
          setIsLoadingUser(false)
        }
      }
    }
    verifyAuth()
    return () => {
      mounted = false
    }
  }, [token, logout])

  // Listen for 401 auth-expired custom events from api client
  useEffect(() => {
    function handleExpired() {
      logout('Your session expired. Please sign in again.')
    }
    window.addEventListener('brandpilot:auth-expired', handleExpired)
    return () => window.removeEventListener('brandpilot:auth-expired', handleExpired)
  }, [logout])

  const value = {
    currentUser,
    token,
    isLoadingUser,
    sessionExpiredMessage,
    login,
    logout,
    clearExpiredMessage,
    isManager: isBrandManager(currentUser),
    isCreator: isCreator(currentUser),
    isReviewer: isReviewer(currentUser),
    canInsights: canAccessInsights(currentUser),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
