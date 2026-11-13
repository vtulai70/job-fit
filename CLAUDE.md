# The Resume Customizer MVP web app

## Business Requirements

This project is for building a resume customizer App, which allows the user to customize a baseline resume for a specific job description. The app name is JobFit. Key features:
- A user can sign in (Clerk accounts; each user only sees their own data)
- When signed in, the user can upload or update the baseline resume, paste the job description, generate the custom resume, and optionally download this as PDF
- The generated custom resume is editable in the UI; Download PDF always uses the edited text, and that edited text is what is saved to the database
- The baseline resume and user preferences (PDF style, AI model, tone, max pages, notes for the AI, include/exclude phone number, Professional Experience years, Earlier Experience years) are persisted
- Preferences are sent to the AI with the baseline resume and job description on every generation; unchecking "Include phone number in generated resume" removes the phone number from the generated resume (preferences must be saved to take effect)
- Experience windows: roles that ended within the last "Professional Experience (years)" (default 15) go in a "Professional Experience" section with full detail; roles that ended in the "Earlier Experience (years)" before that (default 10) go in an "Earlier Experience" section with one list item per role (role, company name and years only, no other details); older roles are left out. A role is placed by its end year; 0 earlier years means no Earlier Experience section
- The custom resumes are persisted when downloaded. The company, PDF style and download timestamp are also persisted.
- The PDF file is named `Resume - <name> - <company>.pdf`, the name taken from the custom resume's top `# ` heading (left out if there is none; characters not allowed in file names are dropped)
- The user has an option to see the custom resume history, and be able to re-download the PDF for any of these
- AI model preference: `openai/gpt-oss-120b` (default), `anthropic/claude-opus-5.5`, `anthropic/claude-haiku-5.5`, `anthropic/claude-sonnet-5.5`, `openai/gpt-6-sol`, `openai/gpt-5.4-nano`, `~google/gemini-pro-latest`. The saved model generates the resume; the chat shows a "Model: <id>" line before each prompt it sends (that line is not sent to the AI)
- There is an AI chat feature in a sidebar; the AI is able to ask clarifying questions before generating the final custom resume. A "Generate custom resume" button starts it once a baseline and job description exist

## Limitations

- Runs locally in a Docker container.
- The job description is pasted text only; URLs are not fetched.
- The AI follows the resume rules (from `docs/INSTRUCTIONS.md`: no new technologies, no invented experience entries, no graduation year, experience windows, one-line Earlier Experience entries) by prompt only; there is no hard post-check. Real-model tests check these rules, and models occasionally slip (e.g. `gpt-oss-120b` dropped the Education section in about 1 of 10 runs and put the Nokia role ending 2012 in Earlier Experience in about 1 of 10). `~google/gemini-pro-latest` returns no resume (`resume_md` null while its reply says it is done) in about 1 of 4 generations; prompt wording and field order did not change that

## Technical Decisions

- NextJS frontend, built as a static export (`output: "export"`)
- Python FastAPI backend, including serving the static NextJS site at /; all API routes under `/api`
- Everything packaged into a Docker container (multi-stage: node builds the frontend, python serves it)
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls via the `openai` SDK. An OPENROUTER_API_KEY is in .env in the project root
- Default model `openai/gpt-oss-120b`; the user can pick another from a fixed list (all support Structured Outputs on OpenRouter). Structured Outputs: `{reply, company, experience_plan, resume_md}`. The model list lives in `backend/app/ai.py` (`Model`, validated) and `frontend/lib/api.ts` (`MODELS`); keep them in sync
- Use SQLite (stdlib `sqlite3`, no ORM) at `data/jobfit.db`, creating a new db if it doesn't exist; schema in `docs/DATABASE.md`
- Authentication with Clerk: `@clerk/react` in the frontend, `clerk-backend-api` verifies the session cookie in the backend. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are in .env
- PDFs are rendered in the backend from markdown with WeasyPrint (styles: professional, modern, classic)
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Project layout and commands

- `backend/` - FastAPI app; see `backend/CLAUDE.md`
- `frontend/` - NextJS app; see `frontend/CLAUDE.md`
- `scripts/start.sh` / `scripts/stop.sh` (and `.ps1`) - build and run the app at http://localhost:8000
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