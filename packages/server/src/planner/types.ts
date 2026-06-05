/**
 * Types for the Segue transition planner.
 *
 * The browser does all DSP + section detection and sends only numbers/labels.
 * The LLM picks a *strategy* (judgment); deterministic code resolves the exact
 * beat-aligned timestamps. The key never leaves the server.
 */

/** A structural section of a track, detected client-side from the energy curve + phrase grid. */
export interface Section {
  kind: "intro" | "build" | "drop" | "breakdown" | "outro";
  startBar: number;
  endBar: number;
  startSec: number;
}

export interface TrackFeatures {
  bpm: number;
  beat: number; // seconds per beat
  phase: number; // beat-grid phase, seconds
  key: string | null;
  camelot: string | null;
  duration: number;
  sections: Section[];
}

export type Skill = "beginner" | "intermediate" | "advanced";
export type SetMoment = "warmup" | "peak" | "cooldown";

export interface PlanOptions {
  skill: Skill;
  setMoment: SetMoment;
  beatmatch: boolean;
  phraseBars: number; // 8 | 16 | 32
}

export interface PlanInput {
  a: TrackFeatures;
  b: TrackFeatures;
  options: PlanOptions;
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

/** What the LLM decides (judgment), before exact timestamps are resolved. */
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
