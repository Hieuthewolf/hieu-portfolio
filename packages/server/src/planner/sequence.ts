/**
 * The deterministic half of the Set Builder: order N tracks into a set that
 * follows an energy arc while keeping neighbours mixable, and summarise each
 * adjacency. Mirrors the resolve.ts pattern — SDK/network-free so it can be
 * unit-tested in isolation and run identically in the browser fallback.
 *
 * The LLM (when available) picks the ordering judgment; repairSet() enforces the
 * hard constraints (pins, valid permutation) and re-derives the gap math here.
 */
import { camelotCompatible, heuristicStrategy } from "./resolve.js";
import type {
  PlanOptions,
  PlanSetInput,
  SetGap,
  SetMoment,
  SetPlan,
  SetRole,
  SetRoleEntry,
  SetStrategy,
  SetTrack,
  TrackFeatures,
} from "./types.js";

const ROLES: SetRole[] = ["opener", "builder", "peak", "bridge", "closer"];

/** Target energy level (0..1) at normalised set position p (0..1), per set moment. */
export function arcTarget(moment: SetMoment, p: number): number {
  switch (moment) {
    case "warmup":
      return 0.2 + 0.6 * p; // steady climb
    case "cooldown":
      return 0.8 - 0.6 * p; // steady descent
    case "peak":
    default:
      return 0.55 + 0.45 * Math.sin(Math.PI * p); // rise to a crest mid-set, ease off
  }
}

function bpmDiff(a: TrackFeatures, b: TrackFeatures): number {
  return Math.abs(a.bpm - b.bpm) / ((a.bpm + b.bpm) / 2);
}

/** Cost of mixing a→b: tempo distance dominates, key clash adds a flat penalty. */
function gapCost(a: SetTrack, b: SetTrack): number {
  return (
    bpmDiff(a.features, b.features) * 4 +
    (camelotCompatible(a.features.camelot, b.features.camelot) ? 0 : 0.5)
  );
}

/** How far a track's energy sits from the arc target at position p. */
function arcCost(t: SetTrack, p: number, eMin: number, eMax: number, moment: SetMoment): number {
  const norm = eMax > eMin ? (t.energy.mean - eMin) / (eMax - eMin) : 0.5;
  return Math.abs(norm - arcTarget(moment, p));
}

function score(order: SetTrack[], moment: SetMoment, eMin: number, eMax: number): number {
  const n = order.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) s += gapCost(order[i]!, order[i + 1]!);
  for (let i = 0; i < n; i++) s += arcCost(order[i]!, n > 1 ? i / (n - 1) : 0, eMin, eMax, moment);
  return s;
}

function reverse(order: SetTrack[], i: number, j: number): void {
  while (i < j) {
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
    i++;
    j--;
  }
}

/** 2-opt local search on the global score; never moves the locked endpoints. */
function twoOpt(
  order: SetTrack[],
  moment: SetMoment,
  eMin: number,
  eMax: number,
  lockFirst: boolean,
  lockLast: boolean,
): void {
  const n = order.length;
  const lo = lockFirst ? 1 : 0;
  const hi = lockLast ? n - 2 : n - 1;
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = lo; i < hi; i++) {
      for (let j = i + 1; j <= hi; j++) {
        const before = score(order, moment, eMin, eMax);
        reverse(order, i, j);
        if (score(order, moment, eMin, eMax) < before - 1e-9) improved = true;
        else reverse(order, i, j); // revert
      }
    }
  }
}

/**
 * Order tracks: greedy seed (each slot takes the remaining track best fitting
 * the arc + cheapest to mix from the previous), then 2-opt refinement. Pinned
 * intro/outro are held at the ends and never moved. Returns track ids.
 */
export function sequence(
  tracks: SetTrack[],
  moment: SetMoment,
  introId?: string | null,
  outroId?: string | null,
): string[] {
  if (tracks.length <= 1) return tracks.map((t) => t.id);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const means = tracks.map((t) => t.energy.mean);
  const eMin = Math.min(...means);
  const eMax = Math.max(...means);

  const intro = introId ? byId.get(introId) : undefined;
  const outro = outroId && outroId !== introId ? byId.get(outroId) : undefined;
  const pinned = new Set<string>();
  if (intro) pinned.add(intro.id);
  if (outro) pinned.add(outro.id);

  const n = tracks.length;
  const order: SetTrack[] = [];
  if (intro) order.push(intro);
  const remaining = tracks.filter((t) => !pinned.has(t.id));
  while (remaining.length) {
    const p = order.length / (n - 1);
    const prev = order[order.length - 1];
    let best = 0;
    let bestCost = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      const c = arcCost(cand, p, eMin, eMax, moment) + (prev ? 0.5 * gapCost(prev, cand) : 0);
      if (c < bestCost) {
        bestCost = c;
        best = i;
      }
    }
    order.push(remaining.splice(best, 1)[0]!);
  }
  if (outro) order.push(outro);

  twoOpt(order, moment, eMin, eMax, !!intro, !!outro);
  return order.map((t) => t.id);
}

