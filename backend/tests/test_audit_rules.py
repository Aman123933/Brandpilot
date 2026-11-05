from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy.orm import Session

from backend.app.models import ContentAsset, GuidelineVersion, Fact, FactVersion
from backend.app.audit.rules import (
    run_deterministic_rules,
    normalize_intake_text,
    check_accessibility,
)


def test_planted_issues_sample_asset_deterministic(db_session: Session):
    """
    Run the planted-issues sample asset through the engine without Gemini and assert it catches:
    - 30h battery vs 24
    - 2-year warranty vs 12 months
    - "cheap"
    - "best in the world"
    Assert offsets match the quoted text exactly.
    """
    # 1. Fetch planted-issues asset
    issue_asset = (
        db_session.query(ContentAsset)
        .filter(ContentAsset.title.contains("Social Media Promo"))
        .first()
    )
    assert issue_asset is not None, "Planted issue asset missing from seed data"

    guideline_v = (
        db_session.query(GuidelineVersion)
        .filter(GuidelineVersion.is_active == True)
        .first()
    )
    assert guideline_v is not None

    facts = db_session.query(Fact).all()
    assert len(facts) >= 6

    # 2. Run deterministic checks (NO AI)
    findings = run_deterministic_rules(issue_asset.body, guideline_v, facts)
    assert len(findings) >= 4

    # 3. Assert offsets match quoted text exactly for EVERY finding
    for f in findings:
        start = f["start_offset"]
        end = f["end_offset"]
        quote = f["quote"]
        assert issue_asset.body[start:end] == quote, f"Offset mismatch for quote '{quote}'"

    # 4. Assert specific required planted issues are caught:
    # (a) "cheap" banned term
    cheap_finding = next((f for f in findings if f["quote"].lower() == "cheap"), None)
    assert cheap_finding is not None, "Failed to catch banned term 'cheap'"
    assert cheap_finding["kind"] == "rule_violation"
    assert cheap_finding["suggestion"] == "affordable"
    assert cheap_finding["source_type"] == "guideline"
    assert cheap_finding["source_ref"] == guideline_v.id

    # (b) "best in the world" banned term / superlative
    best_finding = next((f for f in findings if "best" in f["quote"].lower() and "world" in f["quote"].lower()), None)
    assert best_finding is not None, "Failed to catch 'best in the world'"
    assert best_finding["kind"] in ("rule_violation", "unsupported_claim")
    assert best_finding["source_type"] == "guideline"

    # (c) 30h battery vs 24
    battery_finding = next((f for f in findings if "battery" in f["quote"].lower() and "30" in f["quote"]), None)
    assert battery_finding is not None, "Failed to catch 30h battery vs 24 mismatch"
    assert battery_finding["kind"] == "fact_mismatch"
    assert battery_finding["source_type"] == "fact"
    assert "24" in battery_finding["explanation"] or "24" in (battery_finding["suggestion"] or "")

    # (d) 2-year warranty vs 12 months
    warranty_finding = next((f for f in findings if "warranty" in f["quote"].lower() and "2" in f["quote"]), None)
    assert warranty_finding is not None, "Failed to catch 2-year warranty vs 12 months mismatch"
    assert warranty_finding["kind"] == "fact_mismatch"
    assert warranty_finding["source_type"] == "fact"
    assert "12" in warranty_finding["explanation"] or "12" in (warranty_finding["suggestion"] or "")


def test_clean_asset_has_no_fact_or_banned_violations(db_session: Session):
    clean_asset = (
        db_session.query(ContentAsset)
        .filter(ContentAsset.title.contains("Launch Ad Copy"))
        .first()
    )
    assert clean_asset is not None

    guideline_v = (
        db_session.query(GuidelineVersion)
        .filter(GuidelineVersion.is_active == True)
        .first()
    )
    facts = db_session.query(Fact).all()

    findings = run_deterministic_rules(clean_asset.body, guideline_v, facts)
    violations = [f for f in findings if f["kind"] in ("rule_violation", "fact_mismatch")]
    assert len(violations) == 0, f"Expected 0 violations on clean asset, got: {violations}"


def test_expired_fact_flagged(db_session: Session):
    now = datetime.now(timezone.utc)
    expired_fact = Fact(org_id=1, key="holiday_promo_discount", owner_id=1)
    db_session.add(expired_fact)
    db_session.flush()

    fv = FactVersion(
        fact_id=expired_fact.id,
        version=1,
        value="50%",
        valid_until=now - timedelta(days=5),
        is_current=True,
        source_note="Past promo",
        created_by=1,
    )
    db_session.add(fv)
    db_session.flush()

    text = "Get our holiday promo discount for a limited time."
    findings = run_deterministic_rules(text, None, [expired_fact])
    expired_findings = [f for f in findings if "expired" in f["explanation"].lower()]
    assert len(expired_findings) >= 1
    assert expired_findings[0]["source_ref"] == fv.id
    assert expired_findings[0]["quote"] in text
    assert text[expired_findings[0]["start_offset"]:expired_findings[0]["end_offset"]] == expired_findings[0]["quote"]


def test_accessibility_checks():
    text = (
        "BUY NOW TODAY BEFORE WE RUN OUT OF STOCK! "
        "Engineered with advanced ANC and TWS technology. "
        "Here is the product layout: [image] for details."
    )
    findings = check_accessibility(text)

    # 1. ALL-CAPS runs over 4 words
    caps_f = next((f for f in findings if "ALL-CAPS" in f["explanation"]), None)
    assert caps_f is not None
    assert caps_f["quote"] == "BUY NOW TODAY BEFORE WE RUN OUT OF STOCK"
    assert text[caps_f["start_offset"]:caps_f["end_offset"]] == caps_f["quote"]

    # 2. Unexplained jargon abbreviations on first use
    anc_f = next((f for f in findings if "ANC" in f["quote"]), None)
    assert anc_f is not None
    assert "Active Noise Cancellation" in anc_f["suggestion"]
    assert text[anc_f["start_offset"]:anc_f["end_offset"]] == "ANC"

    # 3. Missing alt-text markers
    img_f = next((f for f in findings if "[image]" in f["quote"].lower()), None)
    assert img_f is not None
    assert text[img_f["start_offset"]:img_f["end_offset"]] == "[image]"


def test_whitespace_normalization_offset_stability():
    raw_text = "  First line with  extra   spaces.  \r\n\r\n\r\nSecond line.\rThird line.  "
    normalized = normalize_intake_text(raw_text)
    assert "\r" not in normalized
    assert "   " not in normalized
    assert "\n\n\n" not in normalized

    target = "Second line."
    idx = normalized.find(target)
    assert idx != -1
    assert normalized[idx:idx + len(target)] == target
