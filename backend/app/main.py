import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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

logger = logging.getLogger("brandpilot")
logging.basicConfig(level=logging.INFO)

FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)


def check_gemini_startup():
    if not settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY.strip():
        logger.info("[BrandPilot Startup] GEMINI_API_KEY is not set. Operating in deterministic rule mode only.")
        return

    logger.info(
        f"[BrandPilot Startup] GEMINI_API_KEY is set. Testing connectivity with model '{settings.GEMINI_MODEL}'..."
    )
    try:
        from google import genai
        client = genai.Client(api_key=settings.GEMINI_API_KEY.strip())
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents="ping",
        )
        if response and response.text:
            logger.info(
                f"[BrandPilot Startup] Gemini test call SUCCEEDED with model '{settings.GEMINI_MODEL}'. Generative AI features enabled."
            )
        else:
            logger.warning(
                f"[BrandPilot Startup] Gemini test call returned empty content with model '{settings.GEMINI_MODEL}'."
            )
    except Exception as exc:
        logger.warning(
            f"[BrandPilot Startup] Gemini test call FAILED with model '{settings.GEMINI_MODEL}': {exc}. Operating with deterministic rule checks only."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        seed_database(db)
        check_expired_facts(db)

    check_gemini_startup()

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

assets_dir = os.path.join(FRONTEND_DIST, "assets")
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")


@app.get("/", tags=["Root"])
def root(request: Request):
    index_file = os.path.join(FRONTEND_DIST, "index.html")
    accept = request.headers.get("accept", "")
    # If requested by a browser navigation or explicitly requests HTML, serve SPA
    if os.path.exists(index_file) and (
        "text/html" in accept or request.headers.get("sec-fetch-dest") == "document"
    ):
        return FileResponse(index_file)
    if os.path.exists(index_file) and "application/json" not in accept and "*/*" not in accept:
        return FileResponse(index_file)
    return {
        "name": "BrandPilot API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "health_url": "/health",
    }


API_ROUTE_PREFIXES = (
    "auth",
    "facts",
    "guidelines",
    "assets",
    "findings",
    "reviews",
    "passports",
    "notifications",
    "admin",
    "health",
    "docs",
    "redoc",
    "openapi.json",
)


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(request: Request, full_path: str):
    first_segment = full_path.split("/")[0]
    if first_segment in API_ROUTE_PREFIXES:
        raise HTTPException(status_code=404, detail="Not Found")

    target_file = os.path.join(FRONTEND_DIST, full_path)
    if os.path.isfile(target_file):
        return FileResponse(target_file)

    index_file = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)

    raise HTTPException(status_code=404, detail="Not Found")
