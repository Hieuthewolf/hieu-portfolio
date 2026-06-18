import { useState } from "react";
import { theme } from "../theme";
import { signIn, signUp } from "../authClient";

const input = {
  fontFamily: theme.sans,
  fontSize: 14,
  border: `1px solid ${theme.line}`,
  background: theme.bg,
  color: theme.ink,
  borderRadius: 8,
  padding: "9px 12px",
  width: "100%",
  boxSizing: "border-box" as const,
};

/** Compact email/password sign-in / sign-up. Reloads on success so Relay refetches. */
export function AuthForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res =
      mode === "in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: name || email.split("@")[0] });
    setBusy(false);
    if (res.error) setError(res.error.message ?? "Something went wrong");
    else window.location.reload();
  };

  return (
    <div style={{ maxWidth: 320, display: "grid", gap: 10 }}>
      {mode === "up" && (
        <input style={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      )}
      <input
        style={input}
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        style={input}
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
      />
      {error && <div style={{ fontFamily: theme.mono, fontSize: 12, color: "#B5532F" }}>{error}</div>}
      <button
        onClick={() => void submit()}
        disabled={busy || !email || !password}
        style={{
          fontFamily: theme.mono,
          fontSize: 13,
          border: `1px solid ${theme.ink}`,
          background: theme.ink,
          color: theme.surface,
          borderRadius: 999,
          padding: "9px 18px",
          cursor: "pointer",
          opacity: busy || !email || !password ? 0.5 : 1,
        }}
      >
        {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
      </button>
      <button
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setError(null);
        }}
        style={{
          fontFamily: theme.mono,
          fontSize: 12,
          color: theme.muted,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          justifySelf: "start",
          padding: 0,
        }}
      >
        {mode === "in" ? "Need an account? Create one" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
