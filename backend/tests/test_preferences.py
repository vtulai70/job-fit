from app import db

DEFAULTS = {"style": "professional", "tone": "", "max_pages": 2, "notes": "", "include_phone": True}


def test_defaults_when_none_saved(signed_in):
    response = signed_in.get("/api/preferences")
    assert response.status_code == 200
    assert response.json() == DEFAULTS


def test_put_then_get(signed_in):
    prefs = {"style": "modern", "tone": "concise", "max_pages": 1, "notes": "Highlight AI work", "include_phone": False}
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
    signed_in.put("/api/preferences", json={"include_phone": True})
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


def test_include_phone_must_be_boolean(signed_in):
    assert signed_in.put("/api/preferences", json={"include_phone": "maybe"}).status_code == 422
