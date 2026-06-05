import { theme } from "../theme";
import type { MixState } from "../audio/engine";

export function MixerStrip({ mix }: { mix: MixState | null }) {
  const progress = mix && mix.phase !== "runup" ? mix.progress : 0;
  const live = !!mix && mix.phase === "blend";

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        borderRadius: 14,
        padding: "14px 18px",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: theme.mono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.muted }}>
          Crossfade
        </span>
        <span style={{ fontFamily: theme.mono, fontSize: 11, color: live ? theme.accent : theme.muted }}>
          {mix?.phase === "runup" ? "run-up…" : mix ? `bar ${Math.max(0, mix.bar)}` : "—"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: theme.serif, fontWeight: 600, color: theme.ink }}>A</span>
        <div style={{ flex: 1, height: 8, background: theme.line, borderRadius: 999, position: "relative", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${progress * 100}%`,
              background: theme.accent,
              transition: "width 80ms linear",
            }}
          />
        </div>
        <span style={{ fontFamily: theme.serif, fontWeight: 600, color: theme.accent }}>B</span>
      </div>
    </div>
  );
}
