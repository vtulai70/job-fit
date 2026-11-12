def test_empty_baseline(signed_in):
    response = signed_in.get("/api/resume/baseline")
    assert response.status_code == 200
    assert response.json() == {"content_md": None, "updated_at": None}


def test_put_then_get_baseline(signed_in):
    put = signed_in.put("/api/resume/baseline", json={"content_md": "# Jane\n\nEngineer"})
    assert put.status_code == 200
    assert put.json()["content_md"] == "# Jane\n\nEngineer"
    assert put.json()["updated_at"].endswith("Z")

    get = signed_in.get("/api/resume/baseline")
    assert get.json() == put.json()


def test_put_replaces_baseline(signed_in):
    signed_in.put("/api/resume/baseline", json={"content_md": "old"})
    signed_in.put("/api/resume/baseline", json={"content_md": "new"})
    assert signed_in.get("/api/resume/baseline").json()["content_md"] == "new"


def test_put_requires_content(signed_in):
    assert signed_in.put("/api/resume/baseline", json={}).status_code == 422
