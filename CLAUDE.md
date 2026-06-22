# CLAUDE.md

Guidance for working in this repo. Read before making changes.

## What this is

A personal portfolio, built as a pnpm monorepo, with an AI "DJ coach" (Segue) living inside it.

- `packages/web` — Vite + React + TypeScript. The portfolio (data via **Relay/GraphQL**)
  **and** Segue, which lives at `src/segue/` and renders at the `/segue` route, plus a
  `/library` route (saved tracks, behind auth).
- `packages/server` — Node + GraphQL Yoga. The **single source of truth** for the schema
  (profile/projects), the Segue transition **planner** (`src/planner/`), the **database**
  (Drizzle + Neon Postgres, `src/db/`) and **auth** (Better Auth, email/password, `src/auth.ts`).
  Runs the local dev server, and the deployed functions import from it.
- `api/graphql.ts` — the **deployed** GraphQL endpoint (Vercel serverless function); a thin
  wrapper importing `packages/server`'s *compiled* `dist`. `api/auth/[...all].ts` — the
  **deployed** Better Auth handler for `/api/auth/*`, same compiled-`dist` pattern. (See
  "Deploy" — importing the `.ts` source crashes at runtime.)

Routing is a deliberate one-liner, not a router library: `web/src/App.tsx` checks
`window.location.pathname` — `/segue` → Segue, `/library` → the saved-track library,
everything else → the Relay portfolio. The Relay provider wraps all three so authenticated
queries/mutations work everywhere.

Auth + DB: the GraphQL Yoga **context** reads the Better Auth session (cookie) into
`{ user }`; track resolvers (`me`/`myTracks`/`saveTrack`/`deleteTrack`) are scoped to that
user. Tracks store metadata + lightweight analysis JSON (no audio, no waveform peaks).

## Run it

```bash
pnpm install
pnpm relay        # REQUIRED before dev/typecheck on a fresh clone (see gotchas)
pnpm dev          # server :4000, web :5173 — portfolio at /, Segue at /segue
```

For DB/auth locally: put `DATABASE_URL` (Neon — `vercel env pull` writes it to a gitignored
`.env*.local` at the repo root), plus `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:5173`,
in a local env file (see `packages/server/.env.example`). Then `pnpm --filter @portfolio/server db:migrate`.
The dev server loads those files via `src/loadEnv.ts`; the Vite dev server proxies `/api/*` →
`:4000` so the browser is same-origin (session cookies + credentialed Relay just work).

Other scripts: `pnpm typecheck`, `pnpm test` (Vitest), `pnpm lint`, `pnpm build`,
`pnpm --filter @portfolio/server db:generate` (after changing `src/db/schema.ts`).

## Gotchas (these cost real debugging time — don't undo them)

- **Relay artifacts are generated, not committed.** `packages/web/src/__generated__/` is
  gitignored (a `.gitkeep` holds the folder). After any clone or pull, run `pnpm relay`
  before `pnpm dev`/typecheck, or you'll hit `Failed to resolve "../__generated__/…"`.
  `pnpm dev` does NOT run relay automatically.
- **Vite + Relay needs `eagerEsModules`.** `packages/web/vite.config.ts` runs
  `babel-plugin-relay` with `eagerEsModules: true`. Without it the `graphql` tag compiles to
  `require(...)` and the browser throws `require is not defined`.
- **Relay config is `relay.config.json`, not `.js`.** With `"type": "module"`, a `.js` config
  trips relay-compiler's loader (`missing field language` / `__esModule`).
- **`packages/web/schema.graphql` is GENERATED, not hand-edited.** It's printed from the server
  schema by `packages/server/src/print-schema.ts` (run by `pnpm relay` and the Vercel build).
  Add/changes types in the server `typeDefs`, then `pnpm relay` — never edit the SDL directly.
- **Custom scalars need a Relay mapping.** The `JSON` scalar (saved-track analysis) is mapped
  in `relay.config.json` `customScalarTypes` → `unknown`; add new scalars there too.
- **`packages/web/tsconfig.json` relaxes two strict flags on purpose**, with comments:
  `noImplicitAny: false` (react-relay/relay-runtime v18 ship no usable types here) and
  `noUncheckedIndexedAccess: false` (the Segue DSP indexes typed arrays in hot loops).
  The rest of the repo stays strict via `tsconfig.base.json`.
- **`tsc` only runs at build/CI**, not in `pnpm dev` (Vite uses esbuild, which skips type
  checking). Run `pnpm typecheck` before pushing.

## Deploy (Vercel)

One Vercel project, importing this repo at the root.

- Web is served static (`packages/web/dist`); `api/graphql.ts` is the serverless GraphQL
  function. Build + output are set in the root `vercel.json`, which also has a SPA rewrite
  (`/((?!api/).*) → /index.html`) so `/segue` deep-links work.
- **Both functions (`api/graphql.ts`, `api/auth/[...all].ts`) import `packages/server`'s
  compiled `dist`, so `vercel.json`'s `buildCommand` builds the server first**, then runs
  `db:migrate` (committed Drizzle migrations) and `print-schema`, then the web `relay` + build.
  Import the *compiled* `dist`, never `packages/server/src/*.ts`.
