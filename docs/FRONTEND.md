# BrandPilot Frontend Architecture & Guide (Round 3)

BrandPilot's frontend is an editorial-grade brand governance platform built for human-in-the-loop review, automated pre-flight checks, ground-truth fact management, and public provenance verification.

Designed around the **"Proofreader's Desk"** aesthetic, the application presents a paper-textured reading canvas, stark ink typography, deliberate vermilion accents, and zero distracting consumer flourishes (no emojis, no sparkles, no gradient washes).

---

## 1. Architecture Overview

The frontend is built with **React 19**, **Vite 6**, and **React Router 7**, structured into cleanly decoupled layers:

```
frontend/
├── mock/
│   └── server.mjs             # Dependency-free Node mock API server on :8000
├── src/
│   ├── api/
│   │   └── client.js          # Unified API client (timeout, retry, slow server banner, 401/403 mapping)
│   ├── auth/
│   │   ├── authContextDef.js  # React Context definition
│   │   ├── AuthContext.jsx    # Token persistence, role checks, session expiration handling
│   │   ├── useAuth.js         # useAuth custom hook
│   │   └── ProtectedRoute.jsx # Role-based route gating with in-app restricted states
│   ├── components/
│   │   ├── charts/
│   │   │   ├── SvgBarChart.jsx   # Hand-built SVG bar chart + table fallback
│   │   │   └── SvgLineChart.jsx  # Hand-built SVG line chart + table fallback
│   │   ├── common/
│   │   │   ├── Badge.jsx         # Status and severity pills (olive, amber, vermilion)
│   │   │   ├── EmptyState.jsx    # Actionable empty state placeholders
│   │   │   ├── ErrorBoundary.jsx # Global React component error boundary
│   │   │   ├── Modal.jsx         # Accessible dialog (focus trap, ESC, ARIA)
│   │   │   ├── Skeleton.jsx      # Skeleton card and table placeholders
│   │   │   ├── Toast.jsx         # Live region toast notifications (aria-live)
│   │   │   └── useToast.js       # Toast dispatch hook
│   │   └── layout/
│   │       └── Shell.jsx         # App shell, responsive drawer, unread counter pill
│   ├── pages/
│   │   ├── LoginPage.jsx          # Auth screen with dynamic demo accounts panel
│   │   ├── OverviewPage.jsx       # Role-aware dashboard (Manager/Creator/Reviewer)
│   │   ├── FactsPage.jsx          # Facts management, unit deduplication, impact preview
│   │   ├── GuidelinesPage.jsx     # Brand Git guidelines index
│   │   ├── GuidelineDetailPage.jsx# Brand Git version timeline, diff, replay, activation
│   │   ├── AssetsPage.jsx         # Asset intake, text drafts, file uploads (txt/pdf/docx)
│   │   ├── AssetDetailPage.jsx    # Live reader, audit findings desk, red team simulation
│   │   ├── ReviewsPage.jsx        # Reviewer queue, inspection desk, passport issuance
│   │   ├── InsightsPage.jsx       # Executive KPI tiles, SVG charts, dispute rate table
│   │   ├── NotificationsPage.jsx  # Notification list with mark-as-read
│   │   ├── PassportDetailPage.jsx # Certificate view, QR verification, manager withdrawal
│   │   ├── PublicVerifyPage.jsx   # Unauthenticated public verification page
│   │   └── NotFoundPage.jsx       # Friendly in-app 404 page
│   ├── utils/
│   │   ├── apiError.js            # Network failure and status code message mapping
│   │   ├── formatters.js          # Unit de-duplication, dates, relative expiry badges
│   │   └── roles.js               # Role capability checkers
│   ├── App.jsx                    # Route registration and provider nesting
│   ├── main.jsx                   # React DOM root entry
│   └── index.css                  # Editorial typography, paper palette, utility classes
├── e2e/
│   ├── helpers.js                 # Playwright test helpers (auth, navigation)
│   ├── journeys.spec.js           # 8 complete end-to-end verification journeys
│   └── screenshots/               # Responsive screenshots (1280px and 390px)
├── playwright.config.js           # Playwright runner configuration
└── vite.config.js                 # Vite build & proxy configuration (assetsDir: 'static')
```

---

## 2. Client Routes

All protected application routes live under `/app/*`. Public routes operate outside authenticated boundaries.

