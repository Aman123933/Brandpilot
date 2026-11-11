# BrandPilot API Reference

This document provides complete, accurate API contracts for the BrandPilot backend. The frontend is built directly against these specifications.

## Overview & Conventions

- **Base URL**: `http://localhost:8000` (configurable via `PUBLIC_BASE_URL`)
- **Interactive Documentation**: `http://localhost:8000/docs` (Swagger UI) and `http://localhost:8000/redoc` (ReDoc)
- **Authentication**: JWT Bearer token passed in the `Authorization` header:
  ```http
  Authorization: Bearer <access_token>
  ```
- **Error Format**: JSON object containing `detail`:
  ```json
  {
    "detail": "Description of error or role requirement"
  }
  ```

---

## Role Matrix

| Endpoint | Allowed Roles | Description |
|---|---|---|
| `GET /health` | Public | System and DB health check |
| `GET /auth/demo-users` | Public | Lists seeded demo users for role switching |
| `POST /auth/demo-login` | Public | Obtains JWT token for a given user ID |
| `GET /facts` | Authenticated (All) | Lists all active brand facts for the org |
| `POST /facts` | `brand_manager` | Creates a new fact and initial version v1 |
| `GET /facts/{id}` | Authenticated (All) | Retrieves fact details with version history |
| `POST /facts/{id}/versions` | `brand_manager` | Posts a new version of an existing fact |
| `GET /guidelines` | Authenticated (All) | Lists brand guidelines for the org |
| `POST /guidelines` | `brand_manager` | Creates a guideline with structured rules JSON |
| `GET /guidelines/{id}` | Authenticated (All) | Retrieves guideline and version history |
| `POST /guidelines/{id}/versions` | `brand_manager` | Posts a new version of a guideline |
| `GET /assets` | Authenticated (All) | Lists content assets submitted to the org |
| `POST /assets` | `creator`, `brand_manager` | Submits a new content asset (text draft) |
| `POST /assets/upload` | `creator`, `brand_manager` | Uploads .txt, .docx, or .pdf (up to 5MB), extracts & normalizes text as revision 1 |
| `GET /assets/{id}` | Authenticated (All) | Retrieves asset and revision history |
| `POST /assets/{id}/submit` | `creator`, `brand_manager` | Submits asset for review (requires prior audit, warns on open high findings) |
| `POST /assets/{id}/audit` | Authenticated (All) | Runs deterministic checks + Gemini Brand Audit, returns findings grouped by severity |
| `POST /assets/{id}/redteam` | Authenticated (All) | Runs Red Team analysis across 3 personas (Journalist, Competitor, Skeptical Customer) |
| `GET /assets/{id}/findings` | Authenticated (All) | Retrieves findings for asset, optionally filtered by revision |
| `PATCH /findings/{id}` | Authenticated (All) | Accepts or dismisses finding; accepting applies text edit as revision +1 and re-runs rules |
| `GET /reviews/queue` | `reviewer` | Review queue listing assets in review with open-finding counts |
| `POST /assets/{id}/decision` | `reviewer` | Records review decision (approved/rejected/changes_requested); links facts and creates Passport |
| `GET /assets/{id}/history` | Authenticated (All) | Full timeline of revisions, approvals, findings, and activity logs |
| `GET /passports/{code}/public` | Public | Public passport verification (strictly leaks no body text or fact values) |
| `GET /passports/{code}` | Authenticated (All) | Authenticated full passport view with referenced facts and approval history |
| `GET /passports/{code}/qr.png` | Public | Dynamic PNG QR code encoding public verification link |
| `POST /passports/{code}/withdraw` | `brand_manager` | Withdraws and revokes public validity of a passport |
| `GET /facts/{id}/impact` | Authenticated (All) | Previews affected approved assets before changing a fact value |
| `POST /admin/run-expiry-check` | `brand_manager` | Runs fact expiry check and triggers recall for expired facts |
| `GET /notifications` | Authenticated (All) | Lists user notifications |
| `PATCH /notifications/{id}/read` | Authenticated (All) | Marks notification as read |

---

## Seed Demo Users

The database initializes automatically with three demo users from the fictional brand **Kestrel Audio**:

| User ID | Name | Role | Email | Permissions |
|---|---|---|---|---|
| `1` | Maya Lin | `brand_manager` | `maya@kestrelaudio.com` | Creates & edits facts and guidelines, views assets |
| `2` | Dev Patel | `creator` | `dev@kestrelaudio.com` | Submits content assets, views approved facts & guidelines |
| `3` | Sana Miller | `reviewer` | `sana@kestrelaudio.com` | Reviews and audits assets (review actions in Step 2) |

---

## Endpoints

### 1. Health

#### `GET /health`
Returns system status and database connectivity.

