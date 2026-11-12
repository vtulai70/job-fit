"""Clerk token verification through the real SDK, using a local RSA key pair (no network)."""

import time

import jwt
import pytest
from clerk_backend_api.security.types import AuthenticateRequestOptions
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app import auth, db

ORIGIN = "http://localhost:8000"


def make_keys():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_pem = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode()
    return private, public_pem


SIGNING_KEY, PUBLIC_PEM = make_keys()
OTHER_KEY, _ = make_keys()


def token(sub="user_alice", azp=ORIGIN, expires_in=60, key=SIGNING_KEY):
    now = int(time.time())
    claims = {"sub": sub, "azp": azp, "iat": now, "nbf": now - 5, "exp": now + expires_in, "sid": "sess_1"}
    return jwt.encode(claims, key, algorithm="RS256")


@pytest.fixture
def clerk(client, monkeypatch):
    """Verify against the local public key instead of fetching Clerk's JWKS."""
    monkeypatch.setattr(
        auth,
        "auth_options",
        lambda: AuthenticateRequestOptions(
            jwt_key=PUBLIC_PEM, authorized_parties=[ORIGIN], accepts_token=["session_token"]
        ),
    )
    return client


def test_no_token_is_rejected(clerk):
    assert clerk.get("/api/preferences").status_code == 401


def test_session_cookie_is_accepted(clerk):
    clerk.cookies.set("__session", token())
    assert clerk.get("/api/preferences").status_code == 200


def test_bearer_token_is_accepted(clerk):
    response = clerk.get("/api/preferences", headers={"Authorization": f"Bearer {token()}"})
    assert response.status_code == 200


@pytest.mark.parametrize(
    "bad",
    [
        token(expires_in=-60),
        token(azp="http://evil.example"),
        token(key=OTHER_KEY),
        "not-a-jwt",
    ],
    ids=["expired", "wrong-origin", "wrong-signature", "garbage"],
)
def test_invalid_tokens_are_rejected(clerk, bad):
    clerk.cookies.set("__session", bad)
    assert clerk.get("/api/preferences").status_code == 401


def test_first_request_creates_user_row(clerk):
    clerk.cookies.set("__session", token(sub="user_new"))
    clerk.get("/api/preferences")
    clerk.get("/api/preferences")
    conn = db.connect()
    rows = conn.execute("SELECT username FROM users").fetchall()
    conn.close()
    assert [r["username"] for r in rows] == ["user_new"]


def test_two_clerk_users_are_isolated(clerk):
    clerk.cookies.set("__session", token(sub="user_alice"))
    clerk.put("/api/resume/baseline", json={"content_md": "alice resume"})
    clerk.cookies.set("__session", token(sub="user_bob"))
    assert clerk.get("/api/resume/baseline").json()["content_md"] is None
    clerk.cookies.set("__session", token(sub="user_alice"))
    assert clerk.get("/api/resume/baseline").json()["content_md"] == "alice resume"


def test_auth_options_from_env(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_x")
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", "http://localhost:8000,http://localhost:8001")
    options = auth.auth_options()
    assert options.secret_key == "sk_test_x"
    assert options.authorized_parties == ["http://localhost:8000", "http://localhost:8001"]
    assert options.accepts_token == ["session_token"]


def test_authorized_parties_default(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_x")
    monkeypatch.delenv("CLERK_AUTHORIZED_PARTIES", raising=False)
    assert auth.auth_options().authorized_parties == ["http://localhost:8000"]
