/**
 * Deployed GraphQL endpoint (Vercel serverless function).
 *
 * Thin serverless wrapper. The schema, portfolio data, Segue planner, and auth
 * context are the single source of truth in `packages/server` — this imports the
 * *compiled* output (`dist`, real .js), which `vercel.json`'s buildCommand builds
 * before the function is bundled.
 *
 * `api/package.json` sets `"type": "module"` so Vercel compiles this handler as
 * ESM. That's load-bearing: `packages/server` is pure ESM, so a CommonJS handler
 * `require()`-ing its `dist` throws ERR_REQUIRE_ESM at runtime (FUNCTION_INVOCATION_FAILED).
 */
import { createYoga } from "graphql-yoga";
import { schema } from "../packages/server/dist/schema.js";
import { createContext } from "../packages/server/dist/context.js";

export const config = { api: { bodyParser: false } };

export default createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  context: ({ request }) => createContext(request),
  // The SPA and this function are same-origin in prod, so no cross-origin access
  // is needed. Restrict to the app origin (with credentials) rather than "*".
  cors: { origin: process.env.BETTER_AUTH_URL ?? false, credentials: true },
});
