"""Baseline resume: read and replace the current user's baseline."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth import UserId
from app.db import Db, now

router = APIRouter(prefix="/api/resume")


class BaselineIn(BaseModel):
    content_md: str


class Baseline(BaseModel):
    content_md: str | None
    updated_at: str | None


@router.get("/baseline")
def get_baseline(user_id: UserId, db: Db) -> Baseline:
    """Return the baseline, or nulls if none has been uploaded."""
    row = db.execute(
        "SELECT content_md, updated_at FROM baseline_resumes WHERE user_id = ?", (user_id,)
    ).fetchone()
    return Baseline(**row) if row else Baseline(content_md=None, updated_at=None)


@router.put("/baseline")
def put_baseline(body: BaselineIn, user_id: UserId, db: Db) -> Baseline:
    """Create or replace the baseline."""
    updated_at = now()
    db.execute(
        "INSERT INTO baseline_resumes (user_id, content_md, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT (user_id) DO UPDATE SET content_md = excluded.content_md, "
        "updated_at = excluded.updated_at",
        (user_id, body.content_md, updated_at),
    )
    return Baseline(content_md=body.content_md, updated_at=updated_at)
