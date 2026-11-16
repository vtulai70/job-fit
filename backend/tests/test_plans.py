from datetime import UTC, datetime

import pytest

from app import db, plans
from app.plans import MONTHLY_GENERATIONS, Plan, next_month_start, plan_from_claims, record_generations, used_this_month


def test_plan_and_features_from_session_token_claims():
    plan = plan_from_claims({"pla": "u:pro", "fea": "u:pro_mode,u:premium_models,u:pdf_download"})
    assert plan == Plan(key="pro", features=["pdf_download", "premium_models", "pro_mode"])
    assert plan.has("pro_mode") and not plan.has("other")


@pytest.mark.parametrize("claims", [{"pla": "u:free"}, {"pla": "u:free", "fea": None}, {"pla": "u:free", "fea": ""}, {}])
def test_free_plan_without_features(claims):
    """A real free-plan token has pla 'u:free' and no fea claim; a token without pla is treated as free."""
    assert plan_from_claims(claims) == Plan(key="free", features=[])


def test_monthly_limits_by_plan():
    assert MONTHLY_GENERATIONS == {"free": 5, "basic": 50, "pro": 200}
    assert Plan(key="basic", features=[]).limit == 50
    assert Plan(key="enterprise", features=[]).limit == 5


def test_get_plan(on_plan, signed_in, monkeypatch):
    monkeypatch.setattr(plans, "utc_now", lambda: datetime(2026, 11, 16, 9, 30, tzinfo=UTC))
    on_plan("basic", "pdf_download")
    assert signed_in.get("/api/plan").json() == {
        "plan": "basic", "features": ["pdf_download"], "limit": 50, "used": 0, "resets_at": "2026-12-01T00:00:00Z",
    }


def at(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


@pytest.mark.parametrize("moment,expected", [
    (at(2026, 11, 16, 9, 30), at(2026, 12, 1)),
    (at(2026, 12, 31, 23, 59), at(2027, 1, 1)),
    (at(2027, 1, 1), at(2027, 2, 1)),
])
def test_next_month_start(moment, expected):
    assert next_month_start(moment) == expected


def user_ids(*names: str) -> list[int]:
    conn = db.connect()
    with conn:
        for name in names:
            db.add_user(conn, name)
    ids = [conn.execute("SELECT id FROM users WHERE username = ?", (n,)).fetchone()["id"] for n in names]
    conn.close()
    return ids


def test_usage_counts_this_calendar_month_per_user(client):
    alice, bob = user_ids("user_a", "user_b")
    conn = db.connect()
    with conn:
        record_generations(conn, alice, ["openai/gpt-oss-120b"], False, at(2026, 10, 31, 23, 59, 59))
        record_generations(conn, alice, ["openai/gpt-oss-120b"], False, at(2026, 11, 1))
        record_generations(conn, alice, ["anthropic/claude-haiku-5.5", "openai/gpt-6-sol"], True, at(2026, 11, 30, 23, 59, 59))
        record_generations(conn, bob, ["openai/gpt-oss-120b"], False, at(2026, 11, 2))
    assert used_this_month(conn, alice, at(2026, 11, 16)) == 3
    assert used_this_month(conn, alice, at(2026, 12, 1)) == 0
    assert used_this_month(conn, bob, at(2026, 11, 16)) == 1
    rows = conn.execute("SELECT model, pro FROM generations WHERE user_id = ? ORDER BY id", (alice,)).fetchall()
    assert [tuple(r) for r in rows][-2:] == [("anthropic/claude-haiku-5.5", 1), ("openai/gpt-6-sol", 1)]
    conn.close()


def test_get_plan_requires_session(client):
    assert client.get("/api/plan").status_code == 401
