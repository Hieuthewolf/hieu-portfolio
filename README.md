# Hieu Nguyen — Portfolio

Personal portfolio and an excuse to show how I structure a real codebase. Profile and
project data are served over **GraphQL** and consumed in **React** through **Relay**
with colocated fragments — each component declares exactly the data it needs.

## Stack

| Layer    | Choice                              | Why |
|----------|-------------------------------------|-----|
| Frontend | React + TypeScript (Vite)           | Fast, typed, standard. |
| Data     | Relay + GraphQL                     | Colocated fragments; data needs live next to the component. |
| Backend  | Node + GraphQL Yoga                 | Tiny, spec-compliant GraphQL server. |
| Tooling  | pnpm workspaces, ESLint, Prettier, Vitest | Monorepo with one command to verify everything. |

## Packages

- `packages/web` — the portfolio site (React + Relay).
- `packages/server` — the GraphQL server, plus the Segue transition planner.
- Segue (the AI DJ coach) lives inside the web app at `/segue`, sharing the same
  GraphQL endpoint and deploy.

## Run locally

Requires Node 20+ and pnpm 9+.

```bash
pnpm install
cp packages/web/.env.example packages/web/.env
cp packages/segue/.env.example packages/segue/.env   # optional
pnpm relay        # generate Relay artifacts (run once before first typecheck)
pnpm dev          # server :4000, web :5173 (portfolio at /, Segue at /segue)
```

Open http://localhost:5173 for the portfolio; Segue is at http://localhost:5173/segue.
Set `ANTHROPIC_API_KEY` in the environment to enable the LLM planner; without it,
Segue falls back to a deterministic heuristic.

## Scripts

| Command          | Does |
|------------------|------|
| `pnpm dev`       | Run all packages in parallel. |
| `pnpm relay`     | Regenerate Relay typed artifacts. |
| `pnpm lint`      | ESLint across the workspace. |
| `pnpm typecheck` | Relay compile + `tsc --noEmit` per package. |
| `pnpm test`      | Vitest across packages. |
| `pnpm build`     | Production build of every package. |
