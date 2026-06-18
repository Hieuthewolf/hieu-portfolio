/**
 * Drizzle client over Neon's serverless HTTP driver — safe to use from
 * short-lived Vercel functions (no pooled connections to manage). `neon()` is
 * lazy, so importing this module never opens a connection.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

// A well-formed placeholder lets tooling/tests/build import this module without a
// live DB (neon() validates the URL *format* at construction but only connects per
// query over HTTP, so real queries still need a real DATABASE_URL at runtime).
const PLACEHOLDER = "postgresql://user:password@localhost/db";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn("DATABASE_URL is not set — database queries will fail until it is.");
}

export const db = drizzle(neon(connectionString ?? PLACEHOLDER), { schema });
export { schema };
