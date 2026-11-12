import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { guidelinesApi } from '../api/client'
import { formatDate } from '../utils/formatters'
import { Badge } from '../components/common/Badge'
import { Modal } from '../components/common/Modal'
import { SkeletonCard, SkeletonTable } from '../components/common/Skeleton'
import { useToast } from '../components/common/useToast'

export function GuidelineDetailPage() {
  const { id } = useParams()
  const { isManager, currentUser } = useAuth()
  const { addToast } = useToast()

  const [guideline, setGuideline] = useState(null)
  const [versions, setVersions] = useState([])
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Diff state
  const [diffData, setDiffData] = useState(null)
  const [loadingDiff, setLoadingDiff] = useState(false)

  // Replay state
  const [replayData, setReplayData] = useState(null)
  const [runningReplay, setRunningReplay] = useState(false)

  // Create Draft Version Modal state
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [changeNote, setChangeNote] = useState('')
  const [newBannedTerm, setNewBannedTerm] = useState('')
  const [newBannedPreferred, setNewBannedPreferred] = useState('')
  const [newBannedWhy, setNewBannedWhy] = useState('')
  const [newBannedId, setNewBannedId] = useState('')
  const [creatingDraft, setCreatingDraft] = useState(false)

  // Activate Modal state
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [activateNote, setActivateNote] = useState('')
  const [activating, setActivating] = useState(false)

  // Reject Modal state
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const refreshData = useCallback(async () => {
    try {
      const [g, vers] = await Promise.all([
        guidelinesApi.get(id),
        guidelinesApi.listVersions(id),
      ])
      setGuideline(g)
      setVersions(vers)
      if (vers && vers.length > 0) {
        const found = vers.find(v => v.status === 'draft') || vers[0]
        const fullVer = g.versions?.find(v => v.version === found.version) || g.versions?.[0]
        setSelectedVersion(fullVer || null)
      }
    } catch (err) {
      setError(err.message || 'Could not load guideline details.')
    }
  }, [id])

  useEffect(() => {
    let mounted = true
    async function fetchGuideline() {
      setLoading(true)
      setError('')
      try {
        const [g, vers] = await Promise.all([
          guidelinesApi.get(id),
          guidelinesApi.listVersions(id),
        ])
        if (mounted) {
          setGuideline(g)
          setVersions(vers)
          if (vers && vers.length > 0) {
            const found = vers.find(v => v.status === 'draft') || vers[0]
            const fullVer = g.versions?.find(v => v.version === found.version) || g.versions?.[0]
            setSelectedVersion(fullVer || null)
          }
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load guideline details.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchGuideline()
    return () => {
      mounted = false
    }
  }, [id])

  // When selected version changes, fetch stored replay if exists and diff against active
  useEffect(() => {
    if (!guideline || !selectedVersion) return
    let mounted = true
    const activeVerNum = guideline.active_version || 1
    const currentVerNum = selectedVersion.version

    async function loadMeta() {
      if (selectedVersion.status === 'draft') {
        try {
          const replay = await guidelinesApi.getReplay(id, currentVerNum)
          if (mounted) setReplayData(replay)
        } catch {
          if (mounted) setReplayData(null)
        }
      } else {
        if (mounted) setReplayData(null)
      }

      if (currentVerNum !== activeVerNum) {
        setLoadingDiff(true)
        try {
          const diff = await guidelinesApi.getDiff(id, activeVerNum, currentVerNum)
          if (mounted) setDiffData(diff)
        } catch {
          if (mounted) setDiffData(null)
        } finally {
          if (mounted) setLoadingDiff(false)
        }
      } else {
        if (mounted) setDiffData(null)
      }
    }

    loadMeta()
    return () => {
      mounted = false
    }
  }, [guideline, selectedVersion, id])

  // Handle Run Replay
  async function handleRunReplay() {
    if (!selectedVersion) return
    setRunningReplay(true)
    try {
      const res = await guidelinesApi.runReplay(id, selectedVersion.version, 'approved')
      setReplayData(res)
      addToast(
        `Deterministic replay completed across ${res.assets_checked} assets. Newly non-compliant: ${res.summary.assets_newly_noncompliant}`,
        'info'
      )
      // Refresh version list to show latest_replay badge
      const vers = await guidelinesApi.listVersions(id)
      setVersions(vers)
    } catch (err) {
      addToast(err.message || 'Replay simulation failed.', 'error')
    } finally {
      setRunningReplay(false)
    }
  }

  // Handle Create Draft Version
  async function handleCreateDraft(e) {
    e.preventDefault()
    if (!selectedVersion) return

    setCreatingDraft(true)
    try {
      // Clone existing rules and append new banned term if provided
      const currentRules = JSON.parse(
        JSON.stringify(selectedVersion.rules || { banned_terms: [], required_phrases: [], claim_rules: [], tone_notes: [] })
      )

      if (newBannedTerm.trim()) {
        const nextId = newBannedId.trim() || `BT-00${(currentRules.banned_terms?.length || 0) + 1}`
        currentRules.banned_terms.push({
          id: nextId,
          term: newBannedTerm.trim(),
          preferred: newBannedPreferred.trim() || 'appropriate term',
          why: newBannedWhy.trim() || 'Brand voice alignment',
          owner_id: currentUser.id,
        })
      }

      await guidelinesApi.createVersion(id, {
        change_note: changeNote.trim() || 'Draft revision',
        rules: currentRules,
        body: selectedVersion.body,
        activate: false,
      })

      addToast('Draft guideline version created successfully in Brand Git.', 'success')
      setShowDraftModal(false)
      setChangeNote('')
      setNewBannedTerm('')
      setNewBannedPreferred('')
      setNewBannedWhy('')
      setNewBannedId('')
      await refreshData()
    } catch (err) {
      addToast(err.message || 'Could not create draft version.', 'error')
    } finally {
      setCreatingDraft(false)
    }
  }

  // Handle Activate Version
  async function handleActivateSubmit(e) {
    e.preventDefault()
    if (!selectedVersion) return

    setActivating(true)
    try {
      const res = await guidelinesApi.activate(id, selectedVersion.version, activateNote.trim())
      addToast(`Version v${res.version} is now ACTIVE. Previous version archived.`, 'success')
      setShowActivateModal(false)
      setActivateNote('')
      await refreshData()
    } catch (err) {
      addToast(err.message || 'Failed to activate version.', 'error')
    } finally {
      setActivating(false)
    }
  }

  // Handle Reject Version
  async function handleRejectSubmit(e) {
    e.preventDefault()
    if (!selectedVersion || !rejectNote.trim() || rejectNote.trim().length < 3) {
      addToast('A rejection note of at least 3 characters is required.', 'error')
      return
    }

    setRejecting(true)
    try {
      await guidelinesApi.reject(id, selectedVersion.version, rejectNote.trim())
      addToast(`Version v${selectedVersion.version} was rejected.`, 'info')
      setShowRejectModal(false)
      setRejectNote('')
      await refreshData()
    } catch (err) {
      addToast(err.message || 'Failed to reject version.', 'error')
    } finally {
      setRejecting(false)
    }
  }

  if (loading) {
    return (
      <main className="page-container">
        <SkeletonCard />
        <SkeletonTable rows={4} cols={4} />
      </main>
    )
  }

  if (error || !guideline) {
    return (
      <main className="page-container">
        <div className="alert-box alert-vermilion" role="alert">
          {error || 'Guideline not found.'}
        </div>
        <Link to="/app/guidelines" className="action-button secondary">
          ← Back to Guidelines
        </Link>
      </main>
    )
  }

  const activeVerNum = guideline.active_version || 1
  const isSelectedDraft = selectedVersion?.status === 'draft'
  const hasReplay = Boolean(replayData)

  return (
    <main className="page-container">
      {/* Header */}
      <header className="page-header">
        <div>
          <div className="breadcrumb-nav mono-font">
            <Link to="/app/guidelines">GUIDELINES</Link> / <span>BRAND GIT #{guideline.id}</span>
          </div>
          <h1 className="display-font">{guideline.title}</h1>
          <p className="page-subtitle">
            Semantic rule versioning, diff comparisons, and deterministic asset replay.
          </p>
        </div>

        <div className="header-actions">
          {isManager && (
            <button
              type="button"
              className="action-button primary"
              onClick={() => setShowDraftModal(true)}
            >
              + Create Draft Version
            </button>
          )}
        </div>
      </header>

      {/* Brand Git Workspace Grid */}
      <div className="brand-git-layout">
        {/* Left Column: Version Timeline */}
        <aside className="timeline-sidebar" aria-label="Version Timeline">
          <h2 className="timeline-header display-font">Version History</h2>

          <div className="version-timeline-list">
            {versions.map(v => {
              const isSelected = selectedVersion?.version === v.version
              const isActive = v.status === 'active' || v.version === activeVerNum

              return (
                <button
                  key={v.id || v.version}
                  type="button"
                  className={`version-card-btn ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    const full = guideline.versions?.find(gv => gv.version === v.version)
                    setSelectedVersion(full || v)
                  }}
                >
                  <div className="version-card-top">
                    <span className="mono-font version-tag">v{v.version}</span>
                    <Badge status={v.status} />
                  </div>

                  <p className="version-change-note">
                    {v.change_note || (isActive ? 'Active baseline version' : 'Draft revision')}
                  </p>

                  <div className="version-card-meta mono-font">
                    <span>{v.created_by?.name || 'Manager'}</span>
                    <span>{formatDate(v.created_at)}</span>
                  </div>

                  {v.latest_replay && (
                    <div className="version-replay-badge mono-font">
                      Replay: {v.latest_replay.assets_newly_noncompliant} flagged
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        {/* Right Main Column: Inspection, Diff, Replay & Rule List */}
        <section className="version-detail-main">
          {/* Version Header Banner */}
          <div className="version-banner">
            <div>
              <div className="version-banner-meta mono-font">
                INSPECTING VERSION {selectedVersion?.version} • STATUS: {selectedVersion?.status?.toUpperCase()}
              </div>
              <h2 className="display-font" style={{ fontSize: '22px', margin: '4px 0' }}>
                {selectedVersion?.change_note || 'Active Production Rules'}
              </h2>
              <p className="version-meta-author mono-font">
                Authored by {selectedVersion?.created_by?.name || 'Maya Lin'} • {formatDate(selectedVersion?.created_at)}
              </p>
            </div>

            {/* Governance Actions for Draft Versions */}
            {isManager && isSelectedDraft && (
              <div className="version-actions-bar">
                <button
                  type="button"
                  className="action-button secondary small"
                  onClick={handleRunReplay}
                  disabled={runningReplay}
                >
                  {runningReplay ? 'Running Replay...' : '▶ Run Asset Replay'}
                </button>

                <button
                  type="button"
                  className="action-button primary small"
                  onClick={() => setShowActivateModal(true)}
                  disabled={!hasReplay}
                  title={!hasReplay ? 'Run an asset replay before activating this version' : ''}
                >
                  Activate Version
                </button>

                <button
                  type="button"
                  className="action-button danger small"
                  onClick={() => setShowRejectModal(true)}
                >
                  Reject
                </button>
              </div>
            )}
          </div>

          {/* Semantic Diff Section (shown if inspecting draft against active) */}
          {selectedVersion?.version !== activeVerNum && (
            <div className="brand-git-section" aria-labelledby="diff-section-title">
              <div className="section-header-row">
                <h3 id="diff-section-title" className="display-font">
                  Semantic Diff vs Active (v{activeVerNum} → v{selectedVersion?.version})
                </h3>
                {diffData?.summary && (
                  <div className="diff-summary-pills mono-font">
                    <span className="pill-added">+{diffData.summary.added} added</span>
                    <span className="pill-removed">-{diffData.summary.removed} removed</span>
                    <span className="pill-changed">~{diffData.summary.changed} changed</span>
                  </div>
                )}
              </div>

              {loadingDiff ? (
                <p className="mono-font">Computing rule differences...</p>
              ) : diffData?.changes?.length > 0 ? (
                <div className="diff-changes-list">
                  {diffData.changes.map((change, i) => (
                    <div key={i} className={`diff-change-item diff-${change.kind}`}>
                      <div className="diff-item-header mono-font">
                        <span className={`diff-kind-badge kind-${change.kind}`}>
                          {change.kind.toUpperCase()}
                        </span>
                        <span className="diff-section-name">[{change.section}]</span>
                        {change.rule_id && <strong className="diff-rule-id">{change.rule_id}</strong>}
                      </div>

                      <div className="diff-item-body">
                        {change.before && (
                          <div className="diff-line diff-before">
                            <span className="diff-sign">-</span>
                            <span className="diff-text">
                              {typeof change.before === 'object'
                                ? `"${change.before.term}" → preferred: "${change.before.preferred}" (${change.before.why})`
                                : String(change.before)}
                            </span>
                          </div>
                        )}
                        {change.after && (
                          <div className="diff-line diff-after">
                            <span className="diff-sign">+</span>
                            <span className="diff-text">
                              {typeof change.after === 'object'
                                ? `"${change.after.term}" → preferred: "${change.after.preferred}" (${change.after.why})`
                                : String(change.after)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="card-empty mono-font">No rule modifications found between these two versions.</p>
              )}
            </div>
          )}

          {/* Replay Simulation Results Table */}
          {isSelectedDraft && (
            <div className="brand-git-section" aria-labelledby="replay-section-title">
              <div className="section-header-row">
                <h3 id="replay-section-title" className="display-font">
                  Deterministic Replay Results
                </h3>
                {replayData && (
                  <span className="mono-font" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Ran at: {formatDate(replayData.ran_at)} ({replayData.scope} scope)
                  </span>
                )}
              </div>

              {!replayData ? (
                <div className="replay-empty-notice">
                  <p>
                    Replay evaluates all approved historical assets against this proposed version to detect newly flagged violations before publication.
                  </p>
                  <button
                    type="button"
                    className="action-button primary small"
                    onClick={handleRunReplay}
                    disabled={runningReplay}
                  >
                    {runningReplay ? 'Running Replay...' : 'Run Replay Now'}
                  </button>
                </div>
              ) : (
                <div className="replay-results-card">
                  {/* Replay Summary Pills */}
                  <div className="replay-stats-grid">
                    <div className="replay-stat-pill">
                      <span>ASSETS CHECKED</span>
                      <strong>{replayData.assets_checked}</strong>
                    </div>
                    <div className="replay-stat-pill">
                      <span>NEWLY FLAGGED</span>
                      <strong style={{ color: replayData.summary.assets_newly_noncompliant > 0 ? 'var(--vermilion)' : 'inherit' }}>
                        {replayData.summary.assets_newly_noncompliant}
                      </strong>
                    </div>
                    <div className="replay-stat-pill">
                      <span>NEWLY CLEARED</span>
                      <strong style={{ color: 'var(--olive)' }}>
                        {replayData.summary.assets_newly_compliant}
                      </strong>
                    </div>
                  </div>

                  {/* Newly Flagged Assets Table */}
                  {replayData.newly_flagged && replayData.newly_flagged.length > 0 ? (
                    <div style={{ marginTop: '16px' }}>
                      <h4 className="mono-font" style={{ fontSize: '12px', marginBottom: '8px', color: 'var(--vermilion)' }}>
                        NEWLY NON-COMPLIANT ASSETS ({replayData.newly_flagged.length})
                      </h4>
                      <table className="editorial-table replay-table" aria-label="Newly Flagged Assets">
                        <thead>
                          <tr>
                            <th scope="col">Asset Title</th>
                            <th scope="col">Passport</th>
                            <th scope="col">Rule Triggered</th>
                            <th scope="col">Flagged Quote</th>
                            <th scope="col">Severity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {replayData.newly_flagged.map((item, idx) => (
                            <tr key={idx}>
                              <td>
                                <Link to={`/app/assets/${item.asset_id}`} className="item-title-link">
                                  <strong>{item.title}</strong>
                                </Link>
                              </td>
                              <td className="mono-font">{item.passport_code || '—'}</td>
                              <td className="mono-font">{item.rule_id}</td>
                              <td><mark className="quote-mark">{item.quote}</mark></td>
                              <td><Badge status={item.severity} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="clean-replay-text mono-font">
                      ✓ Zero approved assets newly flagged under this proposed draft.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Structured Rules List */}
          <div className="brand-git-section" aria-labelledby="rules-list-title">
            <h3 id="rules-list-title" className="display-font">
              Rules Defined in v{selectedVersion?.version}
            </h3>

            {/* Banned Terms */}
            <div className="rule-group">
              <h4 className="rule-group-title mono-font">BANNED TERMS ({selectedVersion?.rules?.banned_terms?.length || 0})</h4>
              <table className="editorial-table" aria-label="Banned Terms Table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Banned Term</th>
                    <th scope="col">Preferred Replacement</th>
                    <th scope="col">Governance Rationale (Why)</th>
                    <th scope="col">Rule Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedVersion?.rules?.banned_terms?.map(rule => (
                    <tr key={rule.id}>
                      <td className="mono-font"><strong>{rule.id}</strong></td>
                      <td><span className="banned-term-tag">{rule.term}</span></td>
                      <td><em>{rule.preferred}</em></td>
                      <td className="source-note-cell">{rule.why}</td>
                      <td className="mono-font" style={{ fontSize: '11px' }}>
                        User #{rule.owner_id || 1}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Required Phrases */}
            {selectedVersion?.rules?.required_phrases?.length > 0 && (
              <div className="rule-group" style={{ marginTop: '24px' }}>
                <h4 className="rule-group-title mono-font">REQUIRED PHRASES</h4>
                <table className="editorial-table" aria-label="Required Phrases">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Required Phrase</th>
                      <th scope="col">Why</th>
                      <th scope="col">Rule Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVersion.rules.required_phrases.map(rp => (
                      <tr key={rp.id}>
                        <td className="mono-font"><strong>{rp.id}</strong></td>
                        <td><strong>{rp.phrase}</strong></td>
                        <td className="source-note-cell">{rp.why}</td>
                        <td className="mono-font">User #{rp.owner_id || 1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Claim Rules */}
            {selectedVersion?.rules?.claim_rules?.length > 0 && (
              <div className="rule-group" style={{ marginTop: '24px' }}>
                <h4 className="rule-group-title mono-font">CLAIM SUBSTANTIATION RULES</h4>
                <table className="editorial-table" aria-label="Claim Rules">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Claim Pattern</th>
                      <th scope="col">Required Fact Ground-Truth</th>
                      <th scope="col">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVersion.rules.claim_rules.map(cr => (
                      <tr key={cr.id}>
                        <td className="mono-font"><strong>{cr.id}</strong></td>
                        <td><code>{cr.pattern}</code></td>
                        <td className="mono-font">{cr.requires_fact_key || 'External Source Citation'}</td>
                        <td className="source-note-cell">{cr.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Create Draft Version Modal */}
      <Modal
        isOpen={showDraftModal}
        onClose={() => setShowDraftModal(false)}
        title="Create New Draft Guideline Version"
      >
        <form onSubmit={handleCreateDraft} className="editorial-form">
          <div className="form-group">
            <label htmlFor="draft-note">Change Note / Commit Message</label>
            <input
              id="draft-note"
              type="text"
              value={changeNote}
              onChange={e => setChangeNote(e.target.value)}
              placeholder="e.g. Ban 'unrivaled' and require lab citation for superiority"
              required
              disabled={creatingDraft}
            />
          </div>

          <div className="form-divider-title mono-font">ADD A NEW BANNED TERM TO THIS DRAFT</div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="banned-id">Rule ID</label>
              <input
                id="banned-id"
                type="text"
                value={newBannedId}
                onChange={e => setNewBannedId(e.target.value)}
                placeholder="e.g. BT-004"
                disabled={creatingDraft}
              />
            </div>
            <div className="form-group flex-2">
              <label htmlFor="banned-term">Banned Term / Phrase</label>
              <input
                id="banned-term"
                type="text"
                value={newBannedTerm}
                onChange={e => setNewBannedTerm(e.target.value)}
                placeholder="e.g. unrivaled"
                disabled={creatingDraft}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="banned-preferred">Preferred Alternative</label>
            <input
              id="banned-preferred"
              type="text"
              value={newBannedPreferred}
              onChange={e => setNewBannedPreferred(e.target.value)}
              placeholder="e.g. high-performing"
              disabled={creatingDraft}
            />
          </div>

          <div className="form-group">
            <label htmlFor="banned-why">Governance Reason (Why)</label>
            <input
              id="banned-why"
              type="text"
              value={newBannedWhy}
              onChange={e => setNewBannedWhy(e.target.value)}
              placeholder="e.g. Attracts regulatory challenge without comparative benchmark data"
              disabled={creatingDraft}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => setShowDraftModal(false)}
              disabled={creatingDraft}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="action-button primary"
              disabled={creatingDraft}
            >
              {creatingDraft ? 'Saving Draft...' : 'Create Draft in Brand Git'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Activate Modal */}
      <Modal
        isOpen={showActivateModal}
        onClose={() => setShowActivateModal(false)}
        title={`Activate Guideline Version v${selectedVersion?.version}`}
      >
        <form onSubmit={handleActivateSubmit} className="editorial-form">
          <p>
            Activating this version will promote it to the canonical active rule set.
            The current active version (v{activeVerNum}) will be archived.
          </p>

          <div className="form-group">
            <label htmlFor="activate-note">Activation Note (optional)</label>
            <input
              id="activate-note"
              type="text"
              value={activateNote}
              onChange={e => setActivateNote(e.target.value)}
              placeholder="e.g. Approved by legal counsel following Q4 review"
              disabled={activating}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => setShowActivateModal(false)}
              disabled={activating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="action-button primary"
              disabled={activating}
            >
              {activating ? 'Activating...' : 'Confirm Activation'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title={`Reject Guideline Version v${selectedVersion?.version}`}
      >
        <form onSubmit={handleRejectSubmit} className="editorial-form">
          <p className="reject-warning">
            Rejecting this draft version marks it as rejected and closes the proposal.
          </p>

          <div className="form-group">
            <label htmlFor="reject-note">Rejection Note (required, min 3 chars)</label>
            <textarea
              id="reject-note"
              rows={3}
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="State the reason for rejecting this guideline version..."
              required
              disabled={rejecting}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => setShowRejectModal(false)}
              disabled={rejecting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="action-button danger"
              disabled={rejecting}
            >
              {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  )
}
