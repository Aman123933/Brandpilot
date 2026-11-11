from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from typing import Optional

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.schemas import ExpiryCheckResponse
from backend.app.services.recall import check_expired_facts

router = APIRouter(prefix="/cron", tags=["Cron"])


@router.post("/expiry", response_model=ExpiryCheckResponse)
def cron_expiry(
    x_cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret"),
    db: Session = Depends(get_db),
):
    if not settings.CRON_SECRET or not settings.CRON_SECRET.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRON_SECRET is not configured on server",
        )

    if not x_cron_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Cron-Secret header",
        )

    if x_cron_secret != settings.CRON_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid X-Cron-Secret header",
        )

    now = datetime.now(timezone.utc)
    affected = check_expired_facts(db, actor_id=None, source="cron")
    return ExpiryCheckResponse(
        checked_at=now,
        affected_assets_count=len(affected),
        affected_assets=affected,
    )
