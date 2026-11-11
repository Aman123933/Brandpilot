# BrandPilot Architecture & System Design

This document details the architecture, data models, workflows, and infrastructure design for BrandPilot.

---

## 1. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Clients["Clients"]
        Browser["Vite React SPA / Mobile Web"]
        PublicVerifier["Public Consumers / QR Scanners"]
        CronService["External Cron (cron-job.org)"]
    end

    subgraph AppServer["FastAPI Backend (Render)"]
        Router["FastAPI Router & Auth Middleware"]
        Scheduler["APScheduler Background Daemon"]
        RulesEngine["Deterministic Rules Engine"]
        BrandGitEngine["Brand Git Diff & Replay Engine"]
        RecallService["Automated Expiry & Recall Service"]
        GeminiClient["Gemini AI Client + Rate Limiter & Fallback"]
    end

    subgraph DataStorage["Persistence Layer (Supabase PostgreSQL / SQLite)"]
        UserTable["Users & Login Attempts"]
        AssetTable["Assets & Revisions"]
        FactTable["Facts & Fact Versions"]
        GuidelineTable["Guidelines & Guideline Versions"]
        PassportTable["Passports & Dependency Maps"]
        CacheTable["AiCache & AiCallLogs"]
        ReplayTable["ReplayRuns & ExpiryRuns"]
    end

    subgraph ExternalServices["External AI Services"]
        GeminiPrimary["Gemini 3.8 Flash (Primary)"]
        GeminiFallback["Gemini 3.5 Flash / 3.1 Flash-Lite (Fallbacks)"]
    end

    Browser -->|JWT Bearer Auth| Router
    PublicVerifier -->|Public Read| Router
    CronService -->|X-Cron-Secret| Router

    Router --> RulesEngine
    Router --> BrandGitEngine
    Router --> RecallService
    Router --> GeminiClient
    Scheduler --> RecallService

    GeminiClient --> GeminiPrimary
    GeminiClient -.->|On 429/503/Timeout| GeminiFallback

    RulesEngine --> DataStorage
    BrandGitEngine --> DataStorage
    RecallService --> DataStorage
    GeminiClient --> CacheTable
    Router --> DataStorage
```

---

## 2. Data Models & Entity Relationships

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : contains
    ORGANIZATION ||--o{ FACT : owns
    ORGANIZATION ||--o{ GUIDELINE : owns
    ORGANIZATION ||--o{ CONTENT_ASSET : owns

    USER ||--o{ CONTENT_ASSET : creates
    USER ||--o{ APPROVAL : decides
    USER ||--o{ NOTIFICATION : receives

    FACT ||--o{ FACT_VERSION : versioned_by
    GUIDELINE ||--o{ GUIDELINE_VERSION : versioned_by
    GUIDELINE_VERSION ||--o{ REPLAY_RUN : evaluated_by

    CONTENT_ASSET ||--o{ ASSET_REVISION : revisioned_by
    CONTENT_ASSET ||--o{ FINDING : flags
    CONTENT_ASSET ||--o{ APPROVAL : reviewed_by
    CONTENT_ASSET ||--o| PASSPORT : certified_by

    PASSPORT ||--o{ ASSET_FACT_LINK : depends_on
    PASSPORT ||--o{ ASSET_GUIDELINE_LINK : depends_on
```

### Key Tables
1. **`organizations`**: Multi-tenant boundaries. All asset, fact, guideline, and activity records belong to an organization.
2. **`users`**: Team members with assigned roles (`brand_manager`, `creator`, `reviewer`), PBKDF2 password hashes, and cryptographic salts.
3. **`guideline_versions`**: Immutable version history for rules (banned terms, required phrases, claims). Tracks `status` (`draft`, `active`, `archived`, `rejected`), `change_note`, and creator.
4. **`facts` & `fact_versions`**: Source-of-truth claim values with effective date ranges (`valid_from`, `valid_until`) and active flags.
5. **`passports`**: Cryptographic certificates of compliance with unique public codes, status (`valid`, `review_required`, `withdrawn`), approval snapshots, and withdrawal audit trails.
6. **`asset_fact_links` & `asset_guideline_links`**: The dependency graph capturing the exact fact versions and guideline versions frozen at time of approval.
7. **`replay_runs`**: Persisted outcomes of deterministic rule replays against asset corpora.
8. **`expiry_runs`**: Historical logs of claim expiration sweeps.
9. **`ai_cache` & `ai_call_logs`**: Permanent database cache of AI outputs and hourly rate limit tracking.

