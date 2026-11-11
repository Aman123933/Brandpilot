# Testing Report & Verification

This document details the test strategy, execution instructions, real test results, and test coverage metrics for BrandPilot Round 3.

---

## 1. Test Execution Instructions

Run all unit, integration, and contract tests from the project root inside the virtual environment:

```bash
# Run the complete test suite
.venv\Scripts\python -m pytest backend/tests -v

# Run the contract compliance tests specifically
.venv\Scripts\python -m pytest backend/tests/test_contract_round3.py -v

# Run with test coverage report
.venv\Scripts\python -m pytest backend/tests --cov=backend/app --cov-report=term-missing
```

---

## 2. Real Pytest Execution Summary

```text
============================= test session starts =============================
platform win32 -- Python 3.13.1, pytest-9.2.0, pluggy-1.7.0
rootdir: C:\Users\AMAN\OneDrive\Desktop\brandpilot
configfile: pytest.ini
plugins: anyio-4.16.0, cov-7.1.0
collected 65 items

backend\tests\test_api.py ....                                           [  6%]
backend\tests\test_audit_gemini.py ...........                           [ 23%]
backend\tests\test_audit_rules.py .....                                  [ 30%]
backend\tests\test_auth.py .......                                       [ 41%]
backend\tests\test_contract_round3.py ..............                     [ 63%]
backend\tests\test_endpoints_audit_redteam.py .....                      [ 70%]
backend\tests\test_facts.py ..                                           [ 73%]
backend\tests\test_intake_upload.py ......                               [ 83%]
backend\tests\test_lifecycle_and_recall.py .......                       [ 93%]
backend\tests\test_seed.py ....                                          [100%]

======================= 65 passed, 2 warnings in 19.25s =======================
```

**Results**:
- **Total Tests**: 65
- **Passed**: 65 (100%)
- **Failed**: 0
- **Skipped**: 0
- **Warnings**: 2 (Starlette test client deprecation notice & PyMuPDF deprecation notice)

---

## 3. Real Code Coverage Breakdown

```text
Name                                   Stmts   Miss  Cover   Missing
--------------------------------------------------------------------
backend\app\__init__.py                    0      0   100%
backend\app\audit\__init__.py              0      0   100%
backend\app\audit\gemini.py              245     30    88%
backend\app\audit\prompts.py               4      0   100%
backend\app\audit\rules.py               210     29    86%
backend\app\auth.py                       54      7    87%
backend\app\config.py                     31      8    74%
backend\app\database.py                   18      5    72%
backend\app\main.py                       82     20    76%
backend\app\models.py                    234      0   100%
backend\app\routers\__init__.py            0      0   100%
backend\app\routers\admin.py              47      1    98%
backend\app\routers\assets.py            275     38    86%
backend\app\routers\auth.py               52      5    90%
backend\app\routers\cron.py               20      3    85%
backend\app\routers\facts.py              67      4    94%
backend\app\routers\findings.py           51      2    96%
backend\app\routers\guidelines.py        188     31    84%
backend\app\routers\health.py             19      2    89%
backend\app\routers\insights.py          100     13    87%
backend\app\routers\notifications.py      21      7    67%
backend\app\routers\passports.py          94      6    94%
backend\app\routers\reviews.py            20      0   100%
backend\app\scheduler.py                  29     18    38%
backend\app\schemas.py                   447      0   100%
backend\app\seed.py                       82      3    96%
backend\app\services\__init__.py           0      0   100%
backend\app\services\brand_git.py        127     21    83%
backend\app\services\recall.py           154     48    69%
--------------------------------------------------------------------
TOTAL                                   2671    301    89%
```

**Overall Code Coverage: 89%** (exceeds the 85% requirement).

---

## 4. Key Test Suites

1. **`test_contract_round3.py` (14 tests)**:
   - Full contract verification covering response schemas, Brand Git lifecycle, executive insights, passport withdrawal with reason, permission enforcement, multi-tenant organization isolation (404 on cross-org accesses), login throttling (429 on 5+ failures), and upload edge cases.
2. **`test_audit_gemini.py` (11 tests)**:
   - Mocked Gemini responses, token timeout fallbacks, rate limit (429) retries, non-retryable 400 rejection, and AI cache hit verification.
3. **`test_lifecycle_and_recall.py` (7 tests)**:
   - End-to-end publishing story: intake -> audit -> approval -> passport issuance -> public verification -> fact update -> automated recall -> passport invalidation.
4. **`test_auth.py` (7 tests)**:
   - Demo credentials, PBKDF2 password hashing verification, JWT token expiration, and role enforcement.
5. **`test_intake_upload.py` (6 tests)**:
   - File ingestion for `.txt`, `.docx`, and `.pdf`, oversized file rejections (>5MB), and unapproved file type filtering.
