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
  SetGap,
  SetMoment,
  SetOptions,
  SetPlan,
  SetRole,
  SetRoleEntry,
  Strategy,
  Technique,
  Track,
  TransitionPlan,
  VocalRegion,
} from "./types";

const ENDPOINT = import.meta.env.VITE_GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const MUTATION = `
  mutation Plan($input: PlanTransitionInput!) {
    planTransition(input: $input) {
      mixStartA mixStartB transLen technique difficulty warp
      rationale coachNote
      playbook { atBar action }
      mixOutSection mixOutSec mixInSection phraseBars beatmatch bpmDiff compatible vocalEase source
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
    vocalRegions: f.vocalRegions.map((v) => ({
      startSec: v.startSec,
      endSec: v.endSec,
      confidence: v.confidence,
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

/** Does a confident vocal region overlap [start, end] (seconds)? */
function hasVocalIn(regions: VocalRegion[] | undefined, start: number, end: number): boolean {
  if (!regions) return false;
  return regions.some((r) => r.endSec > start && r.startSec < end && r.confidence >= 0.5);
}

/** Insert a mid-EQ swap coaching step (unless one already exists) when two vocals overlap. */
function ensureVocalStep(playbook: PlaybookStep[], phraseBars: number): PlaybookStep[] {
  if (playbook.some((s) => s.controls?.some((c) => c.part === "midEQ"))) return playbook;
  const atBar = Math.max(1, Math.round(phraseBars * 0.6));
  const step: PlaybookStep = {
    atBar,
    action:
      "Both tracks have a vocal here. As B's vocal comes in, ease track A's MID (the middle EQ " +
      "knob) down and bring B's MID up so the two voices don't fight.",
    controls: [
      { target: "A", part: "midEQ", dir: "down" },
      { target: "B", part: "midEQ", dir: "up" },
    ],
  };
  const idx = playbook.findIndex((s) => s.atBar > atBar);
  return idx === -1 ? [...playbook, step] : [...playbook.slice(0, idx), step, ...playbook.slice(idx)];
}

/**
 * The start (seconds) of a drop worth mixing OUT of mid-song, or undefined. A drop
 * counts when something plays after it (it isn't the track's final section) and it
 * lands past the opening quarter (skip a cold-open drop). Lets the offline heuristic
 * pick an interior drop instead of always draining to the breakdown/outro.
 */
function interiorDropSec(sections: Section[], duration: number): number | undefined {
  const last = sections[sections.length - 1];
  const interior = sections.filter(
    (s) => s.kind === "drop" && (!last || s.startSec < last.startSec),
  );
  if (interior.length === 0) return undefined;
  return (interior.find((d) => d.startSec >= duration * 0.25) ?? interior[0]!).startSec;
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

  // The strategy may pin an exact out-point (a mid-song drop); otherwise fall back to
  // the labelled section (last match), then to 70% through the track. Mirrors resolve.ts.
  const secA = findSection(a.sections, strat.mixOutSection, true);
  const targetA =
    typeof strat.mixOutSec === "number" && strat.mixOutSec > 0
      ? strat.mixOutSec
      : secA
        ? secA.startSec
        : a.duration * 0.7;
  const mixStartA = clamp(snapGrid(targetA, a.phase, bar) + nudgeBars * bar, 0, a.duration - transLen - 0.2);

  const secB = findSection(b.sections, strat.mixInSection, false);
  const targetB = secB ? secB.startSec : 0;
  const mixStartB = clamp(snapGrid(targetB, b.phase, b.beat * 4), 0, b.duration - transLen - 0.2);

  const bpmDiff = Math.abs(a.bpm - b.bpm) / ((a.bpm + b.bpm) / 2);

  // Both tracks singing across the blend → ease the mids (and coach it). Mirrors resolve.ts.
  const vocalEase =
    hasVocalIn(a.vocalRegions, mixStartA, mixStartA + transLen) &&
    hasVocalIn(b.vocalRegions, mixStartB, mixStartB + transLen);
  const playbook = vocalEase ? ensureVocalStep(strat.playbook, strat.phraseBars) : strat.playbook;

  return {
    mixStartA,
    mixStartB,
    transLen,
    technique: strat.technique,
    difficulty: strat.difficulty,
    warp: strat.warpBToA ? a.bpm / b.bpm : 1,
    rationale: strat.rationale,
    coachNote: strat.coachNote,
    playbook,
    mixOutSection: strat.mixOutSection,
    mixOutSec: strat.mixOutSec,
    mixInSection: strat.mixInSection,
    phraseBars: strat.phraseBars,
    beatmatch: strat.warpBToA,
    bpmDiff,
    compatible: camelotCompatible(a.camelot, b.camelot),
    vocalEase,
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
  let mixOutSec: number | undefined;
  let mixInSection: MixInSection;
  let difficulty: Difficulty;
  let rationale: string;

  if (opts.beatmatch && bpmDiff < 0.08) {
    technique = "Bass-swap blend";
    warpBToA = true;
    mixInSection = "intro";
    difficulty = "easy";
    // Default: mix out of A's calmest stretch. But if a strong drop sits well before
    // that stretch, ride the drop and mix out there rather than draining a long tail.
    const transLen = phraseBars * a.beat * 4;
    const labelled = findSection(a.sections, hasBreak ? "breakdown" : "outro", true);
    const labelledSec = labelled ? labelled.startSec : a.duration * 0.85;
    const drop = interiorDropSec(a.sections, a.duration);
    if (drop !== undefined && labelledSec - drop >= transLen) {
      mixOutSection = "drop";
      mixOutSec = drop;
      rationale =
        `The tempos are close, so you can ride them together. A's drop hits well before its ` +
        `calmer stretch, so mix out on that drop and bring B in beneath it.` +
        (compatible ? ` The keys (${a.camelot} and ${b.camelot}) get along, so it'll sound smooth.` : "");
    } else {
      mixOutSection = hasBreak ? "breakdown" : "outro";
      rationale =
        `The tempos are close, so you can ride them together. Bring B in over A's ${mixOutSection} ` +
        `(its calmer stretch) and let B's intro build.` +
        (compatible ? ` The keys (${a.camelot} and ${b.camelot}) get along, so it'll sound smooth.` : "");
    }
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
    mixOutSec,
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
    mixOutSec: p.mixOutSec,
    mixInSection: p.mixInSection,
    phraseBars: p.phraseBars,
    warpBToA: p.beatmatch,
    difficulty: p.difficulty,
    rationale: p.rationale,
    coachNote: p.coachNote,
    playbook: p.playbook,
  };
}

