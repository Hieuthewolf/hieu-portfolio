/**
 * Deployed GraphQL endpoint (Vercel serverless function).
 *
 * This is just the serverless wrapper. The schema, portfolio data, and Segue
 * planner are the single source of truth in `packages/server` — imported here
 * and bundled into the function by Vercel's Node runtime (esbuild). Earlier this
 * file inlined a copy of all of it; that copy had already drifted from the
 * server, which is exactly what this avoids.
 */
import { createYoga } from "graphql-yoga";
import { schema } from "../packages/server/src/schema.js";

export const config = { api: { bodyParser: false } };

export default createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  cors: { origin: "*" },
});
