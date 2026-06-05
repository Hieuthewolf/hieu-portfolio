export interface EnergyEnvelope {
  vals: Float32Array;
  hop: number;
  sr: number;
  max: number;
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
  sections: Section[];
}

export type Skill = "beginner" | "intermediate" | "advanced";
export type SetMoment = "warmup" | "peak" | "cooldown";

export interface PlanOptions {
  skill: Skill;
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

export interface PlaybookStep {
  atBar: number;
  action: string;
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
  name: string;
  buffer: AudioBuffer;
  features: AudioFeatures;
  cursor: number | null;
}
