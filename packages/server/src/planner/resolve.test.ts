import { describe, expect, it } from "vitest";
import {
  camelotCompatible,
  heuristicStrategy,
  inferControls,
  normalizeControls,
  resolve,
} from "./resolve.js";
import type { PlanInput, Strategy } from "./types.js";

const input: PlanInput = {
  a: {
    bpm: 124,
    beat: 60 / 124,
    phase: 0,
    key: "A minor",
    camelot: "8A",
    duration: 300,
    sections: [{ kind: "outro", startBar: 64, endBar: 80, startSec: 120 }],
  },
  b: {
    bpm: 126,
    beat: 60 / 126,
    phase: 0,
    key: "E minor",
    camelot: "9A",
    duration: 280,
    sections: [{ kind: "intro", startBar: 0, endBar: 16, startSec: 0 }],
  },
  options: { setMoment: "peak", beatmatch: true, phraseBars: 16 },
};

describe("camelotCompatible", () => {
  it("matches identical codes", () => {
    expect(camelotCompatible("8A", "8A")).toBe(true);
  });
  it("matches relative major/minor (same number, different letter)", () => {
    expect(camelotCompatible("8A", "8B")).toBe(true);
  });
  it("matches ±1 around the wheel (same letter), including the 12↔1 wrap", () => {
    expect(camelotCompatible("8A", "9A")).toBe(true);
    expect(camelotCompatible("1A", "12A")).toBe(true);
  });
  it("rejects distant keys and nulls", () => {
    expect(camelotCompatible("8A", "3A")).toBe(false);
    expect(camelotCompatible(null, "8A")).toBe(false);
  });
});

describe("planner deterministic layer", () => {
  it("produces a heuristic plan that stays within track bounds", () => {
    const p = resolve(input, heuristicStrategy(input), "heuristic");
    expect(p.source).toBe("heuristic");
    expect(p.mixStartA).toBeGreaterThanOrEqual(0);
    expect(p.mixStartA + p.transLen).toBeLessThanOrEqual(input.a.duration);
    expect(p.mixStartB).toBeGreaterThanOrEqual(0);
  });

  it("derives compatibility in code (8A → 9A is compatible)", () => {
    const p = resolve(input, heuristicStrategy(input), "heuristic");
    expect(p.compatible).toBe(true);
  });

  it("warps B to A from the bpm ratio when beatmatching", () => {
    const p = resolve(input, { ...heuristicStrategy(input), warpBToA: true }, "heuristic");
    expect(p.warp).toBeCloseTo(input.a.bpm / input.b.bpm, 5);
  });
});

describe("FLX4 control mapping", () => {
  it("carries hand-authored controls from the heuristic through resolve", () => {
    const p = resolve(input, heuristicStrategy(input), "heuristic");
    // The bass-swap step touches A's LOW (down) and B's LOW (up).
    const swap = p.playbook.find((s) =>
      s.controls?.some((c) => c.target === "A" && c.part === "lowEQ"),
    );
    expect(swap?.controls).toEqual([
      { target: "A", part: "lowEQ", dir: "down" },
      { target: "B", part: "lowEQ", dir: "up" },
    ]);
    // The "listen for the kicks" step is ear-only: no controls.
    const ear = p.playbook.find((s) => s.action.toLowerCase().includes("listen"));
    expect(ear?.controls).toBeUndefined();
  });

  it("infers controls from plain-language actions as a fallback", () => {
    expect(inferControls("Slide the crossfader toward the middle.")).toEqual([
      { target: "center", part: "crossfader" },
    ]);
    expect(inferControls("Turn track B's bass up.")).toEqual([
      { target: "B", part: "lowEQ", dir: "up" },
    ]);
    expect(inferControls("Listen for the kick drums landing together.")).toEqual([]);
  });

  it("keeps valid LLM-supplied controls and drops malformed ones", () => {
    const step = {
      atBar: 0,
      action: "do a thing",
      controls: [
        { target: "A", part: "hiEQ", dir: "down" },
        { target: "X", part: "lowEQ" }, // bad target
        { target: "B", part: "wobble" }, // bad part
      ],
    } as unknown as Strategy["playbook"][number];
    expect(normalizeControls(step).controls).toEqual([{ target: "A", part: "hiEQ", dir: "down" }]);
  });

  it("backfills via inference when a step arrives with no valid controls", () => {
    const step = { atBar: 4, action: "Push the crossfader all the way to B." };
    expect(normalizeControls(step).controls).toEqual([{ target: "center", part: "crossfader" }]);
  });
});
