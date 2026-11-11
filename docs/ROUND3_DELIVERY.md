# Round 3 Delivery: Core Improvements

This document details the three major capability improvements completed for Round 3 of the hackathon: **Brand Git**, **Insights**, and **Expiry Automation**.

---

## 1. Brand Git (Guideline Versioning & Deterministic Replay)

### What Was Built
- **Stable Rule Identifiers**: Rules carry stable identifiers (e.g. `BT-001`, `BT-002`, `RP-001`) with owners and clear reasoning.
- **Full Version Lifecycle**: Guideline versions progress through `draft` -> `active` -> `archived` or `rejected`. Drafts allow brand managers to prepare rule changes without immediately disrupting production assets.
- **Semantic Diff Engine**: Computes granular added, modified, and removed rules between any two versions (`/guidelines/{id}/diff?from=A&to=B`).
- **Deterministic Replay (Zero Gemini Quota)**: Evaluates proposed guideline rule sets across all or in-scope content assets using deterministic regex and substring rules. Never consumes Gemini tokens or API quotas. Replay results are persisted (`ReplayRun` table).
- **Safe Activation Gate**: `POST /guidelines/{id}/versions/{v}/activate` strictly requires a recorded replay before activation. Activating archives the previous active version and updates the rule set.

### API Routes
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/guidelines/{id}/versions` | List all versions with metadata and latest replay summary |
| `POST` | `/guidelines/{id}/versions` | Create a new draft guideline version |
| `GET` | `/guidelines/{id}/diff?from=A&to=B` | Semantic rule diff between version A and version B |
| `POST` | `/guidelines/{id}/versions/{v}/replay` | Run deterministic replay over assets |
| `GET` | `/guidelines/{id}/versions/{v}/replay` | Retrieve stored replay run result |
| `POST` | `/guidelines/{id}/versions/{v}/activate` | Activate a version (requires replay first; archives previous) |
| `POST` | `/guidelines/{id}/versions/{v}/reject` | Reject a proposed draft with note |

### Tests Proving This Feature
- `backend/tests/test_contract_round3.py::test_contract_brand_git_endpoints`
- `backend/tests/test_contract_round3.py::test_brand_git_diff_details_and_replay`
- `backend/tests/test_contract_round3.py::test_permission_matrix` (creator/reviewer cannot create or activate versions)
- `backend/tests/test_contract_round3.py::test_idempotency_and_conflicts` (activating active version returns 409)

---

## 2. Executive Insights & Compliance Analytics

### What Was Built
- **SQL-Aggregated Metrics**: Efficient SQL grouping across content assets, approvals, findings, and passports (no in-memory Python row looping).
- **Overview Dashboard**: High-level KPI summary including total assets by status, compliance rate percentage, pending approvals, average hours to review decision, outdated content items, and findings breakdown by severity and kind.
- **Violations Trends**: Breakdown of top violated rules, violation frequency by day (over 7, 30, or 90 days), and breakdown by content creator.
- **Disputed Rules Tracker**: Identifies rules with high frequencies of dismissed findings, helping brand teams identify overly rigid or confusing guidelines.
- **Asset Health Matrix**: Detailed list of assets with passport status, open high/total findings, and compliance indicators.

### API Routes
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/insights/overview` | Executive KPI dashboard metrics |
| `GET` | `/insights/violations?days=30` | Top violated rules, trend by day, and by creator |
| `GET` | `/insights/disputed-rules` | Rules frequently dismissed by reviewers or creators |
| `GET` | `/insights/assets` | Per-asset compliance and review health overview |

### Tests Proving This Feature
- `backend/tests/test_contract_round3.py::test_contract_insights_endpoints`
- `backend/tests/test_contract_round3.py::test_insights_seeded_data_metrics`

---

## 3. Expiry Automation & Multi-Tier Monitoring

### What Was Built
- **In-Process APScheduler**: Singleton background scheduler running every `EXPIRY_CHECK_INTERVAL_MINUTES` (default 60 minutes) to check expiring claims and facts.
- **Startup Verification**: Automatic expiration sweep on application startup.
- **Secured Cron Endpoint**: `POST /cron/expiry` protected by the `X-Cron-Secret` header, enabling external schedulers (e.g. cron-job.org, GitHub Actions, or Render cron) to trigger checks on sleeping free-tier hosting.
- **Lazy Throttled Sweep**: When signed-in users load `/assets` or `/facts`, a background check runs lazily at most once every 10 minutes.
- **Deduplicated Notifications**: Each content asset creator is notified strictly once per expired fact version, preventing inbox spam across repeated cron sweeps.
- **Admin Expiry Telemetry**: `GET /admin/expiry-status` returns last run timestamp, source (`startup`, `scheduler`, `manual`, `cron`, `lazy`), upcoming expiries in the next 7/14/30 days, and scheduling health.

### API Routes
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/expiry-status` | Status, telemetry, last run source, and upcoming expiries |
| `POST` | `/admin/run-expiry-check` | Manual expiry check trigger (manager only) |
| `POST` | `/cron/expiry` | External cron trigger secured with `X-Cron-Secret` header |

### Tests Proving This Feature
- `backend/tests/test_contract_round3.py::test_contract_admin_and_cron_endpoints`
- `backend/tests/test_contract_round3.py::test_expiry_deduplication`
- `backend/tests/test_lifecycle_and_recall.py::test_admin_run_expiry_check`
