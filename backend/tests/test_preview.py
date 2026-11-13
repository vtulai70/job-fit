from app.pdf import render_html


def test_preview_returns_pdf_html_for_style(signed_in):
    body = {"content_md": "# Jane\n\n- one", "style": "classic"}
    response = signed_in.post("/api/preview", json=body)
    assert response.status_code == 200
    assert response.json() == {"html": render_html("# Jane\n\n- one", "classic")}
    assert "<h1>Jane</h1>" in response.json()["html"]


def test_preview_rejects_unknown_style(signed_in):
    assert signed_in.post("/api/preview", json={"content_md": "# x", "style": "fancy"}).status_code == 422


def test_preview_requires_session(client):
    assert client.post("/api/preview", json={"content_md": "# x", "style": "modern"}).status_code == 401
