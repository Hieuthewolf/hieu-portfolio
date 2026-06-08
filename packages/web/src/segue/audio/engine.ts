import { clamp } from "./dsp";
import type { Track, TransitionPlan } from "./types";

export interface MixState {
  phase: "runup" | "blend" | "done";
  progress: number;
  bar: number;
}

export interface PlayUpdate {
  slot: "A" | "B";
  head: number; // 0..1 position within the playing track
  mix: MixState | null;
}

type OnUpdate = (u: PlayUpdate) => void;
type OnEnd = () => void;

// ---- 3-band EQ (deck realism) ----
//
// A real DJ mixer is three EQ bands per channel + a crossfader. The transition
// models an authentic *bass-swap*: the incoming track's lows stay killed until
// the swap point, so two basslines never play at once (the cardinal rule). The
// curve is shared with the DeckEQ readout so the visual matches what you hear.

export interface DeckBands {
  low: number;
  mid: number;
  high: number;
}

const KILL_DB = -40; // a fully "killed" EQ band

/** Band levels (0 = killed, 1 = full) for each deck at transition progress p (0..1). */
export function eqBands(p: number, beatmatch: boolean): { a: DeckBands; b: DeckBands } {
  // Where the bass hands over. A blend swaps late (ride them together first); a
  // non-beatmatched cut swaps early to get off the clashing track quickly.
  const swap = beatmatch ? 0.6 : 0.4;
  const ramp = 0.1;
  const lowA = p < swap ? 1 : clamp(1 - (p - swap) / ramp, 0, 1);
  const lowB = p < swap - 0.05 ? 0 : clamp((p - (swap - 0.05)) / ramp, 0, 1);
  return { a: { low: lowA, mid: 1, high: 1 }, b: { low: lowB, mid: 1, high: 1 } };
}

function makeEQ(c: AudioContext): {
  input: BiquadFilterNode;
  output: BiquadFilterNode;
  low: BiquadFilterNode;
} {
  const low = c.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 200;
  const mid = c.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 0.8;
  const high = c.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 3500;
  low.connect(mid).connect(high);
  return { input: low, output: high, low };
}

const toDb = (level: number): number => (level - 1) * -KILL_DB; // 1 → 0dB, 0 → KILL_DB

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private raf = 0;
  private sources: AudioBufferSourceNode[] = [];

  context(): AudioContext {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  async decode(file: File): Promise<AudioBuffer> {
    const ab = await file.arrayBuffer();
    return this.context().decodeAudioData(ab.slice(0));
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
  }

  async playTrack(track: Track, slot: "A" | "B", onUpdate: OnUpdate, onEnd: OnEnd): Promise<void> {
    this.stop();
    const c = this.context();
    await c.resume();
    const src = c.createBufferSource();
    src.buffer = track.buffer;
    src.connect(c.destination);
    const offset = track.cursor || 0;
    const t0 = c.currentTime + 0.05;
    src.start(t0, offset);
    this.sources = [src];
    const dur = track.buffer.duration;
    const tick = () => {
      const pos = offset + (c.currentTime - t0);
      if (pos >= dur) {
        this.stop();
        onEnd();
        return;
      }
      onUpdate({ slot, head: Math.min(1, pos / dur), mix: null });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  playTransition(a: Track, b: Track, plan: TransitionPlan, onUpdate: OnUpdate, onEnd: OnEnd): Promise<void> {
    return this.run(a, b, plan, Math.max(0, plan.mixStartA - 4 * a.features.beat), onUpdate, onEnd, true);
  }

  playMix(a: Track, b: Track, plan: TransitionPlan, aStart: number, onUpdate: OnUpdate, onEnd: OnEnd): Promise<void> {
    return this.run(a, b, plan, aStart, onUpdate, onEnd, false);
  }

  private async run(
    a: Track,
    b: Track,
    plan: TransitionPlan,
    aStart: number,
    onUpdate: OnUpdate,
    onEnd: OnEnd,
    clip: boolean,
  ): Promise<void> {
    this.stop();
    const c = this.context();
    await c.resume();

    const start = Math.min(Math.max(0, aStart || 0), plan.mixStartA);
    const warp = plan.warp || 1;
    const t0 = c.currentTime + 0.1;
    const transStart = t0 + (plan.mixStartA - start);
    const transEnd = transStart + plan.transLen;
    const barSec = plan.transLen / plan.phraseBars;

    const srcA = c.createBufferSource();
    srcA.buffer = a.buffer;
    const srcB = c.createBufferSource();
    srcB.buffer = b.buffer;
    if (warp !== 1) srcB.playbackRate.value = warp;

    const gA = c.createGain();
    const gB = c.createGain();
    const eqA = makeEQ(c);
    const eqB = makeEQ(c);

    srcA.connect(eqA.input);
    eqA.output.connect(gA).connect(c.destination);
    srcB.connect(eqB.input);
    eqB.output.connect(gB).connect(c.destination);

    gA.gain.setValueAtTime(1, t0);
    gA.gain.setValueAtTime(1, transStart);
    gA.gain.linearRampToValueAtTime(0.0001, transEnd);
    gB.gain.setValueAtTime(0.0001, t0);
    gB.gain.setValueAtTime(0.0001, transStart);
    gB.gain.linearRampToValueAtTime(1, transEnd);

    // Bass-swap: ride A's lows, hold B's killed, then swap on the curve. Sampled
    // in steps so the scheduled audio tracks the same curve DeckEQ draws.
    const STEPS = 24;
    eqA.low.gain.setValueAtTime(0, t0);
    eqB.low.gain.setValueAtTime(KILL_DB, t0);
    for (let k = 0; k <= STEPS; k++) {
      const p = k / STEPS;
      const t = transStart + p * plan.transLen;
      const { a, b } = eqBands(p, plan.beatmatch);
      eqA.low.gain.linearRampToValueAtTime(toDb(a.low), t);
      eqB.low.gain.linearRampToValueAtTime(toDb(b.low), t);
    }

    srcA.start(t0, start);
    srcB.start(transStart, plan.mixStartB);
    srcA.stop(transEnd + 0.2);
    const bRealEnd = transStart + (b.buffer.duration - plan.mixStartB) / warp;
    const end = clip ? transEnd + 4 : bRealEnd;
    if (clip) srcB.stop(end);
    this.sources = [srcA, srcB];

    const durA = a.buffer.duration;
    const durB = b.buffer.duration;
    const tick = () => {
      const now = c.currentTime;
      if (now >= end) {
        this.stop();
        onEnd();
        return;
      }
      if (now < transStart) {
        onUpdate({
          slot: "A",
          head: Math.min(1, (start + (now - t0)) / durA),
          mix: { phase: "runup", progress: 0, bar: -1 },
        });
      } else {
        const progress = clamp((now - transStart) / plan.transLen, 0, 1);
        const bar = Math.floor((now - transStart) / barSec);
        onUpdate({
          slot: "B",
          head: Math.min(1, (plan.mixStartB + (now - transStart) * warp) / durB),
          mix: { phase: now < transEnd ? "blend" : "done", progress, bar },
        });
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