**Response `200 OK`**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "database": "connected",
  "timestamp": "2026-11-04T12:00:00Z"
}
```

---

### 2. Authentication

#### `GET /auth/demo-users`
Retrieves seeded users for frontend "Continue as..." role selectors.

**Response `200 OK`**:
```json
[
  {
    "id": 1,
    "org_id": 1,
    "name": "Maya Lin",
    "email": "maya@kestrelaudio.com",
    "role": "brand_manager",
    "created_at": "2026-11-04T12:00:00Z"
  },
  {
    "id": 2,
    "org_id": 1,
    "name": "Dev Patel",
    "email": "dev@kestrelaudio.com",
    "role": "creator",
    "created_at": "2026-11-04T12:00:00Z"
  },
  {
    "id": 3,
    "org_id": 1,
    "name": "Sana Miller",
    "email": "sana@kestrelaudio.com",
    "role": "reviewer",
    "created_at": "2026-11-04T12:00:00Z"
  }
]
```

#### `POST /auth/demo-login`
Authenticates as any seeded demo user and returns a signed JWT token.

**Request Body**:
```json
{
  "user_id": 1
}
```

**Response `200 OK`**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "org_id": 1,
    "name": "Maya Lin",
    "email": "maya@kestrelaudio.com",
    "role": "brand_manager",
    "created_at": "2026-11-04T12:00:00Z"
  }
}
```

---

### 3. Facts

Facts represent single sources of brand truth (e.g. pricing, battery specifications, warranty durations). A fact's `key` remains stable; `versions` maintain history.

#### `GET /facts`
Lists all facts for the user's organization with their active `current_version`.

**Headers**:
```http
Authorization: Bearer <access_token>
```

**Response `200 OK`**:
```json
[
  {
    "id": 1,
    "org_id": 1,
    "key": "battery_life_hours",
    "owner_id": 1,
    "created_at": "2026-11-04T12:00:00Z",
    "current_version": {
      "id": 1,
      "fact_id": 1,
      "version": 1,
      "value": "24",
      "unit": "hours",
      "valid_from": "2026-10-05T12:00:00Z",
      "valid_until": "2027-11-04T12:00:00Z",
      "is_current": true,
      "source_note": "Acoustic engineering lab battery cycle test report v3.1",
      "created_by": 1,
      "created_at": "2026-11-04T12:00:00Z"
    }
  },
  {
    "id": 4,
    "org_id": 1,
    "key": "return_window_days",
    "owner_id": 1,
    "created_at": "2026-11-04T12:00:00Z",
    "current_version": {
      "id": 4,
      "fact_id": 4,
      "version": 1,
      "value": "30",
      "unit": "days",
      "valid_from": "2026-10-05T12:00:00Z",
      "valid_until": "2026-11-07T12:00:00Z",
      "is_current": true,
      "source_note": "Promotional holiday return policy (expiring soon)",
      "created_by": 1,
      "created_at": "2026-11-04T12:00:00Z"
    }
  }
]
```

#### `POST /facts`
Creates a new fact and its initial version (v1). Only `brand_manager` allowed.

**Request Body**:
```json
{
  "key": "waterproof_rating",
  "value": "IPX7",
  "unit": "IPX",
  "valid_from": "2026-11-04T12:00:00Z",
  "valid_until": "2027-11-04T12:00:00Z",
  "source_note": "IEC 60529 lab waterproof immersion test certificate #IPX-99"
}
```

**Response `201 Created`**:
```json
{
  "id": 7,
  "org_id": 1,
  "key": "waterproof_rating",
  "owner_id": 1,
  "created_at": "2026-11-04T12:00:00Z",
  "current_version": {
    "id": 7,
    "fact_id": 7,
    "version": 1,
    "value": "IPX7",
    "unit": "IPX",
    "valid_from": "2026-11-04T12:00:00Z",
    "valid_until": "2027-11-04T12:00:00Z",
    "is_current": true,
    "source_note": "IEC 60529 lab waterproof immersion test certificate #IPX-99",
    "created_by": 1,
    "created_at": "2026-11-04T12:00:00Z"
  },
  "versions": [
    {
      "id": 7,
      "fact_id": 7,
      "version": 1,
      "value": "IPX7",
      "unit": "IPX",
      "valid_from": "2026-11-04T12:00:00Z",
      "valid_until": "2027-11-04T12:00:00Z",
      "is_current": true,
      "source_note": "IEC 60529 lab waterproof immersion test certificate #IPX-99",
      "created_by": 1,
      "created_at": "2026-11-04T12:00:00Z"
    }
  ]
}
```

#### `GET /facts/{fact_id}`
Returns a fact by ID with its entire historical timeline of versions.

**Response `200 OK`**:
```json
{
  "id": 1,
  "org_id": 1,
  "key": "battery_life_hours",
  "owner_id": 1,
  "created_at": "2026-11-04T12:00:00Z",
  "current_version": {
    "id": 8,
    "fact_id": 1,
    "version": 2,
    "value": "28",
    "unit": "hours",
    "valid_from": "2026-11-04T12:00:00Z",
    "valid_until": "2027-11-04T12:00:00Z",
    "is_current": true,
    "source_note": "Firmware 2.0 optimization",
    "created_by": 1,
    "created_at": "2026-11-04T12:00:00Z"
  },
  "versions": [
    {
      "id": 8,
      "fact_id": 1,
      "version": 2,
      "value": "28",
      "unit": "hours",
      "valid_from": "2026-11-04T12:00:00Z",
      "valid_until": "2027-11-04T12:00:00Z",
      "is_current": true,
      "source_note": "Firmware 2.0 optimization",
      "created_by": 1,
      "created_at": "2026-11-04T12:00:00Z"
    },
    {
      "id": 1,
      "fact_id": 1,
      "version": 1,
      "value": "24",
      "unit": "hours",
      "valid_from": "2026-10-05T12:00:00Z",
      "valid_until": "2027-11-04T12:00:00Z",
      "is_current": false,
      "source_note": "Acoustic engineering lab battery cycle test report v3.1",
      "created_by": 1,
      "created_at": "2026-11-04T12:00:00Z"
    }
  ]
}
```

