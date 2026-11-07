# BrandPilot

> **The standard, held.**  
> Every claim has a source. Every approval has a history.

BrandPilot is an enterprise brand-governance and provenance platform. It prevents brand drift, misinformation, and unverified claims before marketing copy goes live, enforces human review during publication, issues verification passports and provenance audit trails, and continuously monitors published assets against living brand facts.

---

## Live Deployment

- **Web Application**: `https://brandpilot-3n2y.onrender.com`
- **API Documentation**: `https://brandpilot-3n2y.onrender.com/docs`
- **Public Verification**: `https://brandpilot-3n2y.onrender.com/verify/<PASSPORT_CODE>`


## Table of Contents

1. [Workflow & Key Concepts](#workflow--key-concepts)
2. [Architecture Overview](#architecture-overview)
3. [Full-Stack Quickstart](#full-stack-quickstart)
4. [Deployment (Render & Hugging Face Spaces)](#deployment-render--hugging-face-spaces)
5. [Backend Guide](#backend-guide)
6. [Frontend Guide](#frontend-guide)
7. [Role-Based Walkthrough](#role-based-walkthrough)
8. [Testing & Verification](#testing--verification)
9. [AI & Tools Disclosure](#ai--tools-disclosure)
10. [Remaining Production Integrations](#remaining-production-integrations)

---

## Workflow & Key Concepts

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   1. INTAKE     │       │ 2. PRE-FLIGHT   │       │  3. RED TEAM    │
│ Text Draft /    │ ────> │ Audit Rules &   │ ────> │ Multi-Persona   │
│ TXT, DOCX, PDF  │       │ AI Verification │       │ Adversarial Sim │
└─────────────────┘       └─────────────────┘       └─────────────────┘
                                                             │
┌─────────────────┐       ┌─────────────────┐                │
│  6. MONITORING  │       │  5. PASSPORT    │       ┌────────▼────────┐
│ Fact Evolution, │ <──── │ Public Record,  │ <──── │ 4. HUMAN REVIEW │
│ Recall Alerts   │       │ QR Verification │       │ Reviewer Queue  │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

1. **Brand Source of Truth (Facts & Guidelines)**
   - Strict versioning for approved brand ground-truth (pricing, specs, battery ratings, return policies).
   - Pre-flight impact previews before updating a fact version to show affected live assets.
   - Guidelines enforce banned terms, mandatory phrases, tone constraints, and substantiation rules.

2. **Asset Intake & Parsing**
   - Supports direct copywriting drafts and multi-format document parsing (`.txt`, `.docx`, `.pdf`) up to 5MB.
   - Automatic revision tracking (`revision 1, 2, ...`) for every change.

3. **Pre-flight Brand Audit Engine**
   - **Deterministic Engine**: Regex pattern matching, banned vocabulary lookup, expired/mismatched fact checks, and accessibility validations.
   - **Gemini AI Engine**: Intelligent claim substantiation and tone consistency analysis.
   - **No API Key Behavior**: If no `GEMINI_API_KEY` is provided, BrandPilot operates using deterministic rule checks only. AI checks are safely skipped and an informative banner is displayed in the UI. No fake or mocked findings are fabricated.
   - **Inline One-Click Fixes**: Suggested replacements can be accepted via `PATCH /findings/{id}`, automatically applying changes and generating a new revision.

4. **Brand Red-Team Adversarial Simulation**
   - Evaluates content from adversarial perspectives before launch (Critical Journalist, Competitor, Skeptical Customer).
   - Unverifiable claims are labeled "Unverified", never "false".

5. **Human-in-the-Loop Review & Approval**
   - Reviewer queue organizes pending content by severity of findings.
   - Strict RBAC: Creators cannot self-approve content.
   - Reviewers can approve, request changes, or reject (mandatory justification required on rejections).

6. **Verification Passports & Provenance**
   - Approved assets are stamped with a unique Passport verification code (e.g., `BP-A97J-N4`).
   - Public endpoint (`GET /passports/{code}/public`) and dedicated public route (`/verify/:code`) return verification metadata (title, approval date, reviewer first name, guideline version, linked fact count, AI disclosure) without exposing confidential raw copy or internal fact values.
   - Generates scannable QR codes (`GET /passports/{code}/qr.png`) for packaging and digital banners.

7. **Continuous Post-Publication Monitoring & Recall**
   - When a brand fact evolves (e.g., warranty reduced from 2 years to 1 year), BrandPilot immediately identifies every published asset linked to the outdated fact.
   - Asset status transitions to `needs_revalidation`, passport is marked `review_required`, and urgent notifications are dispatched to content owners.

---

## Architecture Overview

```
brandpilot/
├── backend/
│   ├── app/
│   │   ├── audit/          # Deterministic rules & Gemini AI audit engine
│   │   ├── routers/        # FastAPI routes (auth, facts, guidelines, assets, reviews, passports, admin)
│   │   ├── services/       # Recall monitors, notifications, document parsers
│   │   ├── database.py     # SQLAlchemy ORM engine & session setup
│   │   ├── models.py       # DB entities: Facts, Guidelines, Assets, Passports, Logs
│   │   ├── schemas.py      # Pydantic v2 validation models
│   │   └── seed.py         # Demo seed data (Kestrel Audio workspace)
│   ├── tests/              # 47 unit & integration tests
│   └── requirements.txt    # Python backend dependencies
├── frontend/
│   ├── src/
│   │   ├── api.js          # Unified API client (defaults to same-origin)
│   │   ├── App.jsx         # Full interactive dashboard & demo login workflow
│   │   ├── PublicVerify.jsx# Public verification page (/verify/:code)
│   │   ├── App.css         # Typography, design tokens & responsive layout
│   │   └── main.jsx        # React root & React Router DOM configuration
│   ├── package.json        # Frontend dependencies (React 18, Vite, Tailwind CSS 4)
│   └── vite.config.js      # Vite build configuration
├── scripts/
│   └── smoke_test.py       # End-to-end user story verification runner
├── Dockerfile              # Multi-stage production container (Vite build + Uvicorn)
├── render.yaml             # Render Blueprint for free web service
├── docs/
│   ├── API.md              # Detailed OpenAPI / REST endpoint specifications
│   └── BRIEF.md            # Hackathon project specification
├── AI_AND_TOOLS_DISCLOSURE.md # Full disclosure of libraries, APIs & tools
├── .env.example            # Example configuration template
└── pytest.ini              # Pytest configuration
```

---

## Full-Stack Quickstart

### Prerequisites
- **Python**: 3.11+ (Python 3.13 recommended)
- **Node.js**: 18+ (Node.js 20+ recommended) and `npm`

### 1. Environment Configuration

Copy the example environment configuration:

```bash
# On Linux / macOS:
cp .env.example .env

# On Windows PowerShell:
Copy-Item .env.example .env
```

*(Optional)* Add your Google Gemini API key to `.env` to enable generative AI auditing and red-team personas:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODELS=gemini-2.5-flash-lite
```
*(If no key is provided, or if models are temporarily unavailable, BrandPilot operates in deterministic rule mode with clear UI status banners and automated fallback).*

---

### 2. Backend Setup & Run

1. Create and activate a Python virtual environment:

```powershell
# Windows PowerShell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

```bash
# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

2. Start the FastAPI development server:

```bash
uvicorn backend.app.main:app --reload --port 8000
```

The backend is now accessible at:
- **Web App & API Root**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **ReDoc Documentation**: `http://localhost:8000/redoc`
- **Health Check**: `http://localhost:8000/health`

---

### 3. Frontend Setup & Run (Development)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend application will start at:
- **Dev Web App**: `http://localhost:5173`

---

## Deployment (Render & Hugging Face Spaces)

BrandPilot supports single-link deployment where FastAPI directly serves the pre-built React SPA (`frontend/dist`) along with all API endpoints and public verification routes (`/verify/:code`).

### Option A: Render Free Web Service (Recommended)

1. Connect your repository to **[Render](https://render.com/)**.
2. Click **New +** -> **Blueprint**, and select your repository containing `render.yaml`.
3. Configure the environment variables:
   - `GEMINI_API_KEY`: Your key from Google AI Studio (optional).
   - `GEMINI_MODEL`: `gemini-2.5-flash` (or your chosen primary model).
   - `GEMINI_FALLBACK_MODELS`: `gemini-2.5-flash-lite` (optional fallback list).
   - `DATABASE_URL`: Optional (defaults to zero-setup SQLite; provide Supabase PostgreSQL URL for persistent multi-instance production).
   - `PUBLIC_BASE_URL`: The public URL assigned by Render (e.g., `https://brandpilot.onrender.com`).
4. Click **Apply Blueprint**. Render will build the multi-stage Docker container and launch the web service on port 8000.
5. *Cold Start Note*: Free Render instances spin down after inactivity. The frontend automatically shows a "Waking the server (about 30 seconds)" indicator while the instance boots.

### Option B: Hugging Face Docker Space (Fallback)

1. Create a new **Space** on **[Hugging Face](https://huggingface.co/new-space)**.
2. Select **Docker** as the Space SDK (Blank).
3. Push this repository to the Hugging Face Space git remote.
4. Add the following header to the Space's `README.md` frontmatter:
   ```yaml
   ---
   title: BrandPilot
   emoji: 🛡️
   colorFrom: amber
   colorTo: red
   sdk: docker
   app_port: 8000
   pinned: false
   ---
   ```
5. In **Settings -> Variables and Secrets**, configure:
   - Secret `GEMINI_API_KEY`: Your Google AI Studio key.
   - Secret `SECRET_KEY`: A secure random secret.
   - Variable `GEMINI_MODEL`: `gemini-2.5-flash`.
   - Variable `GEMINI_FALLBACK_MODELS`: `gemini-2.5-flash-lite`.
   - Variable `PUBLIC_BASE_URL`: `https://<your-username>-brandpilot.hf.space`.

---

## Backend Guide

### API Routers & Capabilities

| Endpoint Prefix | Responsibility | Allowed Roles |
|---|---|---|
| `/auth` | Demo user directory & JWT token generation | Public |
| `/facts` | Ground-truth facts, impact previews, and version increments | `brand_manager`, `creator`, `reviewer` |
| `/guidelines` | Brand voice rules, banned terms, required phrases | `brand_manager`, `creator`, `reviewer` |
| `/assets` | Text drafts, document parsing (`.txt`, `.docx`, `.pdf`), pre-flight audits, red-team simulation | `creator`, `brand_manager`, `reviewer` |
| `/findings` | Inline finding resolution (`accepted` suggestion, `dismissed`) | `creator`, `brand_manager`, `reviewer` |
| `/reviews` | Reviewer-only queue and approval decisions | `reviewer` |
| `/passports` | Public verification lookup (`/public`), QR code generation (`/qr.png`), full audit chain | Public (`/public`, `/qr.png`), Authenticated |
| `/notifications` | Activity alerts, recall warnings, mark-as-read | Authenticated user |
| `/admin` | Manual fact expiry check and automated asset recall | `brand_manager` |

---

## Frontend Guide

### Technology Stack
- **Framework**: React 18
- **Routing**: React Router DOM v7 (`/` for workspace, `/verify/:code` for public verification)
- **Build Tool**: Vite 8
- **Styling**: Vanilla CSS custom properties with Tailwind CSS 4
- **Typography**: `@fontsource/fraunces`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`

### Key UI Capabilities
- **Identity Switcher**: One-click demo login between Brand Manager, Content Creator, and Reviewer.
- **Brand Facts Manager**: Live ground-truth table, "+ Add new fact", and "Bump version" modal with instant recall preview.
- **Brand Guidelines Register**: Voice rules, banned vocabulary lists, and required slogan guidelines.
- **Reviewer Queue**: Dedicated human approval console showing open findings, severity metrics, and decision submission.
- **Content Assets Workspace**:
  - "+ New draft" creation form.
  - "Upload file" intake supporting `.txt`, `.docx`, and `.pdf`.
  - "Pre-flight Audit" with one-click "Accept fix" and "Dismiss" buttons.
  - "Red-Team Simulation" rendering adversarial customer, auditor, and competitor risks.
  - "Submit for Approval" trigger.
  - Verification Passport inspector and QR code link.
- **Public Verification Page (`/verify/:code`)**: Logged-out public view displaying verification stamps (VALID / REVIEW REQUIRED / WITHDRAWN), approval date, reviewer first name, guideline version, linked-fact count, and AI disclosure, without exposing raw copy or internal fact values.
- **Waking Server Indicator**: Displays a clear "Waking the server (about 30 seconds)" loading state during initial cold-start requests.

---

## Role-Based Walkthrough

BrandPilot comes pre-seeded with the **Kestrel Audio** brand workspace:

### 1. Brand Manager (`Maya Lin`)
- Add ground-truth product facts (e.g., `water_resistance: IPX8`, `battery_life_hours: 24`).
- Define brand guidelines (banned words like `"cheap"` or `"best in the world"`).
- Test policy changes: update `return_window_days` from 30 to 14 days and run **Run Recall Audit** to flag outdated content.

### 2. Content Creator (`Dev Patel`)
- Draft new promotional copy or upload a marketing deck.
- Run **Pre-flight Audit**: instantly highlights discrepancies (e.g. wrong warranty duration, banned words).
- Click **Accept fix** on findings to auto-apply suggested wording.
- Run **Red-Team Simulation** to spot regulatory or competitor risks.
- Click **Submit for Approval** to transfer the asset to the review queue.

### 3. Reviewer (`Sana Miller`)
- Open the **Reviewer queue** tab.
- Inspect assets, open findings, and high-severity violations.
- Submit decision: **Approve & Issue Passport** or **Request changes** with feedback.
- Generates the official verification passport and scannable QR code.

---

## Testing & Verification

### 1. Pytest Backend Suite (47 Tests)

Runs all unit, regression, RBAC, deterministic rule, and recall tests:

```bash
pytest backend -v
```

### 2. End-to-End Story Smoke Test (`scripts/smoke_test.py`)

Walks the complete core story against a target base URL:

```bash
python scripts/smoke_test.py --base-url http://localhost:8000
```

Steps executed and verified:
1. Pre-flight audit on planted sample asset (identifies banned words & fact mismatches).
2. Accept suggested fixes (creates new revision with corrections).
3. Submit asset for reviewer approval.
4. Reviewer approves asset and issues Passport.
5. Verify passport status is VALID with linked ground-truth facts.
6. Fact evolution: brand manager bumps a fact version, triggering automatic recall to REVIEW REQUIRED.
7. Public verification: fetch logged-out public passport verifying status and clean metadata.

### 3. Comprehensive Verification Suite (`verify_endpoints.py`)

```bash
python verify_endpoints.py
```

*Output summary:*
```text
=======================================================
      BRANDPILOT END-TO-END VERIFICATION SUITE         
=======================================================
--- 1. Testing Root and Health Endpoints --- [OK]
--- 2. Testing Auth Endpoints & Token Acquisition --- [OK]
--- 3. Testing RBAC Role Enforcement & Security --- [OK]
--- 4. Testing Brand Facts & Versioning --- [OK]
--- 5. Testing Brand Guidelines & Versioning --- [OK]
--- 6. Testing Asset Intake (Text & File Uploads) --- [OK]
--- 7. Testing Brand Pre-Flight Audit & Finding Resolution --- [OK]
--- 8. Testing Brand Red-Team Personas Simulation --- [OK]
--- 9. Testing Review Workflow & Queue --- [OK]
--- 10. Testing Verification Passports (Public & Full) --- [OK]
--- 11. Testing Fact Evolution & Recall Simulation --- [OK]
--- 12. Testing Audit History & Notifications --- [OK]
=======================================================
ALL 12 MODULE CHECKS PASSED: 12 of 12 verification modules completed successfully.
=======================================================
```

---

## AI & Tools Disclosure

For complete details on all libraries, APIs, Gemini models, cloud infrastructure, and AI tools used in BrandPilot, see [AI_AND_TOOLS_DISCLOSURE.md](AI_AND_TOOLS_DISCLOSURE.md).

---

## Remaining Production Integrations

With all core governance engines, pre-flight audits, red-team analysis, reviewer workflows, and UI dashboards fully functional and tested, the only remaining tasks before enterprise production deployment are:

### 1. Production Authentication & Identity (Logins)
- [ ] **Enterprise SSO / SAML / OIDC**: Connect Google Workspace, Okta, or Microsoft Entra ID.
- [ ] **Auth Provider Integration**: Replace demo user switcher (`/auth/demo-users`) with Supabase Auth, Auth0, or AWS Cognito.
- [ ] **Multi-Factor Authentication (MFA)**: Mandatory 2FA for users in the `reviewer` and `brand_manager` roles.

### 2. External API Integrations
- [ ] **CMS Publishing Webhooks**:
  - WordPress, Contentful, Sanity, or Strapi plugins to block publishing unless an asset has a valid BrandPilot passport.
- [ ] **Social Media & Ad Platform Schedulers**:
  - Direct connectors for Meta Ads Manager, LinkedIn Campaign Manager, and Twitter/X API to verify ad copy against live brand facts before running spend.
- [ ] **Team Collaboration Webhooks**:
  - Slack Bot and Microsoft Teams incoming webhooks to broadcast instant recall alerts when brand facts evolve.
- [ ] **Cloud Storage & CDN**:
  - Amazon S3 or Google Cloud Storage integration for storing large multi-page PDFs, brand asset imagery, and PDF passport certificates.
