import { describe, expect, it } from "vitest";
import { deterministicSetStrategy, gapSummary, repairSet, sequence } from "./sequence.js";
import type { PlanSetInput, SetOptions, SetTrack } from "./types.js";

function track(id: string, bpm: number, camelot: string, energy: number): SetTrack {
  return {
    id,
    features: { bpm, beat: 60 / bpm, phase: 0, key: null, camelot, duration: 240, sections: [] },
    energy: { mean: energy, peak: energy * 1.5, arc: 0 },
  };
}

// A spread of energies/keys so ordering has something to work with.
const tracks: SetTrack[] = [
  track("t1", 122, "8A", 0.2),
  track("t2", 124, "9A", 0.45),
  track("t3", 126, "8B", 0.9),
  track("t4", 125, "10A", 0.6),
  track("t5", 120, "7A", 0.1),
];

const options = (over: Partial<SetOptions> = {}): SetOptions => ({
  skill: "beginner",
  setMoment: "peak",
  beatmatch: true,
  phraseBars: 16,
  ...over,
});

describe("sequence", () => {
  it("returns every track exactly once (a permutation)", () => {
    const order = sequence(tracks, "peak");
    expect([...order].sort()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  it("honours a pinned intro and outro at the ends", () => {
    const order = sequence(tracks, "peak", "t5", "t3");
    expect(order[0]).toBe("t5");
    expect(order[order.length - 1]).toBe("t3");
    expect([...order].sort()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  it("ends lower-energy than it starts for a cooldown", () => {
    const order = sequence(tracks, "cooldown");
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const first = byId.get(order[0]!)!.energy.mean;
    const last = byId.get(order[order.length - 1]!)!.energy.mean;
    expect(last).toBeLessThan(first);
  });
});

describe("gapSummary", () => {
  it("derives compatibility in code and flags risky tempo jumps", () => {
    const close = gapSummary(track("a", 124, "8A", 0.5), track("b", 126, "9A", 0.5), options());
    expect(close.compatible).toBe(true);
    expect(close.risk).toBe(false);

    const farKey = gapSummary(track("a", 124, "8A", 0.5), track("b", 124, "3A", 0.5), options());
    expect(farKey.compatible).toBe(false);
    expect(farKey.risk).toBe(true);
  });
});

describe("repairSet", () => {
  const input: PlanSetInput = { tracks, options: options({ introId: "t5", outroId: "t3" }) };

  it("falls back to a valid permutation when the LLM order is broken", () => {
    const plan = repairSet(input, { order: ["t1", "t1"], roles: [], narrative: "" }, "llm");
    expect([...plan.order].sort()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(plan.gaps).toHaveLength(tracks.length - 1);
  });

  it("enforces pins even if the LLM ignored them", () => {
    const plan = repairSet(
      input,
      { order: ["t1", "t2", "t3", "t4", "t5"], roles: [], narrative: "x" },
      "llm",
    );
    expect(plan.order[0]).toBe("t5");
    expect(plan.order[plan.order.length - 1]).toBe("t3");
  });

  it("assigns opener/closer roles to the ends", () => {
    const plan = repairSet(
      { tracks, options: options() },
      deterministicSetStrategy({ tracks, options: options() }),
      "heuristic",
    );
    const roleOf = (id: string) => plan.roles.find((r) => r.id === id)?.role;
    expect(roleOf(plan.order[0]!)).toBe("opener");
    expect(roleOf(plan.order[plan.order.length - 1]!)).toBe("closer");
  });
});
