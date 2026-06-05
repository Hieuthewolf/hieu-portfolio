/**
 * The bridge between the browser and the planner.
 *
 * `requestPlan` calls the GraphQL mutation (the LLM path; key lives on the
 * server). The local `resolvePlan` / `heuristicStrategy` mirror the server's
 * deterministic layer so we can (a) fall back fully offline, and (b) re-resolve
 * instantly on a nudge or phrase-length change without another API round trip.
 */
import { camelotCompatible, clamp, snapGrid } from "./dsp";
import type {
  AudioFeatures,
  Difficulty,
  MixInSection,
  MixOutSection,
  PlanOptions,
  PlaybookStep,
  Section,
  Strategy,
  Technique,
  TransitionPlan,
} from "./types";

const ENDPOINT = import.meta.env.VITE_GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const MUTATION = `
  mutation Plan($input: PlanTransitionInput!) {
    planTransition(input: $input) {
      mixStartA mixStartB transLen technique difficulty warp
      rationale coachNote
      playbook { atBar action }
      mixOutSection mixInSection phraseBars beatmatch bpmDiff compatible source
    }
  }`;

function toFeaturesInput(f: AudioFeatures) {
  return {
    bpm: f.bpm,
    beat: f.beat,
    phase: f.phase,
    key: f.key,
    camelot: f.camelot,
    duration: f.duration,
    sections: f.sections.map((s) => ({
      kind: s.kind,
      startBar: s.startBar,
      endBar: s.endBar,
      startSec: s.startSec,
    })),
  };
}

interface GraphQLResponse {
  data?: { planTransition: TransitionPlan };
  errors?: Array<{ message: string }>;
}

export async function requestPlan(
  a: AudioFeatures,
  b: AudioFeatures,
  opts: PlanOptions,
): Promise<TransitionPlan> {
  const input = {
    a: toFeaturesInput(a),
    b: toFeaturesInput(b),
    options: {
      skill: opts.skill,
      setMoment: opts.setMoment,
      beatmatch: opts.beatmatch,
      phraseBars: opts.phraseBars,
    },
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: MUTATION, variables: { input } }),
  });
  const json = (await res.json()) as GraphQLResponse;
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error("empty planner response");
  return json.data.planTransition;
}

// ---- Local deterministic layer (offline fallback + instant re-resolve) ----

function findSection(sections: Section[], kind: string, preferLast: boolean): Section | null {
  const matches = sections.filter((s) => s.kind === kind);
  if (matches.length === 0) return null;
  return preferLast ? matches[matches.length - 1] : matches[0];
}

export function resolvePlan(
  a: AudioFeatures,
  b: AudioFeatures,
  strat: Strategy,
  nudgeBars: number,
  source: "llm" | "heuristic",
): TransitionPlan {
  const bar = a.beat * 4;
  const transLen = strat.phraseBars * bar;

  const secA = findSection(a.sections, strat.mixOutSection, true);
  const targetA = secA ? secA.startSec : a.duration * 0.7;
  const mixStartA = clamp(snapGrid(targetA, a.phase, bar) + nudgeBars * bar, 0, a.duration - transLen - 0.2);

  const secB = findSection(b.sections, strat.mixInSection, false);
  const targetB = secB ? secB.startSec : 0;
  const mixStartB = clamp(snapGrid(targetB, b.phase, b.beat * 4), 0, b.duration - transLen - 0.2);

  const bpmDiff = Math.abs(a.bpm - b.bpm) / ((a.bpm + b.bpm) / 2);

  return {
    mixStartA,
    mixStartB,
    transLen,
    technique: strat.technique,
    difficulty: strat.difficulty,
    warp: strat.warpBToA ? a.bpm / b.bpm : 1,
    rationale: strat.rationale,
    coachNote: strat.coachNote,
    playbook: strat.playbook,
    mixOutSection: strat.mixOutSection,
    mixInSection: strat.mixInSection,
    phraseBars: strat.phraseBars,
    beatmatch: strat.warpBToA,
    bpmDiff,
    compatible: camelotCompatible(a.camelot, b.camelot),
    source,
  };
}

export function heuristicStrategy(a: AudioFeatures, b: AudioFeatures, opts: PlanOptions): Strategy {
  const bpmDiff = Math.abs(a.bpm - b.bpm) / ((a.bpm + b.bpm) / 2);
  const compatible = camelotCompatible(a.camelot, b.camelot);
  const phraseBars = opts.phraseBars;
  const hasBreak = a.sections.some((s) => s.kind === "breakdown");

  let technique: Technique;
  let warpBToA: boolean;
  let mixOutSection: MixOutSection;
  let mixInSection: MixInSection;
  let difficulty: Difficulty;
  let rationale: string;

  if (opts.beatmatch && bpmDiff < 0.08) {
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

/** Pull the strategy fields back out of a resolved plan, for instant local re-resolution. */
export function strategyFromPlan(p: TransitionPlan): Strategy {
  return {
    technique: p.technique,
    mixOutSection: p.mixOutSection,
    mixInSection: p.mixInSection,
    phraseBars: p.phraseBars,
    warpBToA: p.beatmatch,
    difficulty: p.difficulty,
    rationale: p.rationale,
    coachNote: p.coachNote,
    playbook: p.playbook,
  };
}
