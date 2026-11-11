from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    Guideline,
    GuidelineVersion,
    User,
    ReplayRun,
    ActivityLog,
    Notification,
    ContentAsset,
)
from backend.app.schemas import (
    GuidelineCreate,
    GuidelineOut,
    GuidelineDetailOut,
    GuidelineVersionCreate,
    GuidelineVersionOut,
    GuidelineVersionListItem,
    UserBriefOut,
    RulesSummary,
    ReplaySummaryBrief,
    GuidelineDiffResponse,
    ReplayRequest,
    ReplayResponse,
    ActivateVersionRequest,
    ActivateVersionResponse,
    RejectVersionRequest,
    RejectVersionResponse,
)
from backend.app.auth import get_current_user, require_roles
from backend.app.services.brand_git import compute_guideline_diff, run_deterministic_replay

router = APIRouter(prefix="/guidelines", tags=["Guidelines"])


def _extract_rules_summary(rules: Optional[dict]) -> RulesSummary:
    r = rules or {}
    return RulesSummary(
        banned_terms=len(r.get("banned_terms", [])),
        required_phrases=len(r.get("required_phrases", [])),
        claim_rules=len(r.get("claim_rules", [])),
    )


def _get_latest_replay_brief(db: Session, guideline_id: int, version: int) -> Optional[ReplaySummaryBrief]:
    replay = (
        db.query(ReplayRun)
        .filter(
            ReplayRun.guideline_id == guideline_id,
            ReplayRun.version == version,
        )
        .order_by(ReplayRun.ran_at.desc())
        .first()
    )
    if not replay:
        return None
    summary = replay.summary or {}
    return ReplaySummaryBrief(
        ran_at=replay.ran_at,
        assets_newly_noncompliant=summary.get("assets_newly_noncompliant", 0),
        assets_newly_compliant=summary.get("assets_newly_compliant", 0),
    )


def _build_version_list_item(db: Session, v: GuidelineVersion) -> GuidelineVersionListItem:
    created_by_user = None
    if v.created_by:
        created_by_user = UserBriefOut(id=v.created_by.id, name=v.created_by.name)
    elif v.created_by_id:
        u = db.query(User).filter(User.id == v.created_by_id).first()
        if u:
            created_by_user = UserBriefOut(id=u.id, name=u.name)

    return GuidelineVersionListItem(
        id=v.id,
        version=v.version,
        status=v.status or ("active" if v.is_active else "draft"),
        created_at=v.created_at,
        created_by=created_by_user,
        change_note=v.change_note,
        rules_summary=_extract_rules_summary(v.rules),
        latest_replay=_get_latest_replay_brief(db, v.guideline_id, v.version),
    )


def _build_version_out(db: Session, v: GuidelineVersion) -> GuidelineVersionOut:
    created_by_user = None
    if v.created_by:
        created_by_user = UserBriefOut(id=v.created_by.id, name=v.created_by.name)
    elif v.created_by_id:
        u = db.query(User).filter(User.id == v.created_by_id).first()
        if u:
            created_by_user = UserBriefOut(id=u.id, name=u.name)

    status_str = v.status or ("active" if v.is_active else "draft")
    return GuidelineVersionOut(
        id=v.id,
        guideline_id=v.guideline_id,
        version=v.version,
        body=v.body,
        rules=v.rules or {},
        created_at=v.created_at,
        is_active=v.is_active,
        status=status_str,
        change_note=v.change_note,
        created_by=created_by_user,
        rules_summary=_extract_rules_summary(v.rules),
        latest_replay=_get_latest_replay_brief(db, v.guideline_id, v.version),
    )


def _build_guideline_out(guideline: Guideline, db: Session) -> GuidelineOut:
    active = next((v for v in guideline.versions if v.is_active), None)
    latest = guideline.versions[0] if guideline.versions else None
    target_version = active or latest

    return GuidelineOut(
        id=guideline.id,
        org_id=guideline.org_id,
        title=guideline.title,
        owner_id=guideline.owner_id,
        created_at=guideline.created_at,
        current_version=_build_version_out(db, target_version) if target_version else None,
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
    return [_build_guideline_out(g, db) for g in guidelines]


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
        change_note="Initial version",
        status="active",
        created_by_id=current_user.id,
        created_at=now,
        is_active=True,
    )
    db.add(guideline_version)
    db.commit()
    db.refresh(guideline)

    version_out = _build_version_out(db, guideline_version)
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

    versions_out = [_build_version_out(db, v) for v in guideline.versions]
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


