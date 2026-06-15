/**
 * Signal-processing kernel for Segue. Pure functions over typed arrays — no
 * React, no DOM beyond the AudioBuffer type. Ported verbatim from the original
 * single-file prototype, with types added.
 */
import type { EnergyEnvelope } from "./types";

export const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl–Schmuckler major/minor key profiles.
const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const CAMELOT: Record<string, string> = {
  "C major": "8B", "C# major": "3B", "D major": "10B", "D# major": "5B", "E major": "12B", "F major": "7B",
  "F# major": "2B", "G major": "9B", "G# major": "4B", "A major": "11B", "A# major": "6B", "B major": "1B",
  "C minor": "5A", "C# minor": "12A", "D minor": "7A", "D# minor": "2A", "E minor": "9A", "F minor": "4A",
  "F# minor": "11A", "G minor": "6A", "G# minor": "1A", "A minor": "8A", "A# minor": "3A", "B minor": "10A",
};

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(x, hi));
}

export function snapGrid(time: number, phase: number, period: number): number {
  return phase + Math.round((time - phase) / period) * period;
}

export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const vr = re[b] * cwr - im[b] * cwi;
        const vi = re[b] * cwi + im[b] * cwr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = ncwr;
      }
    }
  }
}

export function downmix(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i];
  }
  const inv = 1 / buffer.numberOfChannels;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

/**
 * Center (mid) and stereo-difference (side) channels: mid=(L+R)/2, side=(L−R)/2.
 * A mono buffer has an all-zero side. Lead vocals are usually panned center, so a
 * strong mid-vs-side ratio in the vocal band is a cue for where the vocal sits.
 */
export function midSide(buffer: AudioBuffer): { mid: Float32Array; side: Float32Array } {
  const n = buffer.length;
  const mid = new Float32Array(n);
  const side = new Float32Array(n);
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  for (let i = 0; i < n; i++) {
    mid[i] = 0.5 * (L[i] + R[i]);
    side[i] = 0.5 * (L[i] - R[i]);
  }
  return { mid, side };
}

export function computePeaks(mono: Float32Array, buckets: number): Array<[number, number]> {
  const out: Array<[number, number]> = new Array(buckets);
  const step = Math.floor(mono.length / buckets) || 1;
  for (let b = 0; b < buckets; b++) {
    let mn = 1;
    let mx = -1;
    const s = b * step;
    const e = Math.min(s + step, mono.length);
    for (let i = s; i < e; i++) {
      const v = mono[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    out[b] = [mn, mx];
  }
  return out;
}

export function onsetEnvelope(seg: Float32Array, sr: number): { env: Float64Array; frameRate: number } {
  const N = 1024;
  const hop = 512;
  const frames = Math.max(2, Math.floor((seg.length - N) / hop));
  const w = hann(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const prev = new Float64Array(N / 2);
  const env = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const s = f * hop;
    for (let i = 0; i < N; i++) {
      re[i] = (seg[s + i] || 0) * w[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    for (let k = 0; k < N / 2; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const d = mag - prev[k];
      if (d > 0) flux += d;
      prev[k] = mag;
    }
    env[f] = flux;
  }
  return { env, frameRate: sr / hop };
}

export function computeBPM(env: Float64Array, frameRate: number): number {
  const frames = env.length;
  let mean = 0;
  for (let i = 0; i < frames; i++) mean += env[i];
  mean /= frames;
  const e = new Float64Array(frames);
  for (let i = 0; i < frames; i++) e[i] = Math.max(0, env[i] - mean);
  const minLag = Math.floor((frameRate * 60) / 200);
  const maxLag = Math.floor((frameRate * 60) / 60);
  let best = -1;
  let bestBpm = 120;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    let cnt = 0;
    for (let i = 0; i + lag < frames; i++) {
      acc += e[i] * e[i + lag];
      cnt++;
    }
    acc /= cnt || 1;
    const bpm = (60 * frameRate) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 125) / 0.55, 2));
    const score = acc * prior;
    if (score > best) {
      best = score;
      bestBpm = bpm;
    }
  }
  return Math.round(bestBpm * 10) / 10;
}

