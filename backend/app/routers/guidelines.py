from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Guideline, GuidelineVersion, User
from backend.app.schemas import (
    GuidelineCreate,
    GuidelineOut,
    GuidelineDetailOut,
    GuidelineVersionCreate,
    GuidelineVersionOut,
)
from backend.app.auth import get_current_user, require_roles

router = APIRouter(prefix="/guidelines", tags=["Guidelines"])


def _build_guideline_out(guideline: Guideline) -> GuidelineOut:
    active = next((v for v in guideline.versions if v.is_active), None)
    latest = guideline.versions[0] if guideline.versions else None
    target_version = active or latest

    return GuidelineOut(
        id=guideline.id,
        org_id=guideline.org_id,
        title=guideline.title,
        owner_id=guideline.owner_id,
        created_at=guideline.created_at,
        current_version=GuidelineVersionOut.model_validate(target_version) if target_version else None,
    )


@router.get("", response_model=List[GuidelineOut])
def list_guidelines(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    guidelines = (
        db.query(Guideline)
        .filter(Guideline.org_id == current_user.org_id)
        .order_by(Guideline.title)
        .all()
    )
    return [_build_guideline_out(g) for g in guidelines]


@router.post("", response_model=GuidelineDetailOut, status_code=status.HTTP_201_CREATED)
def create_guideline(
    payload: GuidelineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    now = datetime.now(timezone.utc)
    guideline = Guideline(
        org_id=current_user.org_id,
        title=payload.title,
        owner_id=current_user.id,
        created_at=now,
    )
    db.add(guideline)
    db.flush()

    rules_dict = payload.rules.model_dump()
    guideline_version = GuidelineVersion(
        guideline_id=guideline.id,
        version=1,
        body=payload.body,
        rules=rules_dict,
        created_at=now,
        is_active=True,
    )
    db.add(guideline_version)
    db.commit()
    db.refresh(guideline)

    version_out = GuidelineVersionOut.model_validate(guideline_version)
    return GuidelineDetailOut(
        id=guideline.id,
        org_id=guideline.org_id,
        title=guideline.title,
        owner_id=guideline.owner_id,
        created_at=guideline.created_at,
        current_version=version_out,
        versions=[version_out],
    )


@router.get("/{guideline_id}", response_model=GuidelineDetailOut)
def get_guideline(
    guideline_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    guideline = (
        db.query(Guideline)
        .filter(Guideline.id == guideline_id, Guideline.org_id == current_user.org_id)
        .first()
    )
    if not guideline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guideline with ID {guideline_id} not found",
        )

    versions_out = [GuidelineVersionOut.model_validate(v) for v in guideline.versions]
    active = next((v for v in versions_out if v.is_active), None)
    latest = versions_out[0] if versions_out else None

    return GuidelineDetailOut(
        id=guideline.id,
        org_id=guideline.org_id,
        title=guideline.title,
        owner_id=guideline.owner_id,
        created_at=guideline.created_at,
        current_version=active or latest,
        versions=versions_out,
    )


@router.post("/{guideline_id}/versions", response_model=GuidelineVersionOut, status_code=status.HTTP_201_CREATED)
def create_guideline_version(
    guideline_id: int,
    payload: GuidelineVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    guideline = (
        db.query(Guideline)
        .filter(Guideline.id == guideline_id, Guideline.org_id == current_user.org_id)
        .first()
    )
    if not guideline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guideline with ID {guideline_id} not found",
        )

    max_version = max((v.version for v in guideline.versions), default=0)
    next_version = max_version + 1

    if payload.is_active:
        for v in guideline.versions:
            if v.is_active:
                v.is_active = False

    now = datetime.now(timezone.utc)
    rules_dict = payload.rules.model_dump()
    new_version = GuidelineVersion(
        guideline_id=guideline.id,
        version=next_version,
        body=payload.body,
        rules=rules_dict,
        created_at=now,
        is_active=payload.is_active,
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)

    return GuidelineVersionOut.model_validate(new_version)
