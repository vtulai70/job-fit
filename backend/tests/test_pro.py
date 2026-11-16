import re
import threading
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest
from openai import APITimeoutError

from app import ai
from app.main import app
from app.pro import NO_CANDIDATES, CANDIDATE_TIMEOUT, WRITE_NOW, Candidate, Review, Verdict, judge, run_pro, verdict_schema
from app.prompt import build_system_prompt, context
from app.routes.generate import GenerateResult, build_messages
from app.routes.preferences import Preferences
from tests.test_generate import JOB, RESUME as BASELINE

CHAT_MODEL = "openai/gpt-oss-120b"
PRO_MODELS = ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5", "openai/gpt-6-sol"]
PRO_PREFS = {"pro_mode": True, "model": CHAT_MODEL, "pro_models": PRO_MODELS}


def resume_of(model: str) -> str:
    return f"# Voicu Tulai\n\nWritten by writer-{PRO_MODELS.index(model)}"


def candidate_result(model: str) -> GenerateResult:
    return GenerateResult(reply="Done", company=f"Initech ({model})", experience_plan=[], resume_md=resume_of(model))


def labels_by_model(judge_messages: list[dict]) -> dict[str, str]:
    """Which label the judge saw each Pro model's resume under."""
    found = re.findall(r"# Candidate ([A-D])\n\n# Voicu Tulai\n\nWritten by writer-(\d)", judge_messages[1]["content"])
    return {PRO_MODELS[int(index)]: label for label, index in found}


def best_last_verdict(messages: list[dict]) -> Verdict:
    """Ranks the Pro models in reverse order of PRO_MODELS, whatever labels they were shuffled under."""
    labels = labels_by_model(messages)
    ranking = [
        Review(label=labels[m], score=9.0 - i, strengths=f"good {m}", weaknesses="", rule_violations=[])
        for i, m in enumerate(reversed(PRO_MODELS)) if m in labels
    ]
    return Verdict(ranking=ranking, rationale="It fits best.")


class FakeAI:
    """OpenRouter stand-in: the chat model, each Pro model and the judge answer separately."""

    def __init__(self, chat_result: GenerateResult, candidates: dict | None = None, barrier=None):
        self.chat_result = chat_result
        self.candidates = candidates or {}
        self.barrier = barrier
        self.client = MagicMock()
        self.client.with_options.return_value = self.client
        self.client.chat.completions.parse.side_effect = self.parse

    def parse(self, model, messages, response_format, extra_body):
        if issubclass(response_format, Verdict):
            parsed = best_last_verdict(messages)
        elif model == CHAT_MODEL:
            parsed = self.chat_result
        else:
            if self.barrier:
                self.barrier.wait()
            parsed = self.candidates.get(model, candidate_result(model))
            if isinstance(parsed, Exception):
                raise parsed
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed))])

    def calls(self, **match) -> list[dict]:
        return [
            c.kwargs for c in self.client.chat.completions.parse.call_args_list
            if all(c.kwargs[k] == v for k, v in match.items())
        ]

    def candidate_calls(self) -> list[dict]:
        return [c for c in self.calls(response_format=GenerateResult) if c["model"] != CHAT_MODEL]


def judge_calls(fake: FakeAI) -> list[dict]:
    return [c for c in fake.calls() if issubclass(c["response_format"], Verdict)]


CHAT_RESUME = GenerateResult(reply="Done", company="Initech", experience_plan=[], resume_md="# Chat model resume")
QUESTION = GenerateResult(reply="Which team?", company="Initech", experience_plan=[], resume_md=None)


@pytest.fixture
def fake_ai():
    def install(*args, **kwargs) -> FakeAI:
        fake = FakeAI(*args, **kwargs)
        app.dependency_overrides[ai.get_client] = lambda: fake.client
        return fake
    yield install
    app.dependency_overrides.clear()


def generate(signed_in, message="go") -> dict:
    response = signed_in.post("/api/generate", json={"job_description": "Director at Initech", "message": message})
    assert response.status_code == 200, response.text
    return response.json()


def test_pro_off_makes_one_call(signed_in, fake_ai):
    signed_in.put("/api/preferences", json={**PRO_PREFS, "pro_mode": False})
    fake = fake_ai(CHAT_RESUME)
    body = generate(signed_in)
    assert body["pro"] is None
    assert body["resume_md"] == "# Chat model resume"
    assert len(fake.calls()) == 1


