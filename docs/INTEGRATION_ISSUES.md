# BrandPilot Frontend-Backend Integration Notes (Round 3)

This log records observations, schema differences, and field mappings discovered during end-to-end integration testing against the live Python/FastAPI backend (`origin/r3-backend`).

Per the competition rules, **zero backend files were edited**; all variations were resolved defensively within the frontend client layer (`frontend/**`) or recorded here.

---

## 1. Resolved on the Frontend Side

### A. Review Queue Item Identifier & Count Fields
- **Observation**: `GET /reviews/queue` returns items with `asset_id` instead of `id`, and count metrics as `open_findings_count` and `high_severity_findings_count` rather than `open_high_findings` and `open_total_findings`.
- **Frontend Resolution**: In `frontend/src/pages/ReviewsPage.jsx`, queue items are normalized upon intake:
  ```javascript
  const normalizeQueueItem = item => ({
    ...item,
    id: item.id ?? item.asset_id,
    asset_id: item.asset_id ?? item.id,
    open_high_findings: item.open_high_findings ?? item.high_severity_findings_count ?? 0,
    open_total_findings: item.open_total_findings ?? item.open_findings_count ?? 0,
    submitted_at: item.submitted_at || item.created_at,
  })
  ```
  This ensures compatibility whether connected to the mock server or the live backend.

### B. Demo Account Credentials in Database Seed
- **Observation**: In the backend database seed (`backend/app/seed.py`), demo accounts (`maya@kestrelaudio.com`, `dev@kestrelaudio.com`, `sana@kestrelaudio.com`) are provisioned with password `Demo@2026`.
- **Frontend Resolution**:
  - The login screen dynamically consumes `GET /auth/demo-credentials` and never hardcodes credentials.
  - The mock server (`frontend/mock/server.mjs`) was aligned to serve `Demo@2026` while accepting either `Demo@2026` or `Password123!` to maintain dual compatibility across environments.

### C. Dynamic Passport Identifier Tracking in E2E Journeys
- **Observation**: The real backend generates randomized alphanumeric passport codes upon reviewer approval (e.g. `BP-JSPG-PX`), whereas static mock fixtures used `BP-2026-9041`.
- **Frontend Resolution**: Playwright test suites capture the issued passport code directly from the decision response/toast notification and reuse that dynamic code for subsequent passport inspection, manager withdrawal, and public verification journeys.

### D. Notification Routing by Role
- **Observation**: When a brand fact evolves or an asset is approved, the real backend dispatches notifications specifically to the asset owner (`user_id = asset.creator_id`), rather than to the manager who triggered the update.
- **Frontend Resolution**: Playwright tests switch into the content creator account (`dev@kestrelaudio.com`) to inspect and assert the arrival of fact-evolution and recall notices.

---

## 2. Items for Teammate / Backend Awareness (No Frontend Blockers)

1. **Review Queue Schema Field Redundancy**:
   - In future iterations, `backend/app/schemas.py:ReviewQueueItem` could include an `id: int` alias pointing to `asset_id` to prevent third-party consumers from expecting `id`.
   - The frontend currently tolerates either shape without issue.

2. **CORS Headers for Multi-Origin Deployments**:
   - The backend `CORSMiddleware` allows all origins in development (`allow_origins=["*"]`). In production environments on Render/Railway, ensure specific origins are whitelisted if frontend and backend domains differ.

All 8 Playwright E2E journeys run cleanly to completion against both the live FastAPI backend and the standalone mock server with zero unhandled mismatches.
