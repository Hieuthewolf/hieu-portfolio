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

export type SetMoment = "warmup" | "peak" | "cooldown";

export interface PlanOptions {
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

/**
 * A physical control on a DDJ-FLX4-style 2-deck controller, so a playbook step can
 * point at the exact knob/fader the beginner should touch. `target` is the channel:
 * "A"/"B" are the two channel strips (and their decks); "center" is the crossfader.
 */
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
  target: "A" | "B" | "center";
  part: ControlPart;
  dir?: "up" | "down"; // which way to move it — the bass-swap shows A↓ + B↑
}

export interface PlaybookStep {
  atBar: number;
  action: string;
  controls?: ControlRef[]; // optional — ear-only steps ("listen for the kicks") touch nothing
}

/** What the LLM decides (judgment), before exact timestamps are resolved. */
export interface Strategy {
  technique: Technique;
  mixOutSection: MixOutSection;
  // Optional exact out-point in seconds (e.g. a drop mid-song, not just A's ending).
  // When set, it overrides the labelled-section lookup in resolve().
  mixOutSec?: number;
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

// ---- Set Builder: ordering N tracks into a set by energy arc + mixability ----

/** A 3-number digest of a track's RMS energy curve, comparable across tracks. */
export interface EnergySummary {
  mean: number; // absolute mean RMS (loudness rank)
  peak: number; // absolute max RMS
  arc: number; // (lastThird − firstThird)/peak → >0 rising, ~0 flat, <0 falling
}

export type SetRole = "opener" | "builder" | "peak" | "bridge" | "closer";

export interface SetTrack {
  id: string;
  features: TrackFeatures;
  energy: EnergySummary;
}

export interface SetOptions extends PlanOptions {
  introId?: string | null;
  outroId?: string | null;
}

export interface PlanSetInput {
  tracks: SetTrack[];
  options: SetOptions;
}

export interface SetRoleEntry {
  id: string;
  role: SetRole;
}

/** What the LLM decides for a set (judgment): order, a role per track, a one-line story. */
export interface SetStrategy {
  order: string[];
  roles: SetRoleEntry[];
  narrative: string;
}

/** Deterministic, per-adjacency compatibility summary (never trusted to the LLM). */
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