def test_pro_waits_while_the_chat_model_asks_questions(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake = fake_ai(QUESTION)
    body = generate(signed_in)
    assert body["pro"] is None
    assert body["reply"] == "Which team?"
    assert len(fake.calls()) == 1


def test_pro_models_write_the_resume_now_with_a_timeout(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake = fake_ai(CHAT_RESUME)
    generate(signed_in, "Make it punchy")
    calls = fake.candidate_calls()
    assert sorted(c["model"] for c in calls) == sorted(PRO_MODELS)
    for call in calls:
        assert call["messages"][0] == fake.calls(model=CHAT_MODEL)[0]["messages"][0]
        assert call["messages"][-1] == {"role": "user", "content": f"Make it punchy\n\n{WRITE_NOW}"}
    fake.client.with_options.assert_called_with(timeout=CANDIDATE_TIMEOUT)


def test_pro_models_run_in_parallel(signed_in, fake_ai):
    """Each candidate call waits until all of them have started; sequential calls would break the barrier."""
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake_ai(CHAT_RESUME, barrier=threading.Barrier(len(PRO_MODELS), timeout=5))
    assert len(generate(signed_in)["pro"]["candidates"]) == len(PRO_MODELS)


def test_judge_ranks_anonymous_candidates_with_rules_and_context(signed_in, fake_ai):
    signed_in.put("/api/resume/baseline", json={"content_md": "# Stored baseline"})
    signed_in.put("/api/preferences", json={**PRO_PREFS, "tone": "warm"})
    fake = fake_ai(CHAT_RESUME)
    generate(signed_in)
    [judge_call] = judge_calls(fake)
    assert judge_call["model"] == CHAT_MODEL
    system, candidates = (m["content"] for m in judge_call["messages"])
    for text in ["# Stored baseline", "Director at Initech", "Tone: warm", "Do not invent experience entries"]:
        assert text in system
    assert sorted(labels_by_model(judge_call["messages"]).values()) == ["A", "B", "C"]
    for model in [*PRO_MODELS, CHAT_MODEL, "haiku", "sonnet", "gpt"]:
        assert model not in candidates


def test_pro_response_has_ranked_candidates_and_the_best_resume(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake_ai(CHAT_RESUME)
    body = generate(signed_in)
    pro = body["pro"]
    best = PRO_MODELS[-1]
    assert [c["model"] for c in pro["candidates"]] == list(reversed(PRO_MODELS))
    assert pro["candidates"][0] == {
        "model": best, "company": f"Initech ({best})", "resume_md": resume_of(best),
        "score": 9.0, "strengths": f"good {best}", "weaknesses": "", "rule_violations": [],
    }
    assert pro["judge_model"] == CHAT_MODEL
    assert pro["rationale"] == "It fits best."
    assert body["resume_md"] == resume_of(best)
    assert body["company"] == f"Initech ({best})"
    assert body["reply"] == f"{best} scored best (9/10). It fits best."
    assert body["model"] == CHAT_MODEL


def test_failed_and_empty_candidates_are_dropped_and_reported(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake = fake_ai(CHAT_RESUME, candidates={PRO_MODELS[0]: RuntimeError("boom"), PRO_MODELS[1]: QUESTION})
    body = generate(signed_in)
    assert [c["model"] for c in body["pro"]["candidates"]] == [PRO_MODELS[2]]
    assert body["pro"]["failed"] == [
        {"model": PRO_MODELS[0], "reason": "failed with an error"},
        {"model": PRO_MODELS[1], "reason": "returned no resume"},
    ]
    assert not judge_calls(fake)


def test_a_timed_out_candidate_is_reported(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    timeout = APITimeoutError(request=httpx.Request("POST", "https://openrouter.ai"))
    fake_ai(CHAT_RESUME, candidates={PRO_MODELS[1]: timeout})
    pro = generate(signed_in)["pro"]
    assert pro["failed"] == [{"model": PRO_MODELS[1], "reason": f"timed out after {CANDIDATE_TIMEOUT} s"}]
    assert len(pro["candidates"]) == 2 and pro["judge_model"] == CHAT_MODEL


def test_no_failures_reported_when_every_candidate_returns_a_resume(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake_ai(CHAT_RESUME)
    assert generate(signed_in)["pro"]["failed"] == []


def test_a_single_candidate_is_returned_unjudged(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake_ai(CHAT_RESUME, candidates={PRO_MODELS[0]: QUESTION, PRO_MODELS[1]: QUESTION})
    pro = generate(signed_in)["pro"]
    [only] = pro["candidates"]
    assert only["model"] == PRO_MODELS[2] and only["score"] is None
    assert pro["judge_model"] is None
    assert pro["rationale"] == f"Only {PRO_MODELS[2]} returned a resume, so nothing was compared."


def test_no_candidates_answers_without_a_resume_and_reports_every_failure(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake = fake_ai(CHAT_RESUME, candidates={m: RuntimeError("down") for m in PRO_MODELS})
    body = generate(signed_in)
    assert body["resume_md"] is None
    assert body["reply"] == NO_CANDIDATES
    assert body["pro"]["candidates"] == []
    assert [f["model"] for f in body["pro"]["failed"]] == PRO_MODELS
    assert not judge_calls(fake)


GENERATE_NOW = "Generate my custom resume now. Do not ask questions."
FAKE_ROLE = (
    "### Chief Technology Officer, Google\n2020 - 2026\n\n"
    "- Led 4,000 engineers and cut cloud costs by 70% with Azure and Rust\n\n"
)


def real_inputs(prefs):
    year = date.today().year
    messages = build_messages(build_system_prompt(BASELINE, JOB, prefs, year), [], GENERATE_NOW)
    return messages, context(BASELINE, JOB, prefs, year)


@pytest.mark.integration
def test_real_pro_run_ranks_every_candidate():
    prefs = Preferences(pro_mode=True)
    messages, context_text = real_inputs(prefs)
    pro = run_pro(ai.get_client(), messages, context_text, prefs, GenerateResult)
    assert pro.judge_model == prefs.model
    assert sorted(c.model for c in pro.candidates) == sorted(prefs.pro_models)
    assert all(0 <= c.score <= 10 and c.resume_md for c in pro.candidates)
    assert pro.rationale


@pytest.mark.integration
def test_real_judge_flags_a_planted_invented_role():
    prefs = Preferences()
    messages, context_text = real_inputs(prefs)
    result = ai.ask_structured(ai.get_client(), messages, GenerateResult)
    clean = Candidate(model="openai/gpt-oss-120b", company=result.company, resume_md=result.resume_md)
    planted_md = re.sub(r"(^##\s*Professional Experience.*\n+)", rf"\1{FAKE_ROLE}", result.resume_md, count=1, flags=re.M)
    assert FAKE_ROLE in planted_md
    planted = Candidate(model="openai/gpt-6-sol", company=result.company, resume_md=planted_md)
    pro = judge(ai.get_client(), context_text, [clean, planted], prefs.model)
    assert [c.model for c in pro.candidates] == ["openai/gpt-oss-120b", "openai/gpt-6-sol"]
    violations = " ".join(pro.candidates[1].rule_violations)
    assert "Google" in violations or "Azure" in violations, violations


@pytest.mark.parametrize("count", [2, 3, 4])
def test_judge_schema_only_allows_the_labels_in_use(count):
    labels = ("A", "B", "C", "D")[:count]
    schema = verdict_schema(labels).model_json_schema()
    review = next(d for name, d in schema["$defs"].items() if "label" in d["properties"])
    assert review["properties"]["label"]["enum"] == list(labels)
    with pytest.raises(ValueError):
        verdict_schema(("A", "B")).model_validate(
            {"ranking": [{"label": "C", "score": 1, "strengths": "", "weaknesses": "", "rule_violations": []}], "rationale": ""}
        )


def test_judge_is_asked_with_a_schema_for_the_candidates_it_sees(signed_in, fake_ai):
    signed_in.put("/api/preferences", json={**PRO_PREFS, "pro_models": PRO_MODELS[:2]})
    fake = fake_ai(CHAT_RESUME)
    generate(signed_in)
    [call] = judge_calls(fake)
    schema = call["response_format"].model_json_schema()
    review = next(d for d in schema["$defs"].values() if "label" in d["properties"])
    assert review["properties"]["label"]["enum"] == ["A", "B"]