| Route | Role Access | Description |
|---|---|---|
| `/login` | Public | Credentials form with auto-populating demo accounts panel (`GET /auth/demo-credentials`) |
| `/verify/:code` | Public | Unauthenticated public certificate verification with QR badge and validity status |
| `/app/overview` | All Roles | Role-aware landing desk (Manager expiry warnings, Creator drafts, Reviewer pending items) |
| `/app/facts` | All Roles (Managers write) | Ground-truth facts table, unit deduplication, impact preview, expiry audit panel |
| `/app/guidelines` | All Roles | Guidelines list with active versions and rule counts |
| `/app/guidelines/:id` | All Roles (Managers edit) | Brand Git version tree, diff viewer, deterministic replay runner, activation/rejection |
| `/app/assets` | All Roles | Content asset inventory, status filters, text draft creation, document uploads |
| `/app/assets/:id` | All Roles | Review desk, pre-flight findings, one-click accept/dismiss, red team simulation |
| `/app/reviews` | Reviewer only | Two-pane reviewer inspection queue, decision form, passport issuance |
| `/app/insights` | Manager, Reviewer | KPI tiles, hand-built SVG charts, dispute friction table, fleet compliance grid |
| `/app/notifications`| All Roles | Chronological alerts, recall notices, reviewer decision feedback |
| `/app/passports/:code`| All Roles (Managers withdraw)| Certificate view, linked facts provenance, QR code, reason-gated withdrawal |
| `*` | All | Friendly in-app 404 page with single-click return to overview |

---

## 3. Editorial Design System

- **Palette**: Paper background (`#F9F8F5`), desk surface (`#FFFFFF`), primary ink text (`#191816`), muted captions (`#6A6862`), thin borders (`#E5E2DA`).
- **Semantic Accents**:
  - Vermilion (`#C84B31`): Used sparingly for high-severity violations, rejections, withdrawals, and critical calls-to-action.
  - Olive (`#3D6B4F`): Valid passports, approved content, compliant fleet states.
  - Amber (`#C47A1F`): Review required, expiring facts, medium-severity warnings.
- **Typography**:
  - Serif Display: **Fraunces** (`font-display: swap`) for headings, certificate titles, and numbers.
  - Body: **IBM Plex Sans** for plain copy and forms.
  - Monospace: **IBM Plex Mono** for rule codes, passport identifiers, dates, and diff snippets.
- **No Decoration Principle**:
  - No emojis or AI sparkles.
  - No gradient fills or backdrop blurs.
  - All borders are crisp 1px lines.
  - Direct, honest editorial copy.

---

## 4. API Client & Robustness

The unified API client (`src/api/client.js`) guarantees resilient network behavior:
1. **Timeout & Abort**: Every request is wrapped in an `AbortController` with a 30-second timeout.
2. **Single Retry**: Idempotent `GET` requests retry once on network failures or aborts.
3. **Slow Server Banner**: If a request exceeds 2.5 seconds (such as a cold container starting on Render), a global banner alerts the user: *"Waking the server, this can take up to a minute..."*.
4. **Session Expiry (401)**: Intercepts expired JWTs, clears local storage, and dispatches a session expiry event that routes the user to `/login` with an informational notice: *"Your session expired. Please sign in again."*
5. **Role Gating (403)**: Translates 403 Forbidden responses into clear, human-readable explanations.
6. **Double-Click Prevention**: Every submit and mutation button is strictly disabled while a request is in flight (`isSubmitting` / `pending`).
7. **Tolerant Schema Ingestion**: Missing optional fields and extra unexpected fields are tolerated gracefully throughout all UI components.

---

## 5. Running the Application

### Option A: With the Standalone Mock Server (Default for Local Development)

BrandPilot includes a standalone, zero-dependency Node mock server (`frontend/mock/server.mjs`) implementing every contract endpoint:

```bash
# Terminal 1: Start mock server and Vite dev server simultaneously
cd frontend
npm run dev:mock
```
- Mock server listens on `http://127.0.0.1:8000`.
- Vite dev server runs on `http://127.0.0.1:5173`.
- All API prefixes (`/auth`, `/facts`, `/guidelines`, `/assets`, `/findings`, `/reviews`, `/passports`, `/notifications`, `/admin`, `/insights`, `/cron`, `/health`) are automatically proxied.

### Option B: With the Real Python/FastAPI Backend

```bash
# Terminal 1: Start backend uvicorn server
python -m uvicorn backend.app.main:app --port 8000

# Terminal 2: Start frontend dev server
cd frontend
npm run dev
```

### Production Build & Preview

```bash
cd frontend
npm run build
npm run preview
```
- Production assets are generated under `dist/static/` adhering to the required `build.assetsDir = "static"` constraint.
