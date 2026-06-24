import { Suspense } from "react";
import { RelayEnvironmentProvider } from "react-relay";
import { RelayEnvironment } from "./RelayEnvironment";
import { Portfolio } from "./components/Portfolio";
import { Library } from "./components/Library";
import { Setlists } from "./components/Setlists";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { App as SegueApp } from "./segue/App";
import { theme } from "./theme";

const loading = (
  <div style={{ padding: 48, fontFamily: theme.mono, color: theme.muted }}>Loading…</div>
);

export function App() {
  // Three surfaces, one SPA: a lightweight path check, no router dependency.
  // The Relay provider wraps all of them so authenticated queries/mutations work
  // on every surface (Segue's "save to library", the /library page).
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const surface = path.startsWith("/segue") ? (
    <SegueApp />
  ) : path.startsWith("/library") ? (
    <Suspense fallback={loading}>
      <Library />
    </Suspense>
  ) : path.startsWith("/setlists") ? (
    <Suspense fallback={loading}>
      <Setlists />
    </Suspense>
  ) : (
    <Suspense fallback={loading}>
      <Portfolio />
    </Suspense>
  );

  return (
    <RelayEnvironmentProvider environment={RelayEnvironment}>
      <ErrorBoundary>{surface}</ErrorBoundary>
    </RelayEnvironmentProvider>
  );
}
