"""Chat-based custom resume generation."""

from datetime import date
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.ai import Client, ask_structured
from app.auth import UserId
from app.db import Db
from app.pro import ProResult, run_pro
from app.prompt import build_system_prompt, context
from app.routes.preferences import GenerationSettings, generation_settings, load_preferences

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


class GenerateResponse(GenerateResult, GenerationSettings):
    """The AI result plus the saved settings it was generated with; `pro` is set when Pro mode wrote the resume."""

    pro: ProResult | None = None


def pro_reply(pro: ProResult) -> str:
    """Chat summary of the Pro verdict."""
    if not pro.candidates or pro.candidates[0].score is None:
        return pro.rationale
    best = pro.candidates[0]
    return f"{best.model} scored best ({best.score:g}/10). {pro.rationale}"


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
def generate(body: GenerateRequest, user_id: UserId, db: Db, client: Client) -> GenerateResponse:
    """Ask the AI to tailor the baseline to the job, or to ask clarifying questions; returns the settings used.

    In Pro mode, once the AI model is ready to write the resume, the Pro models write it instead and the AI
    model judges their resumes; the best one is the response's resume. Pro models that return no valid resume
    are listed in `pro.failed`; when none does, the response has no resume.
    """
    prefs = load_preferences(db, user_id)
    baseline, year = load_baseline(db, user_id), date.today().year
    system = build_system_prompt(baseline, body.job_description, prefs, year)
    messages = build_messages(system, body.history, body.message)
    result = ask_structured(client, messages, GenerateResult, prefs.model)
    response = GenerateResponse(**result.model_dump(), **generation_settings(prefs).model_dump())
    if prefs.pro_mode and result.resume_md:
        pro = run_pro(client, messages, context(baseline, body.job_description, prefs, year), prefs, GenerateResult)
        best = pro.candidates[0] if pro.candidates else None
        response = response.model_copy(update={
            "pro": pro,
            "reply": pro_reply(pro),
            "company": best.company if best else result.company,
            "resume_md": best.resume_md if best else None,
        })
    return response
