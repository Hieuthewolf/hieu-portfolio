import { describe, expect, it } from "vitest";
import { heuristicStrategy, resolvePlan } from "./planClient";
import type { AudioFeatures } from "./types";

function feat(partial: Partial<AudioFeatures>): AudioFeatures {
  return {
    bpm: 124,
    beat: 60 / 124,
    phase: 0,
    key: "A minor",
    keyConfident: true,
    camelot: "8A",
    duration: 300,
    peaks: [],
    energy: { vals: new Float32Array(), hop: 1024, sr: 44100, max: 1 },
    sections: [],
    ...partial,
  };
}

const a = feat({ sections: [{ kind: "outro", startBar: 64, endBar: 80, startSec: 120 }] });
const b = feat({ camelot: "9A", sections: [{ kind: "intro", startBar: 0, endBar: 16, startSec: 0 }] });
const opts = { skill: "beginner", setMoment: "peak", beatmatch: true, phraseBars: 16, nudgeBars: 0 } as const;
const strat = heuristicStrategy(a, b, opts);

describe("resolvePlan", () => {
  it("keeps timestamps within track bounds", () => {
    const p = resolvePlan(a, b, strat, 0, "heuristic");
    expect(p.mixStartA).toBeGreaterThanOrEqual(0);
    expect(p.mixStartA + p.transLen).toBeLessThanOrEqual(a.duration);
    expect(p.mixStartB).toBeGreaterThanOrEqual(0);
  });

  it("marks ±1 camelot as compatible (8A → 9A)", () => {
    expect(resolvePlan(a, b, strat, 0, "heuristic").compatible).toBe(true);
  });

  it("computes warp from the bpm ratio when beatmatching", () => {
    const fast = feat({ bpm: 128, camelot: "9A", sections: b.sections });
    const p = resolvePlan(a, fast, { ...strat, warpBToA: true }, 0, "heuristic");
    expect(p.warp).toBeCloseTo(a.bpm / fast.bpm, 5);
  });

  it("shifts mixStartA by whole bars on nudge", () => {
    const base = resolvePlan(a, b, strat, 0, "heuristic");
    const nudged = resolvePlan(a, b, strat, 1, "heuristic");
    const bar = a.beat * 4;
    expect(nudged.mixStartA - base.mixStartA).toBeCloseTo(bar, 5);
  });
});
