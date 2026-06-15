import { useEffect, useRef } from "react";
import { theme } from "../theme";
import { eqBands, type DeckBands, type PlayUpdate } from "../audio/engine";

interface DeckEQProps {
  beatmatch: boolean;
  vocalEase?: boolean;
  subscribe: (cb: (f: PlayUpdate | null) => void) => () => void;
}

const BANDS: Array<keyof DeckBands> = ["high", "mid", "low"]; // top-to-bottom

/**
 * A mixer-style 3-band EQ readout for both decks. The bass-swap is driven
 * imperatively from the per-frame engine update (DOM writes, no re-renders) so
 * you can watch the lows hand over from A to B mid-transition.
 */
export function DeckEQ({ beatmatch, vocalEase = false, subscribe }: DeckEQProps) {
  const fills = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const set = (deck: "a" | "b", bands: DeckBands) => {
      for (const band of BANDS) {
        const el = fills.current[`${deck}-${band}`];
        if (el) el.style.height = `${bands[band] * 100}%`;
      }
    };
    return subscribe((f) => {
      if (!f || !f.mix || f.mix.phase === "runup") {
        set("a", { low: 1, mid: 1, high: 1 });
        set("b", { low: 1, mid: 1, high: 1 });
        return;
      }
      const { a, b } = eqBands(f.mix.progress, beatmatch, vocalEase);
      set("a", a);
      set("b", b);
    });
  }, [subscribe, beatmatch, vocalEase]);

  const deck = (tag: "A" | "B", key: "a" | "b") => (
    <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
      <span style={{ fontFamily: theme.serif, fontSize: 16, fontWeight: 600, color: theme.accent }}>
        {tag}
      </span>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 64 }}>
        {BANDS.map((band) => (
          <div key={band} style={{ display: "grid", gap: 4, justifyItems: "center" }}>
            <div
              style={{
                position: "relative",
                width: 16,
                height: 64,
                background: theme.bg,
                border: `1px solid ${theme.line}`,
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                ref={(el) => {
                  fills.current[`${key}-${band}`] = el;
                }}
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "100%",
                  background: band === "low" ? theme.accent : theme.muted,
                  transition: "height 60ms linear",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: theme.mono,
                fontSize: 9,
                color: theme.muted,
                textTransform: "uppercase",
              }}
            >
              {band[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        borderRadius: 14,
        padding: "14px 18px",
        display: "flex",
        gap: 28,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontFamily: theme.mono,
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: theme.muted,
        }}
      >
        EQ
      </span>
      {deck("A", "a")}
      {deck("B", "b")}
    </div>
  );
}
