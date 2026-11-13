import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app import ai
from app.ai import Model
from app.main import app
from datetime import date
from typing import get_args

from app.prompt import OPTIMIZATION, build_system_prompt, experience_rules
from app.routes.generate import ChatMessage, GenerateResult, build_messages
from app.routes.preferences import Optimization, Preferences

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


RESUME_RESULT = GenerateResult(reply="Done", company="Initech", experience_plan=[], resume_md="# Tailored")
QUESTION_RESULT = GenerateResult(
    reply="Which team size should I emphasize?", company="Initech", experience_plan=[], resume_md=None
)


def test_system_prompt_contains_inputs_and_rules():
    prefs = Preferences(style="modern", tone="concise", max_pages=1, notes="Lead with AI")
    prompt = build_system_prompt("# My resume", "Job at Acme", prefs, 2026)
    for text in ["# My resume", "Job at Acme", "1 pages", "concise", "Lead with AI", "graduation"]:
        assert text in prompt


def test_system_prompt_includes_phone_by_default():
    prompt = build_system_prompt("# Me", "Job", Preferences(), 2026)
    assert "Phone number: include the phone number" in prompt
    assert "do NOT include the phone number" not in prompt


def test_system_prompt_excludes_phone_when_requested():
    prompt = build_system_prompt("# Me", "Job", Preferences(include_phone=False), 2026)
    assert "Phone number: do NOT include the phone number anywhere in the resume" in prompt
    assert "Phone number: include the phone number" not in prompt


def test_system_prompt_excludes_graduation_year_by_default():
    prompt = build_system_prompt("# Me", "Job", Preferences(), 2026)
    assert "Graduation year: do NOT include any year in the Education section" in prompt
    assert "Graduation year: keep" not in prompt


def test_system_prompt_keeps_graduation_year_when_requested():
    prompt = build_system_prompt("# Me", "Job", Preferences(include_graduation_year=True), 2026)
    assert "Graduation year: keep the graduation or completion year" in prompt
    assert "do NOT include any year in the Education section" not in prompt


def test_system_prompt_uses_smart_integration_by_default():
    prompt = build_system_prompt("# Me", "Job", Preferences(), 2026)
    assert f"Optimization level: {OPTIMIZATION['smart']}" in prompt
    assert "Change the resume only as much as the user's optimization level below says" in prompt


@pytest.mark.parametrize("level", ["light", "smart", "full"])
def test_system_prompt_has_only_the_chosen_optimization_level(level):
    prompt = build_system_prompt("# Me", "Job", Preferences(optimization=level), 2026)
    assert f"Optimization level: {OPTIMIZATION[level]}" in prompt
    for other in set(OPTIMIZATION) - {level}:
        assert OPTIMIZATION[other] not in prompt


def test_optimization_levels_match_frontend_list_and_have_prompt_text():
    """Keep in sync with OPTIMIZATION_LEVELS in frontend/lib/api.ts."""
    assert get_args(Optimization) == ("light", "smart", "full")
    assert tuple(OPTIMIZATION) == get_args(Optimization)


def test_optimization_levels_match_their_names():
    assert OPTIMIZATION["light"].startswith("Light polish.")
    assert "original context intact" in OPTIMIZATION["light"]
    assert OPTIMIZATION["smart"].startswith("Smart integration.")
    assert "integrate" in OPTIMIZATION["smart"]
    assert OPTIMIZATION["full"].startswith("Full tailoring.")
    assert "rewrite and reprioritize" in OPTIMIZATION["full"]


def test_experience_rules_default_windows():
    rules = experience_rules(Preferences(), 2026)
    assert "Professional Experience\" section: every role that ended in 2011 or later" in rules
    assert "Earlier Experience\" section: every role that ended between 2001 and 2010" in rules
    assert "only the role, company name and years" in rules
    assert "one Markdown list item" in rules
    assert "No sub-bullets" in rules
    assert "Leave out every role that ended before 2001." in rules


def test_system_prompt_forbids_invented_experience_entries():
    prompt = build_system_prompt("# Me", "Job", Preferences(), 2026)
    assert "Do not invent experience entries" in prompt


def test_experience_rules_custom_windows():
    rules = experience_rules(Preferences(professional_years=20, earlier_years=5), 2030)
    assert "ended in 2010 or later" in rules
    assert "ended between 2005 and 2009" in rules
    assert "ended before 2005" in rules


def test_experience_rules_without_earlier_section():
    rules = experience_rules(Preferences(professional_years=5, earlier_years=0), 2026)
    assert "ended in 2021 or later" in rules
    assert "Earlier Experience\" section:" not in rules
    assert 'Leave out every role that ended before 2021; there is no "Earlier Experience" section.' in rules


def test_system_prompt_has_experience_windows_and_no_include_all_rule():
    prompt = build_system_prompt("# Me", "Job", Preferences(), 2026)
    assert "the current year is 2026; place each role by its end year" in prompt
    assert "ended in 2011 or later" in prompt
    assert "Include all experience entries" not in prompt


