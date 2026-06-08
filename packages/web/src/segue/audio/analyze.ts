import {
  beatPhase,
  computeBPM,
  computePeaks,
  downmix,
  energyEnvelope,
  estimateKey,
  keyToCamelot,
  onsetEnvelope,
} from "./dsp";
import type { AudioFeatures, EnergyEnvelope, EnergySummary, Section } from "./types";

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
  };
}