/** Instant, deterministic compatibility summary for one adjacency. */
export function gapSummary(from: SetTrack, to: SetTrack, options: PlanOptions): SetGap {
  const strat = heuristicStrategy({ a: from.features, b: to.features, options });
  const d = bpmDiff(from.features, to.features);
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

/** Assign roles by arc position: ends are opener/closer, highest-energy interior is the peak. */
function rolesByArc(order: string[], tracks: SetTrack[]): SetRoleEntry[] {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const n = order.length;
  let peakIdx = -1;
  let peakE = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    const e = byId.get(order[i]!)?.energy.mean ?? 0;
    if (e > peakE) {
      peakE = e;
      peakIdx = i;
    }
  }
  return order.map((id, i) => {
    let role: SetRole;
    if (i === 0) role = "opener";
    else if (i === n - 1) role = "closer";
    else if (i === peakIdx) role = "peak";
    else if (i < peakIdx) role = "builder";
    else role = "bridge";
    return { id, role };
  });
}

function templateNarrative(n: number, moment: SetMoment): string {
  const arc =
    moment === "warmup"
      ? "easing the room up"
      : moment === "cooldown"
        ? "bringing it back down"
        : "building to a peak, then easing off";
  return `A ${n}-track set ${arc}: open gentle, ride the energy through the middle, and land soft.`;
}

/** The offline set strategy: used when there's no API key, or the LLM call fails. */
export function deterministicSetStrategy(input: PlanSetInput): SetStrategy {
  const { tracks, options } = input;
  const order = sequence(tracks, options.setMoment, options.introId, options.outroId);
  return {
    order,
    roles: rolesByArc(order, tracks),
    narrative: templateNarrative(tracks.length, options.setMoment),
  };
}

function isPermutation(order: string[], ids: string[]): boolean {
  if (order.length !== ids.length) return false;
  const want = new Set(ids);
  const seen = new Set<string>();
  for (const id of order) {
    if (!want.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

/** Move a pinned id to an end of the order (front for intro, back for outro). */
function applyPins(order: string[], introId?: string | null, outroId?: string | null): string[] {
  let out = [...order];
  if (introId && out.includes(introId)) out = [introId, ...out.filter((id) => id !== introId)];
  if (outroId && outroId !== introId && out.includes(outroId))
    out = [...out.filter((id) => id !== outroId), outroId];
  return out;
}

function fillRoles(
  order: string[],
  tracks: SetTrack[],
  modelRoles: SetRoleEntry[],
): SetRoleEntry[] {
  const valid = new Map<string, SetRole>();
  for (const r of modelRoles ?? []) if (r && ROLES.includes(r.role)) valid.set(r.id, r.role);
  return rolesByArc(order, tracks).map((b) => ({ id: b.id, role: valid.get(b.id) ?? b.role }));
}

/**
 * Turn a (possibly LLM-proposed) set strategy into a final SetPlan: validate the
 * order is a real permutation (else fall back to sequence()), enforce pins, then
 * re-derive the gap summaries and roles in code so they're always authoritative.
 */
export function repairSet(
  input: PlanSetInput,
  strat: SetStrategy,
  source: "llm" | "heuristic",
): SetPlan {
  const { tracks, options } = input;
  const ids = tracks.map((t) => t.id);
  let order = isPermutation(strat.order, ids)
    ? strat.order
    : sequence(tracks, options.setMoment, options.introId, options.outroId);
  order = applyPins(order, options.introId, options.outroId);

  const byId = new Map(tracks.map((t) => [t.id, t]));
  const gaps: SetGap[] = [];
  for (let i = 0; i < order.length - 1; i++) {
    gaps.push(gapSummary(byId.get(order[i]!)!, byId.get(order[i + 1]!)!, options));
  }

  return {
    order,
    roles: fillRoles(order, tracks, strat.roles),
    narrative: strat.narrative || templateNarrative(tracks.length, options.setMoment),
    gaps,
    source,
  };
}
