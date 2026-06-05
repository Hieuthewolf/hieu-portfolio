import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("builds initials from a full name", () => {
    expect(initials("Hieu Nguyen")).toBe("HN");
  });

  it("collapses extra whitespace", () => {
    expect(initials("  Hieu   Tan  Nguyen ")).toBe("HTN");
  });

  it("handles an empty string", () => {
    expect(initials("")).toBe("");
  });
});
