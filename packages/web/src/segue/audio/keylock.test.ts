import { describe, expect, it } from "vitest";
import { timeStretch } from "./keylock";

const SR = 44100;

// Minimal AudioBuffer / context stubs — Web Audio isn't available under vitest,
// but SoundTouch itself is pure JS and only needs channel Float32Arrays.
class FakeBuffer {
  duration: number;
  private data: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.duration = length / sampleRate;
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(ch: number) {
    return this.data[ch];
  }
  copyToChannel(src: Float32Array, ch: number) {
    this.data[ch].set(src.subarray(0, this.length));
  }
}

const ctx = {
  createBuffer: (channels: number, length: number, sr: number) => new FakeBuffer(channels, length, sr),
} as unknown as BaseAudioContext;

function tone(seconds: number, freq = 220, channels = 2): FakeBuffer {
  const n = Math.floor(seconds * SR);
  const buf = new FakeBuffer(channels, n, SR);
  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = 0.3 * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return buf;
}

describe("timeStretch (key-lock)", () => {
  it("compresses duration by the tempo factor, preserving channels and sample-rate", async () => {
    const src = tone(2);
    const out = await timeStretch(ctx, src as unknown as AudioBuffer, {
      tempo: 1.1,
      pitchSemitones: 0,
      startSec: 0,
      endSec: 2,
    });
    expect(out.numberOfChannels).toBe(2);
    expect(out.sampleRate).toBe(SR);
    // tempo 1.1 → ~1/1.1 of the frames; generous slack for WSOLA block edges + latency.
    const expected = src.length / 1.1;
    expect(out.length).toBeGreaterThan(expected * 0.8);
    expect(out.length).toBeLessThan(expected * 1.2);
  });

  it("renders only the requested slice", async () => {
    const src = tone(6);
    const out = await timeStretch(ctx, src as unknown as AudioBuffer, {
      tempo: 1,
      pitchSemitones: 0,
      startSec: 1,
      endSec: 4, // a 3-second slice (SoundTouch trims ~0.4s of startup latency)
    });
    // Clearly the ~3s slice, not the full 6s track.
    expect(out.length).toBeGreaterThan(2.0 * SR);
    expect(out.length).toBeLessThan(4.0 * SR);
  });
});
