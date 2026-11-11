# AI & Tools Disclosure

In the spirit of complete transparency, this document lists every third-party library, external service, generative AI model, cloud platform, and AI coding tool used in the development and operation of **BrandPilot**.

---

## 1. Generative AI Models & Services in Product

- **Google Gemini API (`google-genai` SDK)**:
  - **Where Used**:
    1. Pre-flight tone and claim assist (`POST /assets/{id}/audit`).
    2. Brand Red-Team adversarial simulation across 3 distinct personas (`POST /assets/{id}/redteam`): *Critical Journalist*, *Competitor*, and *Skeptical Customer*.
  - **Models & Hierarchy**:
    - **Primary Model**: `gemini-3.8-flash` (fast, structured JSON reasoning).
    - **Fallback Models**: `gemini-3.5-flash`, `gemini-3.1-flash-lite` (tried in sequence upon failure).
    - **Timeout**: 30-second per-call deadline (`GEMINI_TIMEOUT_SECONDS`).
  - **Prompts**:
    - Brand Audit: `BRAND_AUDIT_SYSTEM_PROMPT` enforces strict JSON schema output with start/end character offsets, quote verification against source text, and severity ratings (`high`, `medium`, `low`).
    - Red Team: `RED_TEAM_SYSTEM_PROMPT` simulates adversarial scrutiny, requiring unverified claims to be labeled `Unverified` (never false accusations).
  - **Failure Modes & Fallback Chains**:
    - **429 Rate Limit / 503 Overload / Timeout**: Automatically retries the next model in the fallback chain.
    - **400 Bad Request / Invalid Config**: Immediately halts without burning fallback quotas.
    - **All Fallbacks Failed**: Gracefully returns `ai_available=False` with an informative, human-readable `ai_message`. Deterministic rules continue to execute completely.
    - **Missing API Key**: Operates seamlessly in 100% deterministic mode.
  - **Quota Preservation Protections**:
    - **Zero Quota in Brand Git Replay**: Deterministic replay over corpora never calls Gemini.
    - **Persistent Cache (`AiCache`)**: SHA-256 hash-keyed caching in database eliminates duplicate API calls for identical content.
    - **Rate Limit (`AiCallLog`)**: Enforces maximum 5 AI calls per hour per user.

---

## 2. AI Coding Assistants & Development Tools

- **Google Antigravity (Google DeepMind)**: Agentic pair programming assistant used for codebase architecture, backend endpoint engineering, contract compliance verification, test generation, and deployment configuration.
- **Claude (Anthropic)**: LLM reasoning and code design assistance.
- **Cursor**: AI-powered code editor utilized for navigation and interactive refactoring.

---

## 3. Backend Technologies & Libraries (Python 3.11+)

- **FastAPI (`fastapi >= 0.115.0`)**: Asynchronous web framework providing OpenAPI schemas and routing.
- **Uvicorn (`uvicorn[standard] >= 0.30.0`)**: High-performance ASGI production web server.
- **APScheduler (`apscheduler >= 3.11.0`)**: In-process background scheduler for automated claim expiration checks.
- **psycopg2-binary (`psycopg2-binary >= 2.9.10`)**: PostgreSQL database adapter with connection pooling (`pool_pre_ping`).
- **Pydantic v2 (`pydantic >= 2.7.0`, `pydantic-settings >= 2.3.0`)**: Strict data validation and environment variable configuration.
- **SQLAlchemy 2.0 (`sqlalchemy >= 2.0.30`)**: Database ORM supporting both SQLite and PostgreSQL (Supabase).
- **PyJWT (`pyjwt >= 2.8.0`)**: RFC 7519 JSON Web Token authentication.
- **python-docx (`python-docx >= 1.1.0`)**: Microsoft Word (`.docx`) parsing.
- **PyMuPDF (`pymupdf >= 1.24.0`)**: PDF document text extraction.
- **python-multipart (`python-multipart >= 0.0.12`)**: Form-data handling for file uploads.
- **qrcode (`qrcode[pil] >= 8.0`)**: SVG and PNG QR code generation.
- **pytest & pytest-cov (`pytest >= 8.2.0`, `pytest-cov >= 7.0.0`)**: Automated test runner and code coverage measurement.

---

## 4. Frontend Technologies & Libraries (Node.js 20+)

- **React 18 (`react`, `react-dom`)**: Declarative UI component library.
- **React Router DOM (`react-router-dom v7`)**: Client-side routing for single-page applications and public `/verify/:code` pages.
- **Vite 8 (`vite`, `@vitejs/plugin-react`)**: Next-generation frontend build tooling and bundler.
- **Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`)**: Utility-first CSS framework.
- **Typography Fonts (`@fontsource/fraunces`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`)**: Self-hosted editorial typography for an elegant, trusted look.

---

## 5. Cloud Hosting, Deployment & Infrastructure

- **Render**: Free-tier cloud hosting web service deployed via Docker multi-stage build (`render.yaml`).
- **Supabase**: Managed free-tier PostgreSQL database option (configured via `DATABASE_URL`). Falls back to SQLite with zero setup.
- **Hugging Face Spaces**: Fallback Docker deployment option (`sdk: docker`, port 8000/7860).
