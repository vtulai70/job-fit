"""SQLite access: schema creation, seeding and a per-request connection."""

import os
import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import Depends

DB_PATH = Path(os.environ.get("DB_PATH", "data/jobfit.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    username   TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS baseline_resumes (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    content_md TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_resumes (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company         TEXT NOT NULL,
    job_description TEXT NOT NULL,
    content_md      TEXT NOT NULL,
    style           TEXT NOT NULL,
    downloaded_at   TEXT NOT NULL,
    model           TEXT,
    optimization    TEXT
);
CREATE INDEX IF NOT EXISTS idx_custom_resumes_user_downloaded
    ON custom_resumes (user_id, downloaded_at);
CREATE TABLE IF NOT EXISTS preferences (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


# custom_resumes columns added after the first release; init_db adds them to older files.
ADDED_HISTORY_COLUMNS = ("model", "optimization")


def now() -> str:
    """Current UTC time as ISO-8601 text."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect() -> sqlite3.Connection:
    """Open a connection with foreign keys on and dict-like rows."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def add_user(conn: sqlite3.Connection, username: str) -> None:
    """Create a user if it does not exist."""
    conn.execute(
        "INSERT OR IGNORE INTO users (username, created_at) VALUES (?, ?)", (username, now())
    )


def init_db() -> None:
    """Create the database file and tables if missing, and add columns newer than the file."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    conn.executescript(SCHEMA)
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(custom_resumes)")}
    for column in ADDED_HISTORY_COLUMNS:
        if column not in columns:
            conn.execute(f"ALTER TABLE custom_resumes ADD COLUMN {column} TEXT")
    conn.close()


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one connection per request, committed on success."""
    conn = connect()
    with conn:
        yield conn
    conn.close()


Db = Annotated[sqlite3.Connection, Depends(get_db)]
