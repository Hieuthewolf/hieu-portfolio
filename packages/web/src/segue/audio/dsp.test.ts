import { describe, expect, it } from "vitest";
import { camelotCompatible, keyToCamelot } from "./dsp";

describe("camelotCompatible", () => {
  it("matches identical codes", () => {
    expect(camelotCompatible("8A", "8A")).toBe(true);
  });
  it("matches relative major/minor (same number)", () => {
    expect(camelotCompatible("8A", "8B")).toBe(true);
  });
  it("matches ±1 around the wheel, including the 12↔1 wrap", () => {
    expect(camelotCompatible("8A", "9A")).toBe(true);
    expect(camelotCompatible("1A", "12A")).toBe(true);
  });
  it("rejects distant keys and nulls", () => {
    expect(camelotCompatible("8A", "3A")).toBe(false);
    expect(camelotCompatible(null, "8A")).toBe(false);
    expect(camelotCompatible("8A", null)).toBe(false);
  });
});

describe("keyToCamelot", () => {
  it("maps known keys", () => {
    expect(keyToCamelot("A minor")).toBe("8A");
    expect(keyToCamelot("C major")).toBe("8B");
  });
  it("returns null for unknown", () => {
    expect(keyToCamelot("H minor")).toBe(null);
  });
});
