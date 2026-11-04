from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import ContentAsset, AssetRevision, User
from backend.app.schemas import (
    ContentAssetCreate,
    ContentAssetOut,
    ContentAssetDetailOut,
    AssetRevisionOut,
)
from backend.app.auth import get_current_user, require_roles

router = APIRouter(prefix="/assets", tags=["Assets"])


@router.get("", response_model=List[ContentAssetOut])
def list_assets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assets = (
        db.query(ContentAsset)
        .filter(ContentAsset.org_id == current_user.org_id)
        .order_by(ContentAsset.created_at.desc())
        .all()
    )
    return [ContentAssetOut.model_validate(a) for a in assets]


@router.post("", response_model=ContentAssetDetailOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    payload: ContentAssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("creator", "brand_manager")),
):
    now = datetime.now(timezone.utc)
    asset = ContentAsset(
        org_id=current_user.org_id,
        title=payload.title,
        creator_id=current_user.id,
        body=payload.body,
        source_filename=payload.source_filename,
        status="draft",
        current_revision=1,
        created_at=now,
        updated_at=now,
    )
    db.add(asset)
    db.flush()

    revision = AssetRevision(
        asset_id=asset.id,
        revision=1,
        body=payload.body,
        created_at=now,
    )
    db.add(revision)
    db.commit()
    db.refresh(asset)

    rev_out = AssetRevisionOut.model_validate(revision)
    detail = ContentAssetDetailOut(
        id=asset.id,
        org_id=asset.org_id,
        title=asset.title,
        creator_id=asset.creator_id,
        body=asset.body,
        source_filename=asset.source_filename,
        status=asset.status,
        current_revision=asset.current_revision,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        revisions=[rev_out],
    )
    return detail


@router.get("/{asset_id}", response_model=ContentAssetDetailOut)
def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = (
        db.query(ContentAsset)
        .filter(ContentAsset.id == asset_id, ContentAsset.org_id == current_user.org_id)
        .first()
    )
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content asset with ID {asset_id} not found",
        )

    revisions_out = [AssetRevisionOut.model_validate(r) for r in asset.revisions]
    return ContentAssetDetailOut(
        id=asset.id,
        org_id=asset.org_id,
        title=asset.title,
        creator_id=asset.creator_id,
        body=asset.body,
        source_filename=asset.source_filename,
        status=asset.status,
        current_revision=asset.current_revision,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        revisions=revisions_out,
    )
