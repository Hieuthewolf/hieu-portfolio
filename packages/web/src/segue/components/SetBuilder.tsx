import { useRef, useState, type DragEvent } from "react";
import { theme } from "../theme";
import { useSetBuilder } from "../hooks/useSetBuilder";
import { EnergyArc } from "./EnergyArc";
import { Select } from "./Select";
import { TrackList } from "./TrackList";
import type { Skill, SetMoment, Track } from "../audio/types";

interface SetBuilderProps {
  onRehearse: (from: Track, to: Track) => void;
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

export function SetBuilder({ onRehearse }: SetBuilderProps) {
  const {
    tracks,
    setPlan,
    opts,
    planning,
    error,
    addFiles,
    removeTrack,
    pinIntro,
    pinOutro,
    setOption,
    buildSet,
    reorder,
  } = useSetBuilder();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const byId = new Map(tracks.map((t) => [t.id, t]));
  const ordered: Track[] = setPlan
    ? setPlan.order.map((id) => byId.get(id)!).filter(Boolean)
    : tracks;
  const roleById: Record<string, string> = {};
  if (setPlan) for (const r of setPlan.roles) roleById[r.id] = r.role;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("audio/"));
    if (files.length) void addFiles(files);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 12,
        }}
      >
        <Select
          label="Your level"
          value={opts.skill}
          onChange={(v) => setOption("skill", v as Skill)}
          options={[
            { value: "beginner", label: "Beginner" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" },
          ]}
        />
        <Select
          label="Set moment"
          value={opts.setMoment}
          onChange={(v) => setOption("setMoment", v as SetMoment)}
          options={[
            { value: "warmup", label: "Warm-up" },
            { value: "peak", label: "Peak time" },
            { value: "cooldown", label: "Cool-down" },
          ]}
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void addFiles(files);
          e.target.value = ""; // allow re-adding the same file
        }}
      />

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          fontFamily: theme.sans,
          fontSize: 14,
          color: theme.muted,
          textAlign: "center",
          border: `1.5px dashed ${dragOver ? theme.accent : theme.line}`,
          background: dragOver ? "rgba(15,138,95,0.06)" : "transparent",
          borderRadius: 12,
          padding: "20px 14px",
          cursor: "pointer",
        }}
      >
        Drop audio files here, or click to add — then build the set.
      </div>

      {error && (
        <div
          style={{
            fontFamily: theme.sans,
            fontSize: 14,
            color: "#B5532F",
            background: "#FBEEE8",
            border: "1px solid #E8C9BC",
            borderRadius: 10,
            padding: "10px 14px",
          }}
        >
          {error}
        </div>
      )}

      {tracks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => void buildSet()}
            disabled={tracks.length < 2 || planning}
            style={{ ...btn(false), opacity: tracks.length < 2 || planning ? 0.5 : 1 }}
          >
            {planning ? "ordering…" : setPlan ? "Re-order the set" : "Build the set (ask Claude)"}
          </button>
          <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.muted }}>
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
            {tracks.length < 2 ? " · add at least 2" : ""}
            {setPlan ? ` · ${setPlan.source === "llm" ? "via Claude" : "offline"}` : ""}
          </span>
        </div>
      )}

      {setPlan && ordered.length > 0 && <EnergyArc tracks={ordered} moment={opts.setMoment} />}

      {setPlan?.narrative && (
        <p
          style={{
            margin: 0,
            fontFamily: theme.serif,
            fontSize: 17,
            lineHeight: 1.55,
            color: theme.ink,
          }}
        >
          {setPlan.narrative}
        </p>
      )}

      {ordered.length > 0 && (
        <TrackList
          items={ordered}
          roleById={roleById}
          gaps={setPlan ? setPlan.gaps : null}
          introId={opts.introId}
          outroId={opts.outroId}
          canReorder={!!setPlan}
          onReorder={reorder}
          onRemove={removeTrack}
          onPinIntro={pinIntro}
          onPinOutro={pinOutro}
          onGapClick={(i) => {
            const from = ordered[i];
            const to = ordered[i + 1];
            if (from && to) onRehearse(from, to);
          }}
        />
      )}
    </div>
  );
}