@router.get("/{guideline_id}/versions", response_model=List[GuidelineVersionListItem])
def list_guideline_versions(
    guideline_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists all versions of a guideline, newest first."""
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

    versions = (
        db.query(GuidelineVersion)
        .filter(GuidelineVersion.guideline_id == guideline_id)
        .order_by(GuidelineVersion.version.desc())
        .all()
    )
    return [_build_version_list_item(db, v) for v in versions]


@router.post("/{guideline_id}/versions", response_model=GuidelineVersionOut, status_code=status.HTTP_201_CREATED)
def create_guideline_version(
    guideline_id: int,
    payload: GuidelineVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    """
    Creates a new guideline version.
    Defaults to status: 'draft' unless activate is True.
    """
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

    should_activate = bool(payload.activate or payload.is_active)
    new_status = "active" if should_activate else "draft"

    if should_activate:
        for v in guideline.versions:
            if v.is_active or v.status == "active":
                v.is_active = False
                v.status = "archived"

    now = datetime.now(timezone.utc)
    rules_dict = payload.rules.model_dump()
    new_version = GuidelineVersion(
        guideline_id=guideline.id,
        version=next_version,
        body=payload.body,
        rules=rules_dict,
        change_note=payload.change_note,
        status=new_status,
        created_by_id=current_user.id,
        created_at=now,
        is_active=should_activate,
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)

    return _build_version_out(db, new_version)


@router.get("/{guideline_id}/diff", response_model=GuidelineDiffResponse)
def get_guideline_diff(
    guideline_id: int,
    from_version: int = Query(..., alias="from"),
    to_version: int = Query(..., alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns semantic diff between two guideline versions."""
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

    if from_version == to_version:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from and to versions must be different",
        )

    v_from = (
        db.query(GuidelineVersion)
        .filter(GuidelineVersion.guideline_id == guideline_id, GuidelineVersion.version == from_version)
        .first()
    )
    v_to = (
        db.query(GuidelineVersion)
        .filter(GuidelineVersion.guideline_id == guideline_id, GuidelineVersion.version == to_version)
        .first()
    )

    if not v_from:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guideline version {from_version} not found",
        )
    if not v_to:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guideline version {to_version} not found",
        )

    diff = compute_guideline_diff(v_from, v_to)
    return GuidelineDiffResponse(**diff)


@router.post("/{guideline_id}/versions/{version}/replay", response_model=ReplayResponse)
def post_replay(
    guideline_id: int,
    version: int,
    payload: Optional[ReplayRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager", "reviewer")),
):
    """Runs deterministic replay against proposed version (Brand Manager, Reviewer)."""
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

    target_version = (
        db.query(GuidelineVersion)
        .filter(GuidelineVersion.guideline_id == guideline_id, GuidelineVersion.version == version)
        .first()
    )
    if not target_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guideline version {version} not found",
        )

    if target_version.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot replay non-draft version (status is '{target_version.status}')",
        )

    active_version = (
        db.query(GuidelineVersion)
        .filter(GuidelineVersion.guideline_id == guideline_id, GuidelineVersion.is_active == True)
        .first()
    )

    scope = payload.scope if payload and payload.scope else "approved"
    result = run_deterministic_replay(db, guideline, active_version, target_version, scope=scope)
    return ReplayResponse(**result)


