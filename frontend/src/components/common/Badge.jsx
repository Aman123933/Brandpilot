export function Badge({
  status,
  label = null,
  size = 'normal',
}) {
  const norm = (status || '').toLowerCase()
  let badgeClass = 'badge-muted'
  let text = label || status

  if (['valid', 'active', 'approved', 'compliant'].includes(norm)) {
    badgeClass = 'badge-olive'
  } else if (['review_required', 'in_review', 'changes_requested', 'draft', 'at_risk', 'expiring'].includes(norm)) {
    badgeClass = 'badge-amber'
  } else if (['rejected', 'withdrawn', 'high', 'expired', 'non_compliant'].includes(norm)) {
    badgeClass = 'badge-vermilion'
  } else if (['archived', 'medium', 'low', 'unknown'].includes(norm)) {
    badgeClass = 'badge-muted'
  }

  // Format label if not explicitly provided
  if (!label && status) {
    text = status.replace(/_/g, ' ')
    text = text.charAt(0).toUpperCase() + text.slice(1)
  }

  return (
    <span className={`status-badge ${badgeClass} ${size === 'small' ? 'badge-small' : ''}`}>
      {text}
    </span>
  )
}