#### `POST /facts/{fact_id}/versions`
Creates a new version for an existing fact. Automatically updates older versions to `is_current: false` and sets the new version to `is_current: true`. Only `brand_manager` allowed.

**Request Body**:
```json
{
  "value": "28",
  "unit": "hours",
  "valid_from": "2026-11-04T12:00:00Z",
  "valid_until": "2027-11-04T12:00:00Z",
  "source_note": "Firmware 2.0 DSP optimization results"
}
```

**Response `201 Created`**:
```json
{
  "id": 8,
  "fact_id": 1,
  "version": 2,
  "value": "28",
  "unit": "hours",
  "valid_from": "2026-11-04T12:00:00Z",
  "valid_until": "2027-11-04T12:00:00Z",
  "is_current": true,
  "source_note": "Firmware 2.0 DSP optimization results",
  "created_by": 1,
  "created_at": "2026-11-04T12:00:00Z"
}
```

---

### 4. Guidelines

Guidelines define editorial policies, banned vocabulary, tone specifications, and claim validation rules.

#### `GET /guidelines`
Lists all brand guidelines for the organization.

**Response `200 OK`**:
```json
[
  {
    "id": 1,
    "org_id": 1,
    "title": "Kestrel Voice & Claims",
    "owner_id": 1,
    "created_at": "2026-11-04T12:00:00Z",
    "current_version": {
      "id": 1,
      "guideline_id": 1,
      "version": 1,
      "body": "Kestrel Audio brand voice guidelines and claims governance...",
      "rules": {
        "banned_terms": [
          {
            "term": "cheap",
            "why": "Undermines premium acoustic perception and craftsmanship",
            "preferred": "affordable"
          },
          {
            "term": "best in the world",
            "why": "Unsubstantiated superlative violating brand truth standards",
            "preferred": "industry-leading"
          },
          {
            "term": "guaranteed",
            "why": "Creates absolute legal warranties outside official terms",
            "preferred": "backed by our warranty"
          }
        ],
        "required_phrases": [
          "Kestrel One"
        ],
        "tone_notes": [
          "confident",
          "plain",
          "no hype"
        ],
        "claim_rules": [
          {
            "pattern": "% better",
            "requires_fact_key": null
          },
          {
            "pattern": "#1",
            "requires_fact_key": null
          }
        ]
      },
      "created_at": "2026-11-04T12:00:00Z",
      "is_active": true
    }
  }
]
```

#### `POST /guidelines`
Creates a new guideline and v1 version. Only `brand_manager` allowed.

**Request Body**:
```json
{
  "title": "Kestrel Voice & Claims",
  "body": "Guidelines governing tone, claims, and terminology for Kestrel products.",
  "rules": {
    "banned_terms": [
      {
        "term": "cheap",
        "why": "Undermines premium perception",
        "preferred": "affordable"
      }
    ],
    "required_phrases": ["Kestrel One"],
    "tone_notes": ["confident", "plain", "no hype"],
    "claim_rules": [
      {
        "pattern": "% better",
        "requires_fact_key": null
      }
    ]
  }
}
```

**Response `201 Created`**:
Returns `GuidelineDetailOut` containing the created guideline and initial version.

#### `GET /guidelines/{guideline_id}`
Retrieves a guideline with its version history.

**Response `200 OK`**:
```json
{
  "id": 1,
  "org_id": 1,
  "title": "Kestrel Voice & Claims",
  "owner_id": 1,
  "created_at": "2026-11-04T12:00:00Z",
  "current_version": {
    "id": 1,
    "guideline_id": 1,
    "version": 1,
    "body": "...",
    "rules": { ... },
    "created_at": "2026-11-04T12:00:00Z",
    "is_active": true
  },
  "versions": [ ... ]
}
```

#### `POST /guidelines/{guideline_id}/versions`
Creates a new version of an existing guideline. Only `brand_manager` allowed.

**Request Body**:
```json
{
  "body": "Updated guideline text for v2",
  "rules": {
    "banned_terms": [],
    "required_phrases": ["Kestrel Audio"],
    "tone_notes": ["confident"],
    "claim_rules": []
  },
  "is_active": true
}
```

**Response `201 Created`**:
Returns `GuidelineVersionOut`.

---

### 5. Content Assets

Content assets hold marketing copy, web copy, ad texts, or press releases.

#### `GET /assets`
Lists all content assets in the organization.