@router.get("/{guideline_id}/versions/{version}/replay", response_model=ReplayResponse)
def get_replay(
    guideline_id: int,
    version: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gets last stored replay result for version."""
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

    target_version = (
        db.query(GuidelineVersion)
        .filter(GuidelineVersion.guideline_id == guideline_id, GuidelineVersion.version == version)
        .first()
    )
    if not target_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guideline version {version} not found",
        )

    replay = (
        db.query(ReplayRun)
        .filter(ReplayRun.guideline_id == guideline_id, ReplayRun.version == version)
        .order_by(ReplayRun.ran_at.desc())
        .first()
    )
    if not replay:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No replay has been run for this version yet",
        )

    return ReplayResponse(
        guideline_id=replay.guideline_id,
        active_version=replay.active_version,
        proposed_version=replay.proposed_version,
        scope=replay.scope,
        ran_at=replay.ran_at,
        assets_checked=replay.assets_checked,
        summary=replay.summary or {},
        newly_flagged=replay.newly_flagged or [],
        newly_cleared=replay.newly_cleared or [],
    )


@router.post("/{guideline_id}/versions/{version}/activate", response_model=ActivateVersionResponse)
def activate_version(
    guideline_id: int,
    version: int,
    payload: Optional[ActivateVersionRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    """Activates a proposed draft guideline version (Brand Manager only)."""
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

    target_version = (
        db.query(GuidelineVersion)
        .filter(GuidelineVersion.guideline_id == guideline_id, GuidelineVersion.version == version)
        .first()
    )
    if not target_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guideline version {version} not found",
        )

    if target_version.status == "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Version is already active",
        )

    if target_version.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Version is not a draft (status: '{target_version.status}')",
        )

    # Requires a stored replay
    replay = (
        db.query(ReplayRun)
        .filter(ReplayRun.guideline_id == guideline_id, ReplayRun.version == version)
        .first()
    )
    if not replay:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Run a replay before activating this version",
        )

    now = datetime.now(timezone.utc)
    prev_active = (
        db.query(GuidelineVersion)
        .filter(GuidelineVersion.guideline_id == guideline_id, GuidelineVersion.is_active == True)
        .first()
    )
    prev_version_num = prev_active.version if prev_active else 0
    if prev_active:
        prev_active.is_active = False
        prev_active.status = "archived"

    target_version.status = "active"
    target_version.is_active = True
    if payload and payload.note:
        target_version.change_note = payload.note

    # Assets to recheck from replay
    assets_to_recheck = replay.summary.get("assets_newly_noncompliant", 0) if replay.summary else 0

    # Write ActivityLog
    db.add(
        ActivityLog(
            org_id=guideline.org_id,
            actor_id=current_user.id,
            action="guideline_activated",
            entity="guideline",
            entity_id=str(guideline.id),
            detail={
                "activated_version": version,
                "previous_version": prev_version_num,
                "assets_to_recheck": assets_to_recheck,
                "note": payload.note if payload else None,
            },
            created_at=now,
        )
    )

    # Notify guideline owner and reviewers
    recipient_users = (
        db.query(User)
        .filter(
            User.org_id == guideline.org_id,
            (User.id == guideline.owner_id) | (User.role == "reviewer"),
        )
        .all()
    )
    for u in recipient_users:
        db.add(
            Notification(
                user_id=u.id,
                message=f"Guideline '{guideline.title}' v{version} has been activated.",
                read=False,
                created_at=now,
            )
        )

    db.commit()

    return ActivateVersionResponse(
        guideline_id=guideline.id,
        version=version,
        status="active",
        previous_version=prev_version_num,
        assets_to_recheck=assets_to_recheck,
    )


@router.post("/{guideline_id}/versions/{version}/reject", response_model=RejectVersionResponse)
def reject_version(
    guideline_id: int,
    version: int,
    payload: RejectVersionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    """Rejects a draft guideline version with mandatory note (Brand Manager only)."""
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

    target_version = (
        db.query(GuidelineVersion)
        .filter(GuidelineVersion.guideline_id == guideline_id, GuidelineVersion.version == version)
        .first()
    )
    if not target_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Guideline version {version} not found",
        )

    if target_version.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Version is already rejected",
        )

    if target_version.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject version with status '{target_version.status}'",
        )

    now = datetime.now(timezone.utc)
    target_version.status = "rejected"
    target_version.is_active = False

    db.add(
        ActivityLog(
            org_id=guideline.org_id,
            actor_id=current_user.id,
            action="guideline_version_rejected",
            entity="guideline",
            entity_id=str(guideline.id),
            detail={
                "rejected_version": version,
                "note": payload.note,
            },
            created_at=now,
        )
    )

    db.commit()

    return RejectVersionResponse(
        version=version,
        status="rejected",
    )
