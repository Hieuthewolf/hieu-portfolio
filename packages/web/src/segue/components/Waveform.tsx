import { useEffect, useRef, type MouseEvent } from "react";
import { theme } from "../theme";
import { fmt } from "../utils/format";
import type { AudioFeatures } from "../audio/types";

const SECTION_COLOR: Record<string, string> = {
  intro: "#C9D9CF",
  build: "#9FC6AE",
  drop: "#0F8A5F",
  breakdown: "#E4D6B8",
  outro: "#CFC4AE",
};

interface WaveformProps {
  features: AudioFeatures;
  region: { start: number; end: number } | null;
  label?: string;
  cursor: number | null;
  cursorLabel?: string | null;
  playhead: number | null; // 0..1
  onSeek?: (time: number) => void;
}

const HEIGHT = 96;
const RIBBON = 14;

export function Waveform({ features, region, label, cursor, cursorLabel, playhead, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = HEIGHT;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const dur = features.duration;
    const waveTop = RIBBON;
    const waveH = h - RIBBON;
    const mid = waveTop + waveH / 2;

    // Section ribbon.
    for (const s of features.sections) {
      const x0 = (s.startSec / dur) * w;
      const x1 = (((features.phase + (s.endBar + 1) * features.beat * 4) / dur) || 0) * w;
      ctx.fillStyle = SECTION_COLOR[s.kind] ?? theme.line;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), RIBBON - 3);
    }

    // Region highlight.
    if (region) {
      const rx0 = (region.start / dur) * w;
      const rx1 = (region.end / dur) * w;
      ctx.fillStyle = "rgba(15,138,95,0.12)";
      ctx.fillRect(rx0, waveTop, Math.max(1, rx1 - rx0), waveH);
    }

    // Waveform peaks.
    const p = features.peaks;
    ctx.strokeStyle = theme.muted;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let i = 0; i < p.length; i++) {
      const x = (i / p.length) * w;
      const y0 = mid - p[i][1] * (waveH / 2) * 0.92;
      const y1 = mid - p[i][0] * (waveH / 2) * 0.92;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Cursor marker.
    if (cursor != null) {
      const cx = (cursor / dur) * w;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, waveTop);
      ctx.lineTo(cx, h);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Playhead.
    if (playhead != null) {
      const px = playhead * w;
      ctx.strokeStyle = theme.ink;
      ctx.beginPath();
      ctx.moveTo(px, waveTop);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }, [features, region, label, cursor, cursorLabel, playhead]);

  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeek(frac * features.duration);
  };

  return (
    <div style={{ position: "relative" }}>
      {label && (
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
          {label}
          {cursorLabel ? ` · ${cursorLabel}` : ""}
        </div>
      )}
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          width: "100%",
          height: HEIGHT,
          display: "block",
          cursor: onSeek ? "text" : "default",
          borderRadius: 8,
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: theme.mono,
          fontSize: 10,
          color: theme.muted,
          marginTop: 2,
        }}
      >
        <span>0:00</span>
        <span>{fmt(features.duration)}</span>
      </div>
    </div>
  );
}
