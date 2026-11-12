"""User preferences stored as a JSON object."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth import UserId
from app.db import Db, now

router = APIRouter(prefix="/api/preferences")

Style = Literal["professional", "modern", "classic"]


class Preferences(BaseModel):
    style: Style = "professional"
    tone: str = ""
    max_pages: int = 2
    notes: str = ""
    include_phone: bool = True


def load_preferences(db: Db, user_id: int) -> Preferences:
    """Stored preferences, or defaults when none are saved."""
    row = db.execute("SELECT data FROM preferences WHERE user_id = ?", (user_id,)).fetchone()
    return Preferences.model_validate_json(row["data"]) if row else Preferences()


@router.get("")
def get_preferences(user_id: UserId, db: Db) -> Preferences:
    """Return the user's preferences."""
    return load_preferences(db, user_id)


@router.put("")
def put_preferences(body: Preferences, user_id: UserId, db: Db) -> Preferences:
    """Replace the user's preferences."""
    db.execute(
        "INSERT INTO preferences (user_id, data, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        (user_id, body.model_dump_json(), now()),
    )
    return body
