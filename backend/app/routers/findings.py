from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Finding, ContentAsset, AssetRevision, GuidelineVersion, Fact, User
from backend.app.schemas import FindingOut, FindingUpdate, FindingPatchResponse
from backend.app.auth import get_current_user
from backend.app.audit.rules import run_deterministic_rules

router = APIRouter(prefix="/findings", tags=["Findings"])


@router.patch("/{finding_id}", response_model=FindingPatchResponse)
def update_finding_status(
    finding_id: int,
    payload: FindingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    finding = (
        db.query(Finding)
        .join(ContentAsset, Finding.asset_id == ContentAsset.id)
        .filter(Finding.id == finding_id, ContentAsset.org_id == current_user.org_id)
        .first()
    )
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Finding with ID {finding_id} not found",
        )

    asset = db.query(ContentAsset).filter(ContentAsset.id == finding.asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset with ID {finding.asset_id} not found",
        )

    if payload.status == "dismissed":
        finding.status = "dismissed"
        db.commit()
        db.refresh(finding)
        return FindingPatchResponse(
            finding=FindingOut.model_validate(finding),
            new_revision=None,
            new_body=None,
            new_findings_count=None,
        )

    # When accepted: apply suggested text as a new AssetRevision (revision + 1)
    # and re-run only deterministic checks.
    current_body = asset.body
    new_body = current_body

    if finding.suggestion:
        start = finding.start_offset
        end = finding.end_offset
        quote = finding.quote

        # Try exact offset replacement
        if 0 <= start < end <= len(current_body) and current_body[start:end] == quote:
            new_body = current_body[:start] + finding.suggestion + current_body[end:]
        elif quote in current_body:
            # Fall back to replacing first match of quote
            new_body = current_body.replace(quote, finding.suggestion, 1)

    now = datetime.now(timezone.utc)
    new_rev_number = asset.current_revision + 1

    # Create new revision
    new_revision = AssetRevision(
        asset_id=asset.id,
        revision=new_rev_number,
        body=new_body,
        created_at=now,
    )
    db.add(new_revision)

    # Update asset state
    asset.current_revision = new_rev_number
    asset.body = new_body
    asset.updated_at = now

    finding.status = "accepted"
    db.commit()
    db.refresh(finding)

    # Fetch active guidelines and facts for org
    guideline_version = (
        db.query(GuidelineVersion)
        .join(GuidelineVersion.guideline)
        .filter(GuidelineVersion.is_active == True)
        .first()
    )
    facts = db.query(Fact).filter(Fact.org_id == current_user.org_id).all()

    # Re-run ONLY the deterministic checks on new revision
    new_rule_findings = run_deterministic_rules(new_body, guideline_version, facts)

    # Store new deterministic findings for new revision
    for rf in new_rule_findings:
        new_f = Finding(
            asset_id=asset.id,
            revision=new_rev_number,
            kind=rf["kind"],
            severity=rf["severity"],
            quote=rf["quote"],
            start_offset=rf["start_offset"],
            end_offset=rf["end_offset"],
            explanation=rf["explanation"],
            suggestion=rf.get("suggestion"),
            source_type=rf["source_type"],
            source_ref=rf.get("source_ref"),
            status="open",
            origin=rf.get("origin", "rules"),
            created_at=now,
        )
        db.add(new_f)

    db.commit()

    return FindingPatchResponse(
        finding=FindingOut.model_validate(finding),
        new_revision=new_rev_number,
        new_body=new_body,
        new_findings_count=len(new_rule_findings),
    )
