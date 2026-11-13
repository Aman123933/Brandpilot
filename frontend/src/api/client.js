// BrandPilot Unified API Client
// Implements 30s timeout (AbortController), single GET retry, waking-server listener,
// 401 session expiration, 403 friendly errors, and readable network failure messages.

import { mapApiError } from '../utils/apiError'

export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

// Global listeners for waking server banner and auth expiry
const wakingListeners = new Set()
let activeSlowRequests = 0

export function subscribeWakingServer(listener) {
  wakingListeners.add(listener)
  return () => wakingListeners.delete(listener)
}

function notifyWaking(isWaking) {
  wakingListeners.forEach(fn => fn(isWaking))
}

export class ApiError extends Error {
  constructor(message, status, detail, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.data = data
  }
}

/**
 * Core fetch wrapper with timeout, retry, and error normalization.
 */
export async function apiFetch(endpoint, options = {}, isRetry = false) {
  const method = (options.method || 'GET').toUpperCase()
  const token = localStorage.getItem('brandpilot_token')

  const headers = { ...options.headers }
  if (!(options.body instanceof FormData) && options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  // Track slow requests (e.g. server spin-up on Render)
  let isSlow = false
  const slowTimerId = setTimeout(() => {
    isSlow = true
    activeSlowRequests++
    notifyWaking(true)
  }, 2500)

  try {
    const url = `${API_BASE_URL}${endpoint}`
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    clearTimeout(slowTimerId)
    if (isSlow) {
      activeSlowRequests = Math.max(0, activeSlowRequests - 1)
      if (activeSlowRequests === 0) notifyWaking(false)
    }

    // 401 Unauthorized: Session Expired
    if (response.status === 401) {
      localStorage.removeItem('brandpilot_token')
      localStorage.removeItem('brandpilot_user')
      window.dispatchEvent(new CustomEvent('brandpilot:auth-expired'))
      window.dispatchEvent(new CustomEvent('brandpilot:session-expired'))
      const errorJson = await response.json().catch(() => ({}))
      const msg = errorJson.detail || 'Your session expired. Please sign in again.'
      throw new ApiError(msg, 401, errorJson.detail, errorJson)
    }

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}))
      const humanMessage = mapApiError(errorJson, response.status)
      throw new ApiError(humanMessage, response.status, errorJson.detail, errorJson)
    }

    if (response.status === 204) return null
    return await response.json()
  } catch (err) {
    clearTimeout(timeoutId)
    clearTimeout(slowTimerId)
    if (isSlow) {
      activeSlowRequests = Math.max(0, activeSlowRequests - 1)
      if (activeSlowRequests === 0) notifyWaking(false)
    }

    // Retry idempotent GET once on network failure or abort
    if (method === 'GET' && !isRetry && (err.name === 'AbortError' || err instanceof TypeError)) {
      return apiFetch(endpoint, options, true)
    }

    if (err instanceof ApiError) {
      throw err
    }

    const humanMessage = mapApiError(err)
    throw new ApiError(humanMessage, 0, err.message)
  }
}

// Grouped API helpers
export const authApi = {
  login: credentials =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  getDemoCredentials: () => apiFetch('/auth/demo-credentials'),
  getDemoUsers: () => apiFetch('/auth/demo-users'),
  getMe: () => apiFetch('/auth/me'),
}

export const factsApi = {
  list: () => apiFetch('/facts'),
  get: id => apiFetch(`/facts/${id}`),
  create: data =>
    apiFetch('/facts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createVersion: (id, data) =>
    apiFetch(`/facts/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getImpact: id => apiFetch(`/facts/${id}/impact`),
}

export const guidelinesApi = {
  list: () => apiFetch('/guidelines'),
  get: id => apiFetch(`/guidelines/${id}`),
  create: data =>
    apiFetch('/guidelines', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listVersions: id => apiFetch(`/guidelines/${id}/versions`),
  createVersion: (id, data) =>
    apiFetch(`/guidelines/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getDiff: (id, from, to) => apiFetch(`/guidelines/${id}/diff?from=${from}&to=${to}`),
  runReplay: (id, version, scope = 'approved') =>
    apiFetch(`/guidelines/${id}/versions/${version}/replay`, {
      method: 'POST',
      body: JSON.stringify({ scope }),
    }),
  getReplay: (id, version) => apiFetch(`/guidelines/${id}/versions/${version}/replay`),
  activate: (id, version, note = '') =>
    apiFetch(`/guidelines/${id}/versions/${version}/activate`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  reject: (id, version, note) =>
    apiFetch(`/guidelines/${id}/versions/${version}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
}

export const assetsApi = {
  list: () => apiFetch('/assets'),
  get: id => apiFetch(`/assets/${id}`),
  create: data =>
    apiFetch('/assets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  upload: formData =>
    apiFetch('/assets/upload', {
      method: 'POST',
      body: formData,
    }),
  audit: (id, options = {}) =>
    apiFetch(`/assets/${id}/audit`, {
      method: 'POST',
      ...options,
    }),
  redteam: (id, options = {}) =>
    apiFetch(`/assets/${id}/redteam`, {
      method: 'POST',
      ...options,
    }),
  getFindings: id => apiFetch(`/assets/${id}/findings`),
  patchFinding: (id, status) =>
    apiFetch(`/findings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  submit: id =>
    apiFetch(`/assets/${id}/submit`, {
      method: 'POST',
    }),
  getHistory: id => apiFetch(`/assets/${id}/history`),
}

export const reviewsApi = {
  getQueue: () => apiFetch('/reviews/queue'),
  recordDecision: (assetId, data) =>
    apiFetch(`/assets/${assetId}/decision`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

export const insightsApi = {
  getOverview: () => apiFetch('/insights/overview'),
  getViolations: (days = 30) => apiFetch(`/insights/violations?days=${days}`),
  getDisputedRules: () => apiFetch('/insights/disputed-rules'),
  getAssets: () => apiFetch('/insights/assets'),
}

export const passportsApi = {
  get: code => apiFetch(`/passports/${code}`),
  getPublic: code => apiFetch(`/passports/${code}/public`),
  withdraw: (code, reason) =>
    apiFetch(`/passports/${code}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
}

export const notificationsApi = {
  list: () => apiFetch('/notifications'),
  markAsRead: id =>
    apiFetch(`/notifications/${id}/read`, {
      method: 'PATCH',
    }),
}

export const adminApi = {
  getExpiryStatus: () => apiFetch('/admin/expiry-status'),
  runExpiryCheck: () =>
    apiFetch('/admin/run-expiry-check', {
      method: 'POST',
    }),
  resetDemo: () =>
    apiFetch('/admin/reset-demo', {
      method: 'POST',
    }),
}

export const healthApi = {
  get: () => apiFetch('/health'),
}
