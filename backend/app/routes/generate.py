"""Chat-based custom resume generation."""

from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import plans
from app.ai import PREMIUM_MODELS, Client, ask_structured
from app.auth import UserId
from app.db import Db
from app.pro import ProResult, run_pro
from app.prompt import build_pro_chat_prompt, build_system_prompt, context
from app.plans import CurrentPlan, Plan, record_generations, used_this_month
from app.routes.preferences import GenerationSettings, Preferences, generation_settings, load_preferences

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


class ProChatResult(BaseModel):
    """The AI model's turn in Pro mode: clarifying questions, or ready for the Pro models to write."""

    reply: str
    ready: bool


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


PRO_MODE_LOCKED = "Pro mode is available on the Pro plan. Turn it off in Preferences, or upgrade under Plans."


def plan_name(plan: Plan) -> str:
    return plan.key.capitalize()


def check_access(plan: Plan, prefs: Preferences, used: int, resets_at: datetime) -> None:
    """Raise 403 for Pro mode or premium models the plan lacks, 429 when the monthly allowance cannot cover
    the resumes this turn may produce (one, or one per Pro model)."""
    if prefs.pro_mode and not plan.has("pro_mode"):
        raise HTTPException(status_code=403, detail=PRO_MODE_LOCKED)
    models = [prefs.model, *prefs.pro_models] if prefs.pro_mode else [prefs.model]
    premium = [m for m in models if m in PREMIUM_MODELS]
    if premium and not plan.has("premium_models"):
        raise HTTPException(
            status_code=403,
            detail=f"{', '.join(premium)} {'is' if len(premium) == 1 else 'are'} available on the Pro plan. "
            "Choose another model in Preferences, or upgrade under Plans.",
        )
    needed, left, reset = (len(prefs.pro_models) if prefs.pro_mode else 1), plan.limit - used, f"{resets_at:%B} {resets_at.day}"
    if needed > left and prefs.pro_mode:
        raise HTTPException(
            status_code=429,
            detail=f"Pro mode needs {needed} resumes (one per Pro model), but you have {left} left this month. "
            f"Choose fewer Pro models, wait until {reset}, or upgrade under Plans.",
        )
    if needed > left:
        raise HTTPException(
            status_code=429,
            detail=f"You have used all {plan.limit} resumes of the {plan_name(plan)} plan this month. "
            f"They reset on {reset}; upgrade under Plans for more.",
        )


@router.post("/generate")
def generate(body: GenerateRequest, user_id: UserId, db: Db, client: Client, plan: CurrentPlan) -> GenerateResponse:
    """Ask the AI to tailor the baseline to the job, or to ask clarifying questions; returns the settings used.

    In Pro mode the AI model writes no resume: it asks questions or says it is ready, then the Pro models
    write the resume and the AI model judges their resumes (see `pro_turn`). The plan is checked before any AI
    call (`check_access`); each resume produced is recorded against the monthly allowance.
    """
    prefs = load_preferences(db, user_id)
    moment = plans.utc_now()
    check_access(plan, prefs, used_this_month(db, user_id, moment), plans.next_month_start(moment))
    baseline, year = load_baseline(db, user_id), date.today().year
    messages = build_messages(build_system_prompt(baseline, body.job_description, prefs, year), body.history, body.message)
    settings = generation_settings(prefs).model_dump()
    if prefs.pro_mode:
        chat_system = build_pro_chat_prompt(baseline, body.job_description, prefs, year)
        chat = ask_structured(client, build_messages(chat_system, body.history, body.message), ProChatResult, prefs.model)
        if not chat.ready:
            return GenerateResponse(reply=chat.reply, company=None, experience_plan=[], resume_md=None, **settings)
        response = pro_turn(client, messages, context(baseline, body.job_description, prefs, year), prefs, settings)
        record_generations(db, user_id, [c.model for c in response.pro.candidates], True, moment)
        return response
    result = ask_structured(client, messages, GenerateResult, prefs.model)
    if result.resume_md:
        record_generations(db, user_id, [prefs.model], False, moment)
    return GenerateResponse(**result.model_dump(), **settings)


def pro_turn(client, messages: list[dict], context_text: str, prefs, settings: dict) -> GenerateResponse:
    """The Pro models write the resume (with the normal writing prompt) and the AI model judges; the best one is
    the response's resume. Pro models with no valid resume are in `pro.failed`; when none has one, there is no resume.
    """
    pro = run_pro(client, messages, context_text, prefs, GenerateResult)
    best = pro.candidates[0] if pro.candidates else None
    return GenerateResponse(
        reply=pro_reply(pro),
        company=best.company if best else None,
        experience_plan=[],
        resume_md=best.resume_md if best else None,
        pro=pro,
        **settings,
    )
