import json

import pytest

from app import db
from app.routes.preferences import GENERATION_FIELDS, Preferences, generation_settings

DEFAULTS = {"style": "professional", "tone": "", "max_pages": 2, "notes": "", "include_phone": True, "include_graduation_year": False,
            "include_volunteering": True, "professional_years": 15, "earlier_years": 10, "model": "openai/gpt-oss-120b",
            "optimization": "smart", "pro_mode": False,
            "pro_models": ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"]}


def test_defaults_when_none_saved(signed_in):
    response = signed_in.get("/api/preferences")
    assert response.status_code == 200
    assert response.json() == DEFAULTS


def test_put_then_get(signed_in):
    prefs = {"style": "modern", "tone": "concise", "max_pages": 1, "notes": "Highlight AI work", "include_phone": False,
             "include_graduation_year": True, "include_volunteering": False, "professional_years": 12, "earlier_years": 0, "model": "anthropic/claude-sonnet-5.5",
             "optimization": "light", "pro_mode": True,
             "pro_models": ["openai/gpt-6-sol", "openai/gpt-5.4-nano", "google/gemini-4-argon"]}
    assert signed_in.put("/api/preferences", json=prefs).json() == prefs
    assert signed_in.get("/api/preferences").json() == prefs


def test_partial_put_fills_defaults(signed_in):
    signed_in.put("/api/preferences", json={"style": "classic"})
    assert signed_in.get("/api/preferences").json() == {**DEFAULTS, "style": "classic"}


def test_invalid_style_rejected(signed_in):
    assert signed_in.put("/api/preferences", json={"style": "fancy"}).status_code == 422


def test_phone_can_be_excluded_and_included_again(signed_in):
    signed_in.put("/api/preferences", json={"include_phone": False})
    assert signed_in.get("/api/preferences").json()["include_phone"] is False
    signed_in.put("/api/preferences", json={"include_phone": True, "professional_years": 15, "earlier_years": 10})
    assert signed_in.get("/api/preferences").json()["include_phone"] is True


def test_preferences_saved_before_phone_option_default_to_include(signed_in):
    signed_in.get("/api/preferences")
    conn = db.connect()
    user_id = conn.execute("SELECT id FROM users").fetchone()["id"]
    with conn:
        conn.execute(
            "INSERT INTO preferences (user_id, data, updated_at) VALUES (?, ?, ?)",
            (user_id, '{"style": "modern", "tone": "", "max_pages": 2, "notes": ""}', "2026-01-01T00:00:00Z"),
        )
    conn.close()
    assert signed_in.get("/api/preferences").json() == {**DEFAULTS, "style": "modern"}


def test_graduation_year_can_be_included_and_excluded_again(signed_in):
    signed_in.put("/api/preferences", json={"include_graduation_year": True})
    assert signed_in.get("/api/preferences").json()["include_graduation_year"] is True
    signed_in.put("/api/preferences", json={"include_graduation_year": False})
    assert signed_in.get("/api/preferences").json()["include_graduation_year"] is False


def test_include_phone_must_be_boolean(signed_in):
    assert signed_in.put("/api/preferences", json={"include_phone": "maybe"}).status_code == 422


def test_experience_years_saved(signed_in):
    signed_in.put("/api/preferences", json={"professional_years": 20, "earlier_years": 5})
    body = signed_in.get("/api/preferences").json()
    assert (body["professional_years"], body["earlier_years"]) == (20, 5)


@pytest.mark.parametrize(
    "field,value",
    [("professional_years", 0), ("professional_years", 51), ("earlier_years", -1), ("earlier_years", 51), ("earlier_years", "ten")],
)
def test_experience_years_out_of_range_rejected(signed_in, field, value):
    assert signed_in.put("/api/preferences", json={field: value}).status_code == 422


def test_earlier_years_zero_allowed(signed_in):
    assert signed_in.put("/api/preferences", json={"earlier_years": 0}).status_code == 200


MODELS = [
    "openai/gpt-oss-120b",
    "anthropic/claude-opus-5.5",
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-sonnet-5.5",
    "openai/gpt-6-sol",
    "openai/gpt-5.4-nano",
    "google/gemini-3.8-flash",
    "google/gemini-4-argon",
]


@pytest.mark.parametrize("model", MODELS)
def test_each_listed_model_can_be_saved(signed_in, model):
    assert signed_in.put("/api/preferences", json={"model": model}).status_code == 200
    assert signed_in.get("/api/preferences").json()["model"] == model


@pytest.mark.parametrize("model", ["openai/gpt-4o", "", "anthropic/claude-opus-5-5"])
def test_unlisted_model_rejected(signed_in, model):
    assert signed_in.put("/api/preferences", json={"model": model}).status_code == 422


@pytest.mark.parametrize("level", ["light", "smart", "full"])
def test_optimization_level_saved(signed_in, level):
    signed_in.put("/api/preferences", json={"optimization": level})
    assert signed_in.get("/api/preferences").json()["optimization"] == level


def test_unknown_optimization_level_rejected(signed_in):
    assert signed_in.put("/api/preferences", json={"optimization": "extreme"}).status_code == 422


def test_generation_settings_are_the_preferences_that_shape_a_resume():
    assert GENERATION_FIELDS == (
        "model", "optimization", "professional_years", "earlier_years", "max_pages", "tone", "notes",
    )
    prefs = Preferences(tone="warm", notes="n", max_pages=3, professional_years=9, earlier_years=0, style="classic")
    assert generation_settings(prefs).model_dump() == {
        "model": "openai/gpt-oss-120b", "optimization": "smart", "professional_years": 9, "earlier_years": 0,
        "max_pages": 3, "tone": "warm", "notes": "n",
    }


PRO_PICKS = ["anthropic/claude-haiku-5.5", "openai/gpt-6-sol", "openai/gpt-5.4-nano", "google/gemini-4-argon",
             "anthropic/claude-sonnet-5.5"]


@pytest.mark.parametrize("count", [2, 4])
def test_pro_models_two_to_four_saved(signed_in, count):
    response = signed_in.put("/api/preferences", json={"pro_mode": True, "pro_models": PRO_PICKS[:count]})
    assert response.status_code == 200
    assert signed_in.get("/api/preferences").json()["pro_models"] == PRO_PICKS[:count]


@pytest.mark.parametrize("count", [0, 1, 5])
def test_pro_models_outside_two_to_four_rejected(signed_in, count):
    assert signed_in.put("/api/preferences", json={"pro_models": PRO_PICKS[:count]}).status_code == 422


def test_duplicate_pro_models_rejected(signed_in):
    body = {"pro_models": ["openai/gpt-oss-120b", "openai/gpt-oss-120b"]}
    assert signed_in.put("/api/preferences", json=body).status_code == 422


def test_in_pro_mode_the_ai_model_cannot_be_a_pro_model(signed_in):
    body = {"pro_mode": True, "model": "openai/gpt-oss-120b", "pro_models": ["openai/gpt-oss-120b", "openai/gpt-6-sol"]}
    response = signed_in.put("/api/preferences", json=body)
    assert response.status_code == 422
    assert "in Pro mode the AI model judges and cannot be one of pro_models" in response.text


def test_with_pro_mode_off_the_ai_model_may_be_a_saved_pro_model(signed_in):
    body = {"pro_mode": False, "model": "openai/gpt-oss-120b", "pro_models": ["openai/gpt-oss-120b", "openai/gpt-6-sol"]}
    assert signed_in.put("/api/preferences", json=body).status_code == 200


def test_default_pro_models_leave_out_the_default_ai_model():
    prefs = Preferences(pro_mode=True)
    assert prefs.model not in prefs.pro_models


def test_preferences_saved_with_a_judge_model_load_without_it(signed_in):
    signed_in.get("/api/preferences")
    conn = db.connect()
    user_id = conn.execute("SELECT id FROM users").fetchone()["id"]
    stored = {"model": "google/gemini-4-argon", "pro_mode": True, "judge_model": "anthropic/claude-opus-5.5",
              "pro_models": ["anthropic/claude-haiku-5.5", "openai/gpt-6-sol"]}
    with conn:
        conn.execute("INSERT INTO preferences (user_id, data, updated_at) VALUES (?, ?, ?)",
                     (user_id, json.dumps(stored), "2026-11-16T00:00:00Z"))
    conn.close()
    body = signed_in.get("/api/preferences").json()
    assert "judge_model" not in body
    assert (body["model"], body["pro_models"]) == (stored["model"], stored["pro_models"])


def test_unlisted_pro_model_rejected(signed_in):
    body = {"pro_models": ["openai/gpt-oss-120b", "openai/gpt-4o"]}
    assert signed_in.put("/api/preferences", json=body).status_code == 422


REMOVED = "~google/gemini-pro-latest"


def store(data: dict) -> None:
    """Save raw preferences JSON for the signed-in user, as an earlier version might have."""
    conn = db.connect()
    user_id = conn.execute("SELECT id FROM users").fetchone()["id"]
    with conn:
        conn.execute("INSERT OR REPLACE INTO preferences (user_id, data, updated_at) VALUES (?, ?, ?)",
                     (user_id, json.dumps(data), "2026-11-16T00:00:00Z"))
    conn.close()


def test_removed_ai_model_loads_as_the_default(signed_in):
    signed_in.get("/api/preferences")
    store({"model": REMOVED, "tone": "warm"})
    body = signed_in.get("/api/preferences").json()
    assert (body["model"], body["tone"]) == ("openai/gpt-oss-120b", "warm")


def test_removed_pro_models_are_dropped_and_topped_up_to_two(signed_in):
    signed_in.get("/api/preferences")
    store({"model": "anthropic/claude-haiku-5.5", "pro_mode": True, "pro_models": [REMOVED, "openai/gpt-6-sol"]})
    body = signed_in.get("/api/preferences").json()
    assert body["pro_models"] == ["openai/gpt-oss-120b", "openai/gpt-6-sol"]


def test_a_removed_ai_model_never_falls_back_onto_a_pro_model(signed_in):
    signed_in.get("/api/preferences")
    store({"model": REMOVED, "pro_mode": True,
           "pro_models": ["openai/gpt-oss-120b", "anthropic/claude-haiku-5.5", "openai/gpt-6-sol"]})
    body = signed_in.get("/api/preferences").json()
    assert body["model"] == "openai/gpt-oss-120b"
    assert body["pro_models"] == ["anthropic/claude-haiku-5.5", "openai/gpt-6-sol"]


def test_saving_a_removed_model_is_still_rejected(signed_in):
    assert signed_in.put("/api/preferences", json={"model": REMOVED}).status_code == 422
    assert signed_in.put("/api/preferences", json={"pro_models": [REMOVED, "openai/gpt-6-sol"]}).status_code == 422


def test_volunteering_can_be_excluded_and_included_again(signed_in):
    signed_in.put("/api/preferences", json={"include_volunteering": False})
    assert signed_in.get("/api/preferences").json()["include_volunteering"] is False
    signed_in.put("/api/preferences", json={"include_volunteering": True})
    assert signed_in.get("/api/preferences").json()["include_volunteering"] is True
