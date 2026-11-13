import pytest

from app import db
from app.routes.preferences import GENERATION_FIELDS

ENTRY = {
    "company": "Acme Corp",
    "job_description": "Director of Engineering",
    "content_md": "# Jane Doe\n\n## Experience\n\n- Led teams",
    "style": "professional",
    "model": "anthropic/claude-sonnet-5.5",
    "optimization": "full",
    "professional_years": 12,
    "earlier_years": 6,
    "max_pages": 3,
    "tone": "warm",
    "notes": "Stress mentoring",
}


def test_empty_history(signed_in):
    assert signed_in.get("/api/history").json() == []


def test_add_entry(signed_in):
    response = signed_in.post("/api/history", json=ENTRY)
    assert response.status_code == 201
    body = response.json()
    assert body["company"] == "Acme Corp"
    assert body["style"] == "professional"
    assert body["downloaded_at"].endswith("Z")
    assert body["model"] == "anthropic/claude-sonnet-5.5"
    assert body["optimization"] == "full"
    assert isinstance(body["id"], int)


def test_history_saves_and_lists_every_generation_setting(signed_in):
    signed_in.post("/api/history", json=ENTRY)
    entry = signed_in.get("/api/history").json()[0]
    assert {field: entry[field] for field in GENERATION_FIELDS} == {field: ENTRY[field] for field in GENERATION_FIELDS}
    assert (entry["professional_years"], entry["earlier_years"], entry["max_pages"]) == (12, 6, 3)
    assert (entry["tone"], entry["notes"]) == ("warm", "Stress mentoring")


@pytest.mark.parametrize("field", GENERATION_FIELDS)
def test_history_requires_every_generation_setting(signed_in, field):
    without = {k: v for k, v in ENTRY.items() if k != field}
    assert signed_in.post("/api/history", json=without).status_code == 422


@pytest.mark.parametrize("change", [{"professional_years": 0}, {"professional_years": 51}, {"earlier_years": -1}])
def test_history_rejects_out_of_range_experience_years(signed_in, change):
    assert signed_in.post("/api/history", json={**ENTRY, **change}).status_code == 422


def test_history_keeps_empty_tone_and_notes(signed_in):
    signed_in.post("/api/history", json={**ENTRY, "tone": "", "notes": ""})
    entry = signed_in.get("/api/history").json()[0]
    assert (entry["tone"], entry["notes"]) == ("", "")


def test_history_lists_the_model(signed_in):
    signed_in.post("/api/history", json=ENTRY)
    signed_in.post("/api/history", json={**ENTRY, "model": "openai/gpt-6-sol"})
    models = [e["model"] for e in signed_in.get("/api/history").json()]
    assert models == ["openai/gpt-6-sol", "anthropic/claude-sonnet-5.5"]


def test_history_requires_a_known_model(signed_in):
    assert signed_in.post("/api/history", json={k: v for k, v in ENTRY.items() if k != "model"}).status_code == 422
    assert signed_in.post("/api/history", json={**ENTRY, "model": "acme/unknown"}).status_code == 422


def test_history_lists_the_optimization_level(signed_in):
    signed_in.post("/api/history", json=ENTRY)
    signed_in.post("/api/history", json={**ENTRY, "optimization": "light"})
    levels = [e["optimization"] for e in signed_in.get("/api/history").json()]
    assert levels == ["light", "full"]


def test_history_requires_a_known_optimization_level(signed_in):
    without = {k: v for k, v in ENTRY.items() if k != "optimization"}
    assert signed_in.post("/api/history", json=without).status_code == 422
    assert signed_in.post("/api/history", json={**ENTRY, "optimization": "extreme"}).status_code == 422


def test_entries_saved_before_the_newer_columns_list_without_them(signed_in):
    signed_in.post("/api/history", json=ENTRY)
    conn = db.connect()
    with conn:
        conn.execute(f"UPDATE custom_resumes SET {', '.join(f'{f} = NULL' for f in GENERATION_FIELDS)}")
    conn.close()
    entry = signed_in.get("/api/history").json()[0]
    assert [entry[field] for field in GENERATION_FIELDS] == [None] * len(GENERATION_FIELDS)