// ---- Set Builder ----

const SET_MUTATION = `
  mutation PlanSet($input: PlanSetInput!) {
    planSet(input: $input) {
      order
      roles { id role }
      narrative
      gaps { fromId toId technique difficulty bpmDiff compatible risk mixOutSec }
      source
    }
  }`;

function toSetTrackInput(t: Track) {
  return { id: t.id, features: toFeaturesInput(t.features), energy: t.features.energySummary };
}

interface SetGraphQLResponse {
  data?: { planSet: SetPlan };
  errors?: Array<{ message: string }>;
}

export async function requestSetPlan(tracks: Track[], opts: SetOptions): Promise<SetPlan> {
  const input = {
    tracks: tracks.map(toSetTrackInput),
    options: {
      setMoment: opts.setMoment,
      beatmatch: opts.beatmatch,
      phraseBars: opts.phraseBars,
      introId: opts.introId ?? null,
      outroId: opts.outroId ?? null,
    },
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: SET_MUTATION, variables: { input } }),
  });
  const json = (await res.json()) as SetGraphQLResponse;
  if (json.errors?.length) throw new Error(json.errors[0]!.message);
  if (!json.data) throw new Error("empty set planner response");
  return json.data.planSet;
}

// Local mirror of the server's deterministic layer: instant gap recompute on a
// manual reorder, and a full offline fallback when the planSet request fails.

function bpmDiffOf(a: AudioFeatures, b: AudioFeatures): number {
  return Math.abs(a.bpm - b.bpm) / ((a.bpm + b.bpm) / 2);
}

/** One adjacency's compatibility summary — reuses the local heuristic + Camelot check. */
export function localGap(from: Track, to: Track, opts: PlanOptions): SetGap {
  const strat = heuristicStrategy(from.features, to.features, opts);
  const d = bpmDiffOf(from.features, to.features);
  const compatible = camelotCompatible(from.features.camelot, to.features.camelot);
  return {
    fromId: from.id,
    toId: to.id,
    technique: strat.technique,
    difficulty: strat.difficulty,
    bpmDiff: d,
    compatible,
    risk: !compatible || d >= 0.08,
    mixOutSec: strat.mixOutSec,
  };
}

