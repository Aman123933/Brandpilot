from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.schemas import HealthResponse, AiHealthInfo

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database connectivity failed: {str(exc)}",
        )

    db_url = settings.sqlalchemy_database_url
    engine_name = "postgresql" if db_url.startswith("postgresql") else "sqlite"
    ai_configured = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())

    return HealthResponse(
        status="ok",
        version="1.0.0",
        database=db_status,
        timestamp=datetime.now(timezone.utc),
        database_engine=engine_name,
        ai=AiHealthInfo(
            configured=ai_configured,
            model=settings.GEMINI_MODEL,
        ),
    )
