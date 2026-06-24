import { theme } from "../theme";
import { signOut, useSession } from "../authClient";

const pill = {
  fontFamily: theme.mono,
  fontSize: 12,
  border: `1px solid ${theme.line}`,
  background: "transparent",
  color: theme.ink,
  borderRadius: 999,
  padding: "6px 14px",
  cursor: "pointer",
  textDecoration: "none",
};

export function AccountMenu() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;

  if (!session) {
    return (
      <a href="/library" style={pill}>
        Sign in
      </a>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <a href="/library" style={pill}>
        Library
      </a>
      {session.user.image ? (
        <img
          src={session.user.image}
          alt=""
          width={24}
          height={24}
          style={{ borderRadius: 999, display: "block" }}
        />
      ) : null}
      <span style={{ fontFamily: theme.mono, fontSize: 12, color: theme.muted }}>
        {session.user.name}
      </span>
      <button onClick={() => void signOut()} style={pill}>
        Sign out
      </button>
    </div>
  );
}
