from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.app.models import (
    Organization,
    User,
    Fact,
    FactVersion,
    Guideline,
    GuidelineVersion,
    ContentAsset,
    AssetRevision,
    Finding,
    Approval,
    Passport,
    AssetFactLink,
    AssetGuidelineLink,
    Notification,
    ActivityLog,
    LoginAttempt,
    ReplayRun,
    ExpiryRun,
    AiCache,
    AiCallLog,
)
from backend.app.auth import hash_password


def seed_database(db: Session, force_reset: bool = False) -> bool:
    if force_reset:
        # Clear all tables in dependency order
        db.query(AiCallLog).delete()
        db.query(AiCache).delete()
        db.query(ReplayRun).delete()
        db.query(ExpiryRun).delete()
        db.query(LoginAttempt).delete()
        db.query(Notification).delete()
        db.query(ActivityLog).delete()
        db.query(AssetGuidelineLink).delete()
        db.query(AssetFactLink).delete()
        db.query(Passport).delete()
        db.query(Approval).delete()
        db.query(Finding).delete()
        db.query(AssetRevision).delete()
        db.query(ContentAsset).delete()
        db.query(FactVersion).delete()
        db.query(Fact).delete()
        db.query(GuidelineVersion).delete()
        db.query(Guideline).delete()
        db.query(User).delete()
        db.query(Organization).delete()
        db.commit()

    existing_org = db.query(Organization).filter(Organization.slug == "kestrel-audio").first()
    now = datetime.now(timezone.utc)

    if existing_org:
        # Ensure demo passwords, rule ids, and dB bug fix are present idempotently
        demo_pwd_hash, demo_salt = hash_password("Demo@2026")
        users = db.query(User).filter(User.org_id == existing_org.id).all()
        for u in users:
            if not u.password_hash:
                u.password_hash = demo_pwd_hash
                u.salt = demo_salt

        # Fix dB dB bug on any existing anc fact version
        anc_fact = db.query(Fact).filter(Fact.org_id == existing_org.id, Fact.key == "anc_noise_reduction").first()
        if anc_fact:
            for v in anc_fact.versions:
                if v.value and v.value.endswith(" dB"):
                    v.value = v.value[:-3].strip()

        db.commit()
        return False

    demo_pwd_hash, demo_salt = hash_password("Demo@2026")

    org = Organization(
        name="Kestrel Audio",
        slug="kestrel-audio",
        created_at=now,
    )
    db.add(org)
    db.flush()

    maya = User(
        org_id=org.id,
        name="Maya Lin",
        email="maya@kestrelaudio.com",
        role="brand_manager",
        password_hash=demo_pwd_hash,
        salt=demo_salt,
        created_at=now,
    )
    dev = User(
        org_id=org.id,
        name="Dev Patel",
        email="dev@kestrelaudio.com",
        role="creator",
        password_hash=demo_pwd_hash,
        salt=demo_salt,
        created_at=now,
    )
    sana = User(
        org_id=org.id,
        name="Sana Miller",
        email="sana@kestrelaudio.com",
        role="reviewer",
        password_hash=demo_pwd_hash,
        salt=demo_salt,
        created_at=now,
    )
    db.add_all([maya, dev, sana])
    db.flush()

    facts_seed = [
        {
            "key": "price",
            "value": "129",
            "unit": "USD",
            "source_note": "Approved retail pricing memo Q1 2026",
            "valid_until": now + timedelta(days=180),
        },
        {
            "key": "battery_life_hours",
            "value": "24",
            "unit": "hours",
            "source_note": "Acoustic engineering lab battery cycle test report v3.1",
            "valid_until": now + timedelta(days=365),
        },
        {
            "key": "warranty_months",
            "value": "12",
            "unit": "months",
            "source_note": "Global consumer warranty standard terms 2026",
            "valid_until": now + timedelta(days=365),
        },
        {
            "key": "return_window_days",
            "value": "30",
            "unit": "days",
            "source_note": "Promotional holiday return policy (expiring soon)",
            "valid_until": now + timedelta(days=3),
        },
        {
            "key": "anc_noise_reduction",
            "value": "up to 32",  # Fixed dB dB bug: value is 'up to 32', unit is 'dB'
            "unit": "dB",
            "source_note": "Anechoic chamber active noise cancellation test certification",
            "valid_until": now + timedelta(days=365),
        },
        {
            "key": "bluetooth_version",
            "value": "5.3",
            "unit": None,
            "source_note": "Bluetooth SIG qualification certification #BK-2026",
            "valid_until": now + timedelta(days=365),
        },
    ]

    for item in facts_seed:
        fact = Fact(
            org_id=org.id,
            key=item["key"],
            owner_id=maya.id,
            created_at=now,
        )
        db.add(fact)
        db.flush()

        fact_version = FactVersion(
            fact_id=fact.id,
            version=1,
            value=item["value"],
            unit=item["unit"],
            valid_from=now - timedelta(days=30),
            valid_until=item["valid_until"],
            is_current=True,
            source_note=item["source_note"],
            created_by=maya.id,
            created_at=now,
        )
        db.add(fact_version)

    guideline = Guideline(
        org_id=org.id,
        title="Kestrel Voice & Claims",
        owner_id=maya.id,
        created_at=now,
    )
    db.add(guideline)
    db.flush()

    rules_json = {
        "banned_terms": [
            {
                "id": "BT-001",
                "term": "cheap",
                "why": "Undermines premium acoustic perception and craftsmanship",
                "preferred": "affordable",
                "owner_id": maya.id,
            },
            {
                "id": "BT-002",
                "term": "best in the world",
                "why": "Unsubstantiated superlative violating brand truth standards",
                "preferred": "industry-leading",
                "owner_id": maya.id,
            },
            {
                "id": "BT-003",
                "term": "guaranteed",
                "why": "Creates absolute legal warranties outside official terms",
                "preferred": "backed by our warranty",
                "owner_id": maya.id,
            },
        ],
        "required_phrases": [
            {
                "id": "RP-001",
                "phrase": "Kestrel One",
                "why": "Official product name required on all copy",
                "owner_id": maya.id,
            },
        ],
        "tone_notes": [
            "confident",
            "plain",
            "no hype",
        ],
        "claim_rules": [
            {
                "id": "CR-001",
                "pattern": "% better",
                "requires_fact_key": None,
                "why": "Comparative performance claims must cite certified testing",
                "owner_id": maya.id,
            },
            {
                "id": "CR-002",
                "pattern": "#1",
                "requires_fact_key": None,
                "why": "Market leadership claims require external benchmark verification",
                "owner_id": maya.id,
            },
        ],
    }

    guideline_version = GuidelineVersion(
        guideline_id=guideline.id,
        version=1,
        body=(
            "Kestrel Audio brand voice guidelines and claims governance. "
            "We communicate with confidence, clarity, and uncompromising truth. "
            "Avoid hype and exaggerated superlatives. "
            "Every performance claim must be verified against approved brand facts."
        ),
        rules=rules_json,
        change_note="Initial active brand guidelines v1",
        status="active",
        created_by_id=maya.id,
        created_at=now,
        is_active=True,
    )
    db.add(guideline_version)

    clean_title = "Kestrel One Launch Ad Copy"
    clean_body = (
        "Experience rich, balanced sound with Kestrel One. "
        "Engineered for all-day listening with 24 hours of reliable battery life, "
        "crystal-clear calls via Bluetooth 5.3, and up to 32 dB active noise reduction. "
        "Enjoy peace of mind with our 12-month warranty and 30-day return window. "
        "At $129, premium acoustic engineering is truly affordable."
    )
    clean_asset = ContentAsset(
        org_id=org.id,
        title=clean_title,
        creator_id=dev.id,
        body=clean_body,
        source_filename="kestrel_one_launch_clean.txt",
        status="draft",
        current_revision=1,
        created_at=now,
        updated_at=now,
    )
    db.add(clean_asset)
    db.flush()

    clean_revision = AssetRevision(
        asset_id=clean_asset.id,
        revision=1,
        body=clean_body,
        created_at=now,
    )
    db.add(clean_revision)

    issue_title = "Kestrel One Social Media Promo"
    issue_body = (
        "Meet Kestrel One – simply the best headphones in the world! "
        "You won't believe how cheap these are at only $129. "
        "Rock out all weekend with an insane 30 hours of battery life and rest easy "
        "knowing you're backed by an industry-crushing 2-year warranty. "
        "Guaranteed perfection with up to 32 dB noise cancellation!"
    )
    issue_asset = ContentAsset(
        org_id=org.id,
        title=issue_title,
        creator_id=dev.id,
        body=issue_body,
        source_filename="kestrel_one_social_promo_draft.txt",
        status="draft",
        current_revision=1,
        created_at=now,
        updated_at=now,
    )
    db.add(issue_asset)
    db.flush()

    issue_revision = AssetRevision(
        asset_id=issue_asset.id,
        revision=1,
        body=issue_body,
        created_at=now,
    )
    db.add(issue_revision)

    db.commit()
    return True
