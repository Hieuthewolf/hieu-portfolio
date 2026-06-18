/**
 * Deployed Better Auth endpoint (Vercel serverless function) — handles all
 * /api/auth/* routes (Google sign-in, callback, session, sign-out).
 *
 * Like api/graphql.ts, this imports the *compiled* ESM `dist` from
 * `packages/server`; api/package.json's `"type": "module"` keeps it ESM so the
 * require-of-ESM runtime crash can't happen.
 */
import { toNodeHandler } from "better-auth/node";
import { auth } from "../../packages/server/dist/auth.js";

export const config = { api: { bodyParser: false } };

export default toNodeHandler(auth);
