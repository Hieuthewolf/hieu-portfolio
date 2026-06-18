import {
  Environment,
  Network,
  RecordSource,
  Store,
  type FetchFunction,
} from "relay-runtime";

const HTTP_ENDPOINT = import.meta.env.VITE_GRAPHQL_ENDPOINT ?? "/api/graphql";

const fetchFn: FetchFunction = async (request, variables) => {
  const response = await fetch(HTTP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    // Send the Better Auth session cookie so authenticated queries/mutations work.
    credentials: "include",
    body: JSON.stringify({ query: request.text, variables }),
  });
  return await response.json();
};

export function createRelayEnvironment(): Environment {
  return new Environment({
    network: Network.create(fetchFn),
    store: new Store(new RecordSource()),
  });
}

export const RelayEnvironment = createRelayEnvironment();
