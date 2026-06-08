/**
 * Deployed GraphQL endpoint (Vercel serverless function).
 *
 * Thin serverless wrapper. The schema, portfolio data, and Segue planner are the
 * single source of truth in `packages/server` — this imports the *compiled*
 * output (`dist`, real .js), which `vercel.json`'s buildCommand builds before the
 * function is bundled. Importing the .ts source instead crashes at runtime:
 * Vercel doesn't compile cross-package TypeScript for a function.
 */
import { createYoga } from "graphql-yoga";
import { schema } from "../packages/server/dist/schema.js";

export const config = { api: { bodyParser: false } };

export default createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  cors: { origin: "*" },
});
