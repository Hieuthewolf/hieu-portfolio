/**
 * GraphQL request context. Reads the Better Auth session from the request cookies
 * so resolvers can authorize against the signed-in user. Shared by the dev server
 * (src/index.ts) and the serverless function (api/graphql.ts) so the auth surface
 * is identical in both.
 */
import { auth, type SessionUser } from "./auth.js";

export interface GraphQLContext {
  user: SessionUser | null;
}

export async function createContext(request: Request): Promise<GraphQLContext> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return { user: session?.user ?? null };
  } catch {
    // Never let a session lookup (e.g. a DB hiccup) take down public queries —
    // degrade to anonymous; authed resolvers will just return Unauthorized.
    return { user: null };
  }
}