export function gapsFor(order: Track[], opts: PlanOptions): SetGap[] {
  const gaps: SetGap[] = [];
  for (let i = 0; i < order.length - 1; i++) gaps.push(localGap(order[i]!, order[i + 1]!, opts));
  return gaps;
}

/** Resolve a full beat-aligned transition plan for each adjacency — the schedule the engine plays. */
export function setTimeline(order: Track[], opts: PlanOptions): TransitionPlan[] {
  const plans: TransitionPlan[] = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i]!.features;
    const b = order[i + 1]!.features;
    plans.push(resolvePlan(a, b, heuristicStrategy(a, b, opts), 0, "heuristic"));
  }
  return plans;
}

/**
 * The LLM-backed timeline: ask the planner for each adjacency (in parallel, so it's
 * ~one round trip), falling back per pair to the local heuristic. This is what lets a
 * whole rehearsed set mix out of interior drops the way the single coach already can.
 */
export async function requestSetTimeline(
  order: Track[],
  opts: PlanOptions,
): Promise<TransitionPlan[]> {
  return Promise.all(
    order.slice(0, -1).map(async (t, i) => {
      const a = t.features;
      const b = order[i + 1]!.features;
      try {
        return await requestPlan(a, b, opts);
      } catch {
        return resolvePlan(a, b, heuristicStrategy(a, b, opts), 0, "heuristic");
      }
    }),
  );
}

export function arcTarget(moment: SetMoment, p: number): number {
  if (moment === "warmup") return 0.2 + 0.6 * p;
  if (moment === "cooldown") return 0.8 - 0.6 * p;
  return 0.55 + 0.45 * Math.sin(Math.PI * p); // peak
}

function rolesByArc(order: Track[]): SetRoleEntry[] {
  const n = order.length;
  let peakIdx = -1;
  let peakE = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    if (order[i]!.features.energySummary.mean > peakE) {
      peakE = order[i]!.features.energySummary.mean;
      peakIdx = i;
    }
  }
  return order.map((t, i) => {
    let role: SetRole;
    if (i === 0) role = "opener";
    else if (i === n - 1) role = "closer";
    else if (i === peakIdx) role = "peak";
    else if (i < peakIdx) role = "builder";
    else role = "bridge";
    return { id: t.id, role };
  });
}

/**
 * Offline ordering fallback. Simpler than the server (rank-match energy to the
 * arc target per slot, honour pins) — good enough when the network is down.
 */
export function localSetPlan(tracks: Track[], opts: SetOptions): SetPlan {
  const pinned = new Set([opts.introId, opts.outroId].filter(Boolean) as string[]);
  const free = tracks.filter((t) => !pinned.has(t.id));
  const n = tracks.length;

  // Sort free tracks by energy, then place into interior slots whose arc targets
  // are also sorted — so energy follows the arc shape.
  const byEnergy = [...free].sort(
    (a, b) => a.features.energySummary.mean - b.features.energySummary.mean,
  );
  const intro = opts.introId ? tracks.find((t) => t.id === opts.introId) : undefined;
  const outro =
    opts.outroId && opts.outroId !== opts.introId
      ? tracks.find((t) => t.id === opts.outroId)
      : undefined;

  const interiorSlots: number[] = [];
  for (let i = intro ? 1 : 0; i < n - (outro ? 1 : 0); i++) interiorSlots.push(i);
  const slotsByTarget = [...interiorSlots].sort(
    (i, j) =>
      arcTarget(opts.setMoment, i / Math.max(1, n - 1)) -
      arcTarget(opts.setMoment, j / Math.max(1, n - 1)),
  );

  const order: Track[] = new Array(n);
  if (intro) order[0] = intro;
  if (outro) order[n - 1] = outro;
  slotsByTarget.forEach((slot, k) => {
    order[slot] = byEnergy[k]!;
  });

  const filled = order.filter(Boolean);
  return {
    order: filled.map((t) => t.id),
    roles: rolesByArc(filled),
    narrative: `A ${n}-track set arranged offline along the ${opts.setMoment} energy arc.`,
    gaps: gapsFor(filled, opts),
    source: "heuristic",
  };
}
