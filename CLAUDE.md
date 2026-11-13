# The Resume Customizer MVP web app

## Business Requirements

This project is for building a resume customizer App, which allows the user to customize a baseline resume for a specific job description. The app name is JobFit. Key features:
- A user can sign in (Clerk accounts; each user only sees their own data)
- When signed in, the user can upload or update the baseline resume, paste the job description, generate the custom resume, and optionally download this as PDF
- The generated custom resume is editable in the UI; Download PDF always uses the edited text, and that edited text is what is saved to the database
- The Baseline resume, Download history and Preferences panels expand and collapse by clicking their title (chevron). Baseline resume starts collapsed when a baseline is already saved (expanded otherwise; uploading does not change it); the other two start expanded. The open/closed state is not persisted. The Upload resume and Clear history buttons stay in the panel headers while collapsed
- A Markdown / Preview toggle switches the custom resume between the editable Markdown (default) and a read-only preview rendered by the backend from the same HTML and saved PDF style as the PDF; the preview follows edits and PDF style changes
- The baseline resume and user preferences (PDF style, AI model, optimization level, tone, max pages, notes for the AI, include/exclude phone number, include/exclude university graduation year, Professional Experience years, Earlier Experience years) are persisted
- Preferences are shown in two groups: "Resume generation" at the top (AI model, optimization level, Professional/Earlier Experience years, max pages, tone, notes for the AI, include phone number, include graduation year) and "PDF" at the bottom (PDF style)
- Preferences are saved automatically on every change (there is no Save button) and sent to the AI with the baseline resume and job description on every generation; a generation waits for pending preference saves. Unchecking "Include phone number in generated resume" removes the phone number from the generated resume. "Include university graduation year in generated resume" is off by default, so Education entries have no year; checking it keeps each degree's graduation/completion year from the baseline
- Optimization level (dropdown, default "Smart integration"; the chosen level's description shows under it) sets how much the AI changes the resume: "Light polish" adds the job's skills and requirements to the summary and skills and copies the work history bullets word for word; "Smart integration" naturally works them into the work history; "Full tailoring" fully rewrites and reprioritizes the content for the employer. Every level still follows the resume rules (no invented facts). Stored as `light`, `smart`, `full`
- Experience windows: roles that ended within the last "Professional Experience (years)" (default 15) go in a "Professional Experience" section with full detail; roles that ended in the "Earlier Experience (years)" before that (default 10) go in an "Earlier Experience" section with one list item per role (role, company name and years only, no other details); older roles are left out. A role is placed by its end year; 0 earlier years means no Earlier Experience section
- The custom resumes are persisted when downloaded. The company, PDF style, download timestamp and the model and optimization level that generated the resume (not the ones selected at download time) are also persisted.
- The PDF file is named `Resume - <name> - <company>.pdf` (set by the backend via `Content-Disposition`). The name is the custom resume's first `# ` heading; the company is the one the AI extracted ("Unknown company" when it returns none). Characters not allowed in file names are replaced and whitespace collapsed; an empty part is left out
- The user has an option to see the custom resume history (company, download time, generating model and optimization level; downloads saved before these were recorded show neither), and be able to re-download the PDF for any of these. The list shows at most 10 entries; with more, it gets a vertical scrollbar. A "Clear history" button in the Download history header (shown only when there are entries) asks for confirmation, then deletes all of the user's history entries from the database and empties the list; if the delete fails the list is kept and an alert says so
- AI model preference: `openai/gpt-oss-120b` (default), `anthropic/claude-opus-5.5`, `anthropic/claude-haiku-5.5`, `anthropic/claude-sonnet-5.5`, `openai/gpt-6-sol`, `openai/gpt-5.4-nano`, `~google/gemini-pro-latest`. The saved model generates the resume. Before each prompt it sends, the chat shows a note with the settings used, one per line: "Model: <id>", "Optimization level: <label>", "Tone: <tone>" ("no preference" when empty) and "Notes: <notes>" (only when not empty). The experience years are not shown in it (they still go to the AI). The note is not sent to the AI
- There is an AI chat feature in a sidebar; the AI is able to ask clarifying questions before generating the final custom resume. A "Generate custom resume" button starts it once a baseline and job description exist

## Limitations

- Runs locally in a Docker container.
- The job description is pasted text only; URLs are not fetched.
- The AI follows the resume rules (from `docs/INSTRUCTIONS.md`: no new technologies, no invented experience entries, graduation year only when the preference is on, experience windows, one-line Earlier Experience entries) by prompt only; there is no hard post-check. Real-model tests check these rules, and models occasionally slip (e.g. `gpt-oss-120b` dropped the Education section in about 1 of 10 runs and put the Nokia role ending 2012 in Earlier Experience in about 1 of 10). `~google/gemini-pro-latest` returns no resume (`resume_md` null while its reply says it is done) in about 1 of 4 generations; prompt wording and field order did not change that

## Technical Decisions

- NextJS frontend, built as a static export (`output: "export"`)
- Python FastAPI backend, including serving the static NextJS site at /; all API routes under `/api`
- Everything packaged into a Docker container (multi-stage: node builds the frontend, python serves it)
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls via the `openai` SDK. An OPENROUTER_API_KEY is in .env in the project root
- Default model `openai/gpt-oss-120b`; the user can pick another from a fixed list (all support Structured Outputs on OpenRouter). Structured Outputs: `{reply, company, experience_plan, resume_md}`; `/api/generate` adds the `model` and `optimization` it used. The model list lives in `backend/app/ai.py` (`Model`, validated) and `frontend/lib/api.ts` (`MODELS`); keep them in sync
- Use SQLite (stdlib `sqlite3`, no ORM) at `data/jobfit.db`, creating a new db if it doesn't exist; schema in `docs/DATABASE.md`
- Authentication with Clerk: `@clerk/react` in the frontend, `clerk-backend-api` verifies the session cookie in the backend. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are in .env
- PDFs are rendered in the backend from markdown with WeasyPrint (styles: professional, modern, classic); the preview (`POST /api/preview`) returns the same HTML, shown in a sandboxed iframe
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Project layout and commands

- `backend/` - FastAPI app; see `backend/CLAUDE.md`
- `frontend/` - NextJS app; see `frontend/CLAUDE.md`
- `scripts/start.sh` / `scripts/stop.sh` (and `.ps1`) - build and run the app at http://localhost:8000; rerun `start.sh` after code changes, the container does not pick them up otherwise
- Tests: `cd backend && uv run pytest`; `cd frontend && npm test`; `cd frontend && npm run test:e2e` (throwaway container on port 8001, two Clerk test users)
- macOS: backend needs `brew install pango` for WeasyPrint

## Color Scheme

- Background: `#090D16` - Deep obsidian canvas for immersive dark mode
- Surface / Card: `#111827` (Gray 900) - Layered sidebars and card containers
- Primary / Action: `#38BDF8` (Sky 400) - High-visibility interactive elements and links
- Accent: `#F59E0B` (Amber 500) - Secondary highlights (e.g. the Generate button)
- Text Primary:`#F1F5F9` (Slate 100) - Crisp, legible text against dark surfaces
- Border / Divider: `#1E293B` (Slate 800) - Low-profile structural lines
- Clerk sign-in and account menu use the same palette (`appearance.variables` in `frontend/components/App.tsx`); `colorNeutral` is set to the text color so Clerk's menu items stay legible on dark surfaces

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.