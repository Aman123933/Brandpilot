# BrandPilot

BrandPilot is a brand-governance platform that prevents misinformation and off-brand marketing before it goes live, enforces human review during publication, and monitors published content against live brand facts.

## Workflow

1. **Before Publication (Automated Pre-flight)**
   - Creators draft and submit marketing copy, press releases, or ad copy.
   - The platform checks the draft against approved brand facts (pricing, specs, warranties) and guidelines (banned terms, tone, required phrases, claims).

2. **During Review (Human-in-the-Loop Approval)**
   - Reviewers inspect flagged findings and audit the content.
   - Upon review, the reviewer makes an approval decision (approved, changes requested, or rejected).
   - Approved assets receive a verification passport and register their dependency map linking to the exact versions of facts and guidelines used.

3. **After Publication (Continuous Monitoring & Recall)**
   - Brand facts evolve over time (e.g., return policies change, battery specs update, warranties adjust).
   - When a fact version is updated, BrandPilot flags every published asset that depended on the outdated fact so the team can update or recall it immediately.

## Running the Backend

### 1. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 2. Dependency Installation

Create and activate a virtual environment, then install the dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

### 3. Start the Server

```bash
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

The service will be accessible at:
- API: http://localhost:8000
- Interactive Documentation: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 4. Run Tests

```bash
pytest backend
```
