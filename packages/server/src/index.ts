import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import { schema } from "./schema.js";

const yoga = createYoga({
  schema,
  // Yoga enables permissive CORS in dev; tighten this for production.
  cors: { origin: process.env.WEB_ORIGIN ?? "*" },
});

const server = createServer(yoga);
const port = Number(process.env.PORT ?? 4000);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`GraphQL ready at http://localhost:${port}/graphql`);
});
