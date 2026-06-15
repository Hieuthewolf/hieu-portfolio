import {
  beatPhase,
  clamp,
  computeBPM,
  computePeaks,
  downmix,
  energyEnvelope,
  estimateKey,
  fft,
  hann,
  keyToCamelot,
  midSide,
  onsetEnvelope,
} from "./dsp";
import type { AudioFeatures, EnergyEnvelope, EnergySummary, Section, VocalRegion } from "./types";

/** Analyze a representative central window so intros/outros don't skew tempo + key. */
function centralWindow(mono: Float32Array, sr: number): { seg: Float32Array; startSec: number } {
  const maxLen = Math.min(mono.length, 90 * sr);
  const start = Math.max(0, Math.floor((mono.length - maxLen) / 2));
  return { seg: mono.subarray(start, start + maxLen), startSec: start / sr };
}

interface SectionInputs {
  energy: EnergyEnvelope;
  beat: number;
  phase: number;
  duration: number;
}

/** Structural sections from the energy curve + phrase grid (heuristic). */
export function detectSections({ energy, beat, phase, duration }: SectionInputs): Section[] {
  const bar = beat * 4;
  const nbars = Math.max(1, Math.floor((duration - phase) / bar));

  const barE: number[] = [];
  for (let i = 0; i < nbars; i++) {
    const t0 = phase + i * bar;
    const t1 = t0 + bar;
    const i0 = Math.max(0, Math.floor((t0 * energy.sr) / energy.hop));
    const i1 = Math.min(energy.vals.length, Math.floor((t1 * energy.sr) / energy.hop));
    let sum = 0;
    let cnt = 0;
    for (let j = i0; j < i1; j++) {
      sum += energy.vals[j];
      cnt++;
    }
    barE.push(cnt ? sum / cnt / energy.max : 0);
  }

  const sm = barE.map((v, i) => {
    const a = i > 0 ? barE[i - 1] : v;
    const b = i < barE.length - 1 ? barE[i + 1] : v;
    return (a + v + b) / 3;
  });
  const level = sm.map((v) => (v > 0.6 ? 2 : v < 0.32 ? 0 : 1));

  const runs: Array<{ lvl: number; startBar: number; endBar: number }> = [];
  let s = 0;
  for (let i = 1; i <= level.length; i++) {
    if (i === level.length || level[i] !== level[s]) {
      runs.push({ lvl: level[s], startBar: s, endBar: i - 1 });
      s = i;
    }
  }

  return runs.map((r, idx) => {
    let kind: Section["kind"];
    if (r.lvl === 2) {
      kind = "drop";
    } else if (r.lvl === 0) {
      kind = idx === 0 ? "intro" : idx === runs.length - 1 ? "outro" : "breakdown";
    } else {
      const next = runs[idx + 1];
      kind = next && next.lvl === 2 ? "build" : idx === 0 ? "intro" : idx === runs.length - 1 ? "outro" : "breakdown";
    }
    return { kind, startBar: r.startBar, endBar: r.endBar, startSec: phase + r.startBar * bar };
  });
}

interface VocalInputs {
  mid: Float32Array;
  side: Float32Array;
  sr: number;
}

// Lead vocals concentrate in this band; sub-bass and air sit outside it.
const VOCAL_LO_HZ = 200;
const VOCAL_HI_HZ = 4000;

/**
 * Where lead vocals sit, heuristically. Per frame we score the center (mid) channel
 * in the vocal band on two cues: how *centered* it is (mid vs side energy — lead
 * vocals are usually panned center) and how *tonal* it is (low spectral flatness —
 * sustained harmonics, unlike broadband percussion), gated by enough midband energy.
 * Smoothed, thresholded, and run-length grouped into regions. Approximate by design.
 */