**Response `200 OK`**:
```json
[
  {
    "id": 1,
    "org_id": 1,
    "title": "Kestrel One Launch Ad Copy",
    "creator_id": 2,
    "body": "Experience rich, balanced sound with Kestrel One. Engineered for all-day listening with 24 hours of reliable battery life...",
    "source_filename": "kestrel_one_launch_clean.txt",
    "status": "draft",
    "current_revision": 1,
    "created_at": "2026-11-04T12:00:00Z",
    "updated_at": "2026-11-04T12:00:00Z"
  },
  {
    "id": 2,
    "org_id": 1,
    "title": "Kestrel One Social Media Promo",
    "creator_id": 2,
    "body": "Meet Kestrel One – simply the best headphones in the world! You won't believe how cheap these are at only $129...",
    "source_filename": "kestrel_one_social_promo_draft.txt",
    "status": "draft",
    "current_revision": 1,
    "created_at": "2026-11-04T12:00:00Z",
    "updated_at": "2026-11-04T12:00:00Z"
  }
]
```

#### `POST /assets`
Submits a new content asset. Creates the initial asset revision (rev 1). Allowed roles: `creator`, `brand_manager`.

**Request Body**:
```json
{
  "title": "Email Newsletter Announcement",
  "body": "The all-new Kestrel One has arrived with 24 hours of battery life and active noise reduction.",
  "source_filename": "newsletter.md"
}
```

**Response `201 Created`**:
```json
{
  "id": 3,
  "org_id": 1,
  "title": "Email Newsletter Announcement",
  "creator_id": 2,
  "body": "The all-new Kestrel One has arrived with 24 hours of battery life and active noise reduction.",
  "source_filename": "newsletter.md",
  "status": "draft",
  "current_revision": 1,
  "created_at": "2026-11-04T12:00:00Z",
  "updated_at": "2026-11-04T12:00:00Z",
  "revisions": [
    {
      "id": 3,
      "asset_id": 3,
      "revision": 1,
      "body": "The all-new Kestrel One has arrived with 24 hours of battery life and active noise reduction.",
      "created_at": "2026-11-04T12:00:00Z"
    }
  ]
}
```

#### `GET /assets/{asset_id}`
Retrieves a single asset and all historical revisions.

**Response `200 OK`**:
```json
{
  "id": 1,
  "org_id": 1,
  "title": "Kestrel One Launch Ad Copy",
  "creator_id": 2,
  "body": "Experience rich, balanced sound with Kestrel One. Engineered for all-day listening with 24 hours of reliable battery life...",
  "source_filename": "kestrel_one_launch_clean.txt",
  "status": "draft",
  "current_revision": 1,
  "created_at": "2026-11-04T12:00:00Z",
  "updated_at": "2026-11-04T12:00:00Z",
  "revisions": [
    {
      "id": 1,
      "asset_id": 1,
      "revision": 1,
      "body": "Experience rich, balanced sound with Kestrel One...",
      "created_at": "2026-11-04T12:00:00Z"
    }
  ]
}
```

#### `POST /assets/upload`
Uploads `.txt`, `.docx` (python-docx), or `.pdf` (PyMuPDF) files up to 5 MB. Extracts text, normalizes whitespace once at intake to keep character offsets stable, stores as revision 1, and records `source_filename`. Rejects unsupported file types and files exceeding 5 MB with a `400 Bad Request`.

Allowed roles: `creator`, `brand_manager`.

**Request**: Multipart form-data
- `file`: Binary file (.txt, .docx, or .pdf)
- `title` *(optional)*: Custom asset title string (defaults to formatted file name)

**Response `201 Created`**:
```json
{
  "id": 4,
  "org_id": 1,
  "title": "Q4 Press Release",
  "creator_id": 2,
  "body": "Experience rich, balanced sound with Kestrel One...",
  "source_filename": "q4_press_release.docx",
  "status": "draft",
  "current_revision": 1,
  "created_at": "2026-11-05T12:00:00Z",
  "updated_at": "2026-11-05T12:00:00Z",
  "revisions": [
    {
      "id": 4,
      "asset_id": 4,
      "revision": 1,
      "body": "Experience rich, balanced sound with Kestrel One...",
      "created_at": "2026-11-05T12:00:00Z"
    }
  ]
}
```

---

### 6. Content Analysis Engine (Audit, Red Team & Findings)

#### `POST /assets/{asset_id}/audit`
Runs the dual-layer audit engine:
1. **Deterministic Rules** (zero AI dependency):
   - Whole-word, case-insensitive banned terms from active guideline rules.
   - Unsupported superlatives and absolutes ("best", "#1", "guaranteed", "100%", "never fails", "number one", "revolutionary") flagged as `unsupported_claim` unless backed by a citation or fact.
   - Fact mismatches: extracts numbers and compares against current FactVersions; flags expired facts (`valid_until < today`) as "relies on expired fact".
   - Accessibility: ALL-CAPS runs over 4 words, unexplained jargon abbreviations on first use (e.g. `ANC`), and missing alt-text markers for image placeholders.
   - Character offsets verified to match exact text quotes.
2. **Gemini Brand Audit Assist**:
   - Semantic tone and messaging issues with constructive suggestions that preserve creator intent.
   - Validates that every quote exists in text and only provided fact/guideline IDs are cited (dropping hallucinated findings).
   - Robustness: 25s timeout, single retry on 429/5xx with backoff, SHA-256 caching by content hash + guideline version + fact versions. If AI fails, returns deterministic findings with `ai_available: false`.