def test_system_prompt_marks_missing_inputs():
    prompt = build_system_prompt(None, "  ", Preferences(), 2026)
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


def test_ask_structured_uses_given_model():
    client = fake_client(RESUME_RESULT)
    ai.ask_structured(client, [{"role": "user", "content": "x"}], GenerateResult, "anthropic/claude-haiku-5.5")
    assert client.chat.completions.parse.call_args.kwargs["model"] == "anthropic/claude-haiku-5.5"


def test_generate_uses_default_model_when_none_saved(signed_in, use_ai):
    client = use_ai(RESUME_RESULT)
    signed_in.post("/api/generate", json={"job_description": "Job", "message": "go"})
    assert client.chat.completions.parse.call_args.kwargs["model"] == "openai/gpt-oss-120b"


def test_generate_uses_saved_model(signed_in, use_ai):
    signed_in.put("/api/preferences", json={"model": "~google/gemini-pro-latest"})
    client = use_ai(RESUME_RESULT)
    signed_in.post("/api/generate", json={"job_description": "Job", "message": "go"})
    assert client.chat.completions.parse.call_args.kwargs["model"] == "~google/gemini-pro-latest"


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
    assert response.json() == {
        "reply": "Done", "company": "Initech", "experience_plan": [], "resume_md": "# Tailored",
        "model": "openai/gpt-oss-120b", "optimization": "smart", "professional_years": 15, "earlier_years": 10,
        "max_pages": 2, "tone": "warm", "notes": "Mention mentoring",
    }
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


@pytest.mark.parametrize("include,expected", [(True, "keep the graduation"), (False, "do NOT include any year")])
def test_generate_sends_stored_graduation_year_preference(signed_in, use_ai, include, expected):
    signed_in.put("/api/preferences", json={"include_graduation_year": include})
    client = use_ai(RESUME_RESULT)
    signed_in.post("/api/generate", json={"job_description": "Director at Initech", "message": "go"})
    assert f"Graduation year: {expected}" in sent_messages(client)[0]["content"]


def test_generate_names_and_uses_the_saved_model(signed_in, use_ai):
    signed_in.put("/api/preferences", json={"model": "anthropic/claude-haiku-5.5"})
    client = use_ai(RESUME_RESULT)
    response = signed_in.post("/api/generate", json={"job_description": "x", "message": "go"})
    assert response.json()["model"] == "anthropic/claude-haiku-5.5"
    assert client.chat.completions.parse.call_args.kwargs["model"] == "anthropic/claude-haiku-5.5"


@pytest.mark.parametrize("level", ["light", "full"])
def test_generate_sends_and_names_the_stored_optimization_level(signed_in, use_ai, level):
    signed_in.put("/api/preferences", json={"optimization": level})
    client = use_ai(RESUME_RESULT)
    response = signed_in.post("/api/generate", json={"job_description": "x", "message": "go"})
    assert response.json()["optimization"] == level
    assert f"Optimization level: {OPTIMIZATION[level]}" in sent_messages(client)[0]["content"]


def test_generate_returns_every_stored_generation_setting(signed_in, use_ai):
    stored = {
        "model": "openai/gpt-6-sol", "optimization": "light", "professional_years": 9, "earlier_years": 0,
        "max_pages": 1, "tone": "bold", "notes": "Lead with AI",
    }
    signed_in.put("/api/preferences", json={**stored, "style": "classic", "include_phone": False})
    use_ai(RESUME_RESULT)
    body = signed_in.post("/api/generate", json={"job_description": "x", "message": "go"}).json()
    assert {k: body[k] for k in stored} == stored
    assert "style" not in body and "include_phone" not in body


def test_generate_sends_experience_windows_for_this_year(signed_in, use_ai):
    signed_in.put("/api/preferences", json={"professional_years": 8, "earlier_years": 4})
    client = use_ai(RESUME_RESULT)
    signed_in.post("/api/generate", json={"job_description": "x", "message": "go"})
    system = sent_messages(client)[0]["content"]
    year = date.today().year
    assert f"ended in {year - 8} or later" in system
    assert f"ended between {year - 12} and {year - 9}" in system


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
    system = build_system_prompt(RESUME, JOB, Preferences(), 2026)
    message = "Generate my custom resume now. Do not ask questions."
    result = ai.ask_structured(ai.get_client(), build_messages(system, [], message), GenerateResult)
    assert result.company and "initech" in result.company.lower()
    assert result.resume_md and len(result.resume_md) > 1000
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
    system = build_system_prompt(RESUME, JOB, Preferences(include_phone=include_phone), 2026)
    message = "Generate my custom resume now. Do not ask questions."
    result = ai.ask_structured(ai.get_client(), build_messages(system, [], message), GenerateResult)
    assert result.resume_md
    assert (PHONE_DIGITS in digits(result.resume_md)) is include_phone
    assert "vtulai@yahoo.com" in result.resume_md


