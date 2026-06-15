import { describe, expect, it } from "vitest";
import { detectVocals } from "./analyze";

const SR = 44100;

// Deterministic pseudo-random so the test is stable run to run.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff - 0.5;
  };
}

describe("detectVocals", () => {
  it("flags a centered tonal stretch in the vocal band, not the surrounding noise", () => {
    const dur = 9;
    const n = SR * dur;
    const mid = new Float32Array(n);
    const side = new Float32Array(n);
    const rnd = rng(7);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if (t >= 3 && t < 6) {
        // A centered 660 Hz "vocal": present in mid, nothing in side (panned center).
        mid[i] = 0.5 * Math.sin(2 * Math.PI * 660 * t);
        side[i] = 0;
      } else {
        // Decorrelated broadband noise: wide stereo image, no tonal center.
        mid[i] = 0.3 * rnd();
        side[i] = 0.3 * rnd();
      }
    }
    const regions = detectVocals({ mid, side, sr: SR });
    expect(regions.length).toBeGreaterThanOrEqual(1);
    // A detected region should overlap the [3s, 6s] vocal window.
    const hit = regions.find((r) => r.endSec > 3 && r.startSec < 6);
    expect(hit).toBeDefined();
    expect(hit!.confidence).toBeGreaterThan(0.45);
  });

  it("returns no regions for a fully decorrelated-noise (instrumental-like) clip", () => {
    const n = SR * 6;
    const mid = new Float32Array(n);
    const side = new Float32Array(n);
    const rnd = rng(11);
    for (let i = 0; i < n; i++) {
      mid[i] = 0.3 * rnd();
      side[i] = 0.3 * rnd();
    }
    expect(detectVocals({ mid, side, sr: SR })).toHaveLength(0);
  });
});