Stores findings in the database for the current revision and returns them grouped by severity.

**Response `200 OK`**:
```json
{
  "asset_id": 2,
  "revision": 1,
  "ai_available": true,
  "total_findings": 5,
  "findings": {
    "high": [
      {
        "id": 1,
        "asset_id": 2,
        "revision": 1,
        "kind": "rule_violation",
        "severity": "high",
        "quote": "cheap",
        "start_offset": 86,
        "end_offset": 91,
        "explanation": "Banned term 'cheap' violates brand guidelines: Undermines premium acoustic perception and craftsmanship",
        "suggestion": "affordable",
        "source_type": "guideline",
        "source_ref": 1,
        "status": "open",
        "origin": "rules",
        "created_at": "2026-11-05T12:00:00Z"
      },
      {
        "id": 2,
        "asset_id": 2,
        "revision": 1,
        "kind": "fact_mismatch",
        "severity": "high",
        "quote": "30 hours of battery life",
        "start_offset": 147,
        "end_offset": 171,
        "explanation": "Stated battery specification of 30 hours differs from approved fact (24 hours).",
        "suggestion": "24 hours of battery life",
        "source_type": "fact",
        "source_ref": 2,
        "status": "open",
        "origin": "rules",
        "created_at": "2026-11-05T12:00:00Z"
      },
      {
        "id": 3,
        "asset_id": 2,
        "revision": 1,
        "kind": "fact_mismatch",
        "severity": "high",
        "quote": "2-year warranty",
        "start_offset": 235,
        "end_offset": 250,
        "explanation": "Stated warranty of 2-year warranty differs from approved fact (12 months).",
        "suggestion": "12-month warranty",
        "source_type": "fact",
        "source_ref": 3,
        "status": "open",
        "origin": "rules",
        "created_at": "2026-11-05T12:00:00Z"
      }
    ],
    "medium": [
      {
        "id": 4,
        "asset_id": 2,
        "revision": 1,
        "kind": "rule_violation",
        "severity": "high",
        "quote": "best headphones in the world",
        "start_offset": 31,
        "end_offset": 59,
        "explanation": "Banned term 'best in the world' violates brand guidelines: Unsubstantiated superlative violating brand truth standards",
        "suggestion": "industry-leading",
        "source_type": "guideline",
        "source_ref": 1,
        "status": "open",
        "origin": "rules",
        "created_at": "2026-11-05T12:00:00Z"
      }
    ],
    "low": []
  }
}
```

#### `POST /assets/{asset_id}/redteam`
Runs the Brand Red Team evaluating copy from three adversarial personas:
1. **Critical Journalist**: Scrutinizes exaggerated promises, unsubstantiated claims, and greenwashing.
2. **Competitor**: Identifies actionable advertising vulnerabilities and unprovable superiority claims.
3. **Skeptical Customer**: Challenges confusing jargon, missing pricing details, and warranty fine print.

Unverifiable claims are labeled `"Unverified"`, never `"false"`. Risks are labeled `"potential risks"` and tagged with `kind: "red_team_risk"` and `origin: "ai"`.

**Response `200 OK`**:
```json
{
  "asset_id": 2,
  "revision": 1,
  "ai_available": true,
  "risks": [
    {
      "persona": "critical_journalist",
      "category": "unsupported_promise",
      "severity": "high",
      "quote": "best headphones in the world",
      "start_offset": 31,
      "end_offset": 59,
      "why": "Unverified superlative claim without third-party lab verification or published comparative benchmark.",
      "label": "potential risks"
    },
    {
      "persona": "competitor",
      "category": "misleading",
      "severity": "medium",
      "quote": "Guaranteed perfection",
      "start_offset": 252,
      "end_offset": 273,
      "why": "Creates legal warranty liability regarding manufacturing defects and acoustic frequency tolerance.",
      "label": "potential risks"
    },
    {
      "persona": "skeptical_customer",
      "category": "ambiguity",
      "severity": "low",
      "quote": "cheap these are at only $129",
      "start_offset": 86,
      "end_offset": 114,
      "why": "Language undermines perceived durability while glossing over shipping or return fees.",
      "label": "potential risks"
    }
  ]
}
```

#### `GET /assets/{asset_id}/findings`
Retrieves all stored findings for a content asset. Optionally filters by revision; defaults to the asset's current revision.

**Query Parameters**:
- `revision` *(optional int)*: Revision number to filter findings by (e.g. `?revision=1`).

**Response `200 OK`**:
```json
[
  {
    "id": 1,
    "asset_id": 2,
    "revision": 1,
    "kind": "rule_violation",
    "severity": "high",
    "quote": "cheap",
    "start_offset": 86,
    "end_offset": 91,
    "explanation": "Banned term 'cheap' violates brand guidelines: Undermines premium acoustic perception",
    "suggestion": "affordable",
    "source_type": "guideline",
    "source_ref": 1,
    "status": "open",
    "origin": "rules",
    "created_at": "2026-11-05T12:00:00Z"
  }
]
```

