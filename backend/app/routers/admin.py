from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import User
from backend.app.schemas import ExpiryCheckResponse
from backend.app.auth import require_roles
from backend.app.services.recall import check_expired_facts

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
    affected = check_expired_facts(db, actor_id=current_user.id)
    return ExpiryCheckResponse(
        checked_at=now,
        affected_assets_count=len(affected),
        affected_assets=affected,
    )