def test_list_newest_first(signed_in):
    for company in ["First", "Second", "Third"]:
        signed_in.post("/api/history", json={**ENTRY, "company": company})
    companies = [e["company"] for e in signed_in.get("/api/history").json()]
    assert companies == ["Third", "Second", "First"]


def test_list_orders_by_timestamp(signed_in):
    signed_in.post("/api/history", json={**ENTRY, "company": "Newer"})
    signed_in.post("/api/history", json={**ENTRY, "company": "Older"})
    conn = db.connect()
    with conn:
        conn.execute(
            "UPDATE custom_resumes SET downloaded_at = '2020-01-01T00:00:00Z' WHERE company = 'Older'"
        )
    conn.close()
    companies = [e["company"] for e in signed_in.get("/api/history").json()]
    assert companies == ["Newer", "Older"]


def test_add_requires_fields(signed_in):
    assert signed_in.post("/api/history", json={"company": "Acme"}).status_code == 422


def test_add_rejects_unknown_style(signed_in):
    assert signed_in.post("/api/history", json={**ENTRY, "style": "fancy"}).status_code == 422


def test_pdf_download(signed_in):
    entry_id = signed_in.post("/api/history", json=ENTRY).json()["id"]
    response = signed_in.get(f"/api/history/{entry_id}/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert response.headers["content-disposition"] == (
        "attachment; filename*=UTF-8''Resume%20-%20Jane%20Doe%20-%20Acme%20Corp.pdf"
    )


def test_pdf_filename_safe_for_unusual_company(signed_in):
    entry_id = signed_in.post("/api/history", json={**ENTRY, "company": 'Café "Q" & Co.'}).json()["id"]
    response = signed_in.get(f"/api/history/{entry_id}/pdf")
    assert response.status_code == 200
    assert response.headers["content-disposition"] == (
        "attachment; filename*=UTF-8''Resume%20-%20Jane%20Doe%20-%20Caf%C3%A9%20Q%20%26%20Co..pdf"
    )


def test_pdf_filename_from_top_heading():
    from app.routes.history import pdf_filename

    assert pdf_filename("# Jane Doe\n\n## Experience", "Acme") == "Resume - Jane Doe - Acme.pdf"
    assert pdf_filename("Intro\n# Jane  Doe \n# Other", "Acme") == "Resume - Jane Doe - Acme.pdf"
    assert pdf_filename("## Experience", "Acme") == "Resume - Acme.pdf"
    assert pdf_filename("# A/B: Doe", "") == "Resume - A B Doe.pdf"


def test_pdf_unknown_entry(signed_in):
    assert signed_in.get("/api/history/999/pdf").status_code == 404


def test_stored_content_is_exactly_what_was_posted(signed_in):
    edited = "# Jane Doe\n\n## Edited by hand\n\n- Unicode ok: café, — dash\n"
    entry_id = signed_in.post("/api/history", json={**ENTRY, "content_md": edited}).json()["id"]
    conn = db.connect()
    row = conn.execute("SELECT content_md FROM custom_resumes WHERE id = ?", (entry_id,)).fetchone()
    conn.close()
    assert row["content_md"] == edited


def test_pdf_rendered_from_stored_content_and_style(signed_in, monkeypatch):
    from app.routes import history

    calls = []
    monkeypatch.setattr(history, "render_pdf", lambda md, style: calls.append((md, style)) or b"%PDF-fake")
    entry_id = signed_in.post("/api/history", json={**ENTRY, "content_md": "# Edited text", "style": "classic"}).json()["id"]
    assert signed_in.get(f"/api/history/{entry_id}/pdf").content == b"%PDF-fake"
    assert calls == [("# Edited text", "classic")]


def test_clear_history_deletes_all_entries(signed_in):
    for company in ["First", "Second"]:
        signed_in.post("/api/history", json={**ENTRY, "company": company})
    entry_id = signed_in.get("/api/history").json()[0]["id"]
    assert signed_in.delete("/api/history").status_code == 204
    assert signed_in.get("/api/history").json() == []
    assert signed_in.get(f"/api/history/{entry_id}/pdf").status_code == 404
    conn = db.connect()
    assert conn.execute("SELECT COUNT(*) FROM custom_resumes").fetchone()[0] == 0
    conn.close()


def test_clear_empty_history(signed_in):
    assert signed_in.delete("/api/history").status_code == 204
