import { useRef } from "react";
import { theme } from "../theme";
import { fmt } from "../utils/format";
import { Term } from "./Term";
import type { Track } from "../audio/types";

interface TrackSlotProps {
  tag: "A" | "B";
  role: string;
  track: Track | null;
  isPlaying: boolean;
  onFile: (file: File) => void;
  onPlayToggle: () => void;
}

export function TrackSlot({ tag, role, track, isPlaying, onFile, onPlayToggle }: TrackSlotProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const f = track?.features;

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        borderRadius: 14,
        padding: 18,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            style={{
              fontFamily: theme.serif,
              fontSize: 22,
              fontWeight: 600,
              color: theme.accent,
            }}
          >
            {tag}
          </span>
          <span
            style={{
              fontFamily: theme.mono,
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: theme.muted,
            }}
          >
            {role}
          </span>
        </div>
        {track && (
          <button
            onClick={onPlayToggle}
            style={{
              fontFamily: theme.mono,
              fontSize: 11,
              border: `1px solid ${theme.line}`,
              background: isPlaying ? theme.ink : "transparent",
              color: isPlaying ? theme.surface : theme.ink,
              borderRadius: 999,
              padding: "5px 12px",
              cursor: "pointer",
            }}
          >
            {isPlaying ? "■ stop" : "▶ play"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />

      {!track ? (
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            fontFamily: theme.sans,
            fontSize: 14,
            color: theme.muted,
            border: `1.5px dashed ${theme.line}`,
            background: "transparent",
            borderRadius: 10,
            padding: "22px 14px",
            cursor: "pointer",
          }}
        >
          Load an audio file
        </button>
      ) : (
        <>
          <div
            style={{
              fontFamily: theme.sans,
              fontSize: 14.5,
              fontWeight: 600,
              color: theme.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={track.name}
          >
            {track.name}
          </div>
          {f && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px 16px",
                fontFamily: theme.mono,
                fontSize: 12,
                color: theme.muted,
              }}
            >
              <span>
                <Term def="Beats per minute — how fast the track is. Two tracks close in BPM are easy to blend.">
                  BPM
                </Term>{" "}
                <strong style={{ color: theme.ink }}>{f.bpm}</strong>
              </span>
              <span>
                <Term def="The musical key, written as a Camelot code like 8A. Tracks with equal codes, the same number, or one step apart sound good together.">
                  Key
                </Term>{" "}
                <strong style={{ color: theme.ink }}>
                  {f.camelot ?? "?"}
                  {f.key ? ` (${f.key})` : ""}
                </strong>
                {!f.keyConfident && f.camelot ? <span style={{ opacity: 0.6 }}> ~</span> : null}
              </span>
              <span>
                len <strong style={{ color: theme.ink }}>{fmt(f.duration)}</strong>
              </span>
              <span>
                {f.sections.length}{" "}
                <Term def="Labelled stretches of the track (intro, build, drop, breakdown, outro), found from its energy curve.">
                  sections
                </Term>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
