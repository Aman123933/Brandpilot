export const ROLES = {
  BRAND_MANAGER: 'brand_manager',
  CREATOR: 'creator',
  REVIEWER: 'reviewer',
}

export const ROLE_LABELS = {
  [ROLES.BRAND_MANAGER]: 'Brand Manager',
  [ROLES.CREATOR]: 'Content Creator',
  [ROLES.REVIEWER]: 'Reviewer',
}

export function isBrandManager(userOrRole) {
  const role = typeof userOrRole === 'object' && userOrRole ? userOrRole.role : userOrRole
  return role === ROLES.BRAND_MANAGER
}

export function isCreator(userOrRole) {
  const role = typeof userOrRole === 'object' && userOrRole ? userOrRole.role : userOrRole
  return role === ROLES.CREATOR
}

export function isReviewer(userOrRole) {
  const role = typeof userOrRole === 'object' && userOrRole ? userOrRole.role : userOrRole
  return role === ROLES.REVIEWER
}

export function canAccessInsights(userOrRole) {
  const role = typeof userOrRole === 'object' && userOrRole ? userOrRole.role : userOrRole
  return role === ROLES.BRAND_MANAGER || role === ROLES.REVIEWER
}

export function canManageFacts(userOrRole) {
  return isBrandManager(userOrRole)
}

export function canManageGuidelines(userOrRole) {
  return isBrandManager(userOrRole)
}

export function canWithdrawPassports(userOrRole) {
  return isBrandManager(userOrRole)
}

export function canReviewQueue(userOrRole) {
  return isReviewer(userOrRole)
}
