"""Plan access and monthly limits in /api/generate and the history routes."""

from datetime import UTC, datetime

import pytest

from app import db, plans
from app.plans import record_generations
from app.routes.generate import PRO_MODE_LOCKED
from app.routes.history import PDF_LOCKED
from tests.test_generate import QUESTION_RESULT, RESUME_RESULT, use_ai  # noqa: F401 (fixture)
from tests.test_pro import ASKING, PRO_MODELS, PRO_PREFS, READY, FakeAI, fake_ai, judge_calls  # noqa: F401 (fixture)

NOW = datetime(2026, 11, 16, 9, 30, tzinfo=UTC)
PREMIUM = "anthropic/claude-sonnet-5.5"


@pytest.fixture(autouse=True)
def fixed_now(monkeypatch):
    monkeypatch.setattr(plans, "utc_now", lambda: NOW)


def generate(client):
    return client.post("/api/generate", json={"job_description": "Director at Initech", "message": "go"})


def use(count: int, moment: datetime = NOW) -> None:
    """Record resumes already produced by the signed-in user."""
    conn = db.connect()
    user_id = conn.execute("SELECT id FROM users WHERE username = 'user_alice'").fetchone()["id"]
    with conn:
        record_generations(conn, user_id, ["openai/gpt-oss-120b"] * count, False, moment)
    conn.close()


def used(client) -> int:
    return client.get("/api/plan").json()["used"]


@pytest.mark.parametrize("plan", [("free",), ("basic", "pdf_download")])
def test_premium_ai_model_needs_the_pro_plan(signed_in, on_plan, use_ai, plan):
    on_plan(*plan)
    signed_in.put("/api/preferences", json={"model": PREMIUM})
    fake = use_ai(RESUME_RESULT)
    response = generate(signed_in)
    assert response.status_code == 403
    assert response.json()["detail"] == (
        f"{PREMIUM} is available on the Pro plan. Choose another model in Preferences, or upgrade under Plans."
    )
    fake.chat.completions.parse.assert_not_called()


def test_non_premium_models_work_on_the_free_plan(signed_in, on_plan, use_ai):
    on_plan("free")
    signed_in.put("/api/preferences", json={"model": "openai/gpt-oss-120b", "pro_models": [PREMIUM, "openai/gpt-6-sol"]})
    use_ai(RESUME_RESULT)
    assert generate(signed_in).status_code == 200


def test_pro_mode_needs_the_pro_mode_feature(signed_in, on_plan, fake_ai):
    on_plan("basic", "pdf_download")
    signed_in.put("/api/preferences", json={**PRO_PREFS, "pro_models": ["anthropic/claude-haiku-5.5", "openai/gpt-5.4-nano"]})
    fake = fake_ai(READY)
    response = generate(signed_in)
    assert (response.status_code, response.json()["detail"]) == (403, PRO_MODE_LOCKED)
    assert not fake.calls()


def test_premium_pro_models_need_premium_models(signed_in, on_plan, fake_ai):
    on_plan("custom", "pro_mode")
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake = fake_ai(READY)
    response = generate(signed_in)
    assert response.status_code == 403
    assert not fake.calls()
    assert response.json()["detail"].startswith("anthropic/claude-sonnet-5.5, openai/gpt-6-sol are available on the Pro plan.")


def test_pro_plan_allows_pro_mode_with_premium_models(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake_ai(READY)
    assert generate(signed_in).status_code == 200


def test_a_resume_counts_once_and_a_question_not_at_all(signed_in, on_plan, use_ai):
    on_plan("free")
    use_ai(QUESTION_RESULT)
    generate(signed_in)
    assert used(signed_in) == 0
    use_ai(RESUME_RESULT)
    generate(signed_in)
    assert used(signed_in) == 1


def test_the_monthly_limit_blocks_before_any_ai_call(signed_in, on_plan, use_ai):
    on_plan("free")
    signed_in.get("/api/plan")
    use(4)
    use_ai(RESUME_RESULT)
    assert generate(signed_in).status_code == 200
    assert used(signed_in) == 5
    fake = use_ai(RESUME_RESULT)
    response = generate(signed_in)
    assert response.status_code == 429
    assert response.json()["detail"] == (
        "You have used all 5 resumes of the Free plan this month. They reset on December 1; upgrade under Plans for more."
    )
    fake.chat.completions.parse.assert_not_called()


def test_last_months_resumes_do_not_count(signed_in, on_plan, use_ai):
    on_plan("free")
    signed_in.get("/api/plan")
    use(5, datetime(2026, 10, 31, 23, 59, 59, tzinfo=UTC))
    use_ai(RESUME_RESULT)
    assert generate(signed_in).status_code == 200


def test_a_pro_run_counts_each_pro_model_that_returned_a_resume(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake_ai(READY, candidates={PRO_MODELS[0]: RuntimeError("down")})
    generate(signed_in)
    assert used(signed_in) == len(PRO_MODELS) - 1
    conn = db.connect()
    rows = conn.execute("SELECT model, pro FROM generations ORDER BY model").fetchall()
    conn.close()
    assert [tuple(r) for r in rows] == [(m, 1) for m in sorted(PRO_MODELS[1:])]


def test_the_pro_mode_ready_check_and_questions_are_free(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    fake_ai(ASKING)
    generate(signed_in)
    assert used(signed_in) == 0


def test_a_pro_run_needs_an_allowance_for_every_pro_model(signed_in, fake_ai):
    signed_in.put("/api/preferences", json=PRO_PREFS)
    use(200 - len(PRO_MODELS) + 1)
    fake = fake_ai(READY)
    response = generate(signed_in)
    assert response.status_code == 429
    assert response.json()["detail"] == (
        f"Pro mode needs {len(PRO_MODELS)} resumes (one per Pro model), but you have {len(PRO_MODELS) - 1} left this "
        "month. Choose fewer Pro models, wait until December 1, or upgrade under Plans."
    )
    assert not fake.calls()


ENTRY = {
    "company": "Acme", "job_description": "Job", "content_md": "# Jane Doe", "style": "modern",
    "model": "openai/gpt-oss-120b", "optimization": "smart", "professional_years": 15, "earlier_years": 10,
    "max_pages": 2, "tone": "", "notes": "",
}


def test_free_plan_cannot_save_a_download(signed_in, on_plan):
    on_plan("free")
    response = signed_in.post("/api/history", json=ENTRY)
    assert (response.status_code, response.json()["detail"]) == (403, PDF_LOCKED)
    assert signed_in.get("/api/history").json() == []


def test_basic_plan_downloads_pdfs(signed_in, on_plan):
    on_plan("basic", "pdf_download")
    entry = signed_in.post("/api/history", json=ENTRY).json()
    assert signed_in.get(f"/api/history/{entry['id']}/pdf").status_code == 200


def test_after_a_downgrade_history_is_listed_but_pdfs_need_a_paid_plan(signed_in, on_plan):
    entry = signed_in.post("/api/history", json=ENTRY).json()
    on_plan("free")
    assert [e["id"] for e in signed_in.get("/api/history").json()] == [entry["id"]]
    response = signed_in.get(f"/api/history/{entry['id']}/pdf")
    assert (response.status_code, response.json()["detail"]) == (403, PDF_LOCKED)
    assert signed_in.delete("/api/history").status_code == 204