#### `PATCH /findings/{finding_id}`
Updates the resolution status of a finding to either `accepted` or `dismissed`.

When **accepted**:
- Automatically replaces the quoted text in the asset body with the finding's `suggestion`.
- Creates a new `AssetRevision` (`revision + 1`).
- Advances `ContentAsset.current_revision` to `revision + 1` and updates `ContentAsset.body`.
- Re-runs **only the deterministic checks** on the updated revision, saving newly identified findings.
- Marks the target finding `status: "accepted"`.

When **dismissed**:
- Sets the finding `status: "dismissed"`.

**Request Body**:
```json
{
  "status": "accepted"
}
```

**Response `200 OK` (when accepted)**:
```json
{
  "finding": {
    "id": 1,
    "asset_id": 2,
    "revision": 1,
    "kind": "rule_violation",
    "severity": "high",
    "quote": "cheap",
    "start_offset": 86,
    "end_offset": 91,
    "explanation": "Banned term 'cheap' violates brand guidelines",
    "suggestion": "affordable",
    "source_type": "guideline",
    "source_ref": 1,
    "status": "accepted",
    "origin": "rules",
    "created_at": "2026-11-05T12:00:00Z"
  },
  "new_revision": 2,
  "new_body": "Meet Kestrel One – simply the best headphones in the world! You won't believe how affordable these are at only $129...",
  "new_findings_count": 4
}
```

**Response `200 OK` (when dismissed)**:
```json
{
  "finding": {
    "id": 1,
    "asset_id": 2,
    "revision": 1,
    "kind": "rule_violation",
    "severity": "high",
    "quote": "cheap",
    "start_offset": 86,
    "end_offset": 91,
    "explanation": "Banned term 'cheap' violates brand guidelines",
    "suggestion": "affordable",
    "source_type": "guideline",
    "source_ref": 1,
    "status": "dismissed",
    "origin": "rules",
    "created_at": "2026-11-05T12:00:00Z"
  },
  "new_revision": null,
  "new_body": null,
  "new_findings_count": null
}
```

---

### 7. Human Decision & Approval Layer

#### `POST /assets/{asset_id}/submit`
Moves asset from `draft` or `changes_requested` to `in_review`.
- **Validation**: Blocks (HTTP 400) if the current revision has never been audited.
- **Warnings**: Generates warning notes if high-severity findings remain open (does not block).
- **Notifications**: Notifies all reviewers in the organization.
- **Allowed Roles**: `creator`, `brand_manager`.

**Response `200 OK`**:
```json
{
  "asset_id": 2,
  "status": "in_review",
  "current_revision": 2,
  "message": "Asset successfully submitted for review.",
  "warnings": [
    "Asset has 1 open high-severity finding(s). Reviewers may request changes or reject."
  ]
}
```

#### `GET /reviews/queue`
Lists assets currently pending review (`in_review` or `needs_revalidation`), annotated with open finding counts, high-severity counts, creator metadata, and passport status.

Allowed roles: `reviewer`.

**Response `200 OK`**:
```json
[
  {
    "asset_id": 2,
    "title": "Kestrel One Social Media Promo",
    "creator_id": 2,
    "creator_name": "Dev Patel",
    "status": "in_review",
    "current_revision": 2,
    "open_findings_count": 0,
    "high_severity_findings_count": 0,
    "passport_code": null,
    "passport_status": null,
    "created_at": "2026-11-05T12:00:00Z",
    "updated_at": "2026-11-05T12:15:00Z"
  }
]
```

#### `POST /assets/{asset_id}/decision`
Records a reviewer's decision on an asset (`approved`, `rejected`, or `changes_requested`).
- **Restrictions**: Creators cannot approve their own content (HTTP 403). Comments are required when rejecting or requesting changes.
- **On Approval**: In one atomic transaction:
  - Snapshots `AssetFactLink` for all referenced/evaluated fact versions and `AssetGuidelineLink` for active guidelines.
  - Creates or restores the `Passport` with short public code (e.g. `BP-28XH-T5`), `status = "valid"`, and verified `ai_disclosure`. Approving twice is idempotent and does not create duplicate passports.
  - Updates asset status to `approved`.
  - Notifies creator and records approval & activity log rows.

Allowed roles: `reviewer`.

**Request Body**:
```json
{
  "decision": "approved",
  "comment": "Complies with brand standards. Approved for launch."
}
```

**Response `200 OK`**:
```json
{
  "asset_id": 2,
  "status": "approved",
  "revision": 2,
  "decision": "approved",
  "passport_code": "BP-28XH-T5",
  "message": "Decision 'approved' successfully recorded."
}
```

#### `GET /assets/{asset_id}/history`
Returns the full chronological history for an asset including all revisions, reviewer decisions, finding logs, and activity events.

