import { describe, expect, it } from "vitest";
import { shiftCamelot, suggestFix } from "./fix";

describe("shiftCamelot", () => {
  it("moves a semitone by ±7 on the wheel (a fifth), keeping the letter", () => {
    expect(shiftCamelot("8A", -1)).toBe("1A"); // Am → G#m
    expect(shiftCamelot("8A", 1)).toBe("3A"); // Am → Bbm
  });
  it("wraps around 12↔1", () => {
    expect(shiftCamelot("12A", 1)).toBe("7A");
    expect(shiftCamelot("1A", -1)).toBe("6A");
  });
  it("returns null for unknown keys", () => {
    expect(shiftCamelot(null, 1)).toBeNull();
  });
});

describe("suggestFix", () => {
  it("reports no problem for compatible, close-tempo pairs", () => {
    const f = suggestFix("8A", "9A", 0.01, true);
    expect(f.problem).toBe("none");
    expect(f.tip).toBe("");
  });

  it("finds a small key-shift that makes a clashy pair compatible", () => {
    const f = suggestFix("8A", "11A", 0.01, false);
    expect(f.problem).toBe("key");
    expect(f.keyShift).not.toBeNull();
    // the suggested shift must actually land on a compatible key
    expect(["8A", "9A", "7A", "8B"]).toContain(shiftCamelot("11A", f.keyShift!));
  });

  it("flags a wide tempo gap with a tempo tip and no key-shift", () => {
    const f = suggestFix("8A", "8A", 0.12, true);
    expect(f.problem).toBe("tempo");
    expect(f.keyShift).toBeNull();
    expect(f.tip).toMatch(/tempo/);
  });
});
