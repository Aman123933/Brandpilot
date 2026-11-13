import io
import os
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    ContentAsset,
    AssetRevision,
    GuidelineVersion,
    Fact,
    FactVersion,
    Finding,
    User,
    Approval,
    AssetFactLink,
    AssetGuidelineLink,
    Passport,
    Notification,
    ActivityLog,
)
from backend.app.schemas import (
    ContentAssetCreate,
    ContentAssetOut,
    ContentAssetDetailOut,
    AssetRevisionOut,
    FindingOut,
    AuditResponse,
    AuditGroupedFindings,
    RedTeamResponse,
    RedTeamFinding,
    SubmitForReviewResponse,
    DecisionRequest,
    DecisionResponse,
    AssetHistoryOut,
)
from backend.app.auth import get_current_user, require_roles
from backend.app.audit.rules import normalize_intake_text, run_deterministic_rules
from backend.app.audit.gemini import run_gemini_brand_audit, run_gemini_red_team, filter_relevant_facts
from backend.app.services.recall import lazy_throttled_check_expired_facts

router = APIRouter(prefix="/assets", tags=["Assets"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".txt", ".docx", ".pdf"}


@router.get("", response_model=List[ContentAssetOut])
def list_assets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lazy_throttled_check_expired_facts(db)
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
    if not payload.body or not payload.body.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Content body cannot be empty",
        )
    if not payload.title or not payload.title.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Asset title cannot be empty",
        )

    now = datetime.now(timezone.utc)
    normalized_body = normalize_intake_text(payload.body)

    asset = ContentAsset(
        org_id=current_user.org_id,
        title=payload.title,
        creator_id=current_user.id,
        body=normalized_body,
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
        body=normalized_body,
        created_at=now,
    )
    db.add(revision)
    db.commit()
    db.refresh(asset)

    rev_out = AssetRevisionOut.model_validate(revision)
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
        revisions=[rev_out],
    )


@router.post("/upload", response_model=ContentAssetDetailOut, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("creator", "brand_manager")),
):
    """
    Accepts .txt, .docx, .pdf files up to 5 MB.
    Extracts text, normalizes whitespace once, stores as revision 1, records source_filename.
    """
    filename = file.filename or "upload.txt"
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed types: .txt, .docx, .pdf",
        )

    content_bytes = await file.read()
    if len(content_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )
    if len(content_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 5 MB limit",
        )

    extracted_text = ""
    if ext == ".txt":
        try:
            extracted_text = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            extracted_text = content_bytes.decode("latin-1", errors="replace")

    elif ext == ".docx":
        try:
            import docx
            doc = docx.Document(io.BytesIO(content_bytes))
            parts = []
            for p in doc.paragraphs:
                if p.text:
                    parts.append(p.text)
            for table in doc.tables:
                for row in table.rows:
                    row_text = " | ".join(c.text.strip() for c in row.cells if c.text.strip())
                    if row_text:
                        parts.append(row_text)
            extracted_text = "\n".join(parts)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to parse DOCX file: {str(exc)}",
            )

    elif ext == ".pdf":
        try:
            import fitz
            doc = fitz.open(stream=content_bytes, filetype="pdf")
            parts = []
            for page in doc:
                text = page.get_text()
                if text:
                    parts.append(text)
            extracted_text = "\n".join(parts)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to parse PDF file: {str(exc)}",
            )

    # Normalize whitespace once, keeping offsets stable
    normalized_body = normalize_intake_text(extracted_text)
    if not normalized_body or not normalized_body.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file contains no readable text content",
        )

    # Derive title if not explicitly provided
    if not title or not title.strip():
        base_name, _ = os.path.splitext(filename)
        title = base_name.replace("_", " ").replace("-", " ").strip().title() or "Uploaded Document"

    now = datetime.now(timezone.utc)
    asset = ContentAsset(
        org_id=current_user.org_id,
        title=title,
        creator_id=current_user.id,
        body=normalized_body,
        source_filename=filename,
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
        body=normalized_body,
        created_at=now,
    )
    db.add(revision)
    db.commit()
    db.refresh(asset)

    rev_out = AssetRevisionOut.model_validate(revision)
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
        revisions=[rev_out],
    )


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
        passport_code=asset.passport.id if asset.passport else None,
        passport_status=asset.passport.status if asset.passport else None,
        revisions=revisions_out,
        revisions=revisions_out,
    )


