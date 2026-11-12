import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { assetsApi } from '../api/client'
import { formatDate } from '../utils/formatters'
import { Badge } from '../components/common/Badge'
import { Modal } from '../components/common/Modal'
import { SkeletonTable } from '../components/common/Skeleton'
import { EmptyState } from '../components/common/EmptyState'
import { useToast } from '../components/common/useToast'

const ALLOWED_EXTENSIONS = ['.txt', '.docx', '.pdf']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export function AssetsPage() {
  const { isCreator, isManager } = useAuth()
  const { addToast } = useToast()

  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Create Text Draft Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [draftError, setDraftError] = useState('')

  // Upload Document Modal
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const data = await assetsApi.list()
        if (mounted) setAssets(Array.isArray(data) ? data : [])
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load assets.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => {
      mounted = false
    }
  }, [])

  async function refreshAssets() {
    try {
      const data = await assetsApi.list()
      setAssets(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Could not load assets.')
    }
  }

  // Handle Text Draft Submit
  async function handleCreateDraft(e) {
    e.preventDefault()
    if (!draftTitle.trim() || !draftBody.trim()) {
      setDraftError('Both title and body text are required.')
      return
    }

    setCreatingDraft(true)
    setDraftError('')
    try {
      await assetsApi.create({
        title: draftTitle.trim(),
        body: draftBody.trim(),
      })
      addToast(`Asset '${draftTitle}' created as Revision 1.`, 'success')
      setShowCreateModal(false)
      setDraftTitle('')
      setDraftBody('')
      await refreshAssets()
    } catch (err) {
      setDraftError(err.message || 'Failed to create asset draft.')
    } finally {
      setCreatingDraft(false)
    }
  }

  // Handle File Selection with Client Validation
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    setUploadError('')
    if (!file) {
      setSelectedFile(null)
      return
    }

    // Validate Empty File
    if (file.size === 0) {
      setUploadError('The selected file is empty (0 bytes). Please choose a valid document.')
      setSelectedFile(null)
      return
    }

    // Validate File Size (5MB)
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File size exceeds the 5 MB limit. Please upload a smaller document.')
      setSelectedFile(null)
      return
    }

    // Validate Extension
    const name = file.name.toLowerCase()
    const hasValidExt = ALLOWED_EXTENSIONS.some(ext => name.endsWith(ext))
    if (!hasValidExt) {
      setUploadError('Invalid file type. Only .txt, .docx, and .pdf documents are supported.')
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
    if (!uploadTitle.trim()) {
      // Pre-fill title from filename
      const defaultTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      setUploadTitle(defaultTitle.charAt(0).toUpperCase() + defaultTitle.slice(1))
    }
  }

  // Handle Upload Submit
  async function handleUploadSubmit(e) {
    e.preventDefault()
    if (!selectedFile) {
      setUploadError('Please select a file to upload.')
      return
    }
    if (!uploadTitle.trim()) {
      setUploadError('Please provide an asset title.')
      return
    }

    setUploading(true)
    setUploadError('')

    const formData = new FormData()
    formData.append('title', uploadTitle.trim())
    formData.append('file', selectedFile)

    try {
      await assetsApi.upload(formData)
      addToast(`Document '${uploadTitle}' uploaded and parsed as Revision 1.`, 'success')
      setShowUploadModal(false)
      setUploadTitle('')
      setSelectedFile(null)
      await refreshAssets()
    } catch (err) {
      setUploadError(err.message || 'Failed to upload document.')
    } finally {
      setUploading(false)
    }
  }

  const filteredAssets = statusFilter === 'all'
    ? assets
    : assets.filter(a => a.status === statusFilter)

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">GOVERNANCE / CONTENT PIPELINE</p>
          <h1 className="display-font">Content Assets</h1>
          <p className="page-subtitle">
            Audited copywriting drafts and ingested marketing collateral tracked across revisions.
          </p>
        </div>

        {(isCreator || isManager) && (
          <div className="header-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => {
                setUploadError('')
                setShowUploadModal(true)
              }}
            >
              Upload Document (.txt, .docx, .pdf)
            </button>
            <button
              type="button"
              className="action-button primary"
              onClick={() => {
                setDraftError('')
                setShowCreateModal(true)
              }}
            >
              + Create Text Draft
            </button>
          </div>
        )}
      </header>

      {error && <div className="alert-box alert-vermilion" role="alert">{error}</div>}

      {/* Filter Tabs */}
      <div className="filter-tabs-row" role="tablist" aria-label="Filter assets by status">
        {['all', 'draft', 'in_review', 'approved', 'review_required', 'changes_requested', 'rejected', 'withdrawn'].map(st => (
          <button
            key={st}
            type="button"
            className={`filter-tab mono-font ${statusFilter === st ? 'active' : ''}`}
            onClick={() => setStatusFilter(st)}
            role="tab"
            aria-selected={statusFilter === st}
          >
            {st.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : filteredAssets.length === 0 ? (
        <EmptyState
          title={`No ${statusFilter === 'all' ? '' : statusFilter.replace('_', ' ') + ' '}assets found`}
          description={
            statusFilter === 'all'
              ? 'Draft or upload your first copy asset to run automated brand checks.'
              : 'Try selecting a different status filter above.'
          }
          actionText={(isCreator || isManager) && statusFilter === 'all' ? "Create Draft Copy" : null}
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <div className="table-responsive">
          <table className="editorial-table" aria-label="Content Assets Table">
            <thead>
              <tr>
                <th scope="col">Asset Title</th>
                <th scope="col">Status</th>
                <th scope="col">Revision</th>
                <th scope="col">Passport</th>
                <th scope="col">Created</th>
                <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map(asset => (
                <tr key={asset.id}>
                  <td>
                    <Link to={`/app/assets/${asset.id}`} className="item-title-link">
                      <strong>{asset.title}</strong>
                    </Link>
                  </td>
                  <td>
                    <Badge status={asset.status} />
                  </td>
                  <td className="mono-font">
                    Rev {asset.current_revision || 1}
                  </td>
                  <td>
                    {asset.passport_code ? (
                      <Link
                        to={`/app/passports/${asset.passport_code}`}
                        className="mono-font passport-link-pill"
                      >
                        {asset.passport_code}
                      </Link>
                    ) : (
                      <span className="mono-font" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                        None
                      </span>
                    )}
                  </td>
                  <td className="mono-font" style={{ fontSize: '11px' }}>
                    {formatDate(asset.created_at)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      to={`/app/assets/${asset.id}`}
                      className="action-button secondary small"
                    >
                      Open Review Desk →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Text Draft Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Content Asset Draft"
        maxWidth="600px"
      >
        <form onSubmit={handleCreateDraft} className="editorial-form">
          {draftError && <div className="alert-box alert-vermilion" role="alert">{draftError}</div>}

          <div className="form-group">
            <label htmlFor="draft-title">Asset Title</label>
            <input
              id="draft-title"
              type="text"
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              placeholder="e.g. Kestrel One Holiday Campaign"
              required
              disabled={creatingDraft}
            />
          </div>

          <div className="form-group">
            <label htmlFor="draft-body">Body Copy</label>
            <textarea
              id="draft-body"
              rows={6}
              value={draftBody}
              onChange={e => setDraftBody(e.target.value)}
              placeholder="Paste or write marketing draft copy here..."
              required
              disabled={creatingDraft}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={creatingDraft}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="action-button primary"
              disabled={creatingDraft}
            >
              {creatingDraft ? 'Saving Draft...' : 'Create Draft & Open Desk'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Upload Document Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Upload Document"
      >
        <form onSubmit={handleUploadSubmit} className="editorial-form">
          {uploadError && <div className="alert-box alert-vermilion" role="alert">{uploadError}</div>}

          <div className="form-group">
            <label htmlFor="upload-title">Asset Title</label>
            <input
              id="upload-title"
              type="text"
              value={uploadTitle}
              onChange={e => setUploadTitle(e.target.value)}
              placeholder="e.g. Q4 Press Release"
              required
              disabled={uploading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="upload-file">Select Document (.txt, .docx, .pdf, max 5 MB)</label>
            <input
              id="upload-file"
              type="file"
              accept=".txt,.docx,.pdf"
              onChange={handleFileChange}
              required
              disabled={uploading}
            />
            <small className="form-help">
              Plain text, Microsoft Word (.docx), and Adobe PDF documents up to 5 MB.
            </small>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => setShowUploadModal(false)}
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="action-button primary"
              disabled={uploading || !selectedFile}
            >
              {uploading ? 'Extracting & Parsing...' : 'Upload & Ingest'}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  )
}
