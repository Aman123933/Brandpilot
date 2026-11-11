"""Reset the BrandPilot database.

Drops all tables and re-creates them from the current SQLAlchemy models,
then seeds the database with fresh demo data.

Usage (from the repo root, inside the .venv):
    python scripts/reset_db.py

The DATABASE_URL env var is respected; defaults to SQLite brandpilot.db.
"""

import sys
import os

# Add repo root so we can import the app package.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import engine, Base, SessionLocal
from backend.app.seed import seed_database


def reset():
    print("[reset_db] Dropping all tables …")
    Base.metadata.drop_all(bind=engine)

    print("[reset_db] Creating all tables …")
    Base.metadata.create_all(bind=engine)

    print("[reset_db] Seeding demo data …")
    db = SessionLocal()
    try:
        seeded = seed_database(db, force_reset=False)
        if seeded:
            print("[reset_db] Done — database seeded with fresh demo data.")
        else:
            print("[reset_db] Done — seed reported data already exists (unexpected after drop).")
    finally:
        db.close()


if __name__ == "__main__":
    reset()
