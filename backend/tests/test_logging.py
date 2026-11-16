"""The app log: one line per API request, reasons for errors, AI calls, and no resume or job text."""

import re
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import ai, logs
from app.main import app
from app.routes import history
from app.routes.generate import GenerateResult
from tests.test_generate import completion
from tests.test_pro import PRO_PREFS, READY, fake_ai  # noqa: F401 (fixture)

RESUME = GenerateResult(reply="Done", company="Initech", experience_plan=[], resume_md="# Tailored")


@pytest.fixture(autouse=True)
def log_file(tmp_path, monkeypatch):
    """Each test logs to its own file (configured when the test client starts the app)."""
    path = tmp_path / "logs" / "jobfit.log"
    monkeypatch.setattr(logs, "LOG_FILE", path)
    return path


def lines(path) -> list[str]:
    return path.read_text().splitlines()


def ai_returning(result, usage=None) -> MagicMock:
    client = MagicMock()
    client.chat.completions.parse.return_value = completion(SimpleNamespace(parsed=result), usage)
    app.dependency_overrides[ai.get_client] = lambda: client
    return client


def test_each_api_request_is_logged_with_its_id_user_status_and_time(signed_in, log_file):
    response = signed_in.get("/api/preferences")
    request_id = response.headers["X-Request-ID"]
    [line] = [l for l in lines(log_file) if "GET /api/preferences" in l]
    assert re.match(rf"\d{{4}}-\d\d-\d\d \d\d:\d\d:\d\d,\d+ INFO app.requests \[{request_id} user_alice\] "
                    r"GET /api/preferences -> 200 in \d+ ms$", line), line


def test_startup_settings_are_logged_without_secrets(client, log_file):
    [line] = [l for l in lines(log_file) if "Starting JobFit" in l]
    assert "db=" in line and "default model=openai/gpt-oss-120b" in line
    assert "sk_test_unit" not in log_file.read_text()


def test_health_checks_are_not_logged_at_info(client, log_file):
    client.get("/api/health")
    assert not [l for l in lines(log_file) if "/api/health" in l]


def test_the_reason_for_a_refused_request_is_logged(signed_in, on_plan, log_file):
    on_plan("free")
    signed_in.get(f"/api/history/1/pdf")
    assert any("GET /api/history/1/pdf -> 403: PDF download is available on the Basic and Pro plans." in l
               for l in lines(log_file))


def test_unauthenticated_requests_are_logged(client, log_file):
    client.get("/api/preferences")
    text = log_file.read_text()
    assert "Not signed in" in text and "GET /api/preferences -> 401: Not signed in" in text


def test_validation_errors_log_where_but_never_the_values(signed_in, log_file):
    signed_in.put("/api/preferences", json={"model": "secret-model-value"})
    [line] = [l for l in lines(log_file) if "-> 422:" in l]
    assert "PUT /api/preferences -> 422: body.model:" in line
    assert "secret-model-value" not in log_file.read_text()


def test_unhandled_errors_are_logged_with_their_traceback(signed_in, log_file, monkeypatch):
    def broken(*_):
        raise RuntimeError("PDF engine exploded")

    entry = signed_in.post("/api/history", json={
        "company": "Acme", "job_description": "j", "content_md": "# Me", "style": "modern",
        "model": "openai/gpt-oss-120b", "optimization": "smart", "professional_years": 15, "earlier_years": 10,
        "max_pages": 2, "tone": "", "notes": "",
    }).json()
    monkeypatch.setattr(history, "render_pdf", broken)
    with TestClient(app, raise_server_exceptions=False) as quiet:
        assert quiet.get(f"/api/history/{entry['id']}/pdf").status_code == 500
    text = log_file.read_text()
    assert f"GET /api/history/{entry['id']}/pdf failed with an unhandled error" in text
    assert "Traceback" in text and "RuntimeError: PDF engine exploded" in text


def test_ai_calls_are_logged_with_model_time_and_tokens(signed_in, log_file):
    ai_returning(RESUME, SimpleNamespace(prompt_tokens=1200, completion_tokens=800))
    signed_in.post("/api/generate", json={"job_description": "Director at Initech", "message": "go"})
    text = log_file.read_text()
    assert re.search(r"AI openai/gpt-oss-120b \(GenerateResult\) answered in [\d.]+ s: 1200 prompt \+ 800 completion "
                     r"tokens, finish stop, 2 messages sent", text)
    assert "Generate: pro plan 0/200 used, model openai/gpt-oss-120b, optimization smart, pro mode False" in text
    assert "Generated a resume: 10 chars, company 'Initech'" in text


def test_ai_errors_are_logged(signed_in, log_file):
    client = MagicMock()
    client.chat.completions.parse.side_effect = RuntimeError("Error code: 402 - requires more credits")
    app.dependency_overrides[ai.get_client] = lambda: client
    with TestClient(app, raise_server_exceptions=False) as quiet:
        assert quiet.post("/api/generate", json={"job_description": "j", "message": "go"}).status_code == 500
    assert re.search(r"AI openai/gpt-oss-120b \(GenerateResult\) failed after [\d.]+ s: RuntimeError: Error code: 402",
                     log_file.read_text())


def test_resume_job_and_chat_text_are_never_logged(signed_in, log_file):
    signed_in.put("/api/resume/baseline", json={"content_md": "# SECRET-RESUME-TEXT"})
    ai_returning(GenerateResult(reply="SECRET-REPLY", company="Initech", experience_plan=[], resume_md="# SECRET-OUT"))
    signed_in.post("/api/generate", json={
        "job_description": "SECRET-JOB-TEXT", "message": "SECRET-MESSAGE",
        "history": [{"role": "user", "content": "SECRET-HISTORY"}],
    })
    text = log_file.read_text()
    assert "Saved baseline resume (20 chars)" in text
    for secret in ["SECRET-RESUME-TEXT", "SECRET-JOB-TEXT", "SECRET-MESSAGE", "SECRET-HISTORY", "SECRET-REPLY", "SECRET-OUT"]:
        assert secret not in text, secret


def test_pro_mode_worker_lines_keep_the_request_id(signed_in, fake_ai, log_file):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake_ai(READY)
    request_id = signed_in.post("/api/generate", json={"job_description": "j", "message": "go"}).headers["X-Request-ID"]
    candidate_lines = [l for l in lines(log_file) if "Pro candidate" in l and "wrote a resume" in l]
    assert len(candidate_lines) == len(PRO_PREFS["pro_models"])
    assert all(f"[{request_id} user_alice]" in l for l in candidate_lines)
    assert any("Judge openai/gpt-oss-120b ranked:" in l for l in lines(log_file))
