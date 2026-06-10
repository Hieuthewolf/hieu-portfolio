export interface EnergyEnvelope {
  vals: Float32Array;
  hop: number;
  sr: number;
  max: number;
}

/** A 3-number digest of the energy curve, comparable across tracks (for set ordering). */
export interface EnergySummary {
  mean: number;
  peak: number;
  arc: number; // >0 rising, ~0 flat, <0 falling
}

export interface Section {
  kind: "intro" | "build" | "drop" | "breakdown" | "outro";
  startBar: number;
  endBar: number;
  startSec: number;
}

export interface AudioFeatures {
  bpm: number;
  beat: number; // seconds per beat
  phase: number; // beat-grid phase, seconds
  key: string | null;
  keyConfident: boolean;
  camelot: string | null;
  duration: number;
  peaks: Array<[number, number]>; // [min, max] per bucket, for the waveform
  energy: EnergyEnvelope;
  energySummary: EnergySummary;
  sections: Section[];
}

export type SetMoment = "warmup" | "peak" | "cooldown";

export interface PlanOptions {
  setMoment: SetMoment;
  beatmatch: boolean;
  phraseBars: number; // 8 | 16 | 32
  nudgeBars: number; // local refinement, applied client-side only
}

export type Technique =
  | "Long beatmatched blend"
  | "Bass-swap blend"
  | "Breakdown swap"
  | "Phrase cut"
  | "Echo / filter out"
  | "Double drop";
export type MixOutSection = "drop" | "breakdown" | "outro";
export type MixInSection = "intro" | "build" | "drop";
export type Difficulty = "easy" | "moderate" | "tricky";

// Mirrors packages/server/src/planner ControlRef — a physical control on the FLX4.
export type ControlPart =
  | "lowEQ"
  | "midEQ"
  | "hiEQ"
  | "filter"
  | "channelFader"
  | "crossfader"
  | "play"
  | "cue"
  | "jog"
  | "tempo";

export interface ControlRef {
  target: "A" | "B" | "center"; // A = left channel/deck, B = right, center = crossfader
  part: ControlPart;
  dir?: "up" | "down";
}

export interface PlaybookStep {
  atBar: number;
  action: string;
  controls?: ControlRef[];
}

export interface Strategy {
  technique: Technique;
  mixOutSection: MixOutSection;
  mixInSection: MixInSection;
  phraseBars: number;
  warpBToA: boolean;
  difficulty: Difficulty;
  rationale: string;
  coachNote: string;
  playbook: PlaybookStep[];
}

export interface TransitionPlan {
  mixStartA: number;
  mixStartB: number;
  transLen: number;
  technique: Technique;
  difficulty: Difficulty;
  warp: number;
  rationale: string;
  coachNote: string;
  playbook: PlaybookStep[];
  mixOutSection: MixOutSection;
  mixInSection: MixInSection;
  phraseBars: number;
  beatmatch: boolean;
  bpmDiff: number;
  compatible: boolean;
  source: "llm" | "heuristic";
}

export interface Track {
  id: string;
  name: string;
  buffer: AudioBuffer;
  features: AudioFeatures;
  cursor: number | null;
}

// ---- Set Builder (mirrors packages/server/src/planner set types) ----

export type SetRole = "opener" | "builder" | "peak" | "bridge" | "closer";

export interface SetOptions extends PlanOptions {
  introId?: string | null;
  outroId?: string | null;
}

export interface SetRoleEntry {
  id: string;
  role: SetRole;
}

export interface SetGap {
  fromId: string;
  toId: string;
  technique: Technique;
  difficulty: Difficulty;
  bpmDiff: number;
  compatible: boolean;
  risk: boolean;
}

export interface SetPlan {
  order: string[];
  roles: SetRoleEntry[];
  narrative: string;
  gaps: SetGap[];
  source: "llm" | "heuristic";
}