@pytest.mark.integration
def test_real_generation_keeps_graduation_year_when_requested():
    system = build_system_prompt(RESUME, JOB, Preferences(include_graduation_year=True), 2026)
    message = "Generate my custom resume now. Do not ask questions."
    result = ai.ask_structured(ai.get_client(), build_messages(system, [], message), GenerateResult)
    assert result.resume_md
    assert "1995" in education_section(result.resume_md)


def core_bullets() -> list[str]:
    """Bullets of the two 2019-2026 baseline roles, which always land in Professional Experience."""
    history = RESUME.split("## Professional History")[1].split("## Education")[0]
    return re.findall(r"^- (.+)$", "".join(history.split("\n### ")[1:3]), re.M)


def same_text(text: str) -> str:
    """Text compared regardless of hyphen/dash variants (models swap in non-breaking hyphens) and spacing."""
    return " ".join(re.sub(r"[\u2010-\u2015\u2212-]", "-", text).split())


@pytest.mark.integration
@pytest.mark.parametrize("level", ["light", "smart", "full"])
def test_real_generation_follows_optimization_level(level):
    system = build_system_prompt(RESUME, JOB, Preferences(optimization=level), 2026)
    message = "Generate my custom resume now. Do not ask questions."
    result = ai.ask_structured(ai.get_client(), build_messages(system, [], message), GenerateResult)
    assert result.resume_md
    assert result.company and "initech" in result.company.lower()
    assert "Azure" not in result.resume_md
    assert "vtulai@yahoo.com" in result.resume_md
    assert not re.search(r"(19|20)\d\d", education_section(result.resume_md))
    kept = sum(same_text(b) in same_text(result.resume_md) for b in core_bullets())
    if level == "light":
        assert kept == len(core_bullets())
    else:
        assert kept < len(core_bullets())


def section(md: str, title: str) -> str:
    """Text of a level-2 section, or '' if absent."""
    match = re.search(rf"^##\s*{title}\b.*?(?=^##\s|\Z)", md, re.M | re.S)
    return match.group(0) if match else ""


OMITTED = ["Pinpoint", "Glenayre", "MILLENIUM", "PROFIN", "Sibiu", "Associate Assistant Lecturer"]


@pytest.mark.integration
def test_real_generation_default_experience_windows():
    system = build_system_prompt(RESUME, JOB, Preferences(), 2026)
    result = ai.ask_structured(ai.get_client(), build_messages(system, [], "Generate my custom resume now. Do not ask questions."), GenerateResult)
    for placement in result.experience_plan:
        expected = "professional" if placement.end_year >= 2011 else "earlier" if placement.end_year >= 2001 else "omitted"
        assert placement.section == expected, placement
    md = result.resume_md
    professional = section(md, "Professional Experience")
    earlier = section(md, "Earlier Experience")
    for text in ["Salesforce", "HERE Technologies", "Lead Software Architect"]:
        assert text in professional, text
    for text in ["Intrinsyc", "Lead Software Designer"]:
        assert text in earlier, text
    assert "ct technologies" in earlier.lower()
    assert "Intrinsyc" not in professional
    entries = [line for line in earlier.splitlines()[1:] if line.strip() and line.strip() != "---"]
    assert len(entries) == 3, entries
    assert all(re.match(r"\s*[-*] \S", line) for line in entries), entries
    for name in OMITTED:
        assert name.lower() not in md.lower(), name


@pytest.mark.integration
def test_real_generation_custom_experience_windows():
    prefs = Preferences(professional_years=5, earlier_years=0)
    system = build_system_prompt(RESUME, JOB, prefs, 2026)
    result = ai.ask_structured(ai.get_client(), build_messages(system, [], "Generate my custom resume now. Do not ask questions."), GenerateResult)
    md = result.resume_md
    assert "Director, Software Engineering" in section(md, "Professional Experience")
    assert section(md, "Earlier Experience") == ""
    for name in ["HERE Technologies", "Nokia", "Intrinsyc", "Senior Product Manager"]:
        assert name not in md, name


@pytest.mark.integration
@pytest.mark.parametrize("model", get_args(Model))
def test_real_generation_with_each_model(model):
    """Every selectable model returns our structured result and follows the preferences."""
    prefs = Preferences(professional_years=5, earlier_years=0, include_phone=False, model=model)
    system = build_system_prompt(RESUME, JOB, prefs, 2026)
    message = "Generate my custom resume now. Do not ask questions."
    result = ai.ask_structured(ai.get_client(), build_messages(system, [], message), GenerateResult, prefs.model)
    md = result.resume_md
    assert md and "Director, Software Engineering" in section(md, "Professional Experience")
    assert section(md, "Earlier Experience") == ""
    assert "Nokia" not in md
    assert PHONE_DIGITS not in digits(md)
