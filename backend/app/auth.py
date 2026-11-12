"""Clerk authentication: verify the session token and map the Clerk user to a local user row."""

import os
from typing import Annotated

from clerk_backend_api.security import authenticate_request
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, HTTPException, Request

from app.db import Db, add_user


def auth_options() -> AuthenticateRequestOptions:
    """Verify session tokens with the secret key, from the app's own origin(s) only."""
    return AuthenticateRequestOptions(
        secret_key=os.environ["CLERK_SECRET_KEY"],
        authorized_parties=os.environ.get("CLERK_AUTHORIZED_PARTIES", "http://localhost:8000").split(","),
        accepts_token=["session_token"],
    )


def current_user(request: Request) -> str:
    """Return the Clerk user id from the __session cookie or Bearer token, or raise 401."""
    state = authenticate_request(request, auth_options())
    if not state.is_signed_in:
        raise HTTPException(status_code=401, detail="Not signed in")
    return state.payload["sub"]


CurrentUser = Annotated[str, Depends(current_user)]


def current_user_id(clerk_id: CurrentUser, db: Db) -> int:
    """Return the local user id, creating the row on the user's first request."""
    add_user(db, clerk_id)
    return db.execute("SELECT id FROM users WHERE username = ?", (clerk_id,)).fetchone()["id"]


UserId = Annotated[int, Depends(current_user_id)]
