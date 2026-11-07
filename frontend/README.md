# BrandPilot Frontend

The BrandPilot web application is built with **React 18**, **Vite**, and **Tailwind CSS 4**. It provides an interactive brand governance console for brand managers, content creators, and compliance reviewers.

---

## Features

- **Role-Based Demo Switcher**: Instant switching between Brand Manager (`Maya Lin`), Content Creator (`Dev Patel`), and Reviewer (`Sana Miller`).
- **Brand Facts Dashboard**: View approved ground-truth records, create new facts, and bump fact versions with provenance notes.
- **Brand Guidelines Register**: Review active brand voice rules, banned terms, and mandatory slogans.
- **Content Intake**: Create copy drafts directly in the browser or upload `.txt`, `.docx`, and `.pdf` documents up to 5MB.
- **Pre-flight Brand Audit**: Runs deterministic and AI-powered checks against the brand source of truth; displays findings with severity ratings and provides one-click inline fix application.
- **Brand Red-Team Simulation**: Real-time multi-perspective adversarial evaluation (Cynical Customer, Regulatory Auditor, Competitor Marketer, Skeptical Tech Reviewer).
- **Human Approval Workflow**: Submit assets for review, view pending assets in the Reviewer Queue, and record approve/reject decisions.
- **Verification Passports & QR Codes**: Inspect public verification certificates and generate QR codes for approved assets.
- **Recall Alerts & Notifications**: Real-time notifications when brand facts change and assets need revalidation, with mark-as-read tracking.

---

## Getting Started

### 1. Prerequisites
- **Node.js** 18+ (Node.js 20+ recommended)
- **npm** or compatible package manager

### 2. Installation

```bash
npm install
```

### 3. Environment Variables

Create `.env.local` if you need to point to a custom backend address (defaults to `http://localhost:8000`):

```env
VITE_API_URL=http://localhost:8000
```

### 4. Running the Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## Scripts

- `npm run dev`: Starts the Vite local development server with Hot Module Replacement (HMR).
- `npm run build`: Bundles the application for production into `dist/`.
- `npm run lint`: Runs ESLint across all source files.
- `npm run preview`: Locally previews the production build.

---

## Project Structure

```
frontend/
├── public/
│   ├── favicon.svg      # BrandPilot favicon
│   └── icons.svg        # SVG sprite symbols
├── src/
│   ├── assets/          # Static assets & logos
│   ├── api.js           # API fetch client, token management & endpoints
│   ├── App.css          # Design tokens, typography & layout styling
│   ├── App.jsx          # Main application component & state management
│   ├── index.css        # Tailwind directives & font imports
│   └── main.jsx         # Application entry point
├── eslint.config.js     # ESLint configuration
├── index.html           # HTML template
├── package.json         # Dependencies & scripts
└── vite.config.js       # Vite configuration
```
