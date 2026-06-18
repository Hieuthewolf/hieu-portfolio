/**
 * Better Auth: email/password sign-in with sessions stored in our own Postgres
 * (via the Drizzle adapter). The handler is mounted at /api/auth/* by both the dev
 * server and the serverless function; resolvers read the session through the Yoga
 * context. (Google / other social providers can be added here later.)
 */
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "./db/index.js";

// The deployed app is public, so email/password sign-up is open to anyone unless
// AUTH_ALLOWED_EMAILS is set. Set it (comma-separated) to lock registration to
// yourself: AUTH_ALLOWED_EMAILS="you@example.com".
const allowlist = (process.env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (allowlist.length && !allowlist.includes(user.email.toLowerCase())) {
            throw new APIError("FORBIDDEN", { message: "Sign-ups are restricted." });
          }
          return { data: user };
        },
      },
    },
  },
});

export type SessionUser = (typeof auth.$Infer.Session)["user"];
