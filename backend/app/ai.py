"""OpenRouter access through the OpenAI SDK."""

import logging
import os
import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from openai import OpenAI
from pydantic import BaseModel

from app.auth import CurrentUser

log = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1"
Model = Literal[
    "openai/gpt-oss-120b",
    "anthropic/claude-opus-5.5",
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-sonnet-5.5",
    "openai/gpt-6-sol",
    "openai/gpt-5.4-nano",
    "google/gemini-3.8-flash",
    "google/gemini-4-argon"
]

MODEL: Model = "openai/gpt-oss-120b"
# Models that need the premium_models plan feature (the costliest per resume; see docs/PLAN.md Step 12).
PREMIUM_MODELS: tuple[Model, ...] = (
    "anthropic/claude-opus-5.5",
    "anthropic/claude-sonnet-5.5",
    "openai/gpt-6-sol",
    "google/gemini-4-argon",
)

router = APIRouter(prefix="/api/ai")


def get_client() -> OpenAI:
    """OpenAI SDK client pointed at OpenRouter."""
    return OpenAI(base_url=OPENROUTER_URL, api_key=os.environ["OPENROUTER_API_KEY"])


Client = Annotated[OpenAI, Depends(get_client)]


def ask(client: OpenAI, question: str) -> str:
    """Send a single question and return the text answer."""
    completion = client.chat.completions.create(
        model=MODEL, messages=[{"role": "user", "content": question}]
    )
    return completion.choices[0].message.content


def ask_structured[T: BaseModel](client: OpenAI, messages: list[dict], schema: type[T], model: str = MODEL) -> T:
    """Chat completion parsed into a Pydantic model (Structured Outputs).

    require_parameters routes only to OpenRouter providers that support response_format. Each call is logged
    with its model, duration and token usage (or its error); message text is not logged.
    """
    started = time.perf_counter()
    try:
        completion = client.chat.completions.parse(
            model=model,
            messages=messages,
            response_format=schema,
            extra_body={"provider": {"require_parameters": True}},
        )
    except Exception as error:
        log.error("AI %s (%s) failed after %.1f s: %s: %s", model, schema.__name__, time.perf_counter() - started,
                  type(error).__name__, error)
        raise
    choice, usage = completion.choices[0], completion.usage
    log.info(
        "AI %s (%s) answered in %.1f s: %s prompt + %s completion tokens, finish %s, %d messages sent",
        model, schema.__name__, time.perf_counter() - started, usage.prompt_tokens if usage else "?",
        usage.completion_tokens if usage else "?", choice.finish_reason, len(messages),
    )
    if choice.message.parsed is None:
        log.warning("AI %s (%s) returned no structured result (finish %s)", model, schema.__name__, choice.finish_reason)
    return choice.message.parsed


@router.get("/check")
def check(_: CurrentUser, client: Client) -> dict[str, str]:
    """Connectivity check: ask the model what 2+2 is."""
    return {"model": MODEL, "answer": ask(client, "What is 2+2? Reply with the number only.")}