export function beatPhase(env: Float64Array, frameRate: number, bpm: number): number {
  const beatFrames = (frameRate * 60) / bpm;
  const BINS = 48;
  const acc = new Float64Array(BINS);
  for (let i = 0; i < env.length; i++) {
    const ph = (i % beatFrames) / beatFrames;
    const b = Math.min(BINS - 1, Math.floor(ph * BINS));
    acc[b] += env[i];
  }
  let best = -1;
  let bi = 0;
  for (let b = 0; b < BINS; b++) {
    if (acc[b] > best) {
      best = acc[b];
      bi = b;
    }
  }
  return (((bi + 0.5) / BINS) * beatFrames) / frameRate;
}

export function energyEnvelope(mono: Float32Array, sr: number): EnergyEnvelope {
  const win = 2048;
  const hop = 1024;
  const frames = Math.max(1, Math.floor((mono.length - win) / hop));
  const vals = new Float32Array(frames);
  let max = 1e-9;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const s = f * hop;
    for (let j = 0; j < win; j++) {
      const v = mono[s + j] || 0;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / win);
    vals[f] = rms;
    if (rms > max) max = rms;
  }
  return { vals, hop, sr, max };
}

export interface KeyResult {
  name: string;
  confident: boolean;
}

export function estimateKey(seg: Float32Array, sr: number): KeyResult | null {
  try {
    const N = 4096;
    const hop = 2048;
    const frames = Math.max(1, Math.floor((seg.length - N) / hop));
    const w = hann(N);
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    const chroma = new Float64Array(12);
    const stride = Math.max(1, Math.floor(frames / 80));
    for (let f = 0; f < frames; f += stride) {
      const s = f * hop;
      for (let i = 0; i < N; i++) {
        re[i] = (seg[s + i] || 0) * w[i];
        im[i] = 0;
      }
      fft(re, im);
      const frame = new Float64Array(12);
      for (let k = 1; k < N / 2; k++) {
        const freq = (k * sr) / N;
        if (freq < 65 || freq > 2000) continue;
        const mag = Math.log(1 + Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        frame[pc] += mag;
      }
      let fs = 0;
      for (let i = 0; i < 12; i++) fs += frame[i];
      if (fs > 0) for (let i = 0; i < 12; i++) chroma[i] += frame[i] / fs;
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += chroma[i];
    if (sum <= 0) return null;
    for (let i = 0; i < 12; i++) chroma[i] /= sum;

    const corr = (prof: number[], tonic: number): number => {
      let mp = 0;
      let mc = 0;
      for (let i = 0; i < 12; i++) {
        mp += prof[i];
        mc += chroma[(tonic + i) % 12];
      }
      mp /= 12;
      mc /= 12;
      let num = 0;
      let dp = 0;
      let dc = 0;
      for (let i = 0; i < 12; i++) {
        const a = prof[i] - mp;
        const b = chroma[(tonic + i) % 12] - mc;
        num += a * b;
        dp += a * a;
        dc += b * b;
      }
      return num / (Math.sqrt(dp * dc) || 1);
    };

    let best = -2;
    let second = -2;
    let name = "";
    for (let t = 0; t < 12; t++) {
      const candidates: Array<[number, string]> = [
        [corr(KS_MAJ, t), `${PITCH_CLASSES[t]} major`],
        [corr(KS_MIN, t), `${PITCH_CLASSES[t]} minor`],
      ];
      for (const [score, label] of candidates) {
        if (score > best) {
          second = best;
          best = score;
          name = label;
        } else if (score > second) {
          second = score;
        }
      }
    }
    return { name, confident: best - second > 0.04 };
  } catch {
    return null;
  }
}

export function keyToCamelot(name: string): string | null {
  return CAMELOT[name] ?? null;
}

/** Harmonic compatibility on the Camelot wheel. */
export function camelotCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = Number(a.slice(0, -1));
  const la = a.slice(-1);
  const nb = Number(b.slice(0, -1));
  const lb = b.slice(-1);
  if (na === nb) return true;
  const diff = Math.abs(na - nb);
  return la === lb && (diff === 1 || diff === 11);
}