**Response `200 OK`**:
```json
{
  "asset_id": 2,
  "title": "Kestrel One Social Media Promo",
  "status": "approved",
  "current_revision": 2,
  "revisions": [
    {
      "id": 2,
      "asset_id": 2,
      "revision": 1,
      "body": "...",
      "created_at": "2026-11-05T12:00:00Z"
    },
    {
      "id": 5,
      "asset_id": 2,
      "revision": 2,
      "body": "...",
      "created_at": "2026-11-05T12:10:00Z"
    }
  ],
  "approvals": [
    {
      "id": 1,
      "revision": 2,
      "reviewer_id": 3,
      "reviewer_name": "Sana Miller",
      "decision": "approved",
      "comment": "Complies with brand standards. Approved for launch.",
      "decided_at": "2026-11-05T12:20:00Z"
    }
  ],
  "findings": [],
  "activity_logs": [
    {
      "id": 1,
      "action": "asset_submitted",
      "actor_id": 2,
      "actor_name": "Dev Patel",
      "detail": { "revision": 2, "warnings": [] },
      "created_at": "2026-11-05T12:15:00Z"
    },
    {
      "id": 2,
      "action": "asset_approved",
      "actor_id": 3,
      "actor_name": "Sana Miller",
      "detail": { "revision": 2, "decision": "approved", "passport_code": "BP-28XH-T5" },
      "created_at": "2026-11-05T12:20:00Z"
    }
  ]
}
```

---

### 8. Passport Verification & QR Codes

#### `GET /passports/{code}/public`
Public verification endpoint requiring **NO authentication**.
Guarantees privacy: strictly leaks NO raw body text and NO fact values.

**Response `200 OK`**:
```json
{
  "code": "BP-28XH-T5",
  "asset_title": "Kestrel One Social Media Promo",
  "status": "valid",
  "approved_at": "2026-11-05T12:20:00Z",
  "reviewer_first_name": "Sana",
  "guideline_version_label": "Kestrel Voice & Claims v1",
  "linked_facts_count": 4,
  "ai_disclosure": "Deterministic rule checks only; no external AI services used"
}
```

#### `GET /passports/{code}`
Authenticated full passport view returning complete provenance: referenced facts with values/units/dates, guideline version rules, full revision history, approval comments, and activity audit trails.

**Response `200 OK`**:
```json
{
  "code": "BP-28XH-T5",
  "asset_id": 2,
  "asset_title": "Kestrel One Social Media Promo",
  "asset_status": "approved",
  "status": "valid",
  "approved_at": "2026-11-05T12:20:00Z",
  "approved_by_name": "Sana Miller",
  "ai_disclosure": "Deterministic rule checks only; no external AI services used",
  "created_at": "2026-11-05T12:20:00Z",
  "guideline_version": {
    "id": 1,
    "version": 1,
    "title": "Kestrel Voice & Claims",
    "rules": { ... }
  },
  "referenced_facts": [
    {
      "fact_id": 1,
      "fact_key": "battery_life_hours",
      "version": 1,
      "value": "24",
      "unit": "hours",
      "is_current": true
    }
  ],
  "revisions": [ ... ],
  "approvals": [ ... ],
  "activity_log": [ ... ]
}
```

#### `GET /passports/{code}/qr.png`
Generates and serves a high-resolution PNG QR code encoding `{PUBLIC_BASE_URL}/verify/{code}`.

**Headers**:
```http
Content-Type: image/png
```

#### `POST /passports/{code}/withdraw`
Revokes public passport validity (`status = "withdrawn"`) and marks the asset `rejected`.

Allowed roles: `brand_manager`.

**Response `200 OK`**: Returns updated `PublicPassportOut` with `status: "withdrawn"`.

---

### 9. Fact Recall, Impact Preview & Expiry

#### `GET /facts/{fact_id}/impact?new_value={value}`
Preview endpoint with **NO database side-effects**. Finds all approved assets currently linked to older or current versions of the fact via `AssetFactLink`, and returns the matching sentence and suggested rewrite.

**Response `200 OK`**:
```json
{
  "fact_id": 4,
  "fact_key": "return_window_days",
  "old_value": "30",
  "new_value": "14",
  "affected_assets_count": 1,
  "affected_assets": [
    {
      "asset_id": 2,
      "title": "Kestrel One Social Media Promo",
      "owner": "Dev Patel",
      "passport_code": "BP-28XH-T5",
      "old_value": "30",
      "new_value": "14",
      "matching_sentence": "Guaranteed perfection backed by our 30-day return window.",
      "suggested_sentence": "Guaranteed perfection backed by our 14-day return window."
    }
  ]
}
```

#### `POST /facts/{fact_id}/versions` (Recall Execution)
When a brand manager creates a new version of a fact:
- Finds every approved asset linked to older versions of that fact.
- Transitions passports to `status: "review_required"`.
- Transitions assets to `status: "needs_revalidation"`.
- Dispatches in-app `Notification`s to asset creators.
- Records `ActivityLog` entries.
- Returns the new `FactVersionOut` with the list of `affected_assets`.

#### `POST /admin/run-expiry-check`
Runs automated check for facts whose `valid_until` timestamp has passed (`valid_until < now`). Recalls all approved assets and sets passports to `review_required`. Also automatically runs on server startup.

Allowed roles: `brand_manager`.

