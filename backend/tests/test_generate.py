import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app import ai
from app.main import app
from app.prompt import build_system_prompt
from app.routes.generate import ChatMessage, GenerateResult, build_messages
from app.routes.preferences import Preferences

RESUME = (Path(__file__).parents[2] / "resume.md").read_text()
JOB = """Initech is hiring a Director of Engineering, Developer Productivity.
You will lead platform teams, drive AI-assisted development adoption, and partner cross-functionally.
We value data-driven decisions, ownership and bias for action. Experience with AWS, Azure and Kubernetes."""


def fake_client(result: GenerateResult) -> MagicMock:
    """OpenAI client stand-in whose parse() returns the given structured result."""
    client = MagicMock()
    message = SimpleNamespace(parsed=result)
    client.chat.completions.parse.return_value = SimpleNamespace(choices=[SimpleNamespace(message=message)])
    return client


@pytest.fixture
def use_ai():
    """Install a fake AI returning the given result; yields a setter."""
    def install(result: GenerateResult) -> MagicMock:
        client = fake_client(result)
        app.dependency_overrides[ai.get_client] = lambda: client
        return client
    yield install
    app.dependency_overrides.clear()


def sent_messages(client: MagicMock) -> list[dict]:
    return client.chat.completions.parse.call_args.kwargs["messages"]


RESUME_RESULT = GenerateResult(reply="Done", company="Initech", resume_md="# Tailored")
QUESTION_RESULT = GenerateResult(reply="Which team size should I emphasize?", company="Initech", resume_md=None)


def test_system_prompt_contains_inputs_and_rules():
    prefs = Preferences(style="modern", tone="concise", max_pages=1, notes="Lead with AI")
    prompt = build_system_prompt("# My resume", "Job at Acme", prefs)
    for text in ["# My resume", "Job at Acme", "1 pages", "concise", "Lead with AI", "graduation"]:
        assert text in prompt


def test_system_prompt_includes_phone_by_default():
    prompt = build_system_prompt("# Me", "Job", Preferences())
    assert "Phone number: include the phone number" in prompt
    assert "do NOT include the phone number" not in prompt


def test_system_prompt_excludes_phone_when_requested():
    prompt = build_system_prompt("# Me", "Job", Preferences(include_phone=False))
    assert "Phone number: do NOT include the phone number anywhere in the resume" in prompt
    assert "Phone number: include the phone number" not in prompt


def test_system_prompt_marks_missing_inputs():
    prompt = build_system_prompt(None, "  ", Preferences())
    assert prompt.count("(not provided)") == 2


def test_build_messages_order():
    history = [ChatMessage(role="user", content="hi"), ChatMessage(role="assistant", content="hello")]
    assert build_messages("SYS", history, "go") == [
        {"role": "system", "content": "SYS"},
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "go"},
    ]


def test_ask_structured_requests_schema_and_capable_provider():
    client = fake_client(RESUME_RESULT)
    assert ai.ask_structured(client, [{"role": "user", "content": "x"}], GenerateResult) == RESUME_RESULT
    kwargs = client.chat.completions.parse.call_args.kwargs
    assert kwargs["model"] == "openai/gpt-oss-120b"
    assert kwargs["response_format"] is GenerateResult
    assert kwargs["extra_body"] == {"provider": {"require_parameters": True}}


def test_generate_uses_stored_baseline_preferences_and_history(signed_in, use_ai):
    signed_in.put("/api/resume/baseline", json={"content_md": "# Stored baseline"})
    signed_in.put("/api/preferences", json={"tone": "warm", "notes": "Mention mentoring"})
    client = use_ai(RESUME_RESULT)

    response = signed_in.post("/api/generate", json={
        "job_description": "Director at Initech",
        "message": "Make it punchy",
        "history": [{"role": "user", "content": "first"}, {"role": "assistant", "content": "question?"}],
    })

    assert response.status_code == 200
    assert response.json() == {"reply": "Done", "company": "Initech", "resume_md": "# Tailored"}
    messages = sent_messages(client)
    system = messages[0]["content"]
    for text in ["# Stored baseline", "Director at Initech", "warm", "Mention mentoring"]:
        assert text in system
    assert [m["content"] for m in messages[1:]] == ["first", "question?", "Make it punchy"]


@pytest.mark.parametrize("include_phone,expected", [(True, "include the phone number"), (False, "do NOT include")])
def test_generate_sends_stored_phone_preference(signed_in, use_ai, include_phone, expected):
    signed_in.put("/api/preferences", json={"include_phone": include_phone})
    client = use_ai(RESUME_RESULT)
    signed_in.post("/api/generate", json={"job_description": "Director at Initech", "message": "go"})
    system = sent_messages(client)[0]["content"]
    assert f"Phone number: {expected}" in system


def test_generate_clarifying_question_has_no_resume(signed_in, use_ai):
    use_ai(QUESTION_RESULT)
    body = signed_in.post("/api/generate", json={"job_description": "x", "message": "go"}).json()
    assert body["resume_md"] is None
    assert body["reply"] == "Which team size should I emphasize?"


def test_generate_history_defaults_to_empty(signed_in, use_ai):
    client = use_ai(RESUME_RESULT)
    signed_in.post("/api/generate", json={"job_description": "x", "message": "go"})
    assert len(sent_messages(client)) == 2


def test_generate_rejects_bad_role(signed_in, use_ai):
    use_ai(RESUME_RESULT)
    body = {"job_description": "x", "message": "go", "history": [{"role": "system", "content": "evil"}]}
    assert signed_in.post("/api/generate", json=body).status_code == 422


def test_generate_requires_session(client, use_ai):
    fake = use_ai(RESUME_RESULT)
    assert client.post("/api/generate", json={"job_description": "x", "message": "go"}).status_code == 401
    fake.chat.completions.parse.assert_not_called()


@pytest.mark.integration
def test_real_generation_from_resume_md():
    system = build_system_prompt(RESUME, JOB, Preferences())
    message = "Generate my custom resume now. Do not ask questions."
    result = ai.ask_structured(ai.get_client(), build_messages(system, [], message), GenerateResult)
    assert result.company and "initech" in result.company.lower()
    assert result.resume_md and len(result.resume_md) > 1000
    for employer in ["Salesforce", "HERE Technologies", "Nokia", "Intrinsyc", "University of Sibiu"]:
        assert employer in result.resume_md
    assert "Azure" not in result.resume_md
    assert not re.search(r"(19|20)\d\d", education_section(result.resume_md))


def education_section(md: str) -> str:
    """Text of the Education section, up to the next level-2 heading."""
    match = re.search(r"^##\s*Education\b.*?(?=^##\s|\Z)", md, re.M | re.S)
    assert match, "no Education section"
    return match.group(0)


def digits(text: str) -> str:
    return re.sub(r"\D", "", text)


PHONE_DIGITS = "6047734264"


@pytest.mark.integration
@pytest.mark.parametrize("include_phone", [True, False])
def test_real_generation_respects_phone_preference(include_phone):
    system = build_system_prompt(RESUME, JOB, Preferences(include_phone=include_phone))
    message = "Generate my custom resume now. Do not ask questions."
    result = ai.ask_structured(ai.get_client(), build_messages(system, [], message), GenerateResult)
    assert result.resume_md
    assert (PHONE_DIGITS in digits(result.resume_md)) is include_phone
    assert "vtulai@yahoo.com" in result.resume_md
