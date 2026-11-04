from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.database import engine, Base, SessionLocal
from backend.app.seed import seed_database
from backend.app.routers import auth, health, facts, guidelines, assets


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        seed_database(db)

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


@app.get("/", tags=["Root"])
def root():
    return {
        "name": "BrandPilot API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "health_url": "/health",
    }
