# AI & Tools Disclosure

In the spirit of complete transparency, this document lists every third-party library, external service, generative AI model, cloud platform, and AI coding tool used in the development and operation of **BrandPilot**.

---

## 1. Generative AI Models & Services

- **Google Gemini API (`google-genai` SDK v2.x)**:
  - Used for optional pre-flight semantic claim verification (substantiating claims against provided brand ground-truth facts).
  - Used for Brand Red-Team adversarial simulations across 3 personas (*Critical Journalist*, *Competitor*, and *Skeptical Customer*).
  - Configurable model parameter (`GEMINI_MODEL`, e.g. `gemini-2.5-flash`).
  - **Graceful Degradation**: If `GEMINI_API_KEY` is not provided or API calls fail, BrandPilot automatically runs in deterministic mode. No fake or mocked fallback results are fabricated; deterministic regex rules, banned vocabulary lists, and expired fact checks execute, and an informative banner is displayed in the UI indicating that generative AI features are disabled.

---

## 2. AI Coding Assistants & Development Tools

- **Antigravity (Google DeepMind)**:
  - Agentic pair programming assistant used for repository scaffolding, API endpoint implementation, test authoring, styling refinement, and deployment packaging.

---

## 3. Backend Technologies & Libraries (Python 3.11+)

- **FastAPI (`fastapi >= 0.115.0`)**: High-performance asynchronous web framework providing OpenAPI schemas and routing.
- **Uvicorn (`uvicorn[standard] >= 0.30.0`)**: Lightning-fast ASGI production web server.
- **Pydantic v2 (`pydantic >= 2.7.0`, `pydantic-settings >= 2.3.0`)**: Strict data validation and environment variable configuration.
- **SQLAlchemy 2.0 (`sqlalchemy >= 2.0.30`)**: Modern SQL toolkit and Object Relational Mapper (supporting both SQLite and PostgreSQL).
- **PyJWT (`pyjwt >= 2.8.0`)**: RFC 7519 JSON Web Token signing and verification for role-based authentication.
- **python-docx (`python-docx >= 1.1.0`)**: Microsoft Word (`.docx`) file intake parsing.
- **PyMuPDF (`pymupdf >= 1.24.0`)**: High-performance PDF document text extraction.
- **python-multipart (`python-multipart >= 0.0.12`)**: Form-data handling for file uploads.
- **qrcode (`qrcode[pil] >= 8.0`)**: Scannable PNG QR code generation encoding public verification passport URLs.
- **python-dotenv (`python-dotenv >= 1.0.1`)**: Local environment variable configuration loader.
- **requests (`requests >= 2.31.0`)**: HTTP client for smoke tests and connectivity checks.
- **pytest (`pytest >= 8.2.0`)**: Unit and integration test framework.

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
