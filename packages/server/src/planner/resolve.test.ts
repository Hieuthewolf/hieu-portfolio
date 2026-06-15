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

describe("mid-song drop out-point (mixOutSec)", () => {
  // A track with an early drop, a later drop, and an outro near the end.
  const a = {
    ...input.a,
    sections: [
      { kind: "drop" as const, startBar: 32, endBar: 48, startSec: 64 },
      { kind: "drop" as const, startBar: 104, endBar: 120, startSec: 200 },
      { kind: "outro" as const, startBar: 140, endBar: 160, startSec: 268 },
    ],
  };
  const base: Strategy = {
    technique: "Bass-swap blend",
    mixOutSection: "drop",
    mixInSection: "intro",
    phraseBars: 16,
    warpBToA: true,
    difficulty: "easy",
    rationale: "r",
    coachNote: "c",
    playbook: [],
  };

  it("snaps the out-point to mixOutSec when provided (the mid-song drop)", () => {
    const p = resolve({ ...input, a }, { ...base, mixOutSec: 64 }, "llm");
    expect(p.mixStartA).toBeGreaterThan(55); // near the early drop @64s…
    expect(p.mixStartA).toBeLessThan(75); // …not the later drop @200s
    expect(p.mixStartA + p.transLen).toBeLessThanOrEqual(a.duration);
  });

  it("falls back to the labelled section (last match) when mixOutSec is absent", () => {
    const p = resolve({ ...input, a }, base, "llm");
    expect(p.mixStartA).toBeGreaterThan(180); // last "drop" is @200s, not the early one
  });
});

describe("heuristic interior-drop selection", () => {
  it("mixes out of a strong interior drop when the calm stretch is far off", () => {
    const a = {
      ...input.a,
      sections: [
        { kind: "drop" as const, startBar: 32, endBar: 48, startSec: 64 },
        { kind: "outro" as const, startBar: 140, endBar: 160, startSec: 268 },
      ],
    };
    const s = heuristicStrategy({ ...input, a });
    expect(s.mixOutSection).toBe("drop");
    expect(s.mixOutSec).toBe(64);
    const p = resolve({ ...input, a }, s, "heuristic");
    expect(p.mixStartA).toBeLessThan(75); // lands on the drop, not the distant outro
  });

  it("rides to the calm stretch when it sits right after the drop", () => {
    const a = {
      ...input.a,
      sections: [
        { kind: "drop" as const, startBar: 32, endBar: 40, startSec: 64 },
        { kind: "breakdown" as const, startBar: 40, endBar: 56, startSec: 80 },
        { kind: "outro" as const, startBar: 140, endBar: 160, startSec: 268 },
      ],
    };
    const s = heuristicStrategy({ ...input, a });
    expect(s.mixOutSec).toBeUndefined();
    expect(s.mixOutSection).toBe("breakdown");
  });

  it("leaves mixOutSec unset for a plain track with no interior drop", () => {
    expect(heuristicStrategy(input).mixOutSec).toBeUndefined();
  });
});

describe("vocal-aware blend (vocalEase)", () => {
  it("flags vocalEase and injects a mid-EQ step when both tracks sing across the blend", () => {
    const a = { ...input.a, vocalRegions: [{ startSec: 110, endSec: 150, confidence: 0.8 }] };
    const b = { ...input.b, vocalRegions: [{ startSec: 2, endSec: 40, confidence: 0.8 }] };
    const inp = { ...input, a, b };
    const p = resolve(inp, heuristicStrategy(inp), "heuristic");
    expect(p.vocalEase).toBe(true);
    const midStep = p.playbook.find((s) => s.controls?.some((c) => c.part === "midEQ"));
    expect(midStep?.controls).toEqual([
      { target: "A", part: "midEQ", dir: "down" },
      { target: "B", part: "midEQ", dir: "up" },
    ]);
  });

  it("leaves vocalEase off when only one track has a vocal in the window", () => {
    const a = { ...input.a, vocalRegions: [{ startSec: 110, endSec: 150, confidence: 0.8 }] };
    const inp = { ...input, a };
    const p = resolve(inp, heuristicStrategy(inp), "heuristic");
    expect(p.vocalEase).toBe(false);
    expect(p.playbook.some((s) => s.controls?.some((c) => c.part === "midEQ"))).toBe(false);
  });

  it("ignores low-confidence vocal blips", () => {
    const a = { ...input.a, vocalRegions: [{ startSec: 110, endSec: 150, confidence: 0.2 }] };
    const b = { ...input.b, vocalRegions: [{ startSec: 2, endSec: 40, confidence: 0.2 }] };
    expect(resolve({ ...input, a, b }, heuristicStrategy({ ...input, a, b }), "heuristic").vocalEase).toBe(
      false,
    );
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
