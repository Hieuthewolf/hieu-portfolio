/**
 * Dev/self-host only: load env from the usual local files so `pnpm dev` and
 * `pnpm start` pick up DATABASE_URL / BETTER_AUTH_SECRET etc. `vercel env pull`
 * writes .env*.local at the repo root. Imported first by src/index.ts; the Vercel
 * functions never load this (they get env from the platform). Real process.env
 * always wins (override: false).
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

for (const rel of [
  "../../../.env.development.local",
  "../../../.env.local",
  "../../../.env",
  "../.env",
]) {
  config({ path: fileURLToPath(new URL(rel, import.meta.url)), override: false });
}
