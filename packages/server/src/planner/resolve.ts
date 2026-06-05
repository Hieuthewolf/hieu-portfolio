/**
 * The deterministic half of the planner: turning a chosen Strategy into exact,
 * beat-aligned timestamps, plus the offline heuristic strategy.
 *
 * Deliberately free of any SDK / network imports so it can be unit-tested in
 * isolation and reused without pulling in the Anthropic client.
 */
import type {
  Difficulty,
  MixInSection,
  MixOutSection,
  PlanInput,
  PlaybookStep,
  Section,
  Strategy,
  Technique,
  TransitionPlan,
} from "./types.js";

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(x, hi));
}

export function snapGrid(t: number, phase: number, period: number): number {
  return phase + Math.round((t - phase) / period) * period;
}

/** Harmonic compatibility on the Camelot wheel. Computed in code, never trusted to the LLM. */
export function camelotCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = Number(a.slice(0, -1));
  const la = a.slice(-1);
  const nb = Number(b.slice(0, -1));
  const lb = b.slice(-1);
  if (na === nb) return true; // relative major/minor
  const diff = Math.abs(na - nb);
  return la === lb && (diff === 1 || diff === 11); // ±1 around the 12-hour wheel
}

function findSection(sections: Section[], kind: string, preferLast: boolean): Section | null {
  const matches = sections.filter((s) => s.kind === kind);
  if (matches.length === 0) return null;
  return preferLast ? matches[matches.length - 1]! : matches[0]!;
}

/** Deterministically turn a strategy into exact beat-aligned timestamps + warp. */
export function resolve(input: PlanInput, s: Strategy, source: "llm" | "heuristic"): TransitionPlan {
  const { a, b } = input;
  const barA = a.beat * 4;
  const transLen = s.phraseBars * barA;

  const secA = findSection(a.sections, s.mixOutSection, true);
  const targetA = secA ? secA.startSec : a.duration * 0.7;
  const mixStartA = clamp(snapGrid(targetA, a.phase, barA), 0, Math.max(0, a.duration - transLen - 0.2));

  const secB = findSection(b.sections, s.mixInSection, false);
  const targetB = secB ? secB.startSec : 0;
  const mixStartB = clamp(snapGrid(targetB, b.phase, b.beat * 4), 0, Math.max(0, b.duration - transLen - 0.2));

  const bpmDiff = Math.abs(a.bpm - b.bpm) / ((a.bpm + b.bpm) / 2);

  return {
    mixStartA,
    mixStartB,
    transLen,
    technique: s.technique,
    difficulty: s.difficulty,
    warp: s.warpBToA ? a.bpm / b.bpm : 1,
    rationale: s.rationale,
    coachNote: s.coachNote,
    playbook: s.playbook,
    mixOutSection: s.mixOutSection,
    mixInSection: s.mixInSection,
    phraseBars: s.phraseBars,
    beatmatch: s.warpBToA,
    bpmDiff,
    compatible: camelotCompatible(a.camelot, b.camelot),
    source,
  };
}

/** The offline strategy: used when there's no API key, or when the LLM call fails. */
export function heuristicStrategy(input: PlanInput): Strategy {
  const { a, b, options } = input;
  const bpmDiff = Math.abs(a.bpm - b.bpm) / ((a.bpm + b.bpm) / 2);
  const compatible = camelotCompatible(a.camelot, b.camelot);
  const phraseBars = options.phraseBars;
  const hasBreak = a.sections.some((s) => s.kind === "breakdown");

  let technique: Technique;
  let warpBToA: boolean;
  let mixOutSection: MixOutSection;
  let mixInSection: MixInSection;
  let difficulty: Difficulty;
  let rationale: string;

  if (options.beatmatch && bpmDiff < 0.08) {
    technique = "Bass-swap blend";
    warpBToA = true;
    mixOutSection = hasBreak ? "breakdown" : "outro";
    mixInSection = "intro";
    difficulty = "easy";
    rationale =
      `The tempos are close, so you can ride them together. Bring B in over A's ${mixOutSection} ` +
      `(its calmer stretch) and let B's intro build.` +
      (compatible ? ` The keys (${a.camelot} and ${b.camelot}) get along, so it'll sound smooth.` : "");
  } else {
    technique = "Phrase cut";
    warpBToA = false;
    mixOutSection = "outro";
    mixInSection = "intro";
    difficulty = "moderate";
    rationale = `These two are too far apart in speed to blend cleanly, so a quick cut on the beat is safer than a long mix.`;
  }

  const mid = Math.max(1, Math.floor(phraseBars / 2) - 2);
  const swap = Math.max(2, Math.round(phraseBars * 0.6));
  const playbook: PlaybookStep[] = [
    {
      atBar: 0,
      action:
        "On the first beat of a new phrase (a 16- or 32-bar chunk), start track B with its bass turned down and its volume up.",
    },
    {
      atBar: 0,
      action:
        "Listen for the kick drums landing together — if they drift apart, the tracks aren't beatmatched (locked to the same speed).",
    },
    {
      atBar: mid,
      action:
        "Slide the crossfader (the slider that blends the two songs) toward the middle so you can hear both.",
    },
    {
      atBar: swap,
      action: "Swap the bass on a beat: turn track A's low EQ (its bass knob) down, and track B's up.",
    },
    {
      atBar: phraseBars - 1,
      action:
        "Push the crossfader all the way to B and bring track A's volume down. You're through the mix.",
    },
  ];

  return {
    technique,
    mixOutSection,
    mixInSection,
    phraseBars,
    warpBToA,
    difficulty,
    rationale,
    coachNote:
      "Don't let both basslines play at once — that's what makes a mix sound muddy. The instant you raise B's bass, cut A's.",
    playbook,
  };
}
