from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models import (
    User,
    FactVersion,
    Fact,
    AssetFactLink,
    Passport,
    ContentAsset,
    ExpiryRun,
    Base,
)
from backend.app.schemas import (
    ExpiryCheckResponse,
    ExpiryStatusResponse,
    ExpiryStatusResult,
    UpcomingExpiryItem,
)
from backend.app.auth import require_roles
from backend.app.services.recall import check_expired_facts
from backend.app.seed import seed_database

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/run-expiry-check", response_model=ExpiryCheckResponse)
def run_expiry_check(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    """
    Manually triggers the fact expiry check (Brand Manager only).
    Recalls any approved assets that rely on facts whose valid_until date has passed.
    """
    now = datetime.now(timezone.utc)
    affected = check_expired_facts(db, actor_id=current_user.id, source="manual")
    return ExpiryCheckResponse(
        checked_at=now,
        affected_assets_count=len(affected),
        affected_assets=affected,
    )


@router.get("/expiry-status", response_model=ExpiryStatusResponse)
def get_expiry_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    """
    Returns the expiry engine status, last run metadata, and upcoming expiring facts.
    """
    now = datetime.now(timezone.utc)
    org_id = current_user.org_id

    last_run = db.query(ExpiryRun).order_by(ExpiryRun.ran_at.desc()).first()
    last_run_at = last_run.ran_at if last_run else None
    last_run_source = last_run.source if last_run else None
    last_result = (
        ExpiryStatusResult(affected_assets_count=last_run.affected_assets_count)
        if last_run
        else None
    )

    interval_minutes = settings.EXPIRY_CHECK_INTERVAL_MINUTES
    next_run_at = (
        last_run_at + timedelta(minutes=interval_minutes)
        if last_run_at
        else now + timedelta(minutes=interval_minutes)
    )

    # upcoming = current fact versions expiring within 14 days or already expired, soonest first
    current_facts = (
        db.query(FactVersion)
        .join(Fact, FactVersion.fact_id == Fact.id)
        .filter(
            Fact.org_id == org_id,
            FactVersion.is_current == True,
            FactVersion.valid_until != None,
        )
        .all()
    )

    upcoming: List[UpcomingExpiryItem] = []
    fourteen_days_from_now = now + timedelta(days=14)

    for fv in current_facts:
        v_until = fv.valid_until
        if v_until.tzinfo is None:
            v_until = v_until.replace(tzinfo=timezone.utc)

        if v_until <= fourteen_days_from_now:
            days_left = int((v_until - now).total_seconds() // 86400)
            # Count linked assets
            linked_count = (
                db.query(AssetFactLink)
                .filter(AssetFactLink.fact_version_id == fv.id)
                .count()
            )
            fact_key = fv.fact.key if fv.fact else "unknown"
            upcoming.append(
                UpcomingExpiryItem(
                    fact_id=fv.fact_id,
                    key=fact_key,
                    valid_until=fv.valid_until,
                    days_left=days_left,
                    linked_assets=linked_count,
                )
            )

    upcoming.sort(key=lambda x: (x.days_left, x.key))

    return ExpiryStatusResponse(
        last_run_at=last_run_at,
        last_run_source=last_run_source,
        last_result=last_result,
        next_run_at=next_run_at,
        interval_minutes=interval_minutes,
        upcoming=upcoming,
    )


@router.post("/reset-demo")
def reset_demo(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    """
    Restores seed data (including demo accounts and passwords) and clears derived data.
    Disabled (403) when DEMO_MODE=false.
    """
    if not settings.DEMO_MODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo reset is disabled when DEMO_MODE is false",
        )

    # Re-seed demo database
    seed_database(db, force_reset=True)

    return {"detail": "Demo data restored"}