---

## 3. Brand Git Workflow (Replay & Activation)

```mermaid
sequenceDiagram
    autonumber
    actor BM as Brand Manager
    participant API as FastAPI Router
    participant BG as Brand Git Service
    participant DB as Database

    BM->>API: POST /guidelines/{id}/versions (Draft new rules)
    API->>DB: Store GuidelineVersion (status=draft)
    API-->>BM: Return draft version metadata

    BM->>API: GET /guidelines/{id}/diff?from=active&to=draft
    API->>BG: compute_guideline_diff()
    BG-->>API: Return added, removed, modified rules
    API-->>BM: Return semantic diff

    BM->>API: POST /guidelines/{id}/versions/{v}/replay
    Note over API,BG: ZERO Gemini tokens used (Deterministic rules only)
    API->>BG: run_deterministic_replay(all_assets)
    BG->>DB: Store ReplayRun with newly flagged/cleared items
    API-->>BM: Return replay impact summary

    BM->>API: POST /guidelines/{id}/versions/{v}/activate
    API->>DB: Verify ReplayRun exists for version
    API->>DB: Set previous active -> archived
    API->>DB: Set draft version -> active
    API->>DB: Create ActivityLog & Notification
    API-->>BM: Return active status & affected assets count
```

---

## 4. Automated Expiry & Post-Publication Recall

```mermaid
sequenceDiagram
    autonumber
    participant Trigger as Scheduler / Startup / Cron / Lazy User
    participant RS as Recall Service
    participant DB as Database
    participant Creator as Asset Creator

    Trigger->>RS: check_expired_facts(source)
    RS->>DB: Query FactVersions where valid_until < now
    loop For each expired fact version
        RS->>DB: Query AssetFactLinks referencing expired version
        loop For each affected asset
            RS->>DB: Update Passport status -> review_required
            RS->>DB: Update ContentAsset status -> needs_revalidation
            RS->>DB: Check if notification already exists for creator + fact_version_id
            alt Not yet notified
                RS->>DB: Insert Notification for creator (deduplicated)
            end
        end
    end
    RS->>DB: Record ExpiryRun telemetry
```

---

## 5. AI Safety & Quota Architecture

BrandPilot employs a multi-tier defense system to prevent quota depletion and ensure 100% service uptime:

1. **Deterministic Rule Priority**: Banned terms, numerical claims, and required phrases are checked via deterministic regex and substring rules before any AI call.
2. **Deterministic Replay Guarantee**: Brand Git replay runs over entire corpora without calling Gemini.
3. **Database-Backed Persistent Cache (`AiCache`)**: AI audit and red-team findings are keyed by SHA-256 hashes of the content and active rule IDs. Identical requests never call the API twice.
4. **Per-User Rate Limiting (`AiCallLog`)**: Enforces a strict maximum of 5 AI calls per hour per user.
5. **Multi-Model Fallback Chain**:
   - Primary: `GEMINI_MODEL` (`gemini-3.8-flash`)
   - Fallbacks: `GEMINI_FALLBACK_MODELS` (`gemini-3.5-flash`, `gemini-3.1-flash-lite`)
   - Non-retryable errors (400 Bad Request) immediately halt without burning fallback quota.
   - If all models fail, returns `ai_available=False` with a human-readable `ai_message` while preserving all deterministic findings.
