import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { guidelinesApi } from '../api/client'
import { SkeletonCard } from '../components/common/Skeleton'
import { EmptyState } from '../components/common/EmptyState'
import { Modal } from '../components/common/Modal'
import { Badge } from '../components/common/Badge'
import { useToast } from '../components/common/useToast'

export function GuidelinesPage() {
  const { isManager } = useAuth()
  const { addToast } = useToast()

  const [guidelines, setGuidelines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create Guideline Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [title, setTitle] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const data = await guidelinesApi.list()
        if (mounted) setGuidelines(Array.isArray(data) ? data : [])
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load guidelines.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => {
      mounted = false
    }
  }, [])

  async function refreshGuidelines() {
    try {
      const data = await guidelinesApi.list()
      setGuidelines(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Could not load guidelines.')
    }
  }

  async function handleCreateGuideline(e) {
    e.preventDefault()
    if (!title.trim()) return

    setCreating(true)
    try {
      await guidelinesApi.create({
        title: title.trim(),
        body: bodyText.trim(),
        rules: {
          banned_terms: [],
          required_phrases: [],
          claim_rules: [],
          tone_notes: [],
        },
      })
      addToast(`Guideline '${title}' created successfully.`, 'success')
      setShowCreateModal(false)
      setTitle('')
      setBodyText('')
      await refreshGuidelines()
    } catch (err) {
      addToast(err.message || 'Could not create guideline.', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">GOVERNANCE / STANDARDS</p>
          <h1 className="display-font">Brand Guidelines</h1>
          <p className="page-subtitle">
            Controlled brand rules and claim substantiation standards governed under Brand Git.
          </p>
        </div>

        {isManager && (
          <button
            type="button"
            className="action-button primary"
            onClick={() => setShowCreateModal(true)}
          >
            + New Guideline Set
          </button>
        )}
      </header>

      {error && <div className="alert-box alert-vermilion" role="alert">{error}</div>}

      {loading ? (
        <div className="cards-grid">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : guidelines.length === 0 ? (
        <EmptyState
          title="No guidelines created"
          description="Create your first guideline set to define banned terms, required phrases, and claim rules."
          actionText={isManager ? "Create Guideline" : null}
          onAction={isManager ? () => setShowCreateModal(true) : null}
        />
      ) : (
        <div className="guidelines-list">
          {guidelines.map(g => {
            const activeVer = g.versions?.find(v => v.status === 'active' || v.is_active) || g.versions?.[0] || {}

            return (
              <article key={g.id} className="guideline-card">
                <div className="guideline-card-main">
                  <div className="guideline-card-meta">
                    <span className="mono-font eyebrow">SET #{g.id}</span>
                    <Badge status="active" label={`v${activeVer.version || g.active_version || 1} Active`} />
                  </div>

                  <h2 className="guideline-card-title display-font">
                    <Link to={`/app/guidelines/${g.id}`}>{g.title}</Link>
                  </h2>

                  <p className="guideline-card-desc">
                    {activeVer.body || 'Approved brand voice and claim substantiation rules.'}
                  </p>

                  <div className="rules-summary-tags mono-font">
                    <span>{activeVer.rules_summary?.banned_terms || activeVer.rules?.banned_terms?.length || 0} Banned Terms</span>
                    <span>•</span>
                    <span>{activeVer.rules_summary?.required_phrases || activeVer.rules?.required_phrases?.length || 0} Required Phrases</span>
                    <span>•</span>
                    <span>{activeVer.rules_summary?.claim_rules || activeVer.rules?.claim_rules?.length || 0} Claim Rules</span>
                  </div>
                </div>

                <div className="guideline-card-actions">
                  <Link
                    to={`/app/guidelines/${g.id}`}
                    className="action-button primary"
                  >
                    Open Brand Git Desk →
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Create Guideline Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Guideline Set"
      >
        <form onSubmit={handleCreateGuideline} className="editorial-form">
          <div className="form-group">
            <label htmlFor="create-g-title">Guideline Title</label>
            <input
              id="create-g-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Kestrel Voice & Claims"
              required
              disabled={creating}
            />
          </div>

          <div className="form-group">
            <label htmlFor="create-g-body">Overview / Preamble</label>
            <textarea
              id="create-g-body"
              rows={4}
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              placeholder="Summary of this brand guideline and its scope across channels..."
              disabled={creating}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="action-button primary"
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create Guideline'}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  )
}
