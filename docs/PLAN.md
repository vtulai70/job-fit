# JobFit - Project Plan

## Architecture at a glance

- One Docker container. FastAPI on port 8000 serves `/api/*` and the NextJS static export at `/`.
- SQLite database file at `data/jobfit.db`, on a host-mounted `data/` volume so it survives restarts.
- `.env` in the project root is passed to the container (`OPENROUTER_API_KEY`, later Clerk keys).
- PDFs are generated in the backend (markdown -> HTML -> PDF with WeasyPrint).
- AI calls go to OpenRouter with model `openai/gpt-oss-120b`.
- UI colors: background `#090D16`, surface `#111827`, primary `#38BDF8` (Sky 400), accent `#F59E0B` (Amber 500), text `#F1F5F9`, border `#1E293B`.
- Tests: backend pytest + FastAPI TestClient; frontend Vitest + React Testing Library; end-to-end Playwright against the running container.

## How to use this plan

- The agent ticks `- [ ]` boxes as each substep is completed and verified.
- Each step lists Goal, Substeps, Tests and Success criteria.
- At the end of each step the agent reports results and checks in with the user before moving on.

---

## Step 1: Plan

Enrich this document to plan out each of these parts in detail, with substeps listed out as a checklist to be checked off by the agent, and with tests and success criteria for each. Also create CLAUDE.md files inside the frontend and backend directories that describe the code there. Ensure the user checks and approves the plan.

**Substeps**
- [x] Expand docs/PLAN.md with substeps, tests and success criteria per step
- [x] Write frontend/CLAUDE.md
- [x] Write backend/CLAUDE.md
- [x] User reviews and approves the plan

**Tests**: none (documentation only).

**Success criteria**: user approves the plan.

---

## Step 2: Scaffolding

Set up the Docker infrastructure, the backend in backend/ with FastAPI, and write the start and stop scripts in the scripts/ directory. This should serve example static HTML to confirm that a 'hello world' example works running locally and also make an API call.

**Substeps**
- [x] Create `backend/` as a uv project (`uv init`, `uv add fastapi uvicorn`, `uv add --dev pytest httpx`)
- [x] `backend/app/main.py`: `GET /api/health` returns `{"status": "ok"}`; StaticFiles mount at `/` serving `backend/static/`
- [x] Placeholder `backend/static/index.html`: shows "hello world" and the result of fetching `/api/health`
- [x] `Dockerfile` in project root: python slim + uv, `uv sync --frozen`, run `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`
- [x] `.dockerignore` and `.gitignore` (exclude `.env`, `data/`, `.venv`, `node_modules`, build output)
- [x] `scripts/start.sh` and `scripts/stop.sh` (Mac/Linux): build image, run container with `--env-file .env`, `-p 8000:8000`, `-v ./data:/app/data`; stop and remove container
- [x] `scripts/start.ps1` and `scripts/stop.ps1` (Windows) with the same behavior
- [x] Minimal root `README.md` (what it is, how to start/stop)

**Tests**
- pytest: `/api/health` returns 200 and `{"status": "ok"}`
- pytest: `/` returns 200 HTML containing "hello world"

**Success criteria**
- `scripts/start.sh` builds and starts the container
- `curl localhost:8000/api/health` returns ok
- Browser at `http://localhost:8000/` shows "hello world" and the API result
- `scripts/stop.sh` stops and removes the container
- `uv run pytest` passes

---

## Step 3: Add in Frontend

Now update so that the frontend is statically built and served. Comprehensive unit and integration tests.

**Substeps**
- [x] Create `frontend/` with latest NextJS (App Router, TypeScript, Tailwind), `output: "export"` in `next.config`
- [x] Add color tokens to the Tailwind theme
- [x] Layout shell: header with "JobFit"; main area with baseline resume panel, job description input and generated resume view; right sidebar for AI chat (UI only, no behavior yet)
- [x] Health indicator calling `/api/health`
- [x] Multi-stage Dockerfile: stage 1 (node) runs `npm ci && npm run build` producing `out/`; stage 2 copies `out/` into the backend static directory
- [x] Remove placeholder `index.html`
- [x] Set up Vitest + React Testing Library
- [x] Set up Playwright (base URL `http://localhost:8000`)