- **`api/package.json` sets `"type": "module"` — don't remove it** (covers nested `api/**`).
  `packages/server` is pure ESM; without this a handler compiles to CommonJS and `require()`-ing
  the ESM `dist` throws `ERR_REQUIRE_ESM` → `FUNCTION_INVOCATION_FAILED` (HTTP 500). Local Node
  (≥22) allows require-of-ESM so it won't reproduce locally — **verify function changes on a
  Vercel preview deploy**, not on `main`, which deploys straight to production. (Caveat: the
  *auth flow itself* can't fully verify on previews — Better Auth cookies/`BETTER_AUTH_URL` are
  origin-specific and preview URLs are dynamic; verify auth locally or on prod.)
- Env vars on the project (server-side only unless `VITE_`-prefixed):
  `VITE_GRAPHQL_ENDPOINT = /api/graphql`; `DATABASE_URL`
  (Neon, **needed at build for `db:migrate` and at runtime**); `BETTER_AUTH_SECRET` (**required**
  — signs sessions; prod refuses the default); `BETTER_AUTH_URL` (the app origin, e.g.
  `https://hieu-portfolio-seven.vercel.app`); `AUTH_ALLOWED_EMAILS`
  (comma-separated allowlist that locks email/password sign-up — set it so the public deploy
  isn't open registration). Secrets never get a `VITE_` prefix (that would ship them to the browser).
- Every push to `main` auto-deploys.

## Planner design

The browser does all audio DSP + section detection and sends only numbers/labels. A
deterministic planner (`src/planner/`) picks the *strategy* (technique, sections, phrase
length, coaching) from tempo/key/structure, then resolves exact beat-aligned timestamps and
harmonic compatibility. It's currently **heuristic-only** — an LLM strategy step (which only
ever picks the judgment, never the timing) can be layered back into `index.ts`/`setIndex.ts`
later; see git history for a Gemini/AI-SDK implementation.

## Single source of truth

The schema, portfolio data, planner, DB schema, and auth config live only in `packages/server`.
The local dev server (`src/index.ts`) and the deployed functions (`api/graphql.ts`,
`api/auth/[...all].ts`) both import them — the functions from the compiled `dist`. The Yoga
`context` (`src/context.ts`) is shared by dev + serverless so the auth surface is identical.
The Relay client SDL (`packages/web/schema.graphql`) is generated from this schema. Don't
reintroduce inlined copies in the `api/*` functions.

## Conventions

- pnpm workspaces; Prettier (`semi`, double quotes, `printWidth: 100`); ESLint
  (typescript-eslint recommended). Keep new code passing `pnpm lint && pnpm typecheck`.
- The theme tokens (`theme.ts`) are shared design constants — reuse them rather than
  hardcoding colors/fonts.

### Code style

- **Keep it simple. Don't over-engineer.** Prefer the smallest change that solves the
  problem. No abstraction, config, or indirection until there's a second caller that needs it.
- **Concise comments, and only where they earn it.** Explain *why*, not *what* the code
  already says. Delete stale comments rather than letting them drift.
- Favor readability over cleverness; match the style of the surrounding file.
- **Surgical edits.** Change only what the task needs — don't refactor adjacent code or
  delete pre-existing dead code you didn't create; if you spot it, mention it rather than
  removing it.
- **Work toward a verifiable goal, then loop until it's met.** For a bug, write a failing test
  that reproduces it, then make it pass; keep the suite green before and after a refactor.
  Lean on `pnpm test`/`typecheck` as the success criteria rather than eyeballing "looks done".

### React

- Function components + hooks. Keep state as local and as low in the tree as it needs to be.
- **Keep per-frame / animation work off the React render path.** High-frequency updates
  (playhead, audio meters) drive canvas/DOM imperatively via a subscription — never 60fps
  `setState`. See `segue/hooks/useSegue.ts` + `Waveform.tsx` for the pattern.
- Reach for `useCallback`/`useMemo`/`memo` only when it fixes a real re-render or stabilizes
  a dependency — not by reflex.

### Relay

- One query per route (`useLazyLoadQuery`); components declare what they need with
  `useFragment` and spread fragments up the tree. Don't refetch what a fragment already has.
- Let the compiler-generated `__generated__` types flow through — don't hand-write or
  duplicate them. Run `pnpm relay` after changing any `graphql` tag (it also regenerates the SDL).
- The network layer (`RelayEnvironment.ts`) sends `credentials: "include"` so the auth cookie
  rides along; mutations use `useMutation`. (Segue's planner still uses raw `fetch`, not Relay.)

### Working autonomously

- This is a personal repo and the owner runs with permission prompts bypassed
  (`--dangerously-skip-permissions`). Don't stop to confirm routine edits, installs, or
  local commands — just finish the task and report what you did.
- Still branch/confirm before **outward-facing or hard-to-reverse** actions (pushing,
  deploying, deleting) unless explicitly told to go ahead.
- **Autonomy isn't license to guess.** On genuine ambiguity or a likely-wrong assumption,
  surface it or ask — don't silently pick an interpretation and run. If a simpler approach
  exists than what was asked, say so before building the complex one.
