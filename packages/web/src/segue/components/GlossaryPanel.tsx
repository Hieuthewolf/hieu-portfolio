import { theme } from "../theme";
import { GLOSSARY } from "../glossary";

export function GlossaryPanel() {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        borderRadius: 14,
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          fontFamily: theme.mono,
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: theme.muted,
          marginBottom: 12,
        }}
      >
        Plain-English glossary
      </div>
      <dl style={{ margin: 0, display: "grid", gap: 10 }}>
        {GLOSSARY.map(([term, def]) => (
          <div key={term}>
            <dt
              style={{
                fontFamily: theme.sans,
                fontSize: 13.5,
                fontWeight: 600,
                color: theme.ink,
              }}
            >
              {term}
            </dt>
            <dd
              style={{
                margin: "2px 0 0",
                fontFamily: theme.sans,
                fontSize: 13.5,
                lineHeight: 1.5,
                color: theme.muted,
              }}
            >
              {def}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
