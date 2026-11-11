import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from backend.app.config import settings
from backend.app.database import engine, Base, SessionLocal
from backend.app.seed import seed_database
from backend.app.services.recall import check_expired_facts
from backend.app.scheduler import start_scheduler, stop_scheduler
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
    insights,
    cron,
)

logger = logging.getLogger("brandpilot")
logging.basicConfig(level=logging.INFO)

FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)


def check_gemini_startup():
    if not settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY.strip():
        logger.info("[BrandPilot Startup] GEMINI_API_KEY is not set. Operating in deterministic rule mode only.")
    else:
        logger.info(
            f"[BrandPilot Startup] GEMINI_API_KEY configured. Model: {settings.GEMINI_MODEL}, Fallbacks: {settings.GEMINI_FALLBACK_MODELS}"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # During pytest automated testing, avoid background schedulers, network pings,
    # and touching the default disk engine (tests manage their own in-memory DB).
    is_testing = bool(
        "pytest" in sys.modules
        or os.getenv("PYTEST_CURRENT_TEST")
        or os.getenv("TESTING")
    )

    if not is_testing:
        Base.metadata.create_all(bind=engine)

        with SessionLocal() as db:
            seed_database(db)
            check_expired_facts(db, source="startup")

        start_scheduler()
        check_gemini_startup()

    yield

    if not is_testing:
        stop_scheduler()


app = FastAPI(
    title="BrandPilot API",
    description="Brand governance platform that validates content before publication, manages human approvals, and monitors post-publication validity.",
    version="1.0.0",
    lifespan=lifespan,
)

# Global JSON Exception Handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
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
app.include_router(insights.router)
app.include_router(cron.router)

static_dir = os.path.join(FRONTEND_DIST, "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/", tags=["Root"])
def root(request: Request):
    index_file = os.path.join(FRONTEND_DIST, "index.html")
    accept = request.headers.get("accept", "")
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


# Dedicated SPA routes allowed per contract
@app.get("/login", include_in_schema=False)
@app.get("/app/{full_path:path}", include_in_schema=False)
@app.get("/verify/{full_path:path}", include_in_schema=False)
async def spa_allowed_routes(request: Request):
    index_file = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Frontend build not found")


# Catch-all unknown paths -> return JSON 404 (never HTML)
@app.get("/{full_path:path}", include_in_schema=False)
async def catch_all_fallback(full_path: str):
    raise HTTPException(status_code=404, detail="Not Found")
