import sqlite3

from app import db


def tables(path):
    conn = sqlite3.connect(path)
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    conn.close()
    return names


def test_database_created_on_startup(client):
    assert db.DB_PATH.exists()
    assert tables(db.DB_PATH) == {"users", "baseline_resumes", "custom_resumes", "preferences"}


def test_no_users_until_first_request(client):
    conn = db.connect()
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    conn.close()


def test_init_is_idempotent(signed_in):
    signed_in.put("/api/resume/baseline", json={"content_md": "# Me"})
    db.init_db()
    db.init_db()
    assert signed_in.get("/api/resume/baseline").json()["content_md"] == "# Me"


def test_deleting_user_cascades(signed_in):
    signed_in.put("/api/resume/baseline", json={"content_md": "# Me"})
    conn = db.connect()
    with conn:
        conn.execute("DELETE FROM users WHERE username = 'user_alice'")
    assert conn.execute("SELECT COUNT(*) FROM baseline_resumes").fetchone()[0] == 0
    conn.close()
