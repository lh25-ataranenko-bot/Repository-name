import os

os.environ.setdefault("AUTOWISE_DATABASE_URL", "postgresql+psycopg://autowise:autowise@localhost:5432/autowise_test")
os.environ["AUTOWISE_RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["AUTOWISE_MEDIA_DIR"] = __import__("tempfile").mkdtemp(prefix="autowise-media-")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed.seed import seed  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_token(client):
    r = client.post("/api/auth/login", json={"email": "admin@autowise.local", "password": "change-me-now"})
    return r.json()["token"]
