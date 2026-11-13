"""Every data route needs a session, and users only see their own data."""

import pytest

from app import auth
from app.main import app

PROTECTED = [
    ("GET", "/api/resume/baseline", None),
    ("PUT", "/api/resume/baseline", {"content_md": "x"}),
    ("GET", "/api/history", None),
    ("POST", "/api/history", {"company": "A", "job_description": "j", "content_md": "c", "style": "modern"}),
    ("GET", "/api/history/1/pdf", None),
    ("GET", "/api/preferences", None),
    ("PUT", "/api/preferences", {"style": "modern"}),
    ("POST", "/api/preview", {"content_md": "x", "style": "modern"}),
]


@pytest.mark.parametrize("method,path,body", PROTECTED)
def test_requires_session(client, method, path, body):
    assert client.request(method, path, json=body).status_code == 401


def act_as(username):
    """Make requests run as the given Clerk user id, bypassing token verification."""
    app.dependency_overrides[auth.current_user] = lambda: username


@pytest.fixture
def two_users(client):
    """Data written as user_alice; then switch the client to act as user_bob."""
    act_as("user_alice")
    client.put("/api/resume/baseline", json={"content_md": "user resume"})
    client.put("/api/preferences", json={"style": "classic"})
    entry_id = client.post(
        "/api/history",
        json={"company": "Acme", "job_description": "j", "content_md": "c", "style": "modern"},
    ).json()["id"]
    act_as("user_bob")
    yield client, entry_id
    app.dependency_overrides.clear()


def test_other_user_cannot_see_baseline(two_users):
    client, _ = two_users
    assert client.get("/api/resume/baseline").json()["content_md"] is None


def test_other_user_cannot_see_history(two_users):
    client, entry_id = two_users
    assert client.get("/api/history").json() == []
    assert client.get(f"/api/history/{entry_id}/pdf").status_code == 404


def test_other_user_has_own_preferences(two_users):
    client, _ = two_users
    assert client.get("/api/preferences").json()["style"] == "professional"


def test_writes_do_not_leak_back(two_users):
    client, _ = two_users
    client.put("/api/resume/baseline", json={"content_md": "other resume"})
    act_as("user_alice")
    assert client.get("/api/resume/baseline").json()["content_md"] == "user resume"
