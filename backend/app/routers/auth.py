from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import User
from backend.app.schemas import DemoLoginRequest, TokenResponse, UserOut
from backend.app.auth import create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/demo-users", response_model=List[UserOut])
def list_demo_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.id).all()


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
