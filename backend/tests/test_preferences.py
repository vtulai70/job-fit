DEFAULTS = {"style": "professional", "tone": "", "max_pages": 2, "notes": ""}


def test_defaults_when_none_saved(signed_in):
    response = signed_in.get("/api/preferences")
    assert response.status_code == 200
    assert response.json() == DEFAULTS


def test_put_then_get(signed_in):
    prefs = {"style": "modern", "tone": "concise", "max_pages": 1, "notes": "Highlight AI work"}
    assert signed_in.put("/api/preferences", json=prefs).json() == prefs
    assert signed_in.get("/api/preferences").json() == prefs


def test_partial_put_fills_defaults(signed_in):
    signed_in.put("/api/preferences", json={"style": "classic"})
    assert signed_in.get("/api/preferences").json() == {**DEFAULTS, "style": "classic"}


def test_invalid_style_rejected(signed_in):
    assert signed_in.put("/api/preferences", json={"style": "fancy"}).status_code == 422
