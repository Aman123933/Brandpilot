from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models import User, LoginAttempt
from backend.app.schemas import (
    DemoLoginRequest,
    TokenResponse,
    UserOut,
    LoginRequest,
    DemoCredentialOut,
)
from backend.app.auth import create_access_token, get_current_user, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/demo-users", response_model=List[UserOut])
def list_demo_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.id).all()


@router.get("/demo-credentials", response_model=List[DemoCredentialOut])
def get_demo_credentials():
    if not settings.DEMO_MODE:
        return []
    return [
        DemoCredentialOut(
            name="Maya Lin",
            email="maya@kestrelaudio.com",
            password="Demo@2026",
            role="brand_manager",
            description="Owns facts, guidelines and Brand Git",
        ),
        DemoCredentialOut(
            name="Dev Patel",
            email="dev@kestrelaudio.com",
            password="Demo@2026",
            role="creator",
            description="Drafts and submits content assets for review",
        ),
        DemoCredentialOut(
            name="Sana Miller",
            email="sana@kestrelaudio.com",
            password="Demo@2026",
            role="reviewer",
            description="Audits submissions and issues passports",
        ),
    ]


@router.post("/demo-login", response_model=TokenResponse)
def demo_login(req: DemoLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {req.user_id} not found",
        )

    token = create_access_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email_clean = req.email.strip().lower()
    now = datetime.now(timezone.utc)
    ten_minutes_ago = now - timedelta(minutes=10)

    # Throttling check: 5 failed attempts in the last 10 minutes gives 429
    failed_attempts = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.email == email_clean,
            LoginAttempt.success == False,
            LoginAttempt.attempted_at >= ten_minutes_ago,
        )
        .count()
    )
    if failed_attempts >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again in a few minutes.",
        )

    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not user.password_hash or not user.salt:
        attempt = LoginAttempt(email=email_clean, attempted_at=now, success=False)
        db.add(attempt)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(req.password, user.password_hash, user.salt):
        attempt = LoginAttempt(email=email_clean, attempted_at=now, success=False)
        db.add(attempt)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Success: record attempt
    attempt = LoginAttempt(email=email_clean, attempted_at=now, success=True)
    db.add(attempt)
    db.commit()

    token = create_access_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
