import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth'
import { factsApi, adminApi } from '../api/client'
import { formatFactValue, formatDate, formatExpiryBadge } from '../utils/formatters'
import { SkeletonTable } from '../components/common/Skeleton'
import { EmptyState } from '../components/common/EmptyState'
import { Modal } from '../components/common/Modal'
import { Badge } from '../components/common/Badge'
import { useToast } from '../components/common/useToast'

export function FactsPage() {
  const { isManager } = useAuth()
  const { addToast } = useToast()

  const [facts, setFacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Manager Expiry Status Panel state
  const [expiryStatus, setExpiryStatus] = useState(null)
  const [runningExpiry, setRunningExpiry] = useState(false)

  // Add Fact Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addKey, setAddKey] = useState('')
  const [addValue, setAddValue] = useState('')
  const [addUnit, setAddUnit] = useState('')
  const [addValidUntil, setAddValidUntil] = useState('')
  const [addSource, setAddSource] = useState('')
  const [addingFact, setAddingFact] = useState(false)

  // Update Fact Modal state (with Impact Preview)
  const [selectedFactForUpdate, setSelectedFactForUpdate] = useState(null)
  const [updateValue, setUpdateValue] = useState('')
  const [updateUnit, setUpdateUnit] = useState('')
  const [updateValidUntil, setUpdateValidUntil] = useState('')
  const [updateSource, setUpdateSource] = useState('')
  const [impactData, setImpactData] = useState(null)
  const [loadingImpact, setLoadingImpact] = useState(false)
  const [updatingFact, setUpdatingFact] = useState(false)

  // Version History Modal state
  const [selectedFactHistory, setSelectedFactHistory] = useState(null)

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const data = await factsApi.list()
        if (mounted) setFacts(Array.isArray(data) ? data : [])
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load brand facts.')
      } finally {
        if (mounted) setLoading(false)
      }

      if (isManager) {
        try {
          const exp = await adminApi.getExpiryStatus()
          if (mounted) setExpiryStatus(exp)
        } catch {
          // quiet fallback
        }
      }
    }
    init()
    return () => {
      mounted = false
    }
  }, [isManager])

  async function refreshFacts() {
    try {
      const data = await factsApi.list()
      setFacts(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Could not load brand facts.')
    }
  }

  async function refreshExpiryStatus() {
    try {
      const data = await adminApi.getExpiryStatus()
      setExpiryStatus(data)
    } catch {
      // quiet fallback
    }
  }

  // Handle Add Fact
  async function handleAddFactSubmit(e) {
    e.preventDefault()
    if (!addKey.trim() || !addValue.trim()) return

    setAddingFact(true)
    try {
      await factsApi.create({
        key: addKey.trim(),
        value: addValue.trim(),
        unit: addUnit.trim(),
        valid_until: addValidUntil ? new Date(addValidUntil).toISOString() : null,
        source_note: addSource.trim(),
      })
      addToast(`Brand fact '${addKey}' created successfully.`, 'success')
      setShowAddModal(false)
      setAddKey('')
      setAddValue('')
      setAddUnit('')
      setAddValidUntil('')
      setAddSource('')
      await refreshFacts()
    } catch (err) {
      addToast(err.message || 'Failed to create fact.', 'error')
    } finally {
      setAddingFact(false)
    }
  }

  // Open Update Modal and fetch Impact Preview
  async function openUpdateModal(fact) {
    setSelectedFactForUpdate(fact)
    setUpdateValue(fact.current_version?.value || '')
    setUpdateUnit(fact.current_version?.unit || '')
    setUpdateValidUntil(
      fact.current_version?.valid_until
        ? fact.current_version.valid_until.slice(0, 10)
        : ''
    )
    setUpdateSource('')
    setImpactData(null)
    setLoadingImpact(true)

    try {
      const impact = await factsApi.getImpact(fact.id)
      setImpactData(impact)
    } catch {
      setImpactData({ affected_assets: [] })
    } finally {
      setLoadingImpact(false)
    }
  }

  // Handle Confirm Update Fact
  async function handleUpdateFactSubmit(e) {
    e.preventDefault()
    if (!selectedFactForUpdate || !updateValue.trim()) return

    setUpdatingFact(true)
    try {
      await factsApi.createVersion(selectedFactForUpdate.id, {
        value: updateValue.trim(),
        unit: updateUnit.trim(),
        valid_until: updateValidUntil ? new Date(updateValidUntil).toISOString() : null,
        source_note: updateSource.trim(),
      })
      addToast(
        `Fact '${selectedFactForUpdate.key}' updated. Affected passports flipped to Review Required.`,
        'success'
      )
      setSelectedFactForUpdate(null)
      await refreshFacts()
      if (isManager) refreshExpiryStatus()
    } catch (err) {
      addToast(err.message || 'Failed to update fact version.', 'error')
    } finally {
      setUpdatingFact(false)
    }
  }

  // Handle Manual Expiry Check
  async function handleRunExpiryCheck() {
    setRunningExpiry(true)
    try {
      const res = await adminApi.runExpiryCheck()
      addToast(
        `Expiry audit complete. Recalled / affected assets: ${res.affected_assets_count}`,
        'info'
      )
      await refreshFacts()
      await refreshExpiryStatus()
    } catch (err) {
      addToast(err.message || 'Could not run expiry audit.', 'error')
    } finally {
      setRunningExpiry(false)
    }
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">GOVERNANCE / GROUND TRUTH</p>
          <h1 className="display-font">Brand Facts</h1>
          <p className="page-subtitle">
            Canonical, living product ground-truth. Changing a fact automatically triggers revalidation across all dependent passports.
          </p>
        </div>

        {isManager && (
          <button
            type="button"
            className="action-button primary"
            onClick={() => setShowAddModal(true)}
          >
            + Add New Fact
          </button>
        )}
      </header>

      {error && <div className="alert-box alert-vermilion" role="alert">{error}</div>}

      {/* Brand Manager Expiry Management Panel */}
      {isManager && expiryStatus && (
        <section className="admin-panel" aria-labelledby="expiry-panel-title">
          <div className="admin-panel-header">
            <div>
              <span className="mono-font eyebrow">SCHEDULED AUTOMATION</span>
              <h2 id="expiry-panel-title" className="admin-panel-title display-font">
                Fact Expiry & Recall Status
              </h2>
            </div>
            <button
              type="button"
              className="action-button secondary small"
              onClick={handleRunExpiryCheck}
              disabled={runningExpiry}
            >
              {runningExpiry ? 'Auditing claims...' : 'Run expiry check now'}
            </button>
          </div>

          <div className="admin-meta-row mono-font">
            <span>Last checked: {formatDate(expiryStatus.last_run_at)} ({expiryStatus.last_run_source || 'system'})</span>
            <span>Interval: {expiryStatus.interval_minutes}m</span>
          </div>

          {expiryStatus.upcoming && expiryStatus.upcoming.length > 0 ? (
            <div className="upcoming-expiry-list">
              <strong className="mono-font" style={{ fontSize: '11px', display: 'block', marginBottom: '8px' }}>
                EXPIRING WITHIN 14 DAYS:
              </strong>
              <div className="upcoming-grid">
                {expiryStatus.upcoming.map((u, i) => (
                  <div key={i} className="upcoming-chip">
                    <span className="upcoming-key mono-font">{u.key}</span>
                    <span className={`upcoming-days ${u.days_left <= 3 ? 'urgent' : ''}`}>
                      {u.days_left < 0 ? 'Expired' : `${u.days_left}d left`}
                    </span>
                    <span className="upcoming-assets mono-font">({u.linked_assets} assets)</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="clean-expiry-msg mono-font">No fact claims are expiring in the next 14 days.</p>
          )}
        </section>
      )}

      {/* Facts Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : facts.length === 0 ? (
        <EmptyState
          title="No brand facts recorded"
          description="Create your first approved product spec, price, or policy fact to seed the ground truth."
          actionText={isManager ? "Add Brand Fact" : null}
          onAction={isManager ? () => setShowAddModal(true) : null}
        />
      ) : (
        <div className="table-responsive">
          <table className="editorial-table" aria-label="Brand Facts Table">
            <thead>
              <tr>
                <th scope="col">Fact Key</th>
                <th scope="col">Current Value</th>
                <th scope="col">Validity / Expiry</th>
                <th scope="col">Source Note</th>
                <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {facts.map(fact => {
                const curVer = fact.current_version || {}
                const expiry = formatExpiryBadge(curVer.valid_until)

                return (
                  <tr key={fact.id}>
                    <td>
                      <strong className="mono-font">{fact.key}</strong>
                      <span className="fact-version-sub mono-font">v{curVer.version || 1}</span>
                    </td>
                    <td>
                      <span className="fact-formatted-value">
                        {formatFactValue(curVer)}
                      </span>
                    </td>
                    <td>
                      <Badge
                        status={expiry.status}
                        label={expiry.label}
                        size="small"
                      />
                    </td>
                    <td className="source-note-cell">
                      {curVer.source_note || '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="text-button mono-font"
                        onClick={() => setSelectedFactHistory(fact)}
                        style={{ marginRight: '10px' }}
                      >
                        History ({fact.versions?.length || 1})
                      </button>
                      {isManager && (
                        <button
                          type="button"
                          className="action-button secondary small"
                          onClick={() => openUpdateModal(fact)}
                        >
                          Update
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Fact Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Brand Fact"
      >
        <form onSubmit={handleAddFactSubmit} className="editorial-form">
          <div className="form-group">
            <label htmlFor="add-key">Fact Key (identifier)</label>
            <input
              id="add-key"
              type="text"
              value={addKey}
              onChange={e => setAddKey(e.target.value)}
              placeholder="e.g. bluetooth_version"
              required
              disabled={addingFact}
            />
          </div>

          <div className="form-row">
            <div className="form-group flex-2">
              <label htmlFor="add-value">Approved Value</label>
              <input
                id="add-value"
                type="text"
                value={addValue}
                onChange={e => setAddValue(e.target.value)}
                placeholder="e.g. 5.3"
                required
                disabled={addingFact}
              />
            </div>
            <div className="form-group flex-1">
              <label htmlFor="add-unit">Unit (optional)</label>
              <input
                id="add-unit"
                type="text"
                value={addUnit}
                onChange={e => setAddUnit(e.target.value)}
                placeholder="e.g. dB, USD, hours"
                disabled={addingFact}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="add-valid-until">Valid Until (optional expiry date)</label>
            <input
              id="add-valid-until"
              type="date"
              value={addValidUntil}
              onChange={e => setAddValidUntil(e.target.value)}
              disabled={addingFact}
            />
          </div>

          <div className="form-group">
            <label htmlFor="add-source">Source Reference / Citation Note</label>
            <input
              id="add-source"
              type="text"
              value={addSource}
              onChange={e => setAddSource(e.target.value)}
              placeholder="e.g. Acoustic Lab Spec Sheet v2.1"
              disabled={addingFact}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => setShowAddModal(false)}
              disabled={addingFact}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="action-button primary"
              disabled={addingFact}
            >
              {addingFact ? 'Saving Fact...' : 'Create Brand Fact'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Update Fact Modal with Impact Preview */}
      <Modal
        isOpen={Boolean(selectedFactForUpdate)}
        onClose={() => setSelectedFactForUpdate(null)}
        title={`Update Fact: ${selectedFactForUpdate?.key}`}
      >
        <form onSubmit={handleUpdateFactSubmit} className="editorial-form">
          {/* Impact Preview Section */}
          <div className="impact-preview-box">
            <h4 className="impact-title display-font">Pre-Flight Impact Preview</h4>
            {loadingImpact ? (
              <p className="mono-font impact-loading">Auditing dependent passports...</p>
            ) : impactData?.affected_assets?.length > 0 ? (
              <div>
                <p className="impact-warning">
                  Updating this fact will automatically flip{' '}
                  <strong>{impactData.affected_assets.length} approved passport(s)</strong> to{' '}
                  <span className="impact-badge">Review Required</span>.
                </p>
                <ul className="impact-asset-list">
                  {impactData.affected_assets.map(a => (
                    <li key={a.asset_id} className="impact-asset-item">
                      <span className="mono-font">{a.passport_code}</span>
                      <strong>{a.title}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="impact-clean mono-font">
                No active approved passports depend on this fact version. Update is zero-blast-radius.
              </p>
            )}
          </div>

          <div className="form-row">
            <div className="form-group flex-2">
              <label htmlFor="update-value">New Approved Value</label>
              <input
                id="update-value"
                type="text"
                value={updateValue}
                onChange={e => setUpdateValue(e.target.value)}
                required
                disabled={updatingFact}
              />
            </div>
            <div className="form-group flex-1">
              <label htmlFor="update-unit">Unit</label>
              <input
                id="update-unit"
                type="text"
                value={updateUnit}
                onChange={e => setUpdateUnit(e.target.value)}
                placeholder="e.g. dB"
                disabled={updatingFact}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="update-valid-until">New Expiry Date (optional)</label>
            <input
              id="update-valid-until"
              type="date"
              value={updateValidUntil}
              onChange={e => setUpdateValidUntil(e.target.value)}
              disabled={updatingFact}
            />
          </div>

          <div className="form-group">
            <label htmlFor="update-source">Change Reason / Source Note</label>
            <input
              id="update-source"
              type="text"
              value={updateSource}
              onChange={e => setUpdateSource(e.target.value)}
              placeholder="e.g. Extended policy by Executive Board resolution"
              disabled={updatingFact}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => setSelectedFactForUpdate(null)}
              disabled={updatingFact}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="action-button primary"
              disabled={updatingFact}
            >
              {updatingFact ? 'Publishing Version...' : 'Confirm & Publish New Version'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Version History Modal */}
      <Modal
        isOpen={Boolean(selectedFactHistory)}
        onClose={() => setSelectedFactHistory(null)}
        title={`Version History: ${selectedFactHistory?.key}`}
        maxWidth="640px"
      >
        <div className="history-modal-content">
          <p className="history-subtitle">
            Complete audit trail for all published revisions of this fact.
          </p>

          <table className="editorial-table history-table" aria-label="Version History">
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Value</th>
                <th scope="col">Effective</th>
                <th scope="col">Source Note</th>
              </tr>
            </thead>
            <tbody>
              {selectedFactHistory?.versions?.map(v => (
                <tr key={v.id} className={v.is_current ? 'current-version-row' : ''}>
                  <td>
                    <strong className="mono-font">v{v.version}</strong>
                    {v.is_current && <span className="current-indicator mono-font">CURRENT</span>}
                  </td>
                  <td>{formatFactValue(v)}</td>
                  <td className="mono-font" style={{ fontSize: '11px' }}>
                    {formatDate(v.valid_from)}
                  </td>
                  <td className="source-note-cell">{v.source_note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </main>
  )
}
