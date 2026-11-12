"""Chat-based custom resume generation."""

from datetime import date
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.ai import Client, ask_structured
from app.auth import UserId
from app.db import Db
from app.prompt import build_system_prompt
from app.routes.preferences import load_preferences

router = APIRouter(prefix="/api")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class GenerateRequest(BaseModel):
    job_description: str
    message: str
    history: list[ChatMessage] = []


class RolePlacement(BaseModel):
    role: str
    end_year: int
    section: Literal["professional", "earlier", "omitted"]


class GenerateResult(BaseModel):
    reply: str
    company: str | None
    experience_plan: list[RolePlacement]
    resume_md: str | None


def load_baseline(db: Db, user_id: int) -> str | None:
    """The user's baseline resume markdown, if uploaded."""
    row = db.execute("SELECT content_md FROM baseline_resumes WHERE user_id = ?", (user_id,)).fetchone()
    return row["content_md"] if row else None


def build_messages(system: str, history: list[ChatMessage], message: str) -> list[dict]:
    """System prompt, prior conversation, then the new user message."""
    return [
        {"role": "system", "content": system},
        *(m.model_dump() for m in history),
        {"role": "user", "content": message},
    ]


@router.post("/generate")
def generate(body: GenerateRequest, user_id: UserId, db: Db, client: Client) -> GenerateResult:
    """Ask the AI to tailor the baseline to the job, or to ask clarifying questions."""
    system = build_system_prompt(
        load_baseline(db, user_id), body.job_description, load_preferences(db, user_id), date.today().year
    )
    return ask_structured(client, build_messages(system, body.history, body.message), GenerateResult)
