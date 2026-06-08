/**
 * Deployed GraphQL endpoint (Vercel serverless function).
 *
 * Thin serverless wrapper. The schema, portfolio data, and Segue planner are the
 * single source of truth in `packages/server` — this imports the *compiled*
 * output (`dist`, real .js), which `vercel.json`'s buildCommand builds before the
 * function is bundled.
 *
 * `api/package.json` sets `"type": "module"` so Vercel compiles this handler as
 * ESM. That's load-bearing: `packages/server` is pure ESM, so a CommonJS handler
 * `require()`-ing its `dist` throws ERR_REQUIRE_ESM at runtime (FUNCTION_INVOCATION_FAILED).
 */
import { createYoga } from "graphql-yoga";
import { schema } from "../packages/server/dist/schema.js";

export const config = { api: { bodyParser: false } };

export default createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  cors: { origin: "*" },
});
