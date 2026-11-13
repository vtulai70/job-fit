import pytest

from app import db
from app.routes.preferences import GENERATION_FIELDS, Preferences, generation_settings

DEFAULTS = {"style": "professional", "tone": "", "max_pages": 2, "notes": "", "include_phone": True, "include_graduation_year": False,
            "professional_years": 15, "earlier_years": 10, "model": "openai/gpt-oss-120b",
            "optimization": "smart"}


def test_defaults_when_none_saved(signed_in):
    response = signed_in.get("/api/preferences")
    assert response.status_code == 200
    assert response.json() == DEFAULTS


def test_put_then_get(signed_in):
    prefs = {"style": "modern", "tone": "concise", "max_pages": 1, "notes": "Highlight AI work", "include_phone": False,
             "include_graduation_year": True, "professional_years": 12, "earlier_years": 0, "model": "anthropic/claude-sonnet-5.5",
             "optimization": "light"}
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
    "~google/gemini-pro-latest",
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