**Response `200 OK`**:
```json
{
  "checked_at": "2026-11-05T12:30:00Z",
  "affected_assets_count": 1,
  "affected_assets": [
    {
      "asset_id": 1,
      "title": "Kestrel One Launch Ad Copy",
      "owner": "Dev Patel",
      "passport_code": "BP-10AK-8Z",
      "old_value": "30",
      "new_value": "[EXPIRED]",
      "matching_sentence": "Enjoy peace of mind with our 12-month warranty and 30-day return window.",
      "suggested_sentence": null
    }
  ]
}
```

---

### 10. Notifications

#### `GET /notifications`
Lists notifications for the authenticated user ordered newest first.

**Response `200 OK`**:
```json
[
  {
    "id": 1,
    "user_id": 2,
    "message": "Fact 'return_window_days' updated from '30' to '14'. Your approved asset 'Kestrel One Social Media Promo' requires revalidation.",
    "asset_id": 2,
    "read": false,
    "created_at": "2026-11-05T12:25:00Z"
  }
]
```

#### `PATCH /notifications/{id}/read`
Marks a notification as read (`read = true`).

**Response `200 OK`**: Returns updated `NotificationOut`.

---

### 11. Authentication & Credentials (Round 3)

#### `GET /auth/demo-credentials`
Returns list of demo user credentials when `DEMO_MODE=true` (empty list when `false`).

**Response `200 OK`**:
```json
[
  {
    "name": "Maya Lin",
    "email": "maya@kestrelaudio.com",
    "password": "Demo@2026",
    "role": "brand_manager",
    "description": "Owns facts, guidelines and Brand Git"
  },
  {
    "name": "Dev Patel",
    "email": "dev@kestrelaudio.com",
    "password": "Demo@2026",
    "role": "creator",
    "description": "Drafts and submits content assets for review"
  },
  {
    "name": "Sana Miller",
    "email": "sana@kestrelaudio.com",
    "password": "Demo@2026",
    "role": "reviewer",
    "description": "Audits submissions and issues passports"
  }
]
```

#### `POST /auth/login`
Authenticates with email and password (PBKDF2-HMAC-SHA256, 210,000 iterations). Throttled: 5 failures within 10 minutes returns 429 Too Many Requests.

**Request Body**:
```json
{
  "email": "maya@kestrelaudio.com",
  "password": "Demo@2026"
}
```

**Response `200 OK`**: Returns `TokenResponse` with `access_token`, `token_type`, and `user`.

#### `GET /auth/me`
Returns current authenticated user details.

---

### 12. Brand Git Endpoints

#### `GET /guidelines/{id}/versions`
Lists all versions of guideline with metadata, change notes, rule summaries, and latest replay summary.

#### `GET /guidelines/{id}/diff?from=A&to=B`
Returns semantic diff between versions A and B.

**Response `200 OK`**:
```json
{
  "guideline_id": 1,
  "from_version": 1,
  "to_version": 2,
  "summary": { "added": 1, "removed": 0, "changed": 0 },
  "changes": [
    {
      "kind": "added",
      "section": "banned_terms",
      "rule_id": "BT-004",
      "before": null,
      "after": { "term": "unrivaled", "why": "Unsubstantiated absolute claim" }
    }
  ]
}
```

#### `POST /guidelines/{id}/versions/{v}/replay`
Runs deterministic replay (never calls Gemini) against assets comparing proposed version `v` with currently active version.

#### `GET /guidelines/{id}/versions/{v}/replay`
Retrieves stored replay run results for version `v`.

#### `POST /guidelines/{id}/versions/{v}/activate`
Activates version `v`. Requires a stored replay first (returns 400 if no replay exists; 409 if already active).

#### `POST /guidelines/{id}/versions/{v}/reject`
Rejects proposed version `v` with a required note (returns 409 if already active or archived).

---

### 13. Insights & Analytics Endpoints

#### `GET /insights/overview`
SQL-aggregated dashboard overview: totals, compliance rate, pending approvals, average hours to decision, outdated content items, findings by kind and severity.

#### `GET /insights/violations?days=30`
Violations trends: `top_rules`, `by_day`, and `by_creator` over the requested time window (7, 30, or 90 days).

#### `GET /insights/disputed-rules`
List of rules with dismissed findings count, assisting brand managers in identifying contested rules.

#### `GET /insights/assets`
Asset health matrix: title, status, passport status, open high findings, open total findings, last audit timestamp, and compliance indicator.

---

### 14. Cron & Expiry Telemetry

#### `GET /admin/expiry-status`
Returns expiry telemetry: last run time, last run source (`startup`, `scheduler`, `manual`, `cron`, `lazy`), interval in minutes, and upcoming expirations in the next 7, 14, and 30 days.

#### `POST /cron/expiry`
Secured endpoint for external cron services. Requires header `X-Cron-Secret` matching server configuration. Runs expiry check and returns affected assets count.

#### `POST /admin/reset-demo`
Restores database to seeded demo state. Only enabled when `DEMO_MODE=true` (disabled with 403 when `DEMO_MODE=false`). Manager only.

---

### 15. Passport Withdrawal

#### `POST /passports/{code}/withdraw`
Formally revokes a passport with a mandatory reason. Returns 409 Conflict if already withdrawn.

**Request Body**:
```json
{
  "reason": "Campaign discontinued due to specification updates"
}
```

