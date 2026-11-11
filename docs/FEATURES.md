# BrandPilot Feature Matrix

This document provides a comprehensive and honest inventory of all BrandPilot features, their current implementation status, and backend endpoint coverage.

---

## 1. Feature Status Summary

- **Built**: Fully implemented, backed by persistent data models, and verified by automated tests.
- **Partially Built**: Backend logic and API endpoints complete; extended UI or external integrations planned.
- **Planned**: Documented in product architecture for future development milestones.

---

## 2. Core Capabilities

### Authentication & Tenant Security
| Feature | Status | Description | Backend Endpoint |
|---|---|---|---|
| PBKDF2 Password Hashing | **Built** | 210,000 iterations PBKDF2-HMAC-SHA256 with per-user cryptographic salt | `POST /auth/login` |
| Demo Credentials Discovery | **Built** | Honors `DEMO_MODE=true` to provide 1-click credentials for Maya, Dev, and Sana | `GET /auth/demo-credentials` |
| Brute-Force Throttling | **Built** | 5 failed login attempts within 10 minutes triggers 429 Too Many Requests | `POST /auth/login` |
| Multi-Tenant Isolation | **Built** | Strict organization boundary enforcement; cross-tenant resources return 404 | All endpoints |
| Role-Based Access Control | **Built** | Three distinct roles (`brand_manager`, `creator`, `reviewer`) with strict enforcement | All endpoints |
| Legacy Demo Login | **Built** | Backward compatibility with early round test harnesses | `POST /auth/demo-login` |

### Asset Ingestion & Parsing
| Feature | Status | Description | Backend Endpoint |
|---|---|---|---|
| Text Ingestion | **Built** | Raw UTF-8 and Latin-1 plain text parsing | `POST /assets`, `POST /assets/upload` |
| Microsoft Word (`.docx`) | **Built** | Paragraph and table text extraction via `python-docx` | `POST /assets/upload` |
| PDF Document Parsing | **Built** | Multi-page text extraction via `PyMuPDF` (`fitz`) | `POST /assets/upload` |
| File Size & Format Guards | **Built** | Strict 5MB limit and `.txt`, `.docx`, `.pdf` whitelist (400 on violations) | `POST /assets/upload` |
| Revision History | **Built** | Automatic revision incrementing with snapshot history | `GET /assets/{id}` |

### Brand Governance & Auditing
| Feature | Status | Description | Backend Endpoint |
|---|---|---|---|
| Deterministic Rules Engine | **Built** | Fast substring and regex checks for banned terms and required product phrases | `POST /assets/{id}/audit` |
| Fact Accuracy Checks | **Built** | Cross-referencing against active fact registry; detects expired facts & mismatches | `POST /assets/{id}/audit` |
| Stable Rule Identifiers | **Built** | Every finding carries a stable `rule_id` (e.g. `BT-001`) with ownership | `GET /assets/{id}/findings` |
| Gemini AI Brand Assist | **Built** | Tone evaluation, contextual claims verification, and suggestion generation | `POST /assets/{id}/audit` |
| AI Quota & Rate Guard | **Built** | 5 calls/hour per user rate limit with persistent cache (`AiCache` table) | `POST /assets/{id}/audit` |
| Multi-Model Fallback | **Built** | Automatic retry on 429/503/timeout across fallback model chain | `POST /assets/{id}/audit` |
| Brand Red-Team Simulation | **Built** | Adversarial review across 3 personas (Journalist, Competitor, Skeptical Customer) | `POST /assets/{id}/redteam` |
| Finding Acceptance & Dismissal | **Built** | Apply suggestions automatically or dismiss with human justification | `PATCH /findings/{id}` |

### Brand Git (Guideline Version Control)
| Feature | Status | Description | Backend Endpoint |
|---|---|---|---|
| Version Lifecycle Management | **Built** | `draft`, `active`, `archived`, and `rejected` guideline version states | `/guidelines/{id}/versions` |
| Semantic Rule Diffing | **Built** | Granular diff calculation categorizing rules into added, removed, or modified | `GET /guidelines/{id}/diff` |
| Deterministic Replay Engine | **Built** | Replays proposed rules against all current asset revisions with zero Gemini quota | `POST /guidelines/{id}/versions/{v}/replay` |
| Replay Telemetry Storage | **Built** | Persists replay summary and newly flagged / newly cleared assets | `GET /guidelines/{id}/versions/{v}/replay` |
| Version Activation Gate | **Built** | Activation strictly requires a completed replay; automatically archives prior active | `POST /guidelines/{id}/versions/{v}/activate` |
| Version Rejection | **Built** | Rejects drafts with mandatory reviewer notes and audit logging | `POST /guidelines/{id}/versions/{v}/reject` |

### Executive Insights & Analytics
| Feature | Status | Description | Backend Endpoint |
|---|---|---|---|
| Executive KPI Overview | **Built** | SQL-aggregated totals, compliance rate, turnaround time, and risk counts | `GET /insights/overview` |
| Violation Trend Analysis | **Built** | Top violated rules, trend across 7/30/90 days, and creator breakdown | `GET /insights/violations` |
| Disputed Rules Tracking | **Built** | Tracks rules frequently dismissed by creators or reviewers to guide policy refinement | `GET /insights/disputed-rules` |
| Per-Asset Health Matrix | **Built** | Consolidated view of open findings, passport statuses, and audit timestamps | `GET /insights/assets` |

### Automated Expiry & Post-Publication Recall
| Feature | Status | Description | Backend Endpoint |
|---|---|---|---|
| In-Process Scheduler | **Built** | APScheduler background daemon running every `EXPIRY_CHECK_INTERVAL_MINUTES` | Internal daemon |
| Startup Verification | **Built** | Automatic expiration sweep at server startup | `lifespan` |
| Secured External Cron | **Built** | Secured with `X-Cron-Secret` header for external triggers on free-tier hosting | `POST /cron/expiry` |
| Lazy User-Triggered Sweep | **Built** | Throttled sweep (max once per 10m) on asset or fact loads | `/assets`, `/facts` |
| Notification Deduplication | **Built** | Notifies content creators once per fact version (no repeated spam) | `GET /notifications` |
| Expiry Telemetry Status | **Built** | Comprehensive report on last run source, interval, and upcoming expiries | `GET /admin/expiry-status` |

### Brand Passport & Verification
| Feature | Status | Description | Backend Endpoint |
|---|---|---|---|
| Digital Passport Issuance | **Built** | Cryptographic snapshot of linked facts and active guideline version on approval | `POST /assets/{id}/decision` |
| Logged-In Passport View | **Built** | Complete view for internal teams including withdrawal reasons and audit details | `GET /passports/{code}` |
| Public Verification Stamp | **Built** | Shareable verification page with privacy redaction (no raw body or private facts) | `GET /passports/{code}/public` |
| Formal Passport Revocation | **Built** | Revocation with mandatory reason tracking; returns 409 if already withdrawn | `POST /passports/{code}/withdraw` |
| QR Code Generation | **Built** | Embeddable SVG QR code pointing to public verification URL | `GET /passports/{code}/qr` |

### Integrations & Ecosystem (Roadmap)
| Feature | Status | Description | Backend Endpoint |
|---|---|---|---|
| Figma & Design Tool Plugin | **Planned** | Pre-export guideline checks inside design tools | Planned |
| Slack / Teams Webhooks | **Partially Built** | Activity log infrastructure ready; external webhook dispatch planned | Planned |
| CMS Auto-Unpublish Webhook | **Planned** | Webhook triggered on passport status transition to `review_required` | Planned |
