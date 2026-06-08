import { theme } from "../theme";
import type { SetGap } from "../audio/types";

interface TransitionGapProps {
  gap: SetGap;
  tip?: string;
  onClick: () => void;
}

/** The connector between two tracks in the set — a clickable transition summary. */
export function TransitionGap({ gap, tip, onClick }: TransitionGapProps) {
  return (
    <div style={{ display: "grid", gap: 2, margin: "2px 0 2px 28px" }}>
      <button
        onClick={onClick}
        title="Rehearse this transition in the coach"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "4px 12px",
          padding: "5px 12px",
          background: "transparent",
          border: `1px dashed ${gap.risk ? "#E0B8AC" : theme.line}`,
          borderRadius: 999,
          cursor: "pointer",
          fontFamily: theme.mono,
          fontSize: 11,
          color: theme.muted,
          textAlign: "left",
        }}
      >
        <span style={{ color: theme.ink }}>↳ {gap.technique}</span>
        <span>Δ{(gap.bpmDiff * 100).toFixed(1)}% BPM</span>
        <span style={{ color: gap.compatible ? theme.accent : "#B5532F" }}>
          {gap.compatible ? "key ✓" : "key ✕"}
        </span>
        {gap.risk && (
          <span
            style={{
              color: theme.surface,
              background: "#B5532F",
              borderRadius: 999,
              padding: "1px 8px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            risky
          </span>
        )}
        <span style={{ marginLeft: "auto", opacity: 0.7 }}>rehearse →</span>
      </button>
      {gap.risk && tip && (
        <div
          style={{
            fontFamily: theme.sans,
            fontSize: 12,
            lineHeight: 1.5,
            color: theme.muted,
            padding: "0 12px",
          }}
        >
          {tip}
        </div>
      )}
    </div>
  );
}
