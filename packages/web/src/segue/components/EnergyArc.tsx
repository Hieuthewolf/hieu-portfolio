import { useEffect, useRef } from "react";
import { theme } from "../theme";
import { arcTarget } from "../audio/planClient";
import type { Track } from "../audio/types";

interface EnergyArcProps {
  tracks: Track[]; // in set order
}

const HEIGHT = 120;

/**
 * Static chart of the set's energy journey: each track's energy plotted in order
 * against the target energy arc. Reuses the Waveform canvas pattern (dpr sizing,
 * single redraw) — no per-frame animation, so it's simpler.
 */
export function EnergyArc({ tracks }: EnergyArcProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = HEIGHT;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padX = 16;
    const padY = 16;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;
    const n = tracks.length;
    const yOf = (v: number) => padY + (1 - v) * plotH; // v in 0..1

    // Target arc (dashed accent).
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const p = i / 60;
      const x = padX + p * plotW;
      const y = yOf(arcTarget(p));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    if (n === 0) return;

    // Normalise track energies across this set so the line uses the full height.
    const means = tracks.map((t) => t.features.energySummary.mean);
    const lo = Math.min(...means);
    const hi = Math.max(...means);
    const norm = (m: number) => (hi > lo ? (m - lo) / (hi - lo) : 0.5);
    const xOf = (i: number) => padX + (n > 1 ? i / (n - 1) : 0.5) * plotW;

    // Energy line through the tracks.
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    tracks.forEach((t, i) => {
      const x = xOf(i);
      const y = yOf(norm(t.features.energySummary.mean));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;

    // Track dots.
    tracks.forEach((t, i) => {
      const x = xOf(i);
      const y = yOf(norm(t.features.energySummary.mean));
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.font = `10px ${theme.mono}`;
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), x, h - 4);
    });
  }, [tracks]);

  return (
    <div>
      <div
        style={{
          fontFamily: theme.mono,
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: theme.muted,
          marginBottom: 6,
        }}
      >
        Energy arc
      </div>
      <canvas
        ref={ref}
        style={{
          width: "100%",
          height: HEIGHT,
          display: "block",
          background: theme.surface,
          border: `1px solid ${theme.line}`,
          borderRadius: 10,
        }}
      />
    </div>
  );
}
