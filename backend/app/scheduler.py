import logging
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from backend.app.config import settings
from backend.app.database import SessionLocal
from backend.app.services.recall import check_expired_facts

logger = logging.getLogger("brandpilot.scheduler")

_scheduler: Optional[BackgroundScheduler] = None


def scheduled_expiry_task():
    try:
        with SessionLocal() as db:
            logger.info("[Scheduler] Running periodic scheduled expiry check...")
            check_expired_facts(db, source="scheduler")
    except Exception as exc:
        logger.error(f"[Scheduler] Error running scheduled expiry check: {exc}")


def start_scheduler():
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        logger.info("[Scheduler] Background scheduler is already running.")
        return

    _scheduler = BackgroundScheduler()
    interval = max(1, settings.EXPIRY_CHECK_INTERVAL_MINUTES)
    _scheduler.add_job(
        scheduled_expiry_task,
        "interval",
        minutes=interval,
        id="expiry_check_job",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(f"[Scheduler] Background scheduler started with {interval}m interval.")


def stop_scheduler():
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("[Scheduler] Background scheduler stopped.")
