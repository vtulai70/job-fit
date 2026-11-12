# JobFit Frontend

NextJS app built as a static export (`out/`) and served by the FastAPI backend at `/`.
The Dockerfile builds it and copies `out/` into the backend `static/` directory.
Read `AGENTS.md` first: this NextJS version differs from older training data; its docs are in `node_modules/next/dist/docs/`.

## Stack

- NextJS 16 (App Router, `output: "export"`), React 19, TypeScript, Tailwind CSS 4 (via `@tailwindcss/turbopack`, no PostCSS config)
- Vitest + React Testing Library (jsdom) for unit tests
- Playwright for end-to-end tests against a throwaway container (`http://localhost:8001`)

## Layout

- `app/` - root layout, `page.tsx` (home), `globals.css` (theme tokens)
- `app/page.tsx` renders the client `App`: `ClerkProvider` (`@clerk/react`, Core 3) with `<Show when="signed-out">` -> `<SignIn routing="hash">`, `<Show when="signed-in">` -> `Header` (`UserButton`) + `Workspace`
- `components/Workspace.tsx` - owns user data and chat state; loads baseline, history and preferences on mount, saves through `lib/api.ts`, sends chat turns to `/api/generate` (history kept client-side)
- `components/` panels take props only: `ResumePanel` (upload .md/.txt), `JobDescription` (pasted text), `CustomResume` (+ Download PDF), `HistoryPanel` (re-download links), `PreferencesPanel`, `ChatSidebar` (conversation, Generate button, message box); plus `Header`, `HealthIndicator`
- `lib/api.ts` - typed data calls, `generate`, `pdfUrl`, `downloadCustomResume` (records history, then downloads)
- `tests/` - Vitest unit tests (`*.test.{ts,tsx}`), `setup.ts`, `fetchMock.ts` (stub fetch by "METHOD /path")
- `e2e/` - Playwright tests (`*.spec.ts`); `global.setup.ts` runs `clerkSetup()` and creates the two Clerk test users if missing; `helpers.ts` (`signIn`/`signOut` via `@clerk/testing`, `ALICE`, `BOB`); `generate.spec.ts` mocks `/api/generate` with `page.route` (no AI cost)

## Rules

- Static export only: no server actions, no API routes, no SSR-only features
- All data comes from the backend via same-origin `/api/*` calls; Clerk's `__session` cookie authenticates them (no Authorization header needed)
- Use `@clerk/react`, not `@clerk/nextjs` (which needs a Next.js server). Core 3 replaced `SignedIn`/`SignedOut` with `<Show when=...>`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is inlined at build time (Docker build arg from `.env`); unit tests mock `@clerk/react`
- Use Tailwind theme tokens, not raw hex: `canvas` `#090D16`, `surface` `#111827`, `line` `#1E293B`, `primary` `#38BDF8`, `accent` `#F59E0B`, `ink` `#F1F5F9`
- Keep components small and simple; no emojis
- In unit tests, stub `fetch` with `vi.stubGlobal` (auto-restored in `tests/setup.ts`)

## Commands

- `npm run dev` - local dev server (API calls need the backend running)
- `npm run build` - static export to `out/`
- `npm test` - unit tests
- `npm run test:e2e` - e2e tests; Playwright builds the image and runs a throwaway `jobfit-e2e` container on port 8001 (empty db, never touches `data/`), one worker since tests share the single user
- `npm run lint`
