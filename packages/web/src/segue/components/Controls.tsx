import { theme } from "../theme";
import { Select } from "./Select";
import type { PlanOptions } from "../audio/types";

interface ControlsProps {
  opts: PlanOptions;
  canPlan: boolean;
  hasPlan: boolean;
  planning: boolean;
  preparing: boolean;
  isMixing: boolean;
  set: <K extends keyof PlanOptions>(k: K, v: PlanOptions[K]) => void;
  onFind: () => void;
  onPlayMix: () => void;
  onPlayTransition: () => void;
  onStop: () => void;
  onNudge: (d: number) => void;
}

const btn = (active: boolean) => ({
  fontFamily: theme.mono,
  fontSize: 12,
  border: `1px solid ${active ? theme.ink : theme.line}`,
  background: active ? theme.ink : "transparent",
  color: active ? theme.surface : theme.ink,
  borderRadius: 999,
  padding: "8px 16px",
  cursor: "pointer",
});

export function Controls({
  opts,
  canPlan,
  hasPlan,
  planning,
  preparing,
  isMixing,
  set,
  onFind,
  onPlayMix,
  onPlayTransition,
  onStop,
  onNudge,
}: ControlsProps) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        borderRadius: 14,
        padding: 18,
        display: "grid",
        gap: 16,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
        <Select
          label="Overlap"
          value={String(opts.phraseBars)}
          onChange={(v) => set("phraseBars", Number(v))}
          options={[
            { value: "8", label: "8 bars" },
            { value: "16", label: "16 bars" },
            { value: "32", label: "32 bars" },
          ]}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button onClick={() => set("beatmatch", !opts.beatmatch)} style={btn(opts.beatmatch)}>
          {opts.beatmatch ? "✓ " : ""}beatmatch
        </button>
        <button onClick={onFind} disabled={!canPlan || planning} style={{ ...btn(false), opacity: !canPlan || planning ? 0.5 : 1 }}>
          {planning ? "thinking…" : "Coach me (ask Claude)"}
        </button>
      </div>

      {hasPlan && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button onClick={onPlayMix} disabled={preparing} style={{ ...btn(isMixing), opacity: preparing ? 0.5 : 1 }}>
            {preparing ? "preparing…" : "▶ play the mix"}
          </button>
          <button onClick={onPlayTransition} disabled={preparing} style={{ ...btn(false), opacity: preparing ? 0.5 : 1 }}>
            ▶ just the transition
          </button>
          <button onClick={onStop} style={btn(false)}>
            ■ stop
          </button>
          <span style={{ width: 1, height: 22, background: theme.line }} />
          <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.muted }}>nudge A</span>
          <button onClick={() => onNudge(-1)} style={btn(false)}>
            − bar
          </button>
          <button onClick={() => onNudge(1)} style={btn(false)}>
            + bar
          </button>
        </div>
      )}
    </div>
  );
}
