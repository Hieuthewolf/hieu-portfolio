import { Suspense } from "react";
import { RelayEnvironmentProvider } from "react-relay";
import { RelayEnvironment } from "./RelayEnvironment";
import { Portfolio } from "./components/Portfolio";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { App as SegueApp } from "./segue/App";
import { theme } from "./theme";

export function App() {
  // Two surfaces, one SPA: a lightweight path check, no router dependency.
  // "/segue" → the AI DJ coach; everything else → the Relay portfolio.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/segue")) {
    return <SegueApp />;
  }

  return (
    <RelayEnvironmentProvider environment={RelayEnvironment}>
      <ErrorBoundary>
        <Suspense
          fallback={
            <div style={{ padding: 48, fontFamily: theme.mono, color: theme.muted }}>
              Loading…
            </div>
          }
        >
          <Portfolio />
        </Suspense>
      </ErrorBoundary>
    </RelayEnvironmentProvider>
  );
}