export function detectVocals({ mid, side, sr }: VocalInputs): VocalRegion[] {
  const N = 4096;
  const hop = 4096; // ~93ms at 44.1k — fine for vocal *regions*, and cheap over a full track
  const frames = Math.floor((mid.length - N) / hop);
  if (frames < 2) return [];
  const w = hann(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const reS = new Float64Array(N);
  const imS = new Float64Array(N);
  const lo = Math.max(1, Math.floor((VOCAL_LO_HZ * N) / sr));
  const hi = Math.min(N / 2 - 1, Math.ceil((VOCAL_HI_HZ * N) / sr));

  const like = new Float64Array(frames);
  const pres = new Float64Array(frames);
  let maxPres = 1e-9;
  for (let f = 0; f < frames; f++) {
    const s = f * hop;
    for (let i = 0; i < N; i++) {
      re[i] = (mid[s + i] || 0) * w[i];
      im[i] = 0;
      reS[i] = (side[s + i] || 0) * w[i];
      imS[i] = 0;
    }
    fft(re, im);
    fft(reS, imS);
    let midBand = 0;
    let sideBand = 0;
    let logSum = 0;
    let count = 0;
    for (let k = lo; k <= hi; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const sd = Math.sqrt(reS[k] * reS[k] + imS[k] * imS[k]);
      midBand += m;
      sideBand += sd;
      logSum += Math.log(m + 1e-9);
      count++;
    }
    const arith = midBand / (count || 1);
    const geo = Math.exp(logSum / (count || 1));
    const tonal = clamp(1 - (arith > 0 ? geo / arith : 1), 0, 1); // ~1 tonal, ~0 noisy
    const center = midBand / (midBand + sideBand + 1e-9); // ~1 centered, ~0.5 wide
    like[f] = tonal * center;
    pres[f] = midBand;
    if (midBand > maxPres) maxPres = midBand;
  }
  // Quiet frames can't carry a vocal — fold normalized presence into the score.
  for (let f = 0; f < frames; f++) like[f] *= clamp((pres[f] / maxPres) * 4, 0, 1);

  // Smooth (3-frame), threshold, and run-length group into regions of real length.
  const sm = like.map((v, i) => {
    const a = i > 0 ? like[i - 1] : v;
    const b = i < frames - 1 ? like[i + 1] : v;
    return (a + v + b) / 3;
  });
  const THRESH = 0.45;
  const secPerFrame = hop / sr;
  const minFrames = Math.max(2, Math.round(0.7 / secPerFrame));
  const regions: VocalRegion[] = [];
  let i = 0;
  while (i < frames) {
    if (sm[i] < THRESH) {
      i++;
      continue;
    }
    let j = i;
    let acc = 0;
    while (j < frames && sm[j] >= THRESH) {
      acc += sm[j];
      j++;
    }
    if (j - i >= minFrames) {
      regions.push({
        startSec: i * secPerFrame,
        endSec: j * secPerFrame,
        confidence: clamp(acc / (j - i), 0, 1),
      });
    }
    i = j;
  }
  return regions;
}

/** A 3-number digest of the energy curve (absolute, so it's comparable across tracks). */
export function summarizeEnergy(e: EnergyEnvelope): EnergySummary {
  const n = e.vals.length;
  if (n === 0) return { mean: 0, peak: e.max, arc: 0 };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += e.vals[i];
  const third = Math.max(1, Math.floor(n / 3));
  let firstSum = 0;
  let lastSum = 0;
  for (let i = 0; i < third; i++) firstSum += e.vals[i];
  for (let i = n - third; i < n; i++) lastSum += e.vals[i];
  const arc = e.max > 0 ? (lastSum - firstSum) / third / e.max : 0;
  return { mean: sum / n, peak: e.max, arc };
}

export function analyzeBuffer(buffer: AudioBuffer): AudioFeatures {
  const sr = buffer.sampleRate;
  const mono = downmix(buffer);
  const { seg, startSec } = centralWindow(mono, sr);
  const { env, frameRate } = onsetEnvelope(seg, sr);
  const bpm = computeBPM(env, frameRate);
  const beat = 60 / bpm;
  const phaseWithin = beatPhase(env, frameRate, bpm);
  const phase = (((startSec + phaseWithin) % beat) + beat) % beat;
  const key = estimateKey(seg, sr);
  const energy = energyEnvelope(mono, sr);

  const sections = detectSections({ energy, beat, phase, duration: buffer.duration });
  const { mid, side } = midSide(buffer);
  const vocalRegions = detectVocals({ mid, side, sr });

  return {
    bpm,
    beat,
    phase,
    key: key ? key.name : null,
    keyConfident: key ? key.confident : false,
    camelot: key ? keyToCamelot(key.name) : null,
    duration: buffer.duration,
    peaks: computePeaks(mono, 1000),
    energy,
    energySummary: summarizeEnergy(energy),
    sections,
    vocalRegions,
  };
}
