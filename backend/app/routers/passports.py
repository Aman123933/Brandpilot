import io
import qrcode
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.config import settings
from backend.app.models import (
    Passport,
    ContentAsset,
    AssetFactLink,
    AssetGuidelineLink,
    FactVersion,
    GuidelineVersion,
    ActivityLog,
    User,
)
from backend.app.schemas import (
    PublicPassportOut,
    FullPassportOut,
    AssetRevisionOut,
)
from backend.app.auth import get_current_user, require_roles

router = APIRouter(prefix="/passports", tags=["Passports"])


@router.get("/{code}/public", response_model=PublicPassportOut)
def get_public_passport(code: str, db: Session = Depends(get_db)):
    """
    Public Passport verification endpoint (NO authentication required).
    Returns strictly limited metadata: title, status, approved_at, reviewer first name,
    guideline label, linked facts count, and AI disclosure.
    Never exposes the raw body text or fact values.
    """
    passport = db.query(Passport).filter(Passport.id == code).first()
    if not passport:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Passport with code '{code}' not found",
        )

    asset = passport.asset
    reviewer_first_name = passport.approver.name.split()[0] if passport.approver else None

    # Guideline label
    g_link = (
        db.query(AssetGuidelineLink)
        .filter(AssetGuidelineLink.asset_id == asset.id)
        .first()
    )
    guideline_label = "Approved Brand Guidelines"
    if g_link and g_link.guideline_version:
        gv = g_link.guideline_version
        g_title = gv.guideline.title if gv.guideline else "Brand Guidelines"
        guideline_label = f"{g_title} v{gv.version}"

    # Count of linked facts
    linked_facts_count = (
        db.query(AssetFactLink)
        .filter(AssetFactLink.asset_id == asset.id)
        .count()
    )

    return PublicPassportOut(
        code=passport.id,
        asset_title=asset.title,
        status=passport.status,
        approved_at=passport.approved_at,
        reviewer_first_name=reviewer_first_name,
        guideline_version_label=guideline_label,
        linked_facts_count=linked_facts_count,
        ai_disclosure=passport.ai_disclosure,
    )


@router.get("/{code}", response_model=FullPassportOut)
def get_full_passport(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Authenticated full view of the passport and its complete audit chain,
    including linked fact versions with values, guideline version, revisions, approvals, and activity.
    """
    passport = db.query(Passport).filter(Passport.id == code).first()
    if not passport:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Passport with code '{code}' not found",
        )

    asset = passport.asset
    if asset.org_id != current_user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden to passport outside your organization",
        )

    approver_name = passport.approver.name if passport.approver else None

    # Guideline info
    g_link = (
        db.query(AssetGuidelineLink)
        .filter(AssetGuidelineLink.asset_id == asset.id)
        .first()
    )
    guideline_data = None
    if g_link and g_link.guideline_version:
        gv = g_link.guideline_version
        guideline_data = {
            "id": gv.guideline_id,
            "version": gv.version,
            "title": gv.guideline.title if gv.guideline else "Guidelines",
            "body": gv.body,
            "rules": gv.rules,
            "created_at": gv.created_at.isoformat(),
        }

    # Referenced facts
    fact_links = (
        db.query(AssetFactLink)
        .filter(AssetFactLink.asset_id == asset.id)
        .all()
    )
    facts_data = []
    for fl in fact_links:
        fv = fl.fact_version
        if fv:
            fact_key = fv.fact.key if fv.fact else f"Fact {fv.fact_id}"
            facts_data.append({
                "fact_id": fv.fact_id,
                "fact_key": fact_key,
                "version": fv.version,
                "value": fv.value,
                "unit": fv.unit,
                "valid_from": fv.valid_from.isoformat() if fv.valid_from else None,
                "valid_until": fv.valid_until.isoformat() if fv.valid_until else None,
                "is_current": fv.is_current,
                "source_note": fv.source_note,
            })

    revisions_out = [
        AssetRevisionOut.model_validate(r)
        for r in sorted(asset.revisions, key=lambda x: x.revision)
    ]

    approvals_data = []
    for appr in asset.approvals:
        reviewer_name = appr.reviewer.name if appr.reviewer else f"User {appr.reviewer_id}"
        approvals_data.append({
            "id": appr.id,
            "revision": appr.revision,
            "reviewer_id": appr.reviewer_id,
            "reviewer_name": reviewer_name,
            "decision": appr.decision,
            "comment": appr.comment,
            "decided_at": appr.decided_at.isoformat(),
        })

    activities = (
        db.query(ActivityLog)
        .filter(
            ActivityLog.org_id == current_user.org_id,
            ActivityLog.entity == "asset",
            ActivityLog.entity_id == str(asset.id),
        )
        .order_by(ActivityLog.created_at.asc())
        .all()
    )
    activity_data = []
    for log in activities:
        actor_name = log.actor.name if log.actor else "System"
        activity_data.append({
            "id": log.id,
            "action": log.action,
            "actor_id": log.actor_id,
            "actor_name": actor_name,
            "detail": log.detail,
            "created_at": log.created_at.isoformat(),
        })

    return FullPassportOut(
        code=passport.id,
        asset_id=asset.id,
        asset_title=asset.title,
        asset_status=asset.status,
        status=passport.status,
        approved_at=passport.approved_at,
        approved_by_name=approver_name,
        ai_disclosure=passport.ai_disclosure,
        created_at=passport.created_at,
        guideline_version=guideline_data,
        referenced_facts=facts_data,
        revisions=revisions_out,
        approvals=approvals_data,
        activity_log=activity_data,
    )


@router.get("/{code}/qr.png")
def get_passport_qr_code(code: str, db: Session = Depends(get_db)):
    """Generates and serves a PNG QR code encoding the public verification URL."""
    passport = db.query(Passport).filter(Passport.id == code).first()
    if not passport:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Passport with code '{code}' not found",
        )

    verify_url = f"{settings.PUBLIC_BASE_URL}/verify/{code}"
    qr = qrcode.QRCode(
        version=1,
        box_size=10,
        border=2,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return Response(content=buf.getvalue(), media_type="image/png")


@router.post("/{code}/withdraw", response_model=PublicPassportOut)
def withdraw_passport(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager")),
):
    """Withdraws a passport and revokes public validity (Brand Manager only)."""
    passport = db.query(Passport).filter(Passport.id == code).first()
    if not passport:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Passport with code '{code}' not found",
        )

    asset = passport.asset
    if asset.org_id != current_user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden to passport outside your organization",
        )

    now = datetime.now(timezone.utc)
    passport.status = "withdrawn"
    asset.status = "rejected"
    asset.updated_at = now

    db.add(
        ActivityLog(
            org_id=asset.org_id,
            actor_id=current_user.id,
            action="passport_withdrawn",
            entity="passport",
            entity_id=code,
            detail={"asset_id": asset.id},
            created_at=now,
        )
    )

    db.commit()
    db.refresh(passport)

    return get_public_passport(code, db)
