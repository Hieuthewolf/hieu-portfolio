/**
 * The deterministic half of the planner: turning a chosen Strategy into exact,
 * beat-aligned timestamps, plus the offline heuristic strategy.
 *
 * Deliberately free of any SDK / network imports so it can be unit-tested in
 * isolation and reused without pulling in the Anthropic client.
 */
import type {
  ControlPart,
  ControlRef,
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

const CONTROL_PARTS: ControlPart[] = [
  "lowEQ",
  "midEQ",
  "hiEQ",
  "filter",
  "channelFader",
  "crossfader",
  "play",
  "cue",
  "jog",
  "tempo",
];

function isControlRef(c: unknown): c is ControlRef {
  if (!c || typeof c !== "object") return false;
  const r = c as Partial<ControlRef>;
  return (
    (r.target === "A" || r.target === "B" || r.target === "center") &&
    typeof r.part === "string" &&
    CONTROL_PARTS.includes(r.part as ControlPart) &&
    (r.dir === undefined || r.dir === "up" || r.dir === "down")
  );
}

/**
 * Best-effort fallback: read a plain-language step and guess which control(s) it touches.
 * Only runs when a step arrives without structured `controls` (e.g. an older model
 * response) — the heuristic hand-authors them and the LLM is asked to tag them.
 */
export function inferControls(action: string): ControlRef[] {
  const t = action.toLowerCase();
  const mentionsA = /\b(track|deck)?\s*a('s|\b)|\bits a\b/.test(t) || /track a/.test(t);
  const mentionsB = /\b(track|deck)?\s*b('s|\b)/.test(t) || /track b/.test(t);
  const decks: Array<"A" | "B"> =
    mentionsA && mentionsB ? ["A", "B"] : mentionsB ? ["B"] : ["A"];
  const dir: ControlRef["dir"] = /\b(down|cut|lower|kill|drop)\b/.test(t)
    ? "down"
    : /\b(up|raise|bring up|boost)\b/.test(t)
      ? "up"
      : undefined;

  const out: ControlRef[] = [];
  if (/crossfader|cross-fader/.test(t)) out.push({ target: "center", part: "crossfader" });
  if (/\bbass\b|low eq|low-eq|lows\b/.test(t)) decks.forEach((d) => out.push({ target: d, part: "lowEQ", dir }));
  if (/\bmid(s|-range| eq)?\b/.test(t)) decks.forEach((d) => out.push({ target: d, part: "midEQ", dir }));
  if (/\b(highs?|treble|hi eq)\b/.test(t)) decks.forEach((d) => out.push({ target: d, part: "hiEQ", dir }));
  if (/\bfilter\b/.test(t)) decks.forEach((d) => out.push({ target: d, part: "filter" }));
  if (/\b(volume|channel fader|line fader|upfader|fader up|fader down)\b/.test(t))
    decks.forEach((d) => out.push({ target: d, part: "channelFader", dir }));
  if (/\b(start|hit play|press play|playing)\b/.test(t)) decks.forEach((d) => out.push({ target: d, part: "play" }));
  if (/\bjog|platter\b/.test(t)) decks.forEach((d) => out.push({ target: d, part: "jog" }));
  if (/\btempo|pitch fader\b/.test(t)) decks.forEach((d) => out.push({ target: d, part: "tempo" }));
  return out;
}

/** Keep a step's valid structured controls; if it has none, fall back to inference. */
export function normalizeControls(step: PlaybookStep): PlaybookStep {
  const valid = (step.controls ?? []).filter(isControlRef);
  const controls = valid.length > 0 ? valid : inferControls(step.action);
  return controls.length > 0 ? { ...step, controls } : { atBar: step.atBar, action: step.action };
}

/** Deterministically turn a strategy into exact beat-aligned timestamps + warp. */
export function resolve(input: PlanInput, s: Strategy, source: "llm" | "heuristic"): TransitionPlan {
  const { a, b } = input;
  const barA = a.beat * 4;
  const transLen = s.phraseBars * barA;

  // The model may pin an exact out-point (a mid-song drop); otherwise fall back to
  // the labelled section (last match), then to 70% through the track.
  const secA = findSection(a.sections, s.mixOutSection, true);
  const targetA =
    typeof s.mixOutSec === "number" && s.mixOutSec > 0
      ? s.mixOutSec
      : secA
        ? secA.startSec
        : a.duration * 0.7;
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
    playbook: s.playbook.map(normalizeControls),
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
      controls: [
        { target: "B", part: "play" },
        { target: "B", part: "lowEQ", dir: "down" },
        { target: "B", part: "channelFader", dir: "up" },
      ],
    },
    {
      atBar: 0,
      action:
        "Listen for the kick drums landing together — if they drift apart, the tracks aren't beatmatched (locked to the same speed).",
      // ear-only step: nothing to touch, so nothing lights up on the board.
    },
    {
      atBar: mid,
      action:
        "Slide the crossfader (the slider that blends the two songs) toward the middle so you can hear both.",
      controls: [{ target: "center", part: "crossfader" }],
    },
    {
      atBar: swap,
      action: "Swap the bass on a beat: turn track A's low EQ (its bass knob) down, and track B's up.",
      controls: [
        { target: "A", part: "lowEQ", dir: "down" },
        { target: "B", part: "lowEQ", dir: "up" },
      ],
    },
    {
      atBar: phraseBars - 1,
      action:
        "Push the crossfader all the way to B and bring track A's volume down. You're through the mix.",
      controls: [
        { target: "center", part: "crossfader" },
        { target: "A", part: "channelFader", dir: "down" },
      ],
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
