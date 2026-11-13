# JobFit Backend

FastAPI app that serves the JSON API under `/api/*` and the static NextJS export at `/`.
Written ahead of the code (Step 1); update as code lands.

## Stack

- Python, `uv` for packages and running
- FastAPI + uvicorn
- SQLite via stdlib `sqlite3` (db at `data/jobfit.db`, created if missing)
- WeasyPrint for markdown -> HTML -> PDF
- `openai` SDK (v3, Chat Completions API) pointed at OpenRouter; default model `openai/gpt-oss-120b`, user-selectable
- pytest + FastAPI TestClient

## Layout

- `app/main.py` - app creation, lifespan (creates db), session middleware, routers, static mount
- `app/auth.py` - Clerk session verification (`clerk-backend-api` `authenticate_request`, cookie or Bearer); `CurrentUser` (Clerk user id) and `UserId` (local db id, row created on first request)
- `app/db.py` - schema (see `docs/DATABASE.md`), `init_db` (also adds the `ADDED_HISTORY_COLUMNS` (generation settings: `model`, `optimization`, `professional_years`, `earlier_years`, `max_pages`, `tone`, `notes`, with their SQL types) to older `custom_resumes` tables), `connect`, `Db` per-request connection dependency
- `app/routes/resume.py` - `GET/PUT /api/resume/baseline`
- `app/routes/history.py` - `GET/POST/DELETE /api/history` (DELETE removes all of the current user's entries, 204) (POST body is `HistoryIn`, a `GenerationSettings` plus company/job/content/style, so every generation setting is required and validated; the insert is built from the body's fields; listed entries have each setting or null for older rows), `GET /api/history/{id}/pdf`
- `app/routes/preview.py` - `POST /api/preview` (`{content_md, style}` -> `{html}`), the `render_html` document the PDF is made from
- `app/routes/preferences.py` - `GET/PUT /api/preferences`, `Preferences` model (style, tone, max_pages, notes, include_phone, include_graduation_year (default false), professional_years 1-50, earlier_years 0-50, model, optimization `light`/`smart`/`full` (default `smart`); `Optimization` Literal must match `OPTIMIZATION_LEVELS` in `frontend/lib/api.ts`), `GenerationSettings` (the preferences that shape a resume, all required: model, optimization, professional_years, earlier_years, max_pages, tone, notes; `GENERATION_FIELDS` is its field names, matching `GENERATION_KEYS` in `frontend/lib/api.ts`), `generation_settings(prefs)`, `load_preferences`; new keys get defaults so older stored JSON still loads
- `app/pdf.py` - markdown -> HTML -> PDF (WeasyPrint), styles `professional`, `modern`, `classic`
- `app/ai.py` - OpenRouter client (`get_client` dependency, `Client` type), `Model` (Literal of selectable model ids; must match `MODELS` in `frontend/lib/api.ts`), `MODEL` default, `ask`, `ask_structured(client, messages, schema, model)` (Structured Outputs, `require_parameters`), `GET /api/ai/check` (2+2, default model)
- `app/prompt.py` - system prompt adapted from `docs/INSTRUCTIONS.md`; `build_system_prompt(baseline, job, prefs)` adds a "User preferences" block (max pages, tone, notes, phone include/exclude, graduation year include/exclude, optimization level from `OPTIMIZATION`, experience windows). Step 4 and a Rules line make the generation defer to the optimization level; without that, Light polish rewrote the work history in 3 of 7 runs (0 of 12 after). `test_real_generation_follows_optimization_level` checks Light keeps the core bullets verbatim (dashes normalized: models swap in non-breaking hyphens) and the others rewrite. Rules from INSTRUCTIONS.md "Narrowing" are in `INSTRUCTIONS` (Rules) or, for the Earlier Experience format, in `experience_rules`; keep both in sync when INSTRUCTIONS.md changes. Earlier Experience entries must be Markdown list items: plain consecutive lines merge into one paragraph in the PDF. `experience_rules(prefs, year)` turns the year settings into concrete cutoff years in code (models are unreliable at date arithmetic); the route passes `date.today().year`
- `app/routes/generate.py` - `POST /api/generate`: stored baseline + preferences (including `model`) + request job/message/history -> `{reply, company, experience_plan, resume_md}` plus the saved `GenerationSettings` used (`GenerateResponse`, added after the AI call; style, phone and graduation options are not included; `resume_md` null while asking questions). `experience_plan` lists each baseline role with end year and section (professional/earlier/omitted) before the resume is written: without it the model leaked pre-cutoff roles in about 1 of 6 runs, with it 0 of 24. The frontend ignores it
- `static/` - built frontend, copied in by the Dockerfile (git-ignored; override with `STATIC_DIR` env)
- `tests/` - pytest; `conftest.py` sets env before app import and provides `client` (fresh temp db per test) and `signed_in` fixtures

## Rules

- Always `uv run ...` and `uv add ...`; never pip or bare python
- All API routes live under `/api`
- Every data route takes `UserId` and filters by it
- Raw SQL via stdlib `sqlite3`; no ORM
- Config from environment: `OPENROUTER_API_KEY`, `DB_PATH` (default `data/jobfit.db`), `STATIC_DIR`, `CLERK_SECRET_KEY`, `CLERK_AUTHORIZED_PARTIES` (comma-separated origins, default `http://localhost:8000`)
- Tests override `auth.current_user` for data routes; `tests/test_auth.py` signs real RS256 tokens with a local key to test verification without network
- When changing the prompt, run the `integration` tests a few times: they check real output against the resume rules. `test_real_generation_with_each_model` calls every selectable model (includes Opus; costs a few cents); select with `-k each_model`
- Unit tests never call OpenRouter: override `ai.get_client` via `app.dependency_overrides`
- Short modules and functions; no defensive code; no emojis

## macOS setup

WeasyPrint needs Pango: `brew install pango`. Because `uv` is a hardened-runtime binary, macOS strips `DYLD_*` variables, so Python cannot find Homebrew libraries by default. `tests/conftest.py` sets `DYLD_FALLBACK_LIBRARY_PATH` for tests; for the dev server pass it with `--env-file` (a file containing `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`).

## Commands

- `uv run pytest` - tests (real-API tests are marked `integration` and skipped by default)
- `uv run --env-file ../.env pytest -m integration` - real OpenRouter tests
- `uv run --env-file <mac.env> uvicorn app.main:app --reload` - dev server on macOS
