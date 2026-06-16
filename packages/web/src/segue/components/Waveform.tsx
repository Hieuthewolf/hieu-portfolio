import { useEffect, useRef, type MouseEvent } from "react";
import { theme } from "../theme";
import { fmt } from "../utils/format";
import type { PlayUpdate } from "../audio/engine";
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
  // The transition mix in/out point, set by the planner — drawn as the accent marker.
  mark?: number | null;
  markLabel?: string | null;
  // Where playback starts / is paused. Set by clicking the waveform.
  position: number | null;
  playing?: boolean;
  slot: "A" | "B";
  subscribe: (cb: (f: PlayUpdate | null) => void) => () => void;
  onSeek?: (time: number) => void;
  onPlayPause?: () => void;
}

const HEIGHT = 96;
const RIBBON = 14;

export function Waveform({
  features,
  region,
  label,
  mark,
  markLabel,
  position,
  playing,
  slot,
  subscribe,
  onSeek,
  onPlayPause,
}: WaveformProps) {
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef<HTMLDivElement | null>(null);
  const dimsRef = useRef({ w: 0, dpr: 1 });

  // Static layers (section ribbon, region, peaks, mix marker, play position).
  // These are the expensive draws — hundreds of stroked segments — so they run
  // only when the track, region, or markers actually change, never per frame.
  useEffect(() => {
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!base || !overlay) return;
    const ctx = base.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = base.clientWidth;
    const h = HEIGHT;
    // Keep both stacked canvases at identical resolution.
    for (const cv of [base, overlay]) {
      cv.width = w * dpr;
      cv.height = h * dpr;
    }
    dimsRef.current = { w, dpr };
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

    // Mix marker (planner's mix in/out point).
    if (mark != null) {
      const mx = (mark / dur) * w;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx, waveTop);
      ctx.lineTo(mx, h);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Play position (where audition starts / is paused) — a handle so it reads
    // as a draggable playhead, distinct from the mix marker.
    if (position != null) {
      const px = (position / dur) * w;
      ctx.fillStyle = theme.ink;
      ctx.strokeStyle = theme.ink;
      ctx.beginPath();
      ctx.moveTo(px, waveTop);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 4, waveTop);
      ctx.lineTo(px + 4, waveTop);
      ctx.lineTo(px, waveTop + 5);
      ctx.closePath();
      ctx.fill();
    }
  }, [features, region, mark, position]);

  // Playhead. Driven imperatively by per-frame engine updates — clear + one
  // line on the overlay canvas, so a moving playhead costs no React renders.
  useEffect(() => {
    return subscribe((f) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      const { w, dpr } = dimsRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, HEIGHT);
      if (!f || f.slot !== slot) return;
      const px = f.head * w;
      ctx.strokeStyle = theme.ink;
      ctx.beginPath();
      ctx.moveTo(px, RIBBON);
      ctx.lineTo(px, HEIGHT);
      ctx.stroke();
    });
  }, [subscribe, slot]);

  const xToTime = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    return { frac: Math.min(1, Math.max(0, frac)), time: frac * features.duration };
  };

  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    onSeek(xToTime(e).time);
  };

  // Hover guide + time readout, updated imperatively to stay off the render path.
  const handleHover = (e: MouseEvent<HTMLCanvasElement>) => {
    const hover = hoverRef.current;
    if (!hover || !onSeek) return;
    const { frac, time } = xToTime(e);
    hover.style.opacity = "1";
    hover.style.left = `${frac * 100}%`;
    hover.textContent = fmt(time);
  };
  const hideHover = () => {
    if (hoverRef.current) hoverRef.current.style.opacity = "0";
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
          {markLabel && mark != null ? ` · ${markLabel}` : ""}
        </div>
      )}
      <div style={{ position: "relative", width: "100%", height: HEIGHT }}>
        <canvas
          ref={baseRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: HEIGHT, display: "block", borderRadius: 8 }}
        />
        <canvas
          ref={overlayRef}
          onClick={handleClick}
          onMouseMove={handleHover}
          onMouseLeave={hideHover}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: HEIGHT,
            display: "block",
            cursor: onSeek ? "pointer" : "default",
          }}
        />
        {/* Hover time readout — positioned/toggled imperatively in handleHover. */}
        <div
          ref={hoverRef}
          style={{
            position: "absolute",
            top: RIBBON + 2,
            transform: "translateX(-50%)",
            opacity: 0,
            pointerEvents: "none",
            fontFamily: theme.mono,
            fontSize: 10,
            color: theme.surface,
            background: theme.ink,
            borderRadius: 4,
            padding: "1px 5px",
            transition: "opacity 0.1s",
            whiteSpace: "nowrap",
          }}
        />
        {onPlayPause && (
          <button
            onClick={onPlayPause}
            aria-label={playing ? "Pause" : "Play"}
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              border: "none",
              background: theme.ink,
              color: theme.surface,
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            {playing ? "❚❚" : "▶"}
          </button>
        )}
      </div>
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
