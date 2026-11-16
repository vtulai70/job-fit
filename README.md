# JobFit

Customize a baseline resume for a specific job description with AI.

## Features

- Sign in with Clerk; each user sees only their own data
- Subscription plans with Clerk Billing: Free (5 resumes a month), Basic (50, PDF download), Pro (200, PDF download, premium models, Pro mode); usage and a Plans button in the title bar
- Upload a baseline resume (.md or .txt) and paste a job description
- Chat with the AI in a sidebar; it may ask clarifying questions before generating. Before each prompt the chat shows the model, optimization level, tone and notes used
- Pro mode: 2 to 4 models write the resume in parallel and the AI model judges and ranks them (score, strengths, weaknesses, rule violations); pick any candidate to edit and download
- Preferences, saved automatically on change: AI model (OpenRouter), Pro mode (Pro models; the AI model judges), optimization level (Light polish, Smart integration, Full tailoring), Professional / Earlier Experience years, max pages, tone, notes for the AI, include phone number, include graduation year, include volunteering (only when the job mentions it or work-life balance)
- Edit the generated resume as Markdown, or toggle to a preview rendered like the PDF; the PDF style (professional, modern, classic) is picked in the resume header and saved
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
