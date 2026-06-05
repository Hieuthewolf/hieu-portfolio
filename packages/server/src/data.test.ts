import { describe, expect, it } from "vitest";
import { projects, profile } from "./data.js";

describe("portfolio data", () => {
  it("has unique project ids", () => {
    const ids = projects.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every project at least one metric and tag", () => {
    for (const p of projects) {
      expect(p.metrics.length).toBeGreaterThan(0);
      expect(p.tags.length).toBeGreaterThan(0);
    }
  });

  it("exposes contact links over https or mailto", () => {
    expect(profile.github).toMatch(/^https:\/\//);
    expect(profile.linkedin).toMatch(/^https:\/\//);
    expect(profile.email).toContain("@");
  });
});
