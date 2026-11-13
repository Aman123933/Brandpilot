export function EmptyState({
  title = 'No items found',
  description = 'There are currently no items to display in this view.',
  actionText = null,
  onAction = null,
  actionHref = null,
}) {
  return (
    <div className="empty-state-box">
      <div className="empty-state-mark">○</div>
      <h3 className="empty-state-title display-font">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {(actionText && (onAction || actionHref)) && (
        <div style={{ marginTop: '16px' }}>
          {actionHref ? (
            <a href={actionHref} className="action-button primary">
              {actionText}
            </a>
          ) : (
            <button
              type="button"
              className="action-button primary"
              onClick={onAction}
            >
              {actionText}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
