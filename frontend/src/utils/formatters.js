/**
 * Formats a fact version's value and unit.
 * Defensively de-duplicates units so legacy data like "up to 32 dB" with unit "dB"
 * never displays as "up to 32 dB dB".
 */
export function formatFactValue(version) {
  if (!version || version.value === null || version.value === undefined) return 'N/A'
  const val = String(version.value).trim()
  const unit = version.unit ? String(version.unit).trim() : ''
  if (!unit) return val

  const valLower = val.toLowerCase()
  const unitLower = unit.toLowerCase()

  // If the value already ends with or includes the unit as a separate token, don't re-append
  if (
    valLower === unitLower ||
    valLower.endsWith(` ${unitLower}`) ||
    valLower.endsWith(unitLower) ||
    valLower.includes(` ${unitLower} `)
  ) {
    return val
  }

  return `${val} ${unit}`
}

/**
 * Formats an ISO date string into a clear editorial string.
 */
export function formatDate(isoString) {
  if (!isoString) return '—'
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return String(isoString)
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(d) + ' UTC'
  } catch {
    return String(isoString)
  }
}

/**
 * Calculates days remaining from valid_until and returns status badge metadata.
 */
export function formatExpiryBadge(validUntil) {
  if (!validUntil) {
    return {
      label: 'Permanent',
      isExpired: false,
      isExpiringSoon: false,
      daysLeft: null,
      status: 'permanent',
    }
  }

  const expiryTime = new Date(validUntil).getTime()
  if (isNaN(expiryTime)) {
    return {
      label: 'Unknown',
      isExpired: false,
      isExpiringSoon: false,
      daysLeft: null,
      status: 'unknown',
    }
  }

  const now = Date.now()
  const diffMs = expiryTime - now
  const daysLeft = Math.ceil(diffMs / 86400000)

  if (daysLeft < 0) {
    return {
      label: 'Expired',
      isExpired: true,
      isExpiringSoon: false,
      daysLeft,
      status: 'expired',
    }
  }

  if (daysLeft === 0) {
    return {
      label: 'Expires today',
      isExpired: false,
      isExpiringSoon: true,
      daysLeft: 0,
      status: 'expiring',
    }
  }

  if (daysLeft <= 7) {
    return {
      label: `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      isExpired: false,
      isExpiringSoon: true,
      daysLeft,
      status: 'expiring',
    }
  }

  return {
    label: `Valid for ${daysLeft} days`,
    isExpired: false,
    isExpiringSoon: false,
    daysLeft,
    status: 'valid',
  }
}
