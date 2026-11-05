from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.database import engine, Base, SessionLocal
from backend.app.seed import seed_database
from backend.app.services.recall import check_expired_facts
from backend.app.routers import (
    auth,
    health,
    facts,
    guidelines,
    assets,
    findings,
    reviews,
    passports,
    notifications,
    admin,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        seed_database(db)
        check_expired_facts(db)

    yield


app = FastAPI(
    title="BrandPilot API",
    description="Brand governance platform that validates content before publication, manages human approvals, and monitors post-publication validity.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(facts.router)
app.include_router(guidelines.router)
app.include_router(assets.router)
app.include_router(findings.router)
app.include_router(reviews.router)
app.include_router(passports.router)
app.include_router(notifications.router)
app.include_router(admin.router)


@app.get("/", tags=["Root"])
def root():
    return {
        "name": "BrandPilot API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "health_url": "/health",
    }
