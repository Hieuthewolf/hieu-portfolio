import {
  Environment,
  Network,
  RecordSource,
  Store,
  type FetchFunction,
} from "relay-runtime";

const HTTP_ENDPOINT =
  import.meta.env.VITE_GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const fetchFn: FetchFunction = async (request, variables) => {
  const response = await fetch(HTTP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
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
