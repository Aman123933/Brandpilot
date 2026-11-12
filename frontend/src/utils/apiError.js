/**
 * Transforms an error or response into a human-readable editorial message.
 */
export function mapApiError(error, status) {
  if (!error) return 'An unexpected error occurred. Please try again.'

  if (typeof error === 'string') return error

  if (error.name === 'AbortError') {
    return 'The request timed out after 30 seconds. The server might be busy or waking up.'
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Unable to connect to the server. Please check your network connection.'
  }

  const detail = error.detail || error.message

  if (status === 401) {
    return detail || 'Your session expired. Please sign in again.'
  }

  if (status === 403) {
    return detail || 'You do not have permission to perform this action.'
  }

  if (status === 404) {
    return detail || 'The requested resource could not be found.'
  }

  if (status === 409) {
    return detail || 'A conflict occurred. This action has already been performed.'
  }

  if (status === 429) {
    return detail || 'Too many attempts. Try again in a few minutes.'
  }

  if (status >= 500) {
    return 'The server encountered an error processing your request. Please try again later.'
  }

  if (Array.isArray(detail)) {
    // FastAPI validation errors
    return detail.map(item => item.msg || item.message || JSON.stringify(item)).join('; ')
  }

  return detail || 'Request failed. Please try again.'
}
