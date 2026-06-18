/**
 * Generate the Relay SDL (packages/web/schema.graphql) from the server schema,
 * so the client's schema can never drift from the server's single source of truth.
 * Run via `pnpm --filter @portfolio/server print-schema` (wired into the build).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lexicographicSortSchema, printSchema } from "graphql";
import { schema } from "./schema.js";

const out = fileURLToPath(new URL("../../web/schema.graphql", import.meta.url));
writeFileSync(out, printSchema(lexicographicSortSchema(schema)) + "\n");
console.log(`Wrote ${out}`);
