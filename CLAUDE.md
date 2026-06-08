# CLAUDE.md

Guidance for working in this repo. Read before making changes.

## What this is

A personal portfolio, built as a pnpm monorepo, with an AI "DJ coach" (Segue) living inside it.

- `packages/web` — Vite + React + TypeScript. The portfolio (data via **Relay/GraphQL**)
  **and** Segue, which lives at `src/segue/` and renders at the `/segue` route.
- `packages/server` — Node + GraphQL Yoga. The **single source of truth** for the schema
  (profile/projects) and the Segue transition **planner** (`src/planner/`). Runs the local
  dev server, and the deployed function imports from it.
- `api/graphql.ts` — the **deployed** GraphQL endpoint as a Vercel serverless function. A
  thin wrapper that imports the schema from `packages/server`'s *compiled* output
  (`dist/schema.js`). (See "Deploy" — importing the `.ts` source crashes at runtime.)

Routing is a deliberate one-liner, not a router library: `web/src/App.tsx` checks
`window.location.pathname` — `/segue` renders the Segue app, everything else renders the
Relay portfolio.

## Run it

```bash
pnpm install
pnpm relay        # REQUIRED before dev/typecheck on a fresh clone (see gotchas)
pnpm dev          # server :4000, web :5173 — portfolio at /, Segue at /segue
```

Other scripts: `pnpm typecheck`, `pnpm test` (Vitest), `pnpm lint`, `pnpm build`.

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
- **The function imports `packages/server`'s compiled `dist`, so `vercel.json`'s
  `buildCommand` builds the server first** (`pnpm --filter @portfolio/server build`) before
  the web build. Import the *compiled* `dist`, never `packages/server/src/*.ts`.
- **`api/package.json` sets `"type": "module"` — don't remove it.** `packages/server` is pure
  ESM; without this the handler compiles to CommonJS and `require()`-ing the ESM `dist` throws
  `ERR_REQUIRE_ESM` → `FUNCTION_INVOCATION_FAILED` (HTTP 500). Local Node (≥22) allows
  require-of-ESM so it won't reproduce locally — **verify function changes on a Vercel preview
  deploy** (`vercel build && vercel deploy --prebuilt`, then curl the preview URL), not on
  `main`, which deploys straight to production.
- Env vars on the project: `VITE_GRAPHQL_ENDPOINT = /api/graphql`, and
  `ANTHROPIC_API_KEY = sk-ant-…` (server-side only). **Without the key the planner falls back
  to a deterministic heuristic** — the app never breaks.
- Every push to `main` auto-deploys.

## Planner design

The browser does all audio DSP + section detection and sends only numbers/labels. The LLM
(Claude, tool use) picks a *strategy* (technique, sections, phrase length, coaching). Then
deterministic code resolves exact beat-aligned timestamps and computes harmonic compatibility
— never trusting those to the model. The API key lives only on the server.

## Single source of truth

The schema, portfolio data, and planner live only in `packages/server`. The local dev server
(`src/index.ts`) and the deployed function (`api/graphql.ts`) both import them — the function
from the compiled `dist`. Don't reintroduce an inlined copy in `api/graphql.ts`.

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
  duplicate them. Run `pnpm relay` after changing any `graphql` tag.

### Working autonomously

- This is a personal repo and the owner runs with permission prompts bypassed
  (`--dangerously-skip-permissions`). Don't stop to confirm routine edits, installs, or
  local commands — just finish the task and report what you did.
- Still branch/confirm before **outward-facing or hard-to-reverse** actions (pushing,
  deploying, deleting) unless explicitly told to go ahead.
- **Autonomy isn't license to guess.** On genuine ambiguity or a likely-wrong assumption,
  surface it or ask — don't silently pick an interpretation and run. If a simpler approach
  exists than what was asked, say so before building the complex one.
