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
- `components/Workspace.tsx` - owns user data and chat state (including the edited custom resume and the `model` that generated it, from the `/api/generate` response; a new AI resume replaces both); loads baseline, history and preferences on mount, saves through `lib/api.ts` (preference changes are saved one after another in a promise chain, and each chat turn awaits it so the backend reads the latest preferences), sends chat turns to `/api/generate` (history kept client-side). Before each turn it adds an `info` chat entry "Model: <saved model>"; `info` entries are filtered out of the history sent to the AI
- `components/` panels take props only: `ResumePanel` (upload .md/.txt), `JobDescription` (pasted text), `CustomResume` (Markdown / Preview toggle, `aria-pressed` buttons: editable textarea, or the backend HTML in a sandboxed iframe titled "Custom resume preview", re-rendered when the text or PDF style changes; Download PDF sends the edited text), `HistoryPanel` (company, time, generating model when recorded, re-download links; "Clear history" header button, only with entries, confirms with `window.confirm` then calls `onClear`; above `MAX_VISIBLE` (10) entries the list's max height is set in a layout effect to the measured bottom of the 10th row, since rows can wrap, and it scrolls), `PreferencesPanel` (two fieldsets: "Resume generation" with AI model, Professional/Earlier Experience years, max pages, tone, notes, include phone and include graduation year checkboxes; then "PDF" with style; no Save button, every change calls `onChange`), `ChatSidebar` (conversation, Generate button, message box; buttons disabled until preferences load); plus `Header`, `HealthIndicator`
- `lib/api.ts` - typed data calls, `MODELS` (selectable models, default first; keep in sync with `Model` in `backend/app/ai.py`), `ChatEntry` (chat message or `info` note), `generate`, `pdfUrl`, `previewHtml`, `downloadCustomResume` (records history including the generating model, then downloads), `clearHistory` (`DELETE /api/history`, 204 so it bypasses the JSON `request` helper)
- `tests/` - Vitest unit tests (`*.test.{ts,tsx}`), `setup.ts`, `fetchMock.ts` (stub fetch by "METHOD /path"; status 204 returns no body)
- `e2e/` - Playwright tests (`*.spec.ts`); `global.setup.ts` runs `clerkSetup()` and creates the two Clerk test users if missing; `helpers.ts` (`signIn`/`signOut` via `@clerk/testing`, `ALICE`, `BOB`); `generate.spec.ts` mocks `/api/generate` with `page.route` (no AI cost); `preferences-live.spec.ts` is the one test that calls the real AI (about 15-60 s) to prove saved preferences (phone, experience windows) reach the model

## Rules

- Static export only: no server actions, no API routes, no SSR-only features
- All data comes from the backend via same-origin `/api/*` calls; Clerk's `__session` cookie authenticates them (no Authorization header needed)
- Use `@clerk/react`, not `@clerk/nextjs` (which needs a Next.js server). Core 3 replaced `SignedIn`/`SignedOut` with `<Show when=...>`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is inlined at build time (Docker build arg from `.env`); unit tests mock `@clerk/react`
- Clerk components are themed via `appearance.variables` in `App.tsx`. On this dark theme `colorNeutral` must be light (`#F1F5F9`): Clerk defaults it to black and derives menu item text, borders and hovers from it, which made the account menu unreadable. `e2e/account-menu.spec.ts` guards this with a WCAG contrast check (>= 4.5)
- Use Tailwind theme tokens, not raw hex: `canvas` `#090D16`, `surface` `#111827`, `line` `#1E293B`, `primary` `#38BDF8`, `accent` `#F59E0B`, `ink` `#F1F5F9`
- Keep components small and simple; no emojis
- In unit tests, stub `fetch` with `vi.stubGlobal`; globals and `vi.spyOn` spies are restored after each test in `tests/setup.ts`. jsdom has no layout, so layout (e.g. the history scroll cap) is checked in e2e

## Commands

- `npm run dev` - local dev server (API calls need the backend running)
- `npm run build` - static export to `out/`
- `npm test` - unit tests
- `npm run test:e2e` - e2e tests; Playwright builds the image and runs a throwaway `jobfit-e2e` container on port 8001 (empty db, never touches `data/`), one worker since tests share the single user
- `npm run lint`
