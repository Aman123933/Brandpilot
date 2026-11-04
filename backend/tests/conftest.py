import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app.seed import seed_database
from backend.app.models import User
from backend.app.auth import create_access_token

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    seed_database(session)
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def auth_headers(db_session):
    maya = db_session.query(User).filter(User.email == "maya@kestrelaudio.com").first()
    dev = db_session.query(User).filter(User.email == "dev@kestrelaudio.com").first()
    sana = db_session.query(User).filter(User.email == "sana@kestrelaudio.com").first()

    maya_token = create_access_token(maya)
    dev_token = create_access_token(dev)
    sana_token = create_access_token(sana)

    return {
        "manager": {"Authorization": f"Bearer {maya_token}"},
        "creator": {"Authorization": f"Bearer {dev_token}"},
        "reviewer": {"Authorization": f"Bearer {sana_token}"},
    }
