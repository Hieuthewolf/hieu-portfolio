import "./loadEnv.js"; // must run before modules that read process.env at import
import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import { toNodeHandler } from "better-auth/node";
import { schema } from "./schema.js";
import { auth } from "./auth.js";
import { createContext } from "./context.js";

// Same paths as production (api/graphql.ts + api/auth/[...all].ts) so the Vite
// dev proxy can forward /api/* here and the browser stays same-origin.
const yoga = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  context: ({ request }) => createContext(request),
  cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true },
});

const authHandler = toNodeHandler(auth);

const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/auth")) {
    void authHandler(req, res);
    return;
  }
  void yoga(req, res);
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`GraphQL ready at http://localhost:${port}/api/graphql`);
});
