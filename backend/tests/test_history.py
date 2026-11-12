from app import db

ENTRY = {
    "company": "Acme Corp",
    "job_description": "Director of Engineering",
    "content_md": "# Jane Doe\n\n## Experience\n\n- Led teams",
    "style": "professional",
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
    assert isinstance(body["id"], int)


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
    assert 'filename="resume-Acme-Corp.pdf"' in response.headers["content-disposition"]


def test_pdf_filename_safe_for_unusual_company(signed_in):
    entry_id = signed_in.post("/api/history", json={**ENTRY, "company": 'Café "Q" & Co.'}).json()["id"]
    response = signed_in.get(f"/api/history/{entry_id}/pdf")
    assert response.status_code == 200
    assert 'filename="resume-Caf-Q-Co.pdf"' in response.headers["content-disposition"]


def test_pdf_unknown_entry(signed_in):
    assert signed_in.get("/api/history/999/pdf").status_code == 404
