import { theme } from "../theme";
import { fmt } from "../utils/format";
import type { AudioFeatures, TransitionPlan } from "../audio/types";

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "#0F8A5F",
  moderate: "#B8862F",
  tricky: "#B5532F",
};

interface CoachPanelProps {
  plan: TransitionPlan;
  a: AudioFeatures;
  b: AudioFeatures;
  activeStep: number;
}

export function CoachPanel({ plan, a, b, activeStep }: CoachPanelProps) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        borderRadius: 14,
        padding: 22,
        display: "grid",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <h2 style={{ margin: 0, fontFamily: theme.serif, fontSize: 24, fontWeight: 600, color: theme.ink }}>
          {plan.technique}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontFamily: theme.mono,
              fontSize: 10.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: theme.surface,
              background: DIFFICULTY_COLOR[plan.difficulty] ?? theme.muted,
              borderRadius: 999,
              padding: "3px 10px",
            }}
          >
            {plan.difficulty}
          </span>
          <span style={{ fontFamily: theme.mono, fontSize: 10.5, color: theme.muted }}>
            {plan.source === "llm" ? "via Claude" : "offline"}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 18px",
          fontFamily: theme.mono,
          fontSize: 12,
          color: theme.muted,
        }}
      >
        <span>
          A→B at <strong style={{ color: theme.ink }}>{fmt(plan.mixStartA)}</strong> · B in at{" "}
          <strong style={{ color: theme.ink }}>{fmt(plan.mixStartB)}</strong>
        </span>
        <span>
          {plan.phraseBars} bars · {fmt(plan.transLen)}
        </span>
        <span>
          {a.camelot ?? "?"} → {b.camelot ?? "?"}{" "}
          <strong style={{ color: plan.compatible ? theme.accent : "#B5532F" }}>
            {plan.compatible ? "harmonic" : "clashy"}
          </strong>
        </span>
        {plan.warp !== 1 && <span>warp ×{plan.warp.toFixed(3)}</span>}
      </div>

      <p style={{ margin: 0, fontFamily: theme.serif, fontSize: 17, lineHeight: 1.55, color: theme.ink }}>
        {plan.rationale}
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {plan.playbook.map((step, i) => {
          const active = i === activeStep;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "10px 12px",
                borderRadius: 10,
                background: active ? "rgba(15,138,95,0.10)" : "transparent",
                border: `1px solid ${active ? theme.accent : "transparent"}`,
                transition: "background 120ms, border-color 120ms",
              }}
            >
              <span
                style={{
                  fontFamily: theme.mono,
                  fontSize: 11,
                  color: theme.surface,
                  background: active ? theme.accent : theme.muted,
                  borderRadius: 999,
                  minWidth: 22,
                  height: 22,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ fontFamily: theme.mono, fontSize: 10.5, color: theme.muted }}>
                  bar {step.atBar}
                </span>
                <span style={{ fontFamily: theme.sans, fontSize: 14.5, lineHeight: 1.5, color: theme.ink }}>
                  {step.action}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          fontFamily: theme.sans,
          fontSize: 14,
          lineHeight: 1.55,
          color: theme.ink,
          background: theme.bg,
          border: `1px solid ${theme.line}`,
          borderRadius: 10,
          padding: "12px 14px",
        }}
      >
        <span style={{ fontFamily: theme.mono, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.muted }}>
          Watch out
        </span>
        <div style={{ marginTop: 4 }}>{plan.coachNote}</div>
      </div>
    </div>
  );
}
