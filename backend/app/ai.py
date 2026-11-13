"""OpenRouter access through the OpenAI SDK."""

import os
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from openai import OpenAI
from pydantic import BaseModel

from app.auth import CurrentUser

OPENROUTER_URL = "https://openrouter.ai/api/v1"
Model = Literal[
    "openai/gpt-oss-120b",
    "anthropic/claude-opus-5.5",
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-sonnet-5.5",
    "openai/gpt-6-sol",
    "openai/gpt-5.4-nano",
    "~google/gemini-pro-latest",
]
MODEL: Model = "openai/gpt-oss-120b"

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

    require_parameters routes only to OpenRouter providers that support response_format.
    """
    completion = client.chat.completions.parse(
        model=model,
        messages=messages,
        response_format=schema,
        extra_body={"provider": {"require_parameters": True}},
    )
    return completion.choices[0].message.parsed


@router.get("/check")
def check(_: CurrentUser, client: Client) -> dict[str, str]:
    """Connectivity check: ask the model what 2+2 is."""
    return {"model": MODEL, "answer": ask(client, "What is 2+2? Reply with the number only.")}
