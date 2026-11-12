# JobFit

Customize a baseline resume for a specific job description with AI.

## Run

Requires Docker and a `.env` in the project root with `OPENROUTER_API_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.

- Mac/Linux: `scripts/start.sh` / `scripts/stop.sh`
- Windows: `scripts/start.ps1` / `scripts/stop.ps1`

Then open http://localhost:8000

## Test

- Backend: `cd backend && uv run pytest` (macOS needs `brew install pango`)
- Real AI call: `cd backend && uv run --env-file ../.env pytest -m integration`
- Frontend unit: `cd frontend && npm test`
- End-to-end (Docker running; uses its own throwaway container and two Clerk test users it creates if missing): `cd frontend && npm run test:e2e`
