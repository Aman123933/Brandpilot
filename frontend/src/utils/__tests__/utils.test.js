import { describe, it, expect } from 'vitest'
import { formatFactValue, formatDate, formatExpiryBadge } from '../formatters.js'
import {
  isBrandManager,
  isCreator,
  isReviewer,
  canAccessInsights,
  ROLES,
} from '../roles.js'
import { mapApiError } from '../apiError.js'

describe('formatFactValue - unit de-duplication', () => {
  it('deduplicates unit when value already contains it', () => {
    expect(formatFactValue({ value: 'up to 32 dB', unit: 'dB' })).toBe('up to 32 dB')
    expect(formatFactValue({ value: '30 days', unit: 'days' })).toBe('30 days')
    expect(formatFactValue({ value: '129 USD', unit: 'USD' })).toBe('129 USD')
  })

  it('appends unit when value does not contain it', () => {
    expect(formatFactValue({ value: '129', unit: 'USD' })).toBe('129 USD')
    expect(formatFactValue({ value: '24', unit: 'hours' })).toBe('24 hours')
    expect(formatFactValue({ value: 'up to 32', unit: 'dB' })).toBe('up to 32 dB')
  })

  it('handles empty or missing unit cleanly', () => {
    expect(formatFactValue({ value: 'Version 2.0', unit: '' })).toBe('Version 2.0')
    expect(formatFactValue({ value: '5.3', unit: null })).toBe('5.3')
    expect(formatFactValue(null)).toBe('N/A')
  })
})

describe('formatExpiryBadge', () => {
  it('returns permanent for null valid_until', () => {
    const res = formatExpiryBadge(null)
    expect(res.isExpired).toBe(false)
    expect(res.label).toBe('Permanent')
  })

  it('detects already expired dates', () => {
    const past = new Date(Date.now() - 86400000 * 2).toISOString()
    const res = formatExpiryBadge(past)
    expect(res.isExpired).toBe(true)
    expect(res.label).toBe('Expired')
  })

  it('detects expiring soon within 7 days', () => {
    const soon = new Date(Date.now() + 86400000 * 3).toISOString()
    const res = formatExpiryBadge(soon)
    expect(res.isExpiringSoon).toBe(true)
    expect(res.label).toContain('Expires in')
  })

  it('returns valid for distant dates', () => {
    const future = new Date(Date.now() + 86400000 * 60).toISOString()
    const res = formatExpiryBadge(future)
    expect(res.isExpired).toBe(false)
    expect(res.isExpiringSoon).toBe(false)
    expect(res.label).toContain('Valid for')
  })
})

describe('formatDate', () => {
  it('formats ISO UTC date string cleanly', () => {
    const res = formatDate('2026-10-15T15:00:00Z')
    expect(res).toContain('Oct 2026')
    expect(res).toContain('UTC')
  })

  it('handles null or empty date gracefully', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('')).toBe('—')
  })
})

describe('Role gating checks', () => {
  it('identifies brand manager', () => {
    expect(isBrandManager(ROLES.BRAND_MANAGER)).toBe(true)
    expect(isBrandManager(ROLES.CREATOR)).toBe(false)
    expect(isBrandManager({ role: 'brand_manager' })).toBe(true)
  })

  it('identifies creator', () => {
    expect(isCreator(ROLES.CREATOR)).toBe(true)
    expect(isCreator(ROLES.REVIEWER)).toBe(false)
  })

  it('identifies reviewer', () => {
    expect(isReviewer(ROLES.REVIEWER)).toBe(true)
    expect(isReviewer(ROLES.BRAND_MANAGER)).toBe(false)
  })

  it('gates insights: allowed for manager and reviewer, blocked for creator', () => {
    expect(canAccessInsights(ROLES.BRAND_MANAGER)).toBe(true)
    expect(canAccessInsights(ROLES.REVIEWER)).toBe(true)
    expect(canAccessInsights(ROLES.CREATOR)).toBe(false)
  })
})

describe('mapApiError mapping', () => {
  it('maps 401 to session expired message', () => {
    const msg = mapApiError({}, 401)
    expect(msg).toBe('Your session expired. Please sign in again.')
  })

  it('maps 403 to permission message', () => {
    const msg = mapApiError({}, 403)
    expect(msg).toBe('You do not have permission to perform this action.')
  })

  it('maps 429 to rate limit message', () => {
    const msg = mapApiError({}, 429)
    expect(msg).toBe('Too many attempts. Try again in a few minutes.')
  })

  it('preserves specific backend detail message', () => {
    const msg = mapApiError({ detail: 'Fact key already exists' }, 409)
    expect(msg).toBe('Fact key already exists')
  })

  it('handles AbortError timeout', () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    const msg = mapApiError(err)
    expect(msg).toContain('timed out after 30 seconds')
  })
})
