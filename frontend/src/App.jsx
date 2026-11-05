
import { useEffect, useState } from 'react'
import { apiRequest, demoLogin, getDemoUsers } from './api'
import './App.css'

const roleLabels = {
  brand_manager: 'Brand Manager',
  creator: 'Content Creator',
  reviewer: 'Reviewer',
}

function App() {
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState('')
  const [notifications, setNotifications] = useState([])

  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('brandpilot_user')
    return savedUser ? JSON.parse(savedUser) : null
  })

  const [facts, setFacts] = useState([])
  const [guidelines, setGuidelines] = useState([])
  const [assets, setAssets] = useState([])
  const [loadingDashboard, setLoadingDashboard] = useState(false)

  const [showFactForm, setShowFactForm] = useState(false)
  const [factKey, setFactKey] = useState('')
  const [factValue, setFactValue] = useState('')
  const [factUnit, setFactUnit] = useState('')
  const [factSource, setFactSource] = useState('')
  const [savingFact, setSavingFact] = useState(false)
  const [factMessage, setFactMessage] = useState('')

  const [showVersionForm, setShowVersionForm] = useState(false)
  const [selectedFact, setSelectedFact] = useState(null)
  const [versionValue, setVersionValue] = useState('')
  const [versionUnit, setVersionUnit] = useState('')
  const [versionSource, setVersionSource] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)

  // Brand Audit states
  const [auditMessage, setAuditMessage] = useState('')
  const [auditingAsset, setAuditingAsset] = useState(null)
  const [auditFindings, setAuditFindings] = useState({})

  // Brand Red Team states
  const [redTeamMessage, setRedTeamMessage] = useState('')
  const [redTeamingAsset, setRedTeamingAsset] = useState(null)
  const [redTeamResults, setRedTeamResults] = useState({})

  // Review workflow states
  const [reviewQueue, setReviewQueue] = useState([])
  const [loadingReviewQueue, setLoadingReviewQueue] = useState(false)
  const [reviewMessage, setReviewMessage] = useState('')
  const [submittingAsset, setSubmittingAsset] = useState(null)
  const [submitResults, setSubmitResults] = useState({})
  const [decisionInputs, setDecisionInputs] = useState({})
  const [decidingAsset, setDecidingAsset] = useState(null)
  const [decisionResults, setDecisionResults] = useState({})

  useEffect(() => {
    async function loadUsers() {
      try {
        const data = await getDemoUsers()
        setUsers(data)

        if (data.length > 0) {
          setSelectedUser(String(data[0].id))
        }
      } catch (err) {
        setError(err.message || 'Could not connect to BrandPilot.')
      } finally {
        setLoadingUsers(false)
      }
    }

    if (!currentUser) loadUsers()
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return

    async function loadDashboard() {
      setLoadingDashboard(true)
      setLoadingReviewQueue(currentUser.role === 'reviewer')
      setError('')

      try {
        const results = await Promise.all([
          apiRequest('/facts'),
          apiRequest('/guidelines'),
          apiRequest('/assets'),
          apiRequest('/notifications'),
          currentUser.role === 'reviewer'
            ? apiRequest('/reviews/queue')
            : Promise.resolve([]),
        ])

        setFacts(results[0])
        setGuidelines(results[1])
        setAssets(results[2])
        setNotifications(results[3])
        if (currentUser.role === 'reviewer') {
          setReviewQueue(results[4])
        }
      } catch (err) {
        setError(err.message || 'Could not load dashboard data.')
      } finally {
        setLoadingDashboard(false)
        setLoadingReviewQueue(false)
      }
    }

    loadDashboard()
  }, [currentUser])

  async function handleLogin(event) {
    event.preventDefault()
    if (!selectedUser) return

    setLoggingIn(true)
    setError('')

    try {
      const result = await demoLogin(Number(selectedUser))

      localStorage.setItem('brandpilot_token', result.access_token)
      localStorage.setItem('brandpilot_user', JSON.stringify(result.user))

      setCurrentUser(result.user)
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoggingIn(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('brandpilot_token')
    localStorage.removeItem('brandpilot_user')

    setCurrentUser(null)
    setFacts([])
    setGuidelines([])
    setAssets([])
    setNotifications([])

    setAuditFindings({})
    setAuditMessage('')

    setRedTeamResults({})
    setRedTeamMessage('')

    setReviewQueue([])
    setReviewMessage('')
    setSubmitResults({})
    setDecisionInputs({})
    setDecisionResults({})

    setError('')
  }

  async function handleAddFact(event) {
    event.preventDefault()
    setSavingFact(true)
    setFactMessage('')

    try {
      await apiRequest('/facts', {
        method: 'POST',
        body: JSON.stringify({
          key: factKey,
          value: factValue,
          unit: factUnit,
          source_note: factSource,
        }),
      })

      const updatedFacts = await apiRequest('/facts')
      setFacts(updatedFacts)

      setFactKey('')
      setFactValue('')
      setFactUnit('')
      setFactSource('')
      setShowFactForm(false)
      setFactMessage('New brand fact added successfully.')
    } catch (err) {
      setFactMessage(err.message || 'Could not add the fact.')
    } finally {
      setSavingFact(false)
    }
  }

  async function handleUpdateVersion(event) {
    event.preventDefault()
    if (!selectedFact) return

    setSavingVersion(true)
    setFactMessage('')

    try {
      await apiRequest(`/facts/${selectedFact.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          value: versionValue,
          unit: versionUnit,
          source_note: versionSource,
        }),
      })

      const updatedFacts = await apiRequest('/facts')
      setFacts(updatedFacts)

      setShowVersionForm(false)
      setSelectedFact(null)
      setVersionValue('')
      setVersionUnit('')
      setVersionSource('')
      setFactMessage('New fact version created successfully.')
    } catch (err) {
      setFactMessage(err.message || 'Could not update fact version.')
    } finally {
      setSavingVersion(false)
    }
  }

  // Run Brand Audit
  async function handleAudit(assetId) {
    setAuditingAsset(assetId)
    setAuditMessage('')

    try {
      await apiRequest(`/assets/${assetId}/audit`, {
        method: 'POST',
      })

      const updatedAssets = await apiRequest('/assets')
      const findings = await apiRequest(`/assets/${assetId}/findings`)

      setAuditFindings(prev => ({
        ...prev,
        [assetId]: findings,
      }))

      setAssets(updatedAssets)
      setAuditMessage(`Audit completed for asset ${assetId}.`)
    } catch (err) {
      setAuditMessage(err.message || 'Audit could not be completed.')
    } finally {
      setAuditingAsset(null)
    }
  }

  // Run Brand Red Team
  async function handleRedTeam(assetId) {
    setRedTeamingAsset(assetId)
    setRedTeamMessage('')

    try {
      const result = await apiRequest(`/assets/${assetId}/redteam`, {
        method: 'POST',
      })

      setRedTeamResults(prev => ({
        ...prev,
        [assetId]: result,
      }))

      setRedTeamMessage(
        `Red Team analysis completed for asset ${assetId}.`
      )
    } catch (err) {
      setRedTeamMessage(
        err.message || 'Red Team analysis could not be completed.'
      )
    } finally {
      setRedTeamingAsset(null)
    }
  }

  // Submit an asset for reviewer approval
  async function handleSubmitForReview(assetId) {
    setSubmittingAsset(assetId)
    setReviewMessage('')

    try {
      const result = await apiRequest(`/assets/${assetId}/submit`, {
        method: 'POST',
      })

      setSubmitResults(prev => ({
        ...prev,
        [assetId]: result,
      }))

      const [updatedAssets, updatedNotifications] = await Promise.all([
        apiRequest('/assets'),
        apiRequest('/notifications'),
      ])
      setAssets(updatedAssets)
      setNotifications(updatedNotifications)

      setReviewMessage(result.message || `Asset ${assetId} submitted for review.`)
    } catch (err) {
      setReviewMessage(err.message || 'Could not submit this asset for review.')
    } finally {
      setSubmittingAsset(null)
    }
  }

  function updateDecisionInput(assetId, field, value) {
    setDecisionInputs(prev => ({
      ...prev,
      [assetId]: {
        decision: prev[assetId]?.decision || 'approved',
        comment: prev[assetId]?.comment || '',
        [field]: value,
      },
    }))
  }

  // Record the reviewer's decision
  async function handleDecision(assetId) {
    const choice = decisionInputs[assetId] || {
      decision: 'approved',
      comment: '',
    }

    if (
      (choice.decision === 'rejected' ||
        choice.decision === 'changes_requested') &&
      !choice.comment.trim()
    ) {
      setReviewMessage('A comment is required to reject an asset or request changes.')
      return
    }

    setDecidingAsset(assetId)
    setReviewMessage('')

    try {
      const result = await apiRequest(`/assets/${assetId}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: choice.decision,
          comment: choice.comment.trim(),
        }),
      })

      setDecisionResults(prev => ({
        ...prev,
        [assetId]: result,
      }))

      const [updatedQueue, updatedAssets, updatedNotifications] = await Promise.all([
        apiRequest('/reviews/queue'),
        apiRequest('/assets'),
        apiRequest('/notifications'),
      ])

      setReviewQueue(updatedQueue)
      setAssets(updatedAssets)
      setNotifications(updatedNotifications)
      setReviewMessage(result.message || `Decision recorded for asset ${assetId}.`)
    } catch (err) {
      setReviewMessage(err.message || 'Could not record the reviewer decision.')
    } finally {
      setDecidingAsset(null)
    }
  }

  if (currentUser) {
    return (
      <main className="dashboard-shell">
        <aside className="sidebar">
          <a className="wordmark" href="/">
            brandpilot<span>.</span>
          </a>

          <p className="sidebar-label">WORKSPACE</p>

          <nav className="sidebar-nav">
            <a className="nav-item active" href="#overview">Overview</a>
            <a className="nav-item" href="#facts">Brand facts</a>
            <a className="nav-item" href="#guidelines">Guidelines</a>
            {currentUser.role === 'reviewer' && (
              <a className="nav-item" href="#review-queue">Reviewer queue</a>
            )}
            <a className="nav-item" href="#assets">Content assets</a>
            <a className="nav-item" href="#notifications">Notifications</a>
          </nav>

          <div className="sidebar-bottom">
            <div className="user-info">
              <div className="user-avatar">
                {currentUser.name.charAt(0)}
              </div>
              <div>
                <strong>{currentUser.name}</strong>
                <span>{roleLabels[currentUser.role] || currentUser.role}</span>
              </div>
            </div>

            <button className="logout-button" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </aside>

        <section className="dashboard-main" id="overview">
          <header className="dashboard-topbar">
            <div>
              <p className="eyebrow">KESTREL AUDIO / WORKSPACE</p>
              <h1>Good to see you, {currentUser.name.split(' ')[0]}.</h1>
            </div>

            <span className="workspace-status">
              <span className="status-dot" />
              SYSTEM CONNECTED
            </span>
          </header>

          {error && (
            <div className="dashboard-error">
              {error}
            </div>
          )}

          <section className="dashboard-intro">
            <div>
              <p className="eyebrow">BRAND GOVERNANCE</p>
              <h2>The standard, held.</h2>
              <p>
                Your brand's facts, guidelines and content — in one place.
              </p>
            </div>
            <span className="mono-font">INKLOOM AI / 01</span>
          </section>

          <section className="stats-grid">
            <div className="stat-block">
              <span>BRAND FACTS</span>
              <strong>{facts.length}</strong>
              <small>Approved information records</small>
            </div>

            <div className="stat-block">
              <span>GUIDELINES</span>
              <strong>{guidelines.length}</strong>
              <small>Active brand standards</small>
            </div>

            <div className="stat-block">
              <span>CONTENT ASSETS</span>
              <strong>{assets.length}</strong>
              <small>Tracked content records</small>
            </div>

            <div className="stat-block">
              <span>NOTIFICATIONS</span>
              <strong>{notifications.filter(item => !item.read).length}</strong>
              <small>Unread updates</small>
            </div>
          </section>

          {loadingDashboard ? (
            <p className="loading-message">Loading your workspace data...</p>
          ) : (
            <>
              {/* BRAND FACTS */}
              <section className="dashboard-section" id="facts">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">01 / SOURCE OF TRUTH</p>
                    <h2>Brand facts</h2>
                  </div>

                  <div className="section-actions">
                    <span>{facts.length} RECORDS</span>
                    <button
                      className="add-fact-button"
                      onClick={() => {
                        setShowFactForm(!showFactForm)
                        setFactMessage('')
                      }}
                    >
                      + Add new fact
                    </button>
                  </div>
                </div>

                {showFactForm && (
                  <form className="fact-form" onSubmit={handleAddFact}>
                    <h3>Add a new brand fact</h3>

                    <label>Fact key</label>
                    <input
                      value={factKey}
                      onChange={e => setFactKey(e.target.value)}
                      placeholder="e.g. product_weight"
                      required
                    />

                    <label>Approved value</label>
                    <input
                      value={factValue}
                      onChange={e => setFactValue(e.target.value)}
                      placeholder="e.g. 250"
                      required
                    />

                    <label>Unit (optional)</label>
                    <input
                      value={factUnit}
                      onChange={e => setFactUnit(e.target.value)}
                      placeholder="e.g. grams"
                    />

                    <label>Source note</label>
                    <input
                      value={factSource}
                      onChange={e => setFactSource(e.target.value)}
                      placeholder="Where was this fact verified?"
                      required
                    />

                    <div className="fact-form-actions">
                      <button
                        type="button"
                        onClick={() => setShowFactForm(false)}
                      >
                        Cancel
                      </button>

                      <button type="submit" disabled={savingFact}>
                        {savingFact ? 'Saving...' : 'Save fact'}
                      </button>
                    </div>
                  </form>
                )}

                {factMessage && (
                  <p className="fact-message">{factMessage}</p>
                )}

                {showVersionForm && selectedFact && (
                  <form className="fact-form" onSubmit={handleUpdateVersion}>
                    <h3>Update fact: {selectedFact.key}</h3>

                    <label>New approved value</label>
                    <input
                      value={versionValue}
                      onChange={e => setVersionValue(e.target.value)}
                      required
                    />

                    <label>Unit</label>
                    <input
                      value={versionUnit}
                      onChange={e => setVersionUnit(e.target.value)}
                      placeholder="e.g. grams"
                    />

                    <label>Source note</label>
                    <input
                      value={versionSource}
                      onChange={e => setVersionSource(e.target.value)}
                      placeholder="Where was this change verified?"
                      required
                    />

                    <div className="fact-form-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setShowVersionForm(false)
                          setSelectedFact(null)
                        }}
                      >
                        Cancel
                      </button>

                      <button type="submit" disabled={savingVersion}>
                        {savingVersion ? 'Saving...' : 'Save new version'}
                      </button>
                    </div>
                  </form>
                )}

                {facts.length === 0 ? (
                  <p className="empty-message">No brand facts found.</p>
                ) : (
                  <div className="data-list">
                    {facts.map(fact => (
                      <article className="data-row" key={fact.id}>
                        <div>
                          <strong>{fact.key}</strong>
                          <p>{fact.current_version?.value || 'No value available'}</p>
                        </div>

                        <span className="record-id">FACT / {fact.id}</span>

                        <button
                          className="add-fact-button"
                          onClick={() => {
                            setSelectedFact(fact)
                            setVersionValue(
                              String(fact.current_version?.value || '')
                            )
                            setVersionUnit(fact.current_version?.unit || '')
                            setVersionSource('')
                            setShowVersionForm(true)
                            setFactMessage('')
                          }}
                        >
                          Update version
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* GUIDELINES */}
              <section className="dashboard-section" id="guidelines">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">02 / BRAND RULES</p>
                    <h2>Guidelines</h2>
                  </div>
                  <span>{guidelines.length} RECORDS</span>
                </div>

                {guidelines.length === 0 ? (
                  <p className="empty-message">No guidelines found.</p>
                ) : (
                  <div className="data-list">
                    {guidelines.map(guideline => (
                      <article className="data-row" key={guideline.id}>
                        <div>
                          <strong>{guideline.title}</strong>
                          <p>
                            {guideline.current_version?.body ||
                              'No description available'}
                          </p>
                        </div>
                        <span className="record-id">RULE / {guideline.id}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* REVIEWER QUEUE */}
              {currentUser.role === 'reviewer' && (
                <section className="dashboard-section" id="review-queue">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">03 / HUMAN APPROVAL</p>
                      <h2>Reviewer queue</h2>
                    </div>
                    <span>{reviewQueue.length} PENDING</span>
                  </div>

                  {reviewMessage && (
                    <p className="fact-message">{reviewMessage}</p>
                  )}

                  {Object.values(decisionResults).length > 0 && (
                    <div className="data-list">
                      {Object.values(decisionResults).map(result => (
                        <article className="data-row" key={`decision-result-${result.asset_id}`}>
                          <div>
                            <strong>
                              Asset {result.asset_id}: {result.decision?.replaceAll('_', ' ')}
                            </strong>
                            <p>{result.message}</p>
                            {result.passport_code && (
                              <p>Passport created/updated: {result.passport_code}</p>
                            )}
                          </div>
                          <span className="record-id">
                            REVISION / {result.revision}
                          </span>
                        </article>
                      ))}
                    </div>
                  )}

                  {loadingReviewQueue ? (
                    <p className="loading-message">Loading review queue...</p>
                  ) : reviewQueue.length === 0 ? (
                    <p className="empty-message">
                      No assets are currently waiting for review or revalidation.
                    </p>
                  ) : (
                    <div className="data-list">
                      {reviewQueue.map(item => {
                        const choice = decisionInputs[item.asset_id] || {
                          decision: 'approved',
                          comment: '',
                        }

                        return (
                          <article className="data-row" key={item.asset_id}>
                            <div>
                              <strong>{item.title}</strong>
                              <p>Creator: {item.creator_name}</p>
                              <p>
                                Status: {item.status?.replaceAll('_', ' ')}
                                {' · '}Revision: {item.current_revision}
                              </p>
                              <p>
                                Open findings: {item.open_findings_count}
                                {' · '}High severity: {item.high_severity_findings_count}
                              </p>
                              {item.passport_code && (
                                <p>
                                  Passport: {item.passport_code}
                                  {item.passport_status
                                    ? ` · ${item.passport_status.replaceAll('_', ' ')}`
                                    : ''}
                                </p>
                              )}
                              <span className="record-id">
                                ASSET / {item.asset_id}
                              </span>
                            </div>

                            <div className="fact-form">
                              <label htmlFor={`decision-${item.asset_id}`}>
                                REVIEW DECISION
                              </label>
                              <select
                                id={`decision-${item.asset_id}`}
                                value={choice.decision}
                                onChange={event =>
                                  updateDecisionInput(
                                    item.asset_id,
                                    'decision',
                                    event.target.value
                                  )
                                }
                              >
                                <option value="approved">Approve</option>
                                <option value="changes_requested">Request changes</option>
                                <option value="rejected">Reject</option>
                              </select>

                              <label htmlFor={`comment-${item.asset_id}`}>
                                COMMENT
                                {choice.decision !== 'approved' ? ' (REQUIRED)' : ' (OPTIONAL)'}
                              </label>
                              <textarea
                                id={`comment-${item.asset_id}`}
                                value={choice.comment}
                                onChange={event =>
                                  updateDecisionInput(
                                    item.asset_id,
                                    'comment',
                                    event.target.value
                                  )
                                }
                                placeholder={
                                  choice.decision === 'approved'
                                    ? 'Optional approval note'
                                    : 'Explain why changes or rejection are needed'
                                }
                                rows="3"
                              />

                              <button
                                className="add-fact-button"
                                onClick={() => handleDecision(item.asset_id)}
                                disabled={decidingAsset === item.asset_id}
                              >
                                {decidingAsset === item.asset_id
                                  ? 'Saving decision...'
                                  : 'Submit decision'}
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* CONTENT ASSETS + AUDIT + RED TEAM */}
              <section className="dashboard-section" id="assets">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">03 / CONTENT REGISTER</p>
                    <h2>Content assets</h2>
                  </div>
                  <span>{assets.length} RECORDS</span>
                </div>

                {auditMessage && (
                  <p className="fact-message">{auditMessage}</p>
                )}

                {redTeamMessage && (
                  <p className="fact-message">{redTeamMessage}</p>
                )}

                {reviewMessage && currentUser.role !== 'reviewer' && (
                  <p className="fact-message">{reviewMessage}</p>
                )}

                {assets.length === 0 ? (
                  <p className="empty-message">No content assets found.</p>
                ) : (
                  <div className="data-list">
                    {assets.map(asset => (
                      <article className="data-row" key={asset.id}>
                        <div>
                          <strong>{asset.title}</strong>
                          <p>
                            {asset.status?.replaceAll('_', ' ') ||
                              'Status unavailable'}
                          </p>
                        </div>

                        <span className="record-id">
                          ASSET / {asset.id}
                        </span>

                        {/* BRAND AUDIT BUTTON */}
                        <button
                          className="add-fact-button"
                          onClick={() => handleAudit(asset.id)}
                          disabled={auditingAsset === asset.id}
                        >
                          {auditingAsset === asset.id
                            ? 'Auditing...'
                            : 'Run brand audit'}
                        </button>

                        {/* BRAND AUDIT RESULTS */}
                        {auditFindings[asset.id]?.length > 0 ? (
                          <div className="data-list">
                            {auditFindings[asset.id].map(finding => (
                              <article className="data-row" key={finding.id}>
                                <div>
                                  <strong>
                                    {finding.kind || 'Audit finding'}
                                  </strong>
                                  <p>{finding.quote}</p>
                                  <p>{finding.explanation}</p>

                                  {finding.suggestion && (
                                    <p>
                                      Suggested fix: {finding.suggestion}
                                    </p>
                                  )}
                                </div>

                                <span className="record-id">
                                  {finding.severity || 'REVIEW'}
                                </span>
                              </article>
                            ))}
                          </div>
                        ) : auditFindings[asset.id] ? (
                          <p className="empty-message">
                            No issues found for this asset.
                          </p>
                        ) : null}

                        {/* BRAND RED TEAM BUTTON */}
                        <button
                          className="add-fact-button"
                          onClick={() => handleRedTeam(asset.id)}
                          disabled={redTeamingAsset === asset.id}
                        >
                          {redTeamingAsset === asset.id
                            ? 'Analysing...'
                            : 'Run Brand Red Team'}
                        </button>

                        {/* BRAND RED TEAM RESULTS */}
                        {redTeamResults[asset.id] && (
                          <div className="data-list">
                            <div>
                              <strong>
                                Potential Risks — Not Confirmed Violations
                              </strong>

                              <p>
                                {redTeamResults[asset.id].ai_available
                                  ? 'AI analysis available'
                                  : 'AI analysis unavailable'}
                              </p>
                            </div>

                            {redTeamResults[asset.id].risks?.length > 0 ? (
                              redTeamResults[asset.id].risks.map(
                                (risk, index) => (
                                  <article
                                    className="data-row"
                                    key={`${asset.id}-risk-${index}`}
                                  >
                                    <div>
                                      <strong>{risk.persona}</strong>
                                      <p>{risk.category}</p>
                                      <p>{risk.quote}</p>
                                      <p>{risk.why}</p>
                                      <p>
                                        {risk.label || 'Potential risks'}
                                      </p>
                                    </div>

                                    <span className="record-id">
                                      {risk.severity || 'REVIEW'}
                                    </span>
                                  </article>
                                )
                              )
                            ) : (
                              <p className="empty-message">
                                No potential risks returned for this asset.
                              </p>
                            )}
                          </div>
                        )}

                        {/* SUBMIT FOR REVIEW */}
                        {currentUser.role !== 'reviewer' && (
                          <div className="review-submit-area">
                            <button
                              className="add-fact-button"
                              onClick={() => handleSubmitForReview(asset.id)}
                              disabled={submittingAsset === asset.id}
                            >
                              {submittingAsset === asset.id
                                ? 'Submitting...'
                                : 'Submit for review'}
                            </button>

                            {submitResults[asset.id] && (
                              <div>
                                <p className="fact-message">
                                  {submitResults[asset.id].message}
                                  {' · '}Status: {submitResults[asset.id].status}
                                </p>
                                {submitResults[asset.id].warnings?.map((warning, index) => (
                                  <p className="empty-message" key={`${asset.id}-warning-${index}`}>
                                    Warning: {warning}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* NOTIFICATIONS */}
              <section className="dashboard-section" id="notifications">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">04 / ACTIVITY</p>
                    <h2>Notifications</h2>
                  </div>
                  <span>{notifications.length} UPDATES</span>
                </div>

                {notifications.length === 0 ? (
                  <p className="empty-message">You're all caught up.</p>
                ) : (
                  <div className="data-list">
                    {notifications.map(notification => (
                      <article className="data-row" key={notification.id}>
                        <div>
                          <strong>{notification.message}</strong>
                          <p>{notification.read ? 'Read' : 'Unread'}</p>
                        </div>
                        <span className="record-id">
                          UPDATE / {notification.id}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </main>
    )
  }

  // LOGIN SCREEN
  return (
    <main className="login-layout">
      <aside className="brand-panel">
        <header className="topbar">
          <a className="wordmark" href="/">
            brandpilot<span>.</span>
          </a>
          <span className="topbar-note">INKLOOM AI</span>
        </header>

        <div className="brand-message">
          <p className="eyebrow">THE STANDARD, HELD.</p>
          <h1>Every claim has a source. Every approval has a history.</h1>
          <p>
            A continuous system for keeping your brand accurate,
            consistent, and accountable.
          </p>
        </div>

        <div className="brand-footer">
          <span>FACTS · GUIDELINES · PROVENANCE</span>
          <span>01 / 03</span>
        </div>
      </aside>

      <section className="login-panel">
        <div className="login-content">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h2>Sign in to BrandPilot</h2>
          <p className="login-description">
            Choose a demo identity to enter the Kestrel Audio workspace.
          </p>

          <form onSubmit={handleLogin}>
            <label htmlFor="demo-user">CONTINUE AS</label>

            {loadingUsers ? (
              <p className="form-message">Loading available accounts...</p>
            ) : (
              <select
                id="demo-user"
                value={selectedUser}
                onChange={event => setSelectedUser(event.target.value)}
                disabled={users.length === 0}
              >
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {roleLabels[user.role] || user.role}
                  </option>
                ))}
              </select>
            )}

            {error && <p className="error-message">{error}</p>}

            <button
              className="primary-button"
              type="submit"
              disabled={loadingUsers || loggingIn || users.length === 0}
            >
              {loggingIn ? 'Signing in...' : 'Continue to workspace'}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <div className="login-footnote">
            <span className="status-dot" />
            DEMO ENVIRONMENT · KESTREL AUDIO
          </div>
        </div>

        <footer className="panel-footer">
          Brand governance, with a paper trail.
        </footer>
      </section>
    </main>
  )
}

export default App
