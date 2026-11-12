"""Test setup that must run before the app is imported, plus shared fixtures."""

import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

static_dir = Path(tempfile.mkdtemp())
(static_dir / "index.html").write_text("<html><body>JobFit test page</body></html>")
os.environ["STATIC_DIR"] = str(static_dir)
os.environ["CLERK_SECRET_KEY"] = "sk_test_unit"

# uv is a hardened-runtime binary, so macOS strips DYLD_* variables before Python starts.
# WeasyPrint finds Homebrew's Pango through ctypes, which reads this at import time.
if sys.platform == "darwin":
    os.environ.setdefault("DYLD_FALLBACK_LIBRARY_PATH", "/opt/homebrew/lib")

from app import auth, db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Client with a fresh database file per test; lifespan creates the schema."""
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "data" / "jobfit.db")
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def signed_in(client):
    """Client whose requests run as a Clerk user (token verification is covered in test_auth.py)."""
    app.dependency_overrides[auth.current_user] = lambda: "user_alice"
    yield client
    app.dependency_overrides.clear()
