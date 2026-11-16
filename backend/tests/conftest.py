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
os.environ["LOG_FILE"] = str(Path(tempfile.mkdtemp()) / "jobfit.log")

# uv is a hardened-runtime binary, so macOS strips DYLD_* variables before Python starts.
# WeasyPrint finds Homebrew's Pango through ctypes, which reads this at import time.
if sys.platform == "darwin":
    os.environ.setdefault("DYLD_FALLBACK_LIBRARY_PATH", "/opt/homebrew/lib")

from app import auth, db, plans  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Client with a fresh database file per test; lifespan creates the schema."""
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "data" / "jobfit.db")
    with TestClient(app) as test_client:
        yield test_client


PRO = plans.Plan(key="pro", features=["pdf_download", "premium_models", "pro_mode"])


@pytest.fixture
def signed_in(client):
    """Client whose requests run as a Clerk user on the Pro plan (token verification is covered in
    test_auth.py; use `on_plan` for another plan)."""
    app.dependency_overrides[auth.current_user] = lambda: "user_alice"
    app.dependency_overrides[plans.current_plan] = lambda: PRO
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def on_plan(signed_in):
    """Switch the signed-in user to a plan: on_plan("free") or on_plan("basic", "pdf_download")."""
    def switch(key: str, *features: str):
        app.dependency_overrides[plans.current_plan] = lambda: plans.Plan(key=key, features=sorted(features))
    return switch
