import { useEffect, useState } from 'react'
import { apiRequest, demoLogin, getDemoUsers, API_BASE_URL } from './api'
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

  // Fact forms
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

  // Guideline creation form (Brand Manager)
  const [showGuidelineForm, setShowGuidelineForm] = useState(false)
  const [guidelineTitle, setGuidelineTitle] = useState('')
  const [guidelineBody, setGuidelineBody] = useState('')
  const [bannedTermInput, setBannedTermInput] = useState('')
  const [requiredPhraseInput, setRequiredPhraseInput] = useState('')
  const [savingGuideline, setSavingGuideline] = useState(false)
  const [guidelineMessage, setGuidelineMessage] = useState('')

  // Asset Intake forms (Creator / Manager)
  const [showAssetForm, setShowAssetForm] = useState(false)
  const [newAssetTitle, setNewAssetTitle] = useState('')
  const [newAssetBody, setNewAssetBody] = useState('')
  const [savingAsset, setSavingAsset] = useState(false)

  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadingAsset, setUploadingAsset] = useState(false)
  const [assetMessage, setAssetMessage] = useState('')

  // Brand Audit states
  const [auditMessage, setAuditMessage] = useState('')
  const [auditingAsset, setAuditingAsset] = useState(null)
  const [auditFindings, setAuditFindings] = useState({})
  const [resolvingFinding, setResolvingFinding] = useState(null)

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

  // Admin recall check state
  const [runningExpiry, setRunningExpiry] = useState(false)
  const [expiryMessage, setExpiryMessage] = useState('')

  // Public passport view modal / drawer
  const [viewingPassport, setViewingPassport] = useState(null)
  const [loadingPassport, setLoadingPassport] = useState(false)

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

  // --- Brand Facts Handlers ---
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

  // --- Guidelines Handlers ---
  async function handleCreateGuideline(event) {
    event.preventDefault()
    setSavingGuideline(true)
    setGuidelineMessage('')

    try {
      const banned = bannedTermInput
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .map(term => ({ term, why: 'Brand perception standard', preferred: 'approved alternative' }))

      const required = requiredPhraseInput
        .split(',')
        .map(p => p.trim())
        .filter(Boolean)

      await apiRequest('/guidelines', {
        method: 'POST',
        body: JSON.stringify({
          title: guidelineTitle,
          body: guidelineBody,
          rules: {
            banned_terms: banned,
            required_phrases: required,
            tone_notes: ['clear', 'confident', 'honest'],
            claim_rules: [],
          },
        }),
      })

      const updatedGuides = await apiRequest('/guidelines')
      setGuidelines(updatedGuides)

      setGuidelineTitle('')
      setGuidelineBody('')
      setBannedTermInput('')
      setRequiredPhraseInput('')
      setShowGuidelineForm(false)
      setGuidelineMessage('New brand guideline registered successfully.')
    } catch (err) {
      setGuidelineMessage(err.message || 'Could not create guideline.')
    } finally {
      setSavingGuideline(false)
    }
  }

  // --- Asset Intake Handlers ---
  async function handleCreateDraftAsset(event) {
    event.preventDefault()
    setSavingAsset(true)
    setAssetMessage('')

    try {
      await apiRequest('/assets', {
        method: 'POST',
        body: JSON.stringify({
          title: newAssetTitle,
          body: newAssetBody,
          source_filename: `${newAssetTitle.toLowerCase().replace(/\s+/g, '_')}.txt`,
        }),
      })

      const updatedAssets = await apiRequest('/assets')
      setAssets(updatedAssets)

      setNewAssetTitle('')
      setNewAssetBody('')
      setShowAssetForm(false)
      setAssetMessage('Content draft created successfully.')
    } catch (err) {
      setAssetMessage(err.message || 'Could not create asset.')
    } finally {
      setSavingAsset(false)
    }
  }

  async function handleUploadFileAsset(event) {
    event.preventDefault()
    if (!uploadFile) {
      setAssetMessage('Please select a file to upload (.txt, .docx, .pdf).')
      return
    }

    setUploadingAsset(true)
    setAssetMessage('')

    try {
      const formData = new FormData()
      formData.append('title', uploadTitle || uploadFile.name)
      formData.append('file', uploadFile)

      await apiRequest('/assets/upload', {
        method: 'POST',
        body: formData,
      })

      const updatedAssets = await apiRequest('/assets')
      setAssets(updatedAssets)

      setUploadTitle('')
      setUploadFile(null)
      setShowUploadForm(false)
      setAssetMessage('Document uploaded and parsed into content register.')
    } catch (err) {
      setAssetMessage(err.message || 'Could not upload file.')
    } finally {
      setUploadingAsset(false)
    }
  }

  // --- Brand Audit & Finding Resolution ---
  async function handleAudit(assetId) {
    setAuditingAsset(assetId)
    setAuditMessage('')

    try {
      await apiRequest(`/assets/${assetId}/audit`, {
        method: 'POST',
      })

      const [updatedAssets, findings] = await Promise.all([
        apiRequest('/assets'),
        apiRequest(`/assets/${assetId}/findings`),
      ])

      setAuditFindings(prev => ({
        ...prev,
        [assetId]: findings,
      }))
      setAssets(updatedAssets)
      setAuditMessage(`Audit completed for asset ${assetId}. Found ${findings.length} issue(s).`)
    } catch (err) {
      setAuditMessage(err.message || 'Audit could not be completed.')
    } finally {
      setAuditingAsset(null)
    }
  }

  async function handleAcceptFinding(assetId, findingId) {
    setResolvingFinding(findingId)
    setAuditMessage('')

    try {
      await apiRequest(`/findings/${findingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'accepted' }),
      })

      const [updatedAssets, findings] = await Promise.all([
        apiRequest('/assets'),
        apiRequest(`/assets/${assetId}/findings`),
      ])

      setAuditFindings(prev => ({
        ...prev,
        [assetId]: findings,
      }))
      setAssets(updatedAssets)
      setAuditMessage(`Suggested fix accepted. New revision generated.`)
    } catch (err) {
      setAuditMessage(err.message || 'Could not accept suggested fix.')
    } finally {
      setResolvingFinding(null)
    }
  }

  async function handleDismissFinding(assetId, findingId) {
    setResolvingFinding(findingId)
    setAuditMessage('')

    try {
      await apiRequest(`/findings/${findingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      })

      const findings = await apiRequest(`/assets/${assetId}/findings`)
      setAuditFindings(prev => ({
        ...prev,
        [assetId]: findings,
      }))
      setAuditMessage(`Finding dismissed.`)
    } catch (err) {
      setAuditMessage(err.message || 'Could not dismiss finding.')
    } finally {
      setResolvingFinding(null)
    }
  }

  // --- Brand Red Team ---
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
        `Red Team analysis completed for asset ${assetId}. Generated ${result.risks?.length || 0} risk perspective(s).`
      )
    } catch (err) {
      setRedTeamMessage(err.message || 'Red Team analysis could not be completed.')
    } finally {
      setRedTeamingAsset(null)
    }
  }

  // --- Submit for Review ---
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

  // --- Record Reviewer Decision ---
  async function handleDecision(assetId) {
    const choice = decisionInputs[assetId] || {
      decision: 'approved',
      comment: '',
    }

    if (
      (choice.decision === 'rejected' || choice.decision === 'changes_requested') &&
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

  // --- Admin Expiry / Recall Simulation ---
  async function handleRunExpiryCheck() {
    setRunningExpiry(true)
    setExpiryMessage('')

    try {
      const result = await apiRequest('/admin/run-expiry-check', {
        method: 'POST',
      })

      const [updatedAssets, updatedNotifications] = await Promise.all([
        apiRequest('/assets'),
        apiRequest('/notifications'),
      ])
      setAssets(updatedAssets)
      setNotifications(updatedNotifications)
      setExpiryMessage(
        `Fact expiry audit executed. Recalled / affected assets: ${result.affected_assets_count}`
      )
    } catch (err) {
      setExpiryMessage(err.message || 'Could not run expiry check.')
    } finally {
      setRunningExpiry(false)
    }
  }

  // --- Passport Public Inspection ---
  async function handleOpenPassport(code) {
    setLoadingPassport(true)
    try {
      const data = await apiRequest(`/passports/${code}/public`)
      setViewingPassport(data)
    } catch (err) {
      setAssetMessage(err.message || 'Could not load passport.')
    } finally {
      setLoadingPassport(false)
    }
  }

  // --- Notifications: Mark as Read ---
  async function handleMarkNotificationRead(notificationId) {
    try {
      await apiRequest(`/notifications/${notificationId}/read`, {
        method: 'PATCH',
      })

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
      )
    } catch {
      // ignore
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

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {currentUser.role === 'brand_manager' && (
                <button
                  className="add-fact-button"
                  onClick={handleRunExpiryCheck}
                  disabled={runningExpiry}
                  title="Run automated recall audit to detect published assets relying on outdated facts"
                >
                  {runningExpiry ? 'Auditing recall...' : 'Run Recall Audit'}
                </button>
              )}
              <span className="workspace-status">
                <span className="status-dot" />
                SYSTEM CONNECTED
              </span>
            </div>
          </header>

          {error && <div className="dashboard-error">{error}</div>}
          {loadingDashboard && (
            <div className="waking-server-banner">
              <div className="spinner" />
              <div>
                <strong>Waking the server (about 30 seconds)...</strong>
                <div className="waking-subtext">Free-tier hosting spins down when idle. Loading workspace data...</div>
              </div>
            </div>
          )}
          {expiryMessage && <p className="fact-message">{expiryMessage}</p>}

          <section className="dashboard-intro">
            <div>
              <p className="eyebrow">BRAND GOVERNANCE</p>
              <h2>The standard, held.</h2>
              <p>
                Your brand's facts, guidelines and content — with provable auditability before and after publication.
              </p>
            </div>
            <span className="mono-font">INKLOOM AI / 01</span>
          </section>

          <section className="stats-grid">
            <div className="stat-block">
              <span>BRAND FACTS</span>
              <strong>{facts.length}</strong>
              <small>Approved ground-truth values</small>
            </div>

            <div className="stat-block">
              <span>GUIDELINES</span>
              <strong>{guidelines.length}</strong>
              <small>Active brand rule sets</small>
            </div>

            <div className="stat-block">
              <span>CONTENT ASSETS</span>
              <strong>{assets.length}</strong>
              <small>Tracked content assets</small>
            </div>

            <div className="stat-block">
              <span>NOTIFICATIONS</span>
              <strong>{notifications.filter(item => !item.read).length}</strong>
              <small>Unread team updates</small>
            </div>
          </section>

          {loadingDashboard ? (
            <p className="loading-message">Loading your workspace data...</p>
          ) : (
            <>
              {/* ----------------- BRAND FACTS ----------------- */}
              <section className="dashboard-section" id="facts">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">01 / SOURCE OF TRUTH</p>
                    <h2>Brand facts</h2>
                  </div>

                  <div className="section-actions">
                    <span>{facts.length} RECORDS</span>
                    {currentUser.role === 'brand_manager' && (
                      <button
                        className="add-fact-button"
                        onClick={() => {
                          setShowFactForm(!showFactForm)
                          setFactMessage('')
                        }}
                      >
                        {showFactForm ? 'Close form' : '+ Add new fact'}
                      </button>
                    )}
                  </div>
                </div>

                {showFactForm && (
                  <form className="fact-form" onSubmit={handleAddFact}>
                    <h3>Add a new brand fact</h3>

                    <label>Fact key</label>
                    <input
                      value={factKey}
                      onChange={e => setFactKey(e.target.value)}
                      placeholder="e.g. return_window_days"
                      required
                    />

                    <label>Approved value</label>
                    <input
                      value={factValue}
                      onChange={e => setFactValue(e.target.value)}
                      placeholder="e.g. 30"
                      required
                    />

                    <label>Unit (optional)</label>
                    <input
                      value={factUnit}
                      onChange={e => setFactUnit(e.target.value)}
                      placeholder="e.g. days, hours, USD"
                    />

                    <label>Source note / provenance</label>
                    <input
                      value={factSource}
                      onChange={e => setFactSource(e.target.value)}
                      placeholder="Where was this verified? (e.g. QA testing lab report)"
                      required
                    />

                    <div className="fact-form-actions">
                      <button type="button" onClick={() => setShowFactForm(false)}>
                        Cancel
                      </button>
                      <button type="submit" disabled={savingFact}>
                        {savingFact ? 'Saving...' : 'Save fact'}
                      </button>
                    </div>
                  </form>
                )}

                {factMessage && <p className="fact-message">{factMessage}</p>}

                {showVersionForm && selectedFact && (
                  <form className="fact-form" onSubmit={handleUpdateVersion}>
                    <h3>Update fact: {selectedFact.key} (v{selectedFact.current_version?.version || 1} → v{(selectedFact.current_version?.version || 1) + 1})</h3>

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
                      placeholder="e.g. days"
                    />

                    <label>Source note / justification</label>
                    <input
                      value={versionSource}
                      onChange={e => setVersionSource(e.target.value)}
                      placeholder="Reason for change (e.g. Executive policy update)"
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
                        {savingVersion ? 'Saving...' : 'Save new version & trigger recall'}
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
                          <p>
                            Approved value: <strong>{fact.current_version?.value || 'N/A'} {fact.current_version?.unit || ''}</strong>
                            {' · '}Version: v{fact.current_version?.version || 1}
                          </p>
                          <small style={{ color: 'var(--muted)' }}>
                            Provenance: {fact.current_version?.source_note || 'Approved'}
                          </small>
                        </div>

                        <span className="record-id">FACT #{fact.id}</span>

                        {currentUser.role === 'brand_manager' && (
                          <button
                            className="add-fact-button"
                            onClick={() => {
                              setSelectedFact(fact)
                              setVersionValue(String(fact.current_version?.value || ''))
                              setVersionUnit(fact.current_version?.unit || '')
                              setVersionSource('')
                              setShowVersionForm(true)
                              setFactMessage('')
                            }}
                          >
                            Bump version
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* ----------------- GUIDELINES ----------------- */}
              <section className="dashboard-section" id="guidelines">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">02 / BRAND RULES</p>
                    <h2>Guidelines</h2>
                  </div>
                  <div className="section-actions">
                    <span>{guidelines.length} RECORDS</span>
                    {currentUser.role === 'brand_manager' && (
                      <button
                        className="add-fact-button"
                        onClick={() => {
                          setShowGuidelineForm(!showGuidelineForm)
                          setGuidelineMessage('')
                        }}
                      >
                        {showGuidelineForm ? 'Close form' : '+ Add guideline'}
                      </button>
                    )}
                  </div>
                </div>

                {showGuidelineForm && (
                  <form className="fact-form" onSubmit={handleCreateGuideline}>
                    <h3>Create Brand Guideline</h3>

                    <label>Guideline Title</label>
                    <input
                      value={guidelineTitle}
                      onChange={e => setGuidelineTitle(e.target.value)}
                      placeholder="e.g. Kestrel Launch Tone & Voice"
                      required
                    />

                    <label>Body / Overview</label>
                    <textarea
                      value={guidelineBody}
                      onChange={e => setGuidelineBody(e.target.value)}
                      placeholder="Guidelines for all consumer-facing promotional copy..."
                      rows="3"
                      required
                    />

                    <label>Banned Terms (comma separated)</label>
                    <input
                      value={bannedTermInput}
                      onChange={e => setBannedTermInput(e.target.value)}
                      placeholder="e.g. cheap, unrivaled, plastic"
                    />

                    <label>Required Phrases (comma separated)</label>
                    <input
                      value={requiredPhraseInput}
                      onChange={e => setRequiredPhraseInput(e.target.value)}
                      placeholder="e.g. Kestrel Audio, Engineered for Clarity"
                    />

                    <div className="fact-form-actions">
                      <button type="button" onClick={() => setShowGuidelineForm(false)}>
                        Cancel
                      </button>
                      <button type="submit" disabled={savingGuideline}>
                        {savingGuideline ? 'Saving...' : 'Save guideline'}
                      </button>
                    </div>
                  </form>
                )}

                {guidelineMessage && <p className="fact-message">{guidelineMessage}</p>}

                {guidelines.length === 0 ? (
                  <p className="empty-message">No guidelines found.</p>
                ) : (
                  <div className="data-list">
                    {guidelines.map(guideline => (
                      <article className="data-row" key={guideline.id}>
                        <div>
                          <strong>{guideline.title}</strong>
                          <p>{guideline.current_version?.body || 'No description available'}</p>
                          {guideline.current_version?.rules?.banned_terms?.length > 0 && (
                            <small style={{ display: 'block', marginTop: '4px', color: 'var(--muted)' }}>
                              Banned: {guideline.current_version.rules.banned_terms.map(b => b.term).join(', ')}
                            </small>
                          )}
                        </div>
                        <span className="record-id">RULE #{guideline.id}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* ----------------- REVIEWER QUEUE ----------------- */}
              {currentUser.role === 'reviewer' && (
                <section className="dashboard-section" id="review-queue">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">03 / HUMAN APPROVAL</p>
                      <h2>Reviewer queue</h2>
                    </div>
                    <span>{reviewQueue.length} PENDING</span>
                  </div>

                  {reviewMessage && <p className="fact-message">{reviewMessage}</p>}

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
                              <p>
                                Passport: <code>{result.passport_code}</code>{' '}
                                <button
                                  className="add-fact-button"
                                  style={{ padding: '3px 8px', fontSize: '11px', marginLeft: '6px' }}
                                  onClick={() => handleOpenPassport(result.passport_code)}
                                >
                                  View Passport
                                </button>
                              </p>
                            )}
                          </div>
                          <span className="record-id">REVISION #{result.revision}</span>
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
                                Status: <strong>{item.status?.replaceAll('_', ' ')}</strong>
                                {' · '}Revision: #{item.current_revision}
                              </p>
                              <p>
                                Open findings: {item.open_findings_count}
                                {' · '}High severity: {item.high_severity_findings_count}
                              </p>
                              {item.passport_code && (
                                <p>
                                  Passport: <code>{item.passport_code}</code>
                                  {item.passport_status
                                    ? ` · (${item.passport_status.replaceAll('_', ' ')})`
                                    : ''}
                                </p>
                              )}
                              <span className="record-id">ASSET #{item.asset_id}</span>
                            </div>

                            <div className="fact-form" style={{ maxWidth: '340px' }}>
                              <label htmlFor={`decision-${item.asset_id}`}>DECISION</label>
                              <select
                                id={`decision-${item.asset_id}`}
                                value={choice.decision}
                                onChange={e => updateDecisionInput(item.asset_id, 'decision', e.target.value)}
                              >
                                <option value="approved">Approve & Issue Passport</option>
                                <option value="changes_requested">Request changes</option>
                                <option value="rejected">Reject</option>
                              </select>

                              <label htmlFor={`comment-${item.asset_id}`}>
                                COMMENT {choice.decision !== 'approved' ? '(REQUIRED)' : '(OPTIONAL)'}
                              </label>
                              <textarea
                                id={`comment-${item.asset_id}`}
                                value={choice.comment}
                                onChange={e => updateDecisionInput(item.asset_id, 'comment', e.target.value)}
                                placeholder={
                                  choice.decision === 'approved'
                                    ? 'Approval note (e.g. Verified against brand facts)'
                                    : 'Explain why revision is needed...'
                                }
                                rows="2"
                              />

                              <button
                                className="add-fact-button"
                                onClick={() => handleDecision(item.asset_id)}
                                disabled={decidingAsset === item.asset_id}
                              >
                                {decidingAsset === item.asset_id ? 'Recording...' : 'Submit Decision'}
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* ----------------- CONTENT ASSETS ----------------- */}
              <section className="dashboard-section" id="assets">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">03 / CONTENT REGISTER</p>
                    <h2>Content assets</h2>
                  </div>
                  <div className="section-actions">
                    <span>{assets.length} RECORDS</span>
                    {currentUser.role !== 'reviewer' && (
                      <>
                        <button
                          className="add-fact-button"
                          onClick={() => {
                            setShowAssetForm(!showAssetForm)
                            setShowUploadForm(false)
                            setAssetMessage('')
                          }}
                        >
                          {showAssetForm ? 'Close form' : '+ New draft'}
                        </button>
                        <button
                          className="add-fact-button"
                          onClick={() => {
                            setShowUploadForm(!showUploadForm)
                            setShowAssetForm(false)
                            setAssetMessage('')
                          }}
                        >
                          {showUploadForm ? 'Close form' : 'Upload file'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {showAssetForm && (
                  <form className="fact-form" onSubmit={handleCreateDraftAsset}>
                    <h3>Create Text Draft Asset</h3>
                    <label>Title</label>
                    <input
                      value={newAssetTitle}
                      onChange={e => setNewAssetTitle(e.target.value)}
                      placeholder="e.g. Kestrel Launch Press Release"
                      required
                    />
                    <label>Body / Copy</label>
                    <textarea
                      value={newAssetBody}
                      onChange={e => setNewAssetBody(e.target.value)}
                      placeholder="Draft marketing copy, press announcement, or campaign script..."
                      rows="5"
                      required
                    />
                    <div className="fact-form-actions">
                      <button type="button" onClick={() => setShowAssetForm(false)}>
                        Cancel
                      </button>
                      <button type="submit" disabled={savingAsset}>
                        {savingAsset ? 'Creating...' : 'Register draft'}
                      </button>
                    </div>
                  </form>
                )}

                {showUploadForm && (
                  <form className="fact-form" onSubmit={handleUploadFileAsset}>
                    <h3>Upload Document Intake (.txt, .docx, .pdf)</h3>
                    <label>Title (optional)</label>
                    <input
                      value={uploadTitle}
                      onChange={e => setUploadTitle(e.target.value)}
                      placeholder="Asset title (leave empty to use filename)"
                    />
                    <label>Choose File (Max 5MB)</label>
                    <input
                      type="file"
                      accept=".txt,.docx,.pdf"
                      onChange={e => setUploadFile(e.target.files[0])}
                      required
                    />
                    <div className="fact-form-actions">
                      <button type="button" onClick={() => setShowUploadForm(false)}>
                        Cancel
                      </button>
                      <button type="submit" disabled={uploadingAsset}>
                        {uploadingAsset ? 'Uploading & parsing...' : 'Upload & register'}
                      </button>
                    </div>
                  </form>
                )}

                {assetMessage && <p className="fact-message">{assetMessage}</p>}
                {auditMessage && <p className="fact-message">{auditMessage}</p>}
                {redTeamMessage && <p className="fact-message">{redTeamMessage}</p>}
                {reviewMessage && currentUser.role !== 'reviewer' && (
                  <p className="fact-message">{reviewMessage}</p>
                )}

                {assets.length === 0 ? (
                  <p className="empty-message">No content assets found.</p>
                ) : (
                  <div className="data-list">
                    {assets.map(asset => {
                      const findings = auditFindings[asset.id] || []

                      return (
                        <article className="data-row" key={asset.id} style={{ display: 'block', marginBottom: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <strong style={{ fontSize: '16px' }}>{asset.title}</strong>
                              <p style={{ margin: '4px 0' }}>
                                Status: <strong style={{ textTransform: 'capitalize' }}>{asset.status?.replaceAll('_', ' ')}</strong>
                                {' · '}Revision: #{asset.current_revision}
                              </p>
                              {asset.passport && (
                                <p style={{ margin: '4px 0' }}>
                                  Passport:{' '}
                                  <code style={{ background: '#e0ded6', padding: '2px 6px', borderRadius: '3px' }}>
                                    {asset.passport.id}
                                  </code>{' '}
                                  ({asset.passport.status}){' · '}
                                  <button
                                    className="add-fact-button"
                                    style={{ padding: '2px 8px', fontSize: '11px' }}
                                    onClick={() => handleOpenPassport(asset.passport.id)}
                                  >
                                    Inspect Passport
                                  </button>
                                  {' · '}
                                  <a
                                    href={`${API_BASE_URL}/passports/${asset.passport.id}/qr.png`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: '12px', marginLeft: '4px' }}
                                  >
                                    QR Code ↗
                                  </a>
                                </p>
                              )}
                            </div>
                            <span className="record-id">ASSET #{asset.id}</span>
                          </div>

                          {/* Action Toolbar */}
                          <div style={{ display: 'flex', gap: '8px', margin: '12px 0', flexWrap: 'wrap' }}>
                            <button
                              className="add-fact-button"
                              onClick={() => handleAudit(asset.id)}
                              disabled={auditingAsset === asset.id}
                            >
                              {auditingAsset === asset.id ? 'Auditing...' : 'Pre-flight Audit'}
                            </button>

                            <button
                              className="add-fact-button"
                              onClick={() => handleRedTeam(asset.id)}
                              disabled={redTeamingAsset === asset.id}
                            >
                              {redTeamingAsset === asset.id ? 'Analysing...' : 'Red-Team Simulation'}
                            </button>

                            {currentUser.role !== 'reviewer' && (
                              <button
                                className="add-fact-button"
                                onClick={() => handleSubmitForReview(asset.id)}
                                disabled={submittingAsset === asset.id}
                              >
                                {submittingAsset === asset.id ? 'Submitting...' : 'Submit for Approval'}
                              </button>
                            )}
                          </div>

                          {submitResults[asset.id] && (
                            <p className="fact-message" style={{ margin: '8px 0' }}>
                              {submitResults[asset.id].message}
                            </p>
                          )}

                          {/* AUDIT FINDINGS LIST */}
                          {findings.length > 0 && (
                            <div style={{ background: '#f5f1e8', padding: '12px', borderRadius: '4px', margin: '10px 0' }}>
                              <strong style={{ fontSize: '12px', letterSpacing: '1px' }}>
                                PRE-FLIGHT AUDIT FINDINGS ({findings.length})
                              </strong>
                              {findings.map(finding => (
                                <div
                                  key={finding.id}
                                  style={{
                                    borderBottom: '1px solid #e0dacd',
                                    padding: '8px 0',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}
                                >
                                  <div>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: finding.severity === 'high' ? '#b91c1c' : '#b45309' }}>
                                      [{finding.severity.toUpperCase()}] {finding.kind}:
                                    </span>{' '}
                                    <span style={{ fontStyle: 'italic' }}>"{finding.quote}"</span>
                                    <p style={{ margin: '2px 0', fontSize: '12px' }}>{finding.explanation}</p>
                                    {finding.suggestion && (
                                      <p style={{ margin: '2px 0', fontSize: '12px', color: '#15803d' }}>
                                        Suggested replacement: <strong>{finding.suggestion}</strong>
                                      </p>
                                    )}
                                  </div>

                                  {finding.status === 'open' && (
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      {finding.suggestion && (
                                        <button
                                          className="add-fact-button"
                                          style={{ background: '#15803d', color: 'white', borderColor: '#15803d' }}
                                          disabled={resolvingFinding === finding.id}
                                          onClick={() => handleAcceptFinding(asset.id, finding.id)}
                                        >
                                          Accept fix
                                        </button>
                                      )}
                                      <button
                                        className="add-fact-button"
                                        disabled={resolvingFinding === finding.id}
                                        onClick={() => handleDismissFinding(asset.id, finding.id)}
                                      >
                                        Dismiss
                                      </button>
                                    </div>
                                  )}
                                  {finding.status !== 'open' && (
                                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)' }}>
                                      {finding.status}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* RED TEAM RESULTS */}
                          {redTeamResults[asset.id] && (
                            <div style={{ background: '#f5f1e8', padding: '12px', borderRadius: '4px', margin: '10px 0' }}>
                              <strong style={{ fontSize: '12px', letterSpacing: '1px' }}>
                                RED-TEAM RISK PERSPECTIVES ({redTeamResults[asset.id].risks?.length || 0})
                              </strong>
                              {redTeamResults[asset.id].risks?.length === 0 ? (
                                <p style={{ fontSize: '12px', margin: '4px 0' }}>No risks identified by red-team personas.</p>
                              ) : (
                                redTeamResults[asset.id].risks.map((risk, idx) => (
                                  <div key={idx} style={{ borderBottom: '1px solid #e0dacd', padding: '8px 0' }}>
                                    <strong style={{ fontSize: '12px' }}>{risk.persona} ({risk.category})</strong>
                                    <p style={{ margin: '2px 0', fontSize: '12px' }}>Quote: "{risk.quote}"</p>
                                    <p style={{ margin: '2px 0', fontSize: '12px', color: 'var(--muted)' }}>Risk: {risk.why}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* ----------------- NOTIFICATIONS ----------------- */}
              <section className="dashboard-section" id="notifications">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">04 / ACTIVITY & RECALL ALERTS</p>
                    <h2>Notifications</h2>
                  </div>
                  <span>{notifications.length} TOTAL</span>
                </div>

                {notifications.length === 0 ? (
                  <p className="empty-message">You're all caught up.</p>
                ) : (
                  <div className="data-list">
                    {notifications.map(notification => (
                      <article className="data-row" key={notification.id}>
                        <div>
                          <strong>{notification.message}</strong>
                          <p style={{ margin: '2px 0', fontSize: '12px', color: notification.read ? 'var(--muted)' : '#b91c1c' }}>
                            {notification.read ? 'Read' : '● Unread Alert'}
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {!notification.read && (
                            <button
                              className="add-fact-button"
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                              onClick={() => handleMarkNotificationRead(notification.id)}
                            >
                              Mark read
                            </button>
                          )}
                          <span className="record-id">NOTIF #{notification.id}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* PASSPORT MODAL */}
          {viewingPassport && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999,
              }}
              onClick={() => setViewingPassport(null)}
            >
              <div
                style={{
                  background: 'var(--paper)',
                  padding: '30px',
                  borderRadius: '6px',
                  maxWidth: '500px',
                  width: '90%',
                  border: '1px solid var(--border)',
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontFamily: 'Fraunces, serif' }}>Verification Passport</h3>
                  <button className="add-fact-button" onClick={() => setViewingPassport(null)}>
                    ✕ Close
                  </button>
                </div>
                <hr style={{ margin: '15px 0', borderColor: 'var(--border)' }} />
                <p><strong>Code:</strong> <code>{viewingPassport.code}</code></p>
                <p><strong>Asset:</strong> {viewingPassport.asset_title}</p>
                <p><strong>Status:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{viewingPassport.status}</span></p>
                <p><strong>Approved by:</strong> {viewingPassport.reviewer_first_name || 'Reviewer'}</p>
                <p><strong>Approved at:</strong> {new Date(viewingPassport.approved_at).toLocaleString()}</p>
                <p><strong>Guidelines:</strong> {viewingPassport.guideline_version_label}</p>
                <p><strong>Verified Facts Linked:</strong> {viewingPassport.linked_facts_count}</p>
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <img
                    src={`${API_BASE_URL}/passports/${viewingPassport.code}/qr.png`}
                    alt="Passport QR Code"
                    style={{ width: '160px', height: '160px', border: '1px solid #ccc', padding: '6px' }}
                  />
                  <br />
                  <small style={{ color: 'var(--muted)' }}>Scan with any phone to verify provenance without leaking asset content.</small>
                </div>
              </div>
            </div>
          )}
          {loadingPassport && (
            <p className="loading-message">Fetching public passport record...</p>
          )}
        </section>
      </main>
    )
  }

  // --- LOGIN SCREEN ---
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
            consistent, and accountable — before publication and throughout product updates.
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
              <div className="waking-server-banner">
                <div className="spinner" />
                <div>
                  <strong>Waking the server (about 30 seconds)...</strong>
                  <div className="waking-subtext">Free-tier hosting spins down when idle. Connecting to BrandPilot backend...</div>
                </div>
              </div>
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
