# BrandPilot Project Brief

You are building BrandPilot for a hackathon: a brand-governance platform that checks content BEFORE publication against approved guidelines and facts, records a human approval DURING review, and monitors content validity AFTER publication. Fact changes must automatically flag every approved asset that depended on the old fact.

Step 1. Create the repo structure: /backend (FastAPI, Python 3.11+, Pydantic v2, SQLAlchemy 2.0), /frontend (empty for now), /docs. Write docs/BRIEF.md containing this entire message so later work can reference it.

HARD CONSTRAINTS
- Everything must be free. No paid APIs, no credit-card services.
- Config only via environment variables (.env.example, never commit real keys): DATABASE_URL, GEMINI_API_KEY, GEMINI_MODEL, SECRET_KEY, PUBLIC_BASE_URL.
- If DATABASE_URL is unset, fall back to local SQLite so it runs with zero setup. Production will use Supabase free Postgres.
- Readable, human-style code: clear names, short functions, comments only where the reason isn't obvious. No placeholder TODOs left behind.

DATA MODEL (SQLAlchemy)
- Organization; User (role: brand_manager | creator | reviewer; org_id)
- Guideline (id, org, title, owner_id) and GuidelineVersion (guideline_id, version int, body text, rules JSON, created_at, is_active). Rules JSON holds structured rules: banned_terms[{term, why, preferred}], required_phrases, tone_notes, claim_rules[{pattern, requires_fact_key}].
- Fact (id, org, key like "return_window_days", owner_id) and FactVersion (fact_id, version int, value text, unit, valid_from, valid_until nullable, is_current, source_note, created_by). A fact's key is stable; versions change.
- ContentAsset (id, org, title, creator_id, body text, source_filename, status: draft | in_review | changes_requested | approved | rejected, current_revision int)
- AssetRevision (asset_id, revision, body, created_at)
- Finding (asset_id, revision, kind: rule_violation | fact_mismatch | unsupported_claim | tone | accessibility | red_team_risk, severity: high|medium|low, quote text, start_offset, end_offset, explanation, suggestion, source_type: guideline|fact|none, source_ref (guideline version id or fact version id), status: open|accepted|dismissed, origin: rules|ai)
- Approval (asset_id, revision, reviewer_id, decision: approved|rejected|changes_requested, comment, decided_at)
- AssetFactLink (asset_id, fact_version_id) and AssetGuidelineLink (asset_id, guideline_version_id): the dependency map. Written at approval time.
- Passport (id public short code like BP-7K3Q-9X, asset_id, status: valid | review_required | withdrawn, approved_by, approved_at, ai_disclosure text, created_at)
- Notification (user_id, message, asset_id, read, created_at)
- ActivityLog (org, actor_id, action, entity, entity_id, detail JSON, created_at). Append-only audit trail.

AUTH (simple but real)
- POST /auth/demo-login {user_id} returns a signed token (PyJWT). GET /auth/demo-users lists seeded users so the UI can show a "Continue as ..." picker, so a judge needs no signup.
- Every endpoint checks the token and enforces role server-side (managers write facts/guidelines; creators submit content; reviewers approve). Return 403 with a clear message otherwise.

ENDPOINTS FOR THIS STEP
- Facts: list, create, get with version history, POST new version (this is the "fact change"; do not implement the recall logic yet, leave a clearly named function stub recall_for_fact_version() that returns an empty list).
- Guidelines: list, create, get, POST new version (structured rules JSON validated by Pydantic).
- Assets: list, create (title + pasted text), get, with revisions.
- GET /health.
- Write docs/API.md listing every endpoint with request/response JSON examples. The frontend developer will build against this file, so keep it accurate and update it whenever endpoints change.

SEED DATA (idempotent script, runs on startup if DB is empty; fictional brand "Kestrel Audio", wireless headphones)
- Users: Maya (brand_manager), Dev (creator), Sana (reviewer).
- Facts: price of Kestrel One = 129 USD; battery_life_hours = 24; warranty_months = 12; return_window_days = 30; anc_noise_reduction = "up to 32 dB"; bluetooth_version = 5.3. Give each a source_note and a valid_until in the future; make ONE fact expire within a few days to demo expiry.
- One guideline "Kestrel Voice & Claims" v1 with rules: banned terms (cheap -> "affordable", "best in the world", "guaranteed"), claim_rules (any "% better" or "#1" claim requires a cited source), tone notes (confident, plain, no hype).
- Two sample ContentAssets: one clean ad copy, one with planted issues (says 30 hours battery, 2-year warranty, "the best headphones in the world", "cheap").

QUALITY
- pytest tests for auth role enforcement, fact versioning (new version flips is_current), and seed idempotency. Run them and make them pass.
- Run the server, hit every endpoint with curl or httpx, and fix anything broken before finishing. Report what you ran and the results.
