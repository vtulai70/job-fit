# JobFit

Customize a baseline resume for a specific job description with AI.

## Features

- Sign in with Clerk; each user sees only their own data
- Upload a baseline resume (.md or .txt) and paste a job description
- Chat with the AI in a sidebar; it may ask clarifying questions before generating. Before each prompt the chat shows the model, optimization level, tone and notes used
- Preferences, saved automatically on change:
  - Resume generation: AI model (OpenRouter), optimization level (Light polish, Smart integration, Full tailoring), Professional / Earlier Experience years, max pages, tone, notes for the AI, include phone number, include graduation year
  - PDF: style (professional, modern, classic)
- Edit the generated resume as Markdown, or toggle to a preview rendered like the PDF
- Download as PDF, named `Resume - <name> - <company>.pdf`
- Download history with the generation settings of each download, PDF re-download and Clear history; scrolls past 10 entries
- Baseline resume, Download history and Preferences panels collapse and expand

## Run

Requires Docker and a `.env` in the project root with `OPENROUTER_API_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.

- Mac/Linux: `scripts/start.sh` / `scripts/stop.sh`
- Windows: `scripts/start.ps1` / `scripts/stop.ps1`

Then open http://localhost:8000. Rerun the start script after code changes to rebuild the container.

## Test

- Backend: `cd backend && uv run pytest` (macOS needs `brew install pango`)
- Real AI call: `cd backend && uv run --env-file ../.env pytest -m integration`
- Frontend unit: `cd frontend && npm test`
- End-to-end (Docker running; uses its own throwaway container and two Clerk test users it creates if missing): `cd frontend && npm run test:e2e`