**Tests**
- Unit: each component renders; job description input accepts text; chat sidebar renders input and send button
- Unit: health indicator shows ok with mocked fetch
- E2E: page loads from the container, header and sidebar visible, health indicator shows ok
- Backend tests still pass

**Success criteria**
- `scripts/start.sh` serves the NextJS UI at `/`
- `npm test`, `npx playwright test` and `uv run pytest` pass

---

## Step 4: Add in a fake user sign in experience

Now update so that on first hitting /, you need to log in with dummy credentials ("user", "password") in order to be able to upload the baseline resume, link the job description and you can log out. Comprehensive tests.

**Substeps**
- [x] Backend `POST /api/auth/login`: checks `user`/`password`, sets an httpOnly signed session cookie
- [x] Backend `POST /api/auth/logout`: clears the cookie
- [x] Backend `GET /api/auth/me`: returns the username or 401
- [x] Backend `current_user` dependency for protected routes
- [x] Frontend login page shown when `/api/auth/me` returns 401; error message on bad credentials
- [x] Logout button in header
- [x] Baseline resume upload (.md / .txt read as text) and job description field (URL or pasted text), held in client state for now

**Tests**
- Backend: login success sets cookie; bad credentials return 401; `/me` with and without cookie; logout clears session
- Frontend unit: login form submits; error message shown; logout returns to login view; resume upload displays content
- E2E: wrong credentials rejected; login -> upload resume -> enter job description -> logout -> back at login

**Success criteria**
- The main UI cannot be reached without logging in
- All tests pass

---

## Step 5: Database modeling

Now propose a database schema for persisting the baseline resume, custom resume download history and user preferences, saving it as JSON. Document the database approach in docs/ and get user sign off.

**Substeps**
- [x] Write `docs/schema.json` describing the tables:
  - `users` (id, username unique, created_at)
  - `baseline_resumes` (user_id PK/FK, content_md, updated_at)
  - `custom_resumes` (id, user_id FK, company, job_description, content_md, downloaded_at)
  - `preferences` (user_id PK/FK, data JSON, e.g. visual style, tone, updated_at)
- [x] Write `docs/DATABASE.md`: schema overview, stdlib `sqlite3` access (no ORM), db file at `data/jobfit.db`, created with `CREATE TABLE IF NOT EXISTS` on startup, seed of the `user` account, multi-user ready
- [x] User sign off

**Tests**: none (documentation only).

**Success criteria**: user signs off on DATABASE.md and schema.json.

---

## Step 6: Backend

Now add API routes to allow the backend to read and update the baseline resume for a given user; add history entries and retrieve the full download history, and update user preferences. Test this thoroughly with backend unit tests. The database should be created if it doesn't exist.

**Substeps**
- [x] `app/db.py`: connect, create schema if missing, seed `user`
- [x] `GET /api/resume/baseline`, `PUT /api/resume/baseline`
- [x] `GET /api/history`, `POST /api/history`
- [x] `GET /api/history/{id}/pdf`
- [x] `GET /api/preferences`, `PUT /api/preferences`
- [x] `app/pdf.py`: markdown -> HTML -> PDF with WeasyPrint; add required system libraries to the Dockerfile
- [x] All data routes scoped to `current_user`

**Tests** (temp db per test)
- Database file and tables created when missing
- Read/update baseline; empty baseline returns a clear empty response
- Add history entries and list them newest first
- Get and update preferences
- PDF endpoint returns `application/pdf` with body starting `%PDF`
- 401 for every data route when not logged in
- User isolation: a second seeded user cannot see the first user's data

**Success criteria**
- `uv run pytest` passes
- A fresh container creates the database on first start

---

## Step 7: Frontend + Backend

Now have the frontend actually use the backend API, so that the baseline resume, download history and preferences are persisted. Test very thoroughly.

**Substeps**
- [x] `lib/api.ts`: small fetch wrapper for `/api/*`
- [x] Load baseline on login; save baseline on upload
- [x] Preferences panel loads and saves via API
- [x] "Download PDF" posts a history entry, then downloads the PDF
- [x] History view: list of company + timestamp with re-download
- [x] Job description is pasted text only (decided: no URL fetching for the MVP)
- [x] E2E runs against its own throwaway container on port 8001 so tests never touch `data/jobfit.db`

**Tests**
- Unit (mocked fetch): baseline load/save, preferences load/save, download flow, history list and re-download
- E2E: upload baseline, logout, login -> baseline still present
- E2E: history entry (created via API, since generation arrives in Step 9) is listed; re-download returns a PDF
- E2E: preferences persist across reload
- E2E: data survives `scripts/stop.sh` + `scripts/start.sh`

**Success criteria**
- Persisted data survives logout and container restart
- All tests pass

---

## Step 8: AI connectivity

Now allow the backend to make an AI call via OpenRouter. Test connectivity with a simple "2+2" test and ensure the AI call is working.

**Substeps**
- [x] `uv add openai`
- [x] `app/ai.py`: OpenAI client with `base_url="https://openrouter.ai/api/v1"`, key from `OPENROUTER_API_KEY`, model `openai/gpt-oss-120b`
- [x] `GET /api/ai/check`: asks "What is 2+2?" and returns the answer

**Tests**
- Unit: mocked client, route returns the model answer
- Integration (marked, needs real key): answer contains "4"

**Success criteria**
- Live call returns 4 from inside the running container

---

## Step 9: Custom resume generation

Now extend the backend with an endpoint to generate a custom resume, so that it always calls the AI with the baseline resume, target job description, user preferences plus the user's question (and conversation history). The AI should respond with Structured Outputs that includes the company name and generated custom resume. Test thoroughly.

**Substeps**
- [x] System prompt adapted from `docs/INSTRUCTIONS.md` (resume only; keep its narrowing rules)
- [x] `POST /api/generate` body `{job_description, message, history[]}`; server loads baseline and preferences for the current user
- [x] Structured Outputs via Pydantic model `{reply: str, company: str | null, resume_md: str | null}`; `resume_md` is null while the AI asks clarifying questions
- [x] Chat sidebar wired to `/api/generate`, conversation history kept client-side
- [x] "Generate custom resume" button, enabled once baseline and job description exist; sends a standard request into the same chat
- [x] Generated resume rendered in the main area
- [x] Download flow from Step 7 uses the returned company

**Tests**
- Unit (mocked AI): prompt contains baseline, job description, preferences and history; structured output parsed; clarifying-question path returns null resume
- Integration (real model): `resume.md` + sample job description returns a company name and a non-empty resume
- Frontend unit: chat sends message, shows reply, shows generated resume
- E2E (mocked generate route): chat -> resume -> download -> appears in history

**Success criteria**
- User can chat, answer clarifying questions, receive a custom resume, download it as PDF and see it in history
- All tests pass

---

## Step 10: Multiple user accounts

Now add support for multiple user accounts and authentication with Clerk. NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are in .env.

**Substeps**
- [x] Frontend: replace fake login with Clerk client components that work with static export
- [x] Backend: verify the Clerk session token using `CLERK_SECRET_KEY`; `current_user` resolves from it
- [x] Create a `users` row on first request, keyed by Clerk user id
- [x] Remove hardcoded credentials and the fake login routes

**Tests**
- Backend (mocked token verification): two users are isolated; invalid token returns 401
- E2E with Clerk testing tokens if feasible

**Success criteria**
- Two real accounts each see only their own baseline, history and preferences
- All tests pass

---

## Step 11: Pro mode

Add a "Pro mode" in which the baseline resume, job description and preferences go to several models in parallel, and another model (the judge) compares the resumes they return and picks the best fit for the job. The user can still view, edit and download any of the candidates.

**Decisions**
- Changed after implementation: there is no separate judge model setting; the AI model judges, and in Pro mode it cannot be one of the Pro models
- 2 to 4 candidate models, chosen from the full model list (no restriction to cheaper models)
- The judge model cannot also be a candidate (checked in the frontend and validated in the backend)
- Pro starts automatically: with Pro mode on, a chat turn that produces a resume (including the one started by "Generate custom resume") runs Pro instead of a single generation
- The clarifying-question chat stays with the "AI model" preference. Once that model answers with a resume instead of questions, the Pro candidates run, each with the same conversation plus an instruction to write the resume now without asking questions. The chat model's own resume is discarded. So a Pro turn takes one chat turn, plus the slowest candidate, plus the judge
- The judge sees the candidates labelled A/B/C/D, in shuffled order and without model names, so it cannot favour a model by name or position
- Only the downloaded candidate is saved to the history. The others are discarded, keeping the "persisted on download" rule

**Substeps**
- [x] Preferences:
  - `pro_mode` (bool, default false)
  - `pro_models` (2-4 distinct `Model` values, default the first two other than the judge)
  - `judge_model` (`Model`, default `anthropic/claude-opus-5.5`, not in `pro_models`)
  - Older stored JSON loads with these defaults
- [x] Backend candidates:
  - Run `ask_structured` for each Pro model in parallel with a `ThreadPoolExecutor`; the route is a sync `def`, so the existing client works as-is
  - Drop a candidate that errors, times out, or returns a null `resume_md`
- [x] Backend judge:
  - The prompt gets the baseline, the job description, the preferences and the labelled candidates
  - Structured output: `{ranking: [{label, score, strengths, weaknesses, rule_violations}], winner, rationale}`
  - `rule_violations` checks each candidate against the baseline and `docs/INSTRUCTIONS.md`: invented facts, new technologies, experience windows, graduation year, phone number
- [x] `POST /api/generate` keeps its request body:
  - With Pro off, or while the chat model is still asking questions, the response is unchanged
  - Once the resume is ready in Pro mode, the response adds `pro: {candidates: [{model, resume_md, score, strengths, weaknesses, rule_violations}], winner_model, rationale, judge_model}`, with candidates ordered by rank; `resume_md` and `company` are the winner's
  - With 1 candidate left there is no judge call and the response notes it; with 0, the request fails
- [x] History: add nullable columns `pro_judge_model` and `pro_rank`, filled when a Pro candidate is downloaded; `model` is the downloaded candidate's model
- [x] Preferences UI, in the Resume generation group:
  - A "Pro mode" checkbox
  - When it is on: a "Pro models" checklist that allows at most 4 and needs at least 2, and a "Judge model" dropdown that leaves out the selected Pro models
- [x] Chat:
  - The settings note adds `Pro models: <ids>` and `Judge: <id>`
  - The busy text reads "Generating N candidates, then comparing..."
  - The assistant reply summarizes the verdict (winner, score, one-line reason)
- [x] Custom resume panel:
  - One tab per candidate (model name and score, the winner marked, an issue count when there are rule violations); the winner is selected first
  - A collapsible "Why it won" section with the judge rationale, and the selected candidate's strengths, weaknesses and violations
  - Markdown/Preview, edits and Download apply to the selected tab, and edits are kept per tab
- [x] History UI: a "Pro: judged by <model>, rank <n>" label in the settings line

**Tests**
- Backend unit (fake client):
  - Candidates run in parallel and failures are dropped
  - The judge sees no model names, and labels map back to the right models
  - The 0 and 1 candidate edge cases
  - The judge model in `pro_models` is rejected (422)
  - Pro off is unchanged
- Integration (real models; run a few times after prompt changes):
  - A Pro run returns ranked candidates
  - Plant an invented employer in one candidate and check the judge flags it
- Frontend unit:
  - Pro preference controls (2-4 limit, judge excluded)
  - Candidate tabs switch content and keep edits per tab
  - Download sends the selected candidate and its Pro fields
  - The chat note
- E2E (mocked generate route): Pro on -> generate -> pick a non-winning tab -> download -> history shows the model and the Pro label

**Success criteria**
- With Pro mode on, "Generate custom resume" returns 2-4 ranked candidates with the judge's verdict, and any of them can be edited and downloaded
- With Pro mode off, the app behaves exactly as before
- All tests pass
