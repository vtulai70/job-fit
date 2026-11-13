"""User preferences stored as a JSON object."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.ai import MODEL, Model
from app.auth import UserId
from app.db import Db, now

router = APIRouter(prefix="/api/preferences")

Style = Literal["professional", "modern", "classic"]
Optimization = Literal["light", "smart", "full"]


class GenerationSettings(BaseModel):
    """The preferences that shape a generated resume; /api/generate returns them and each download saves them."""

    model: Model
    optimization: Optimization
    professional_years: int = Field(ge=1, le=50)
    earlier_years: int = Field(ge=0, le=50)
    max_pages: int
    tone: str
    notes: str


GENERATION_FIELDS = tuple(GenerationSettings.model_fields)


class Preferences(BaseModel):
    style: Style = "professional"
    tone: str = ""
    max_pages: int = 2
    notes: str = ""
    include_phone: bool = True
    include_graduation_year: bool = False
    professional_years: int = Field(default=15, ge=1, le=50)
    earlier_years: int = Field(default=10, ge=0, le=50)
    model: Model = MODEL
    optimization: Optimization = "smart"


def generation_settings(prefs: Preferences) -> GenerationSettings:
    """The subset of the preferences that a generation used."""
    return GenerationSettings(**prefs.model_dump(include=set(GENERATION_FIELDS)))


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
