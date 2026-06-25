import { theme } from "../theme";
import { fmt } from "../utils/format";
import { suggestFix } from "../audio/fix";
import { TransitionGap } from "./TransitionGap";
import { SaveTrackButton } from "./SaveTrackButton";
import type { SetGap, Track } from "../audio/types";

interface TrackListProps {
  items: Track[]; // in display order
  roleById: Record<string, string>;
  gaps: SetGap[] | null; // gaps[i] sits between items[i] and items[i+1]
  introId?: string | null;
  outroId?: string | null;
  canReorder: boolean;
  playingIndex?: number | null;
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onPinIntro: (id: string) => void;
  onPinOutro: (id: string) => void;
  onGapClick: (index: number) => void;
}

const chip = (active: boolean) => ({
  fontFamily: theme.mono,
  fontSize: 10.5,
  border: `1px solid ${active ? theme.accent : theme.line}`,
  background: active ? theme.accent : "transparent",
  color: active ? theme.surface : theme.muted,
  borderRadius: 999,
  padding: "3px 9px",
  cursor: "pointer",
});

const iconBtn = {
  fontFamily: theme.mono,
  fontSize: 12,
  border: `1px solid ${theme.line}`,
  background: "transparent",
  color: theme.ink,
  borderRadius: 7,
  padding: "3px 8px",
  cursor: "pointer",
};

export function TrackList({
  items,
  roleById,
  gaps,
  introId,
  outroId,
  canReorder,
  playingIndex,
  onReorder,
  onRemove,
  onPinIntro,
  onPinOutro,
  onGapClick,
}: TrackListProps) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {items.map((t, i) => {
        const f = t.features;
        const role = roleById[t.id];
        const isPlaying = playingIndex === i;
        return (
          <div key={t.id}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: isPlaying ? "rgba(15,138,95,0.10)" : theme.surface,
                border: `1px solid ${isPlaying ? theme.accent : theme.line}`,
                borderRadius: 12,
                padding: "10px 14px",
                transition: "background 120ms, border-color 120ms",
              }}
            >
              <span
                style={{
                  fontFamily: theme.serif,
                  fontSize: 16,
                  fontWeight: 600,
                  color: theme.accent,
                  minWidth: 20,
                  textAlign: "center",
                }}
              >
                {i + 1}
              </span>
              <div style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: theme.sans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.ink,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={t.name}
                >
                  {t.name}
                </span>
                <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.muted }}>
                  {f.bpm} BPM · {f.camelot ?? "?"} · {fmt(f.duration)}
                  {role ? ` · ${role}` : ""}
                </span>
              </div>

              <button
                style={chip(introId === t.id)}
                onClick={() => onPinIntro(t.id)}
                title="Pin as the set's first track"
              >
                intro
              </button>
              <button
                style={chip(outroId === t.id)}
                onClick={() => onPinOutro(t.id)}
                title="Pin as the set's last track"
              >
                outro
              </button>

              {canReorder && (
                <>
                  <button
                    style={iconBtn}
                    disabled={i === 0}
                    onClick={() => onReorder(i, i - 1)}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    style={iconBtn}
                    disabled={i === items.length - 1}
                    onClick={() => onReorder(i, i + 1)}
                    title="Move down"
                  >
                    ↓
                  </button>
                </>
              )}
              <SaveTrackButton track={t} />
              <button
                style={{ ...iconBtn, color: theme.muted }}
                onClick={() => onRemove(t.id)}
                title="Remove"
              >
                ✕
              </button>
            </div>

            {gaps && i < gaps.length && (
              <TransitionGap
                gap={gaps[i]!}
                tip={
                  suggestFix(
                    t.features.camelot,
                    items[i + 1]!.features.camelot,
                    gaps[i]!.bpmDiff,
                    gaps[i]!.compatible,
                  ).tip
                }
                onClick={() => onGapClick(i)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