@router.post("/{asset_id}/audit", response_model=AuditResponse)
def audit_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Runs deterministic rules + Gemini Brand Audit assist.
    Stores findings for the current revision and returns them grouped by severity.
    """
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

    # Fetch active guidelines and current facts for the organization
    guideline_version = (
        db.query(GuidelineVersion)
        .join(GuidelineVersion.guideline)
        .filter(GuidelineVersion.is_active == True)
        .first()
    )
    facts = db.query(Fact).filter(Fact.org_id == current_user.org_id).all()

    # 1. Deterministic rules
    deterministic_findings = run_deterministic_rules(asset.body, guideline_version, facts)

    # 2. Gemini AI Brand Audit
    ai_findings, ai_available, ai_message = run_gemini_brand_audit(
        asset.body, guideline_version, facts, db=db, user_id=current_user.id
    )

    # Combine findings (avoid duplicate identical spans)
    seen_spans = {(f["start_offset"], f["end_offset"]) for f in deterministic_findings}
    combined_findings = list(deterministic_findings)
    for af in ai_findings:
        span = (af["start_offset"], af["end_offset"])
        if span not in seen_spans:
            combined_findings.append(af)
            seen_spans.add(span)

    # Clear previous audit findings for current revision
    db.query(Finding).filter(
        Finding.asset_id == asset.id,
        Finding.revision == asset.current_revision,
        Finding.kind != "red_team_risk",
    ).delete()

    now = datetime.now(timezone.utc)
    stored_models = []
    for f in combined_findings:
        finding_obj = Finding(
            asset_id=asset.id,
            revision=asset.current_revision,
            rule_id=f.get("rule_id"),
            kind=f["kind"],
            severity=f["severity"],
            quote=f["quote"],
            start_offset=f["start_offset"],
            end_offset=f["end_offset"],
            explanation=f["explanation"],
            suggestion=f.get("suggestion"),
            source_type=f["source_type"],
            source_ref=f.get("source_ref"),
            status="open",
            origin=f.get("origin", "rules"),
            created_at=now,
        )
        db.add(finding_obj)
        stored_models.append(finding_obj)

    # Log audit activity
    db.add(
        ActivityLog(
            org_id=asset.org_id,
            actor_id=current_user.id,
            action="asset_audited",
            entity="asset",
            entity_id=str(asset.id),
            detail={"revision": asset.current_revision, "total_findings": len(stored_models), "ai_available": ai_available},
            created_at=now,
        )
    )

    db.commit()

    # Group by severity
    high_group = []
    med_group = []
    low_group = []
    for fm in stored_models:
        db.refresh(fm)
        out = FindingOut.model_validate(fm)
        if out.severity == "high":
            high_group.append(out)
        elif out.severity == "medium":
            med_group.append(out)
        else:
            low_group.append(out)

    return AuditResponse(
        asset_id=asset.id,
        revision=asset.current_revision,
        ai_available=ai_available,
        ai_message=ai_message,
        total_findings=len(stored_models),
        findings=AuditGroupedFindings(
            high=high_group,
            medium=med_group,
            low=low_group,
        ),
    )


@router.post("/{asset_id}/redteam", response_model=RedTeamResponse)
def redteam_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Runs the Brand Red Team personas (Critical Journalist, Competitor, Skeptical Customer).
    Stores risks and returns them labeled 'potential risks'.
    """
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

    risks, ai_available, ai_message = run_gemini_red_team(
        asset.body, db=db, user_id=current_user.id
    )

    # Store red team risks in findings table for audit log
    now = datetime.now(timezone.utc)
    for r in risks:
        finding_obj = Finding(
            asset_id=asset.id,
            revision=asset.current_revision,
            kind="red_team_risk",
            severity=r["severity"],
            quote=r["quote"],
            start_offset=r["start_offset"] or 0,
            end_offset=r["end_offset"] or len(r["quote"]),
            explanation=f"[{r['persona'].replace('_', ' ').title()}] {r['why']}",
            suggestion=None,
            source_type="none",
            source_ref=None,
            status="open",
            origin="ai",
            created_at=now,
        )
        db.add(finding_obj)

    db.commit()

    return RedTeamResponse(
        asset_id=asset.id,
        revision=asset.current_revision,
        ai_available=ai_available,
        ai_message=ai_message,
        risks=[RedTeamFinding.model_validate(r) for r in risks],
    )


