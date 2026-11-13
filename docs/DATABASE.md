# Database

The full schema is in `docs/schema.json`. This document explains the approach.

## Approach

- SQLite file at `data/jobfit.db`. In Docker, `data/` is the host-mounted volume, so data survives container restarts.
- Access through Python's stdlib `sqlite3`. No ORM: four small tables and simple queries do not need one.
- On startup the backend creates the `data/` directory and the tables if missing (`CREATE TABLE IF NOT EXISTS`). A user row is created on each Clerk user's first request. No migration tool for the MVP; columns added later (the `custom_resumes` generation settings: `model`, `optimization`, `professional_years`, `earlier_years`, `max_pages`, `tone`, `notes`) are added by `init_db` with `ALTER TABLE` when missing.
- One connection per request (FastAPI dependency), with `PRAGMA foreign_keys = ON` and `row_factory = sqlite3.Row`.
- Timestamps are ISO-8601 UTC text.
- Every query is filtered by the current user's `id`, so the schema is multi-user ready from day one.

## Tables

| Table | Purpose | Rows per user |
|---|---|---|
| `users` | Accounts; `username` holds the Clerk user id (e.g. `user_2abc...`) | 1 |
| `baseline_resumes` | Current baseline resume as markdown; upload replaces it | 0..1 |
| `custom_resumes` | Download history: company, job description, generated markdown, PDF style, timestamp, and the generation settings (model, optimization level, experience years, max pages, tone, notes) | 0..n |
| `preferences` | JSON object of preferences; no row means defaults | 0..1 |

## SQL

```sql
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
    -- Generation settings the resume was made with; NULL for rows saved before each was recorded.
    model              TEXT,
    optimization       TEXT,        -- light, smart or full
    professional_years INTEGER,
    earlier_years      INTEGER,
    max_pages          INTEGER,
    tone               TEXT,
    notes              TEXT
);
CREATE INDEX IF NOT EXISTS idx_custom_resumes_user_downloaded
    ON custom_resumes (user_id, downloaded_at);

CREATE TABLE IF NOT EXISTS preferences (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## Preferences JSON

```json
{ "style": "professional", "tone": "", "max_pages": 2, "notes": "", "include_phone": true,
  "include_graduation_year": false,
  "professional_years": 15, "earlier_years": 10, "model": "openai/gpt-oss-120b", "optimization": "smart" }
```

- `style`: PDF visual style, one of `professional`, `modern`, `classic`
- `tone`: free text guidance for the AI
- `max_pages`: target resume length
- `notes`: anything else the AI should always consider
- `include_phone`: whether the generated resume keeps the phone number from the baseline (rows saved before this key existed load as `true`)
- `include_graduation_year`: whether the generated resume keeps the university graduation/completion year in Education (default `false`; older rows load as `false`)
- `professional_years` (1-50, default 15) and `earlier_years` (0-50, default 10): experience windows, see `backend/CLAUDE.md`. Older rows load with the defaults
- `model`: OpenRouter model id used for generation, one of the list in `backend/app/ai.py` (`Model`); default `openai/gpt-oss-120b`, older rows load with the default
- `optimization`: how much the AI changes the resume, one of `light` (Light polish), `smart` (Smart integration), `full` (Full tailoring); default `smart`, older rows load with the default

Stored as JSON so new preference keys need no schema change. The backend validates it with a Pydantic model.

## Design decisions

- **Store markdown, not PDFs.** History keeps the generated markdown and the style used; the PDF is rendered again on re-download. Smaller database, and a re-download matches the original even if preferences change later.
- **History entry on download, not on generation.** Matches the requirement that custom resumes are persisted when downloaded.
- **Baseline is a single current version.** No baseline history for the MVP; each history row keeps its own generated content, so older downloads are unaffected by a new baseline.
