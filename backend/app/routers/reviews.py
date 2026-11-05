from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import ContentAsset, Finding, User
from backend.app.schemas import ReviewQueueItem
from backend.app.auth import require_roles

router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.get("/queue", response_model=List[ReviewQueueItem])
def get_review_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("reviewer")),
):
    """
    Reviewer-only endpoint listing assets pending review or revalidation,
    along with their open and high-severity finding counts.
    """
    assets = (
        db.query(ContentAsset)
        .filter(
            ContentAsset.org_id == current_user.org_id,
            ContentAsset.status.in_(["in_review", "needs_revalidation", "changes_requested"]),
        )
        .order_by(ContentAsset.updated_at.desc())
        .all()
    )

    queue = []
    for asset in assets:
        creator_name = asset.creator.name if asset.creator else f"User {asset.creator_id}"
        open_findings = (
            db.query(Finding)
            .filter(
                Finding.asset_id == asset.id,
                Finding.revision == asset.current_revision,
                Finding.status == "open",
            )
            .count()
        )
        high_findings = (
            db.query(Finding)
            .filter(
                Finding.asset_id == asset.id,
                Finding.revision == asset.current_revision,
                Finding.severity == "high",
                Finding.status == "open",
            )
            .count()
        )
        passport_code = asset.passport.id if asset.passport else None
        passport_status = asset.passport.status if asset.passport else None

        queue.append(
            ReviewQueueItem(
                asset_id=asset.id,
                title=asset.title,
                creator_id=asset.creator_id,
                creator_name=creator_name,
                status=asset.status,
                current_revision=asset.current_revision,
                open_findings_count=open_findings,
                high_severity_findings_count=high_findings,
                passport_code=passport_code,
                passport_status=passport_status,
                created_at=asset.created_at,
                updated_at=asset.updated_at,
            )
        )

    return queue