@router.get("/{asset_id}/findings", response_model=List[FindingOut])
def get_asset_findings(
    asset_id: int,
    revision: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieves all findings for an asset, optionally filtered by revision (default: current revision)."""
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

    target_revision = revision if revision is not None else asset.current_revision

    findings = (
        db.query(Finding)
        .filter(Finding.asset_id == asset.id, Finding.revision == target_revision)
        .order_by(Finding.id.asc())
        .all()
    )
    return [FindingOut.model_validate(f) for f in findings]


@router.post("/{asset_id}/submit", response_model=SubmitForReviewResponse)
def submit_for_review(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("creator", "brand_manager")),
):
    """
    Submits an asset for review (transitions status to in_review).
    Blocks if the latest revision has never been audited.
    Warns if high-severity findings are still open.
    Notifies all reviewers in the organization.
    """
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

    if asset.status == "in_review":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Asset is already in review",
        )

    # 1. Block if latest revision has never been audited
    has_audit_findings = (
        db.query(Finding)
        .filter(Finding.asset_id == asset.id, Finding.revision == asset.current_revision)
        .first()
    )
    has_audit_log = (
        db.query(ActivityLog)
        .filter(
            ActivityLog.entity == "asset",
            ActivityLog.entity_id == str(asset.id),
            ActivityLog.action == "asset_audited",
        )
        .first()
    )
    if not has_audit_findings and not has_audit_log:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The latest revision must be audited before submission for review.",
        )

    # 2. Warn if high-severity findings are still open
    open_high_count = (
        db.query(Finding)
        .filter(
            Finding.asset_id == asset.id,
            Finding.revision == asset.current_revision,
            Finding.severity == "high",
            Finding.status == "open",
        )
        .count()
    )
    warnings = []
    if open_high_count > 0:
        warnings.append(
            f"Asset has {open_high_count} open high-severity finding(s). Reviewers may request changes or reject."
        )

    now = datetime.now(timezone.utc)
    asset.status = "in_review"
    asset.updated_at = now

    # 3. Notify reviewers in the organization
    reviewers = (
        db.query(User)
        .filter(User.org_id == current_user.org_id, User.role == "reviewer")
        .all()
    )
    for reviewer in reviewers:
        db.add(
            Notification(
                user_id=reviewer.id,
                message=f"Asset '{asset.title}' (rev {asset.current_revision}) submitted for review by {current_user.name}.",
                asset_id=asset.id,
                read=False,
                created_at=now,
            )
        )

    # 4. Activity log
    db.add(
        ActivityLog(
            org_id=asset.org_id,
            actor_id=current_user.id,
            action="asset_submitted",
            entity="asset",
            entity_id=str(asset.id),
            detail={"revision": asset.current_revision, "warnings": warnings},
            created_at=now,
        )
    )

    db.commit()
    db.refresh(asset)

    return SubmitForReviewResponse(
        asset_id=asset.id,
        status=asset.status,
        current_revision=asset.current_revision,
        message="Asset successfully submitted for review.",
        warnings=warnings,
    )


@router.post("/{asset_id}/decision", response_model=DecisionResponse)
def decide_asset(
    asset_id: int,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reviewer decision on an asset: approved, rejected, or changes_requested.
    - Creators cannot approve their own content (403).
    - Reviewer only (403 for non-reviewers).
    - Comments are required for reject / changes_requested.
    - On approval: snapshots dependency map (AssetFactLink & AssetGuidelineLink) and creates/updates Passport with short unique code.
    """
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

    # Creators cannot approve their own content (403)
    if current_user.id == asset.creator_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Creators cannot approve their own content",
        )

    # Reviewer only
    if current_user.role != "reviewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Role 'reviewer' required to record review decisions",
        )

    # Comment is required for reject / changes_requested
    if payload.decision in ("rejected", "changes_requested") and not (payload.comment and payload.comment.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A comment is required when rejecting or requesting changes.",
        )

    now = datetime.now(timezone.utc)

    # Record Approval row
    approval = Approval(
        asset_id=asset.id,
        revision=asset.current_revision,
        reviewer_id=current_user.id,
        decision=payload.decision,
        comment=payload.comment,
        decided_at=now,
    )
    db.add(approval)

    passport_code = None

    if payload.decision == "approved":
        asset.status = "approved"
        asset.updated_at = now

        # 1. Snapshot dependency map: AssetFactLink for every FactVersion used on this revision
        org_facts = db.query(Fact).filter(Fact.org_id == current_user.org_id).all()
        relevant_pairs = filter_relevant_facts(asset.body, org_facts)
        finding_fact_ids = {
            f.source_ref
            for f in asset.findings
            if f.revision == asset.current_revision and f.source_type == "fact" and f.source_ref
        }
        fact_version_ids_to_link = {fv.id for _, fv in relevant_pairs} | finding_fact_ids

        for fv_id in fact_version_ids_to_link:
            fv = db.query(FactVersion).filter(FactVersion.id == fv_id).first()
            if not fv:
                continue

            # Clear older links for this same fact
            old_links = (
                db.query(AssetFactLink)
                .join(FactVersion, AssetFactLink.fact_version_id == FactVersion.id)
                .filter(AssetFactLink.asset_id == asset.id, FactVersion.fact_id == fv.fact_id)
                .all()
            )
            for ol in old_links:
                if ol.fact_version_id != fv_id:
                    db.delete(ol)

            # Link new/current version idempotently
            existing_link = (
                db.query(AssetFactLink)
                .filter(AssetFactLink.asset_id == asset.id, AssetFactLink.fact_version_id == fv_id)
                .first()
            )
            if not existing_link:
                db.add(AssetFactLink(asset_id=asset.id, fact_version_id=fv_id, created_at=now))

        # 2. AssetGuidelineLink for active guideline version
        active_gv = (
            db.query(GuidelineVersion)
            .join(GuidelineVersion.guideline)
            .filter(GuidelineVersion.is_active == True)
            .first()
        )
        if active_gv:
            existing_g_link = (
                db.query(AssetGuidelineLink)
                .filter(
                    AssetGuidelineLink.asset_id == asset.id,
                    AssetGuidelineLink.guideline_version_id == active_gv.id,
                )
                .first()
            )
            if not existing_g_link:
                db.add(AssetGuidelineLink(asset_id=asset.id, guideline_version_id=active_gv.id, created_at=now))

        # 3. Create or update Passport (idempotent, never duplicate)
        existing_passport = db.query(Passport).filter(Passport.asset_id == asset.id).first()
        has_ai = any(f.origin == "ai" for f in asset.findings if f.revision == asset.current_revision)
        ai_disclosure = (
            "Rule checks; Gemini analysis (external service) used for tone suggestions and risk analysis"
            if has_ai
            else "Deterministic rule checks only; no external AI services used"
        )

        if existing_passport:
            passport = existing_passport
            passport.status = "valid"
            passport.approved_by = current_user.id
            passport.approved_at = now
            passport.ai_disclosure = ai_disclosure
            passport_code = passport.id
        else:
            import secrets
            chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
            while True:
                code = "BP-" + "".join(secrets.choice(chars) for _ in range(4)) + "-" + "".join(secrets.choice(chars) for _ in range(2))
                if not db.query(Passport).filter(Passport.id == code).first():
                    break
            passport = Passport(
                id=code,
                asset_id=asset.id,
                status="valid",
                approved_by=current_user.id,
                approved_at=now,
                ai_disclosure=ai_disclosure,
                created_at=now,
            )
            db.add(passport)
            passport_code = code

        # Notify creator
        db.add(
            Notification(
                user_id=asset.creator_id,
                message=f"Asset '{asset.title}' was approved by {current_user.name}.",
                asset_id=asset.id,
                read=False,
                created_at=now,
            )
        )

    elif payload.decision == "changes_requested":
        asset.status = "changes_requested"
        asset.updated_at = now
        db.add(
            Notification(
                user_id=asset.creator_id,
                message=f"Changes requested on '{asset.title}' by {current_user.name}: {payload.comment}",
                asset_id=asset.id,
                read=False,
                created_at=now,
            )
        )

    elif payload.decision == "rejected":
        asset.status = "rejected"
        asset.updated_at = now
        db.add(
            Notification(
                user_id=asset.creator_id,
                message=f"Asset '{asset.title}' was rejected by {current_user.name}: {payload.comment}",
                asset_id=asset.id,
                read=False,
                created_at=now,
            )
        )

    # Activity Log
    db.add(
        ActivityLog(
            org_id=asset.org_id,
            actor_id=current_user.id,
            action=f"asset_{payload.decision}",
            entity="asset",
            entity_id=str(asset.id),
            detail={
                "revision": asset.current_revision,
                "decision": payload.decision,
                "comment": payload.comment,
                "passport_code": passport_code,
            },
            created_at=now,
        )
    )

    db.commit()

    return DecisionResponse(
        asset_id=asset.id,
        status=asset.status,
        revision=asset.current_revision,
        decision=payload.decision,
        passport_code=passport_code,
        message=f"Decision '{payload.decision}' successfully recorded.",
    )


@router.get("/{asset_id}/history", response_model=AssetHistoryOut)
def get_asset_history(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Chronological history of revisions, approvals, findings, and activity for an asset."""
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

    findings_out = [FindingOut.model_validate(f) for f in asset.findings]

    activity_logs = (
        db.query(ActivityLog)
        .filter(
            ActivityLog.org_id == current_user.org_id,
            ActivityLog.entity == "asset",
            ActivityLog.entity_id == str(asset.id),
        )
        .order_by(ActivityLog.created_at.asc())
        .all()
    )
    activities_data = []
    for log in activity_logs:
        actor_name = log.actor.name if log.actor else "System"
        activities_data.append({
            "id": log.id,
            "action": log.action,
            "actor_id": log.actor_id,
            "actor_name": actor_name,
            "detail": log.detail,
            "created_at": log.created_at.isoformat(),
        })

    return AssetHistoryOut(
        asset_id=asset.id,
        title=asset.title,
        status=asset.status,
        current_revision=asset.current_revision,
        revisions=revisions_out,
        approvals=approvals_data,
        findings=findings_out,
        activity_logs=activities_data,
    )
