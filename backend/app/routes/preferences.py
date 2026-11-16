"""User preferences stored as a JSON object."""

import json
from typing import Literal, get_args

from fastapi import APIRouter
from pydantic import BaseModel, Field, model_validator

from app.ai import MODEL, Model
from app.auth import UserId
from app.db import Db, now

router = APIRouter(prefix="/api/preferences")

Style = Literal["professional", "modern", "classic"]
Optimization = Literal["light", "smart", "full"]

PRO_MIN_MODELS = 2
PRO_MAX_MODELS = 4
DEFAULT_PRO_MODELS: tuple[Model, ...] = ("anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5")


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
    include_volunteering: bool = True
    professional_years: int = Field(default=15, ge=1, le=50)
    earlier_years: int = Field(default=10, ge=0, le=50)
    model: Model = MODEL
    optimization: Optimization = "smart"
    pro_mode: bool = False
    pro_models: list[Model] = Field(default=list(DEFAULT_PRO_MODELS), min_length=PRO_MIN_MODELS, max_length=PRO_MAX_MODELS)

    @model_validator(mode="after")
    def check_pro_models(self) -> "Preferences":
        """Pro candidates are distinct; in Pro mode the AI model, which judges them, is not one of them."""
        if len(set(self.pro_models)) != len(self.pro_models):
            raise ValueError("pro_models must be distinct")
        if self.pro_mode and self.model in self.pro_models:
            raise ValueError("in Pro mode the AI model judges and cannot be one of pro_models")
        return self


def generation_settings(prefs: Preferences) -> GenerationSettings:
    """The subset of the preferences that a generation used."""
    return GenerationSettings(**prefs.model_dump(include=set(GENERATION_FIELDS)))


def without_removed_models(data: dict) -> dict:
    """Stored preferences with models no longer selectable replaced: the AI model by the default, and Pro
    models dropped (with the AI model in Pro mode), topped up to the minimum in list order."""
    models = get_args(Model)
    model = data.get("model", MODEL) if data.get("model", MODEL) in models else MODEL
    if "pro_models" not in data:
        return {**data, "model": model}
    excluded = {model} if data.get("pro_mode") else set()
    kept = [m for m in data["pro_models"] if m in models and m not in excluded]
    extra = [m for m in models if m not in kept and m != model][: max(0, PRO_MIN_MODELS - len(kept))]
    return {**data, "model": model, "pro_models": [m for m in models if m in kept or m in extra]}


def load_preferences(db: Db, user_id: int) -> Preferences:
    """Stored preferences, or defaults when none are saved; models removed from the list since are replaced."""
    row = db.execute("SELECT data FROM preferences WHERE user_id = ?", (user_id,)).fetchone()
    return Preferences.model_validate(without_removed_models(json.loads(row["data"]))) if row else Preferences()


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
