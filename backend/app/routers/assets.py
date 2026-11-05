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
    Finding,
    User,
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
)
from backend.app.auth import get_current_user, require_roles
from backend.app.audit.rules import normalize_intake_text, run_deterministic_rules
from backend.app.audit.gemini import run_gemini_brand_audit, run_gemini_red_team

router = APIRouter(prefix="/assets", tags=["Assets"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".txt", ".docx", ".pdf"}


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
    if not normalized_body:
        normalized_body = "(Empty document)"

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
    ai_findings, ai_available = run_gemini_brand_audit(asset.body, guideline_version, facts)

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

    risks, ai_available = run_gemini_red_team(asset.body)

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
