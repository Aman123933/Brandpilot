from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy.orm import Session

from backend.app.seed import seed_database
from backend.app.models import (
    Organization,
    User,
    Fact,
    FactVersion,
    Guideline,
    GuidelineVersion,
    ContentAsset,
)


def test_seed_idempotency(db_session: Session):
    result = seed_database(db_session)
    assert result is False

    orgs = db_session.query(Organization).all()
    assert len(orgs) == 1
    assert orgs[0].slug == "kestrel-audio"

    users = db_session.query(User).all()
    assert len(users) == 3

    facts = db_session.query(Fact).all()
    assert len(facts) == 6

    guidelines = db_session.query(Guideline).all()
    assert len(guidelines) == 1

    assets = db_session.query(ContentAsset).all()
    assert len(assets) == 2


def test_seed_facts_specifications(db_session: Session):
    facts = db_session.query(Fact).all()
    fact_map = {f.key: f for f in facts}

    expected_keys = [
        "price",
        "battery_life_hours",
        "warranty_months",
        "return_window_days",
        "anc_noise_reduction",
        "bluetooth_version",
    ]
    for key in expected_keys:
        assert key in fact_map, f"Fact '{key}' missing from seed data"

    now = datetime.now(timezone.utc)
    expiring_soon_count = 0

    for fact in facts:
        assert len(fact.versions) >= 1
        current_v = fact.versions[0]
        assert current_v.is_current is True
        assert current_v.source_note is not None and len(current_v.source_note) > 0
        assert current_v.valid_until is not None

        assert current_v.valid_until.replace(tzinfo=timezone.utc) > now

        diff = current_v.valid_until.replace(tzinfo=timezone.utc) - now
        if diff < timedelta(days=7):
            expiring_soon_count += 1
            assert fact.key == "return_window_days"

    assert expiring_soon_count == 1, "Exactly one fact should expire within a few days to demo expiry"


def test_seed_guidelines_specifications(db_session: Session):
    guideline = db_session.query(Guideline).filter(Guideline.title == "Kestrel Voice & Claims").first()
    assert guideline is not None

    assert len(guideline.versions) == 1
    gv = guideline.versions[0]
    assert gv.version == 1
    assert gv.is_active is True

    rules = gv.rules
    assert "banned_terms" in rules
    assert "claim_rules" in rules
    assert "tone_notes" in rules

    banned_terms = {item["term"]: item for item in rules["banned_terms"]}
    assert "cheap" in banned_terms
    assert banned_terms["cheap"]["preferred"] == "affordable"
    assert "best in the world" in banned_terms
    assert "guaranteed" in banned_terms

    tone_notes = rules["tone_notes"]
    assert "confident" in tone_notes
    assert "plain" in tone_notes
    assert "no hype" in tone_notes

    claim_patterns = [c["pattern"] for c in rules["claim_rules"]]
    assert "% better" in claim_patterns
    assert "#1" in claim_patterns


def test_seed_content_assets_specifications(db_session: Session):
    assets = db_session.query(ContentAsset).all()
    assert len(assets) == 2

    clean_asset = next((a for a in assets if "Launch" in a.title), None)
    issue_asset = next((a for a in assets if "Social" in a.title), None)

    assert clean_asset is not None
    assert issue_asset is not None

    assert "24 hours" in clean_asset.body
    assert "12-month warranty" in clean_asset.body
    assert "affordable" in clean_asset.body

    assert "30 hours" in issue_asset.body
    assert "2-year warranty" in issue_asset.body
    assert "the best headphones in the world" in issue_asset.body
    assert "cheap" in issue_asset.body
