from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Fact, FactVersion, User
from backend.app.schemas import (
    FactCreate,
    FactOut,
    FactDetailOut,
    FactVersionCreate,
    FactVersionOut,
    ImpactPreviewResponse,
)
from backend.app.auth import get_current_user, require_roles
from backend.app.services.recall import (
    recall_for_fact_version,
    get_fact_impact_preview,
    lazy_throttled_check_expired_facts,
)

router = APIRouter(prefix="/facts", tags=["Facts"])


def _build_fact_out(fact: Fact) -> FactOut:
    current = next((v for v in fact.versions if v.is_current), None)
    return FactOut(
        id=fact.id,
        org_id=fact.org_id,
        key=fact.key,
        owner_id=fact.owner_id,
        created_at=fact.created_at,
        current_version=FactVersionOut.model_validate(current) if current else None,
    )


@router.get("", response_model=List[FactOut])
def list_facts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lazy_throttled_check_expired_facts(db)
    facts = (
        db.query(Fact)
        .filter(Fact.org_id == current_user.org_id)
        .order_by(Fact.key)
        .all()
    )
    return [_build_fact_out(fact) for fact in facts]


@router.post("", response_model=FactDetailOut, status_code=status.HTTP_201_CREATED)
def create_fact(
    payload: FactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    existing = (
        db.query(Fact)
        .filter(Fact.org_id == current_user.org_id, Fact.key == payload.key)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A fact with key '{payload.key}' already exists in this organization.",
        )

    now = datetime.now(timezone.utc)
    fact = Fact(
        org_id=current_user.org_id,
        key=payload.key,
        owner_id=current_user.id,
        created_at=now,
    )
    db.add(fact)
    db.flush()

    fact_version = FactVersion(
        fact_id=fact.id,
        version=1,
        value=payload.value,
        unit=payload.unit,
        valid_from=payload.valid_from or now,
        valid_until=payload.valid_until,
        is_current=True,
        source_note=payload.source_note,
        created_by=current_user.id,
        created_at=now,
    )
    db.add(fact_version)
    db.commit()
    db.refresh(fact)

    current_out = FactVersionOut.model_validate(fact_version)
    return FactDetailOut(
        id=fact.id,
        org_id=fact.org_id,
        key=fact.key,
        owner_id=fact.owner_id,
        created_at=fact.created_at,
        current_version=current_out,
        versions=[current_out],
    )


@router.get("/{fact_id}", response_model=FactDetailOut)
def get_fact(
    fact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fact = (
        db.query(Fact)
        .filter(Fact.id == fact_id, Fact.org_id == current_user.org_id)
        .first()
    )
    if not fact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fact with ID {fact_id} not found",
        )

    versions_out = [FactVersionOut.model_validate(v) for v in fact.versions]
    current = next((v for v in versions_out if v.is_current), None)

    return FactDetailOut(
        id=fact.id,
        org_id=fact.org_id,
        key=fact.key,
        owner_id=fact.owner_id,
        created_at=fact.created_at,
        current_version=current,
        versions=versions_out,
    )


@router.get("/{fact_id}/impact", response_model=ImpactPreviewResponse)
def preview_fact_impact(
    fact_id: int,
    new_value: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Preview which approved assets will be impacted if this fact is updated,
    including affected asset titles, owners, passport codes, and matching sentences.
    No database modifications are made.
    """
    fact = (
        db.query(Fact)
        .filter(Fact.id == fact_id, Fact.org_id == current_user.org_id)
        .first()
    )
    if not fact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fact with ID {fact_id} not found",
        )

    return get_fact_impact_preview(db, fact_id, new_value, current_user.org_id)


@router.post("/{fact_id}/versions", response_model=FactVersionOut, status_code=status.HTTP_201_CREATED)
def create_fact_version(
    fact_id: int,
    payload: FactVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    fact = (
        db.query(Fact)
        .filter(Fact.id == fact_id, Fact.org_id == current_user.org_id)
        .first()
    )
    if not fact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fact with ID {fact_id} not found",
        )

    max_version = max((v.version for v in fact.versions), default=0)
    next_version = max_version + 1

    for v in fact.versions:
        if v.is_current:
            v.is_current = False

    now = datetime.now(timezone.utc)
    new_version = FactVersion(
        fact_id=fact.id,
        version=next_version,
        value=payload.value,
        unit=payload.unit,
        valid_from=payload.valid_from or now,
        valid_until=payload.valid_until,
        is_current=True,
        source_note=payload.source_note,
        created_by=current_user.id,
        created_at=now,
    )
    db.add(new_version)
    db.flush()

    # Trigger recall: marks passports review_required, assets needs_revalidation, notifies owners
    affected_assets = recall_for_fact_version(db, new_version.id, actor_id=current_user.id)

    db.commit()
    db.refresh(new_version)

    out = FactVersionOut.model_validate(new_version)
    out.affected_assets = affected_assets
    return out
