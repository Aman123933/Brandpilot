export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('brandpilot_token')

  const headers = {
    ...options.headers,
  }

  if (!(options.body instanceof FormData) && options.body) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || `Request failed (${response.status})`)
  }

  if (response.status === 204) return null

  return response.json()
}

export function getDemoUsers() {
  return apiRequest('/auth/demo-users')
}

export function demoLogin(userId) {
  return apiRequest('/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
}
