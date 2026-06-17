import { clamp } from "./dsp";
import { timeStretch } from "./keylock";
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

/** Per-frame state while a whole set plays back end to end. */
export interface SetPlayUpdate {
  index: number; // the track currently in front
  from: number; // the track fading out (during a blend), else -1
  blending: boolean; // inside a transition overlap?
  progress: number; // 0..1 across the whole set
  // Per-transition blend state during an overlap (else null) — lets the FLX4 board
  // animate the current transition the same way it does for a single coach mix.
  mix: MixState | null;
}

type OnUpdate = (u: PlayUpdate) => void;
type OnSetUpdate = (u: SetPlayUpdate) => void;
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
export function eqBands(p: number, beatmatch: boolean, vocalEase = false): { a: DeckBands; b: DeckBands } {
  // Where the bass hands over. A blend swaps late (ride them together first); a
  // non-beatmatched cut swaps early to get off the clashing track quickly.
  const swap = beatmatch ? 0.6 : 0.4;
  const ramp = 0.1;
  const lowA = p < swap ? 1 : clamp(1 - (p - swap) / ramp, 0, 1);
  const lowB = p < swap - 0.05 ? 0 : clamp((p - (swap - 0.05)) / ramp, 0, 1);
  // Vocal hand-off: when both tracks have a vocal across the blend, duck A's mids as
  // B's vocal enters (same shape as the bass swap) so two leads never stack. Off →
  // mids stay full, i.e. exactly today's behavior.
  const midA = vocalEase ? lowA : 1;
  const midB = vocalEase ? lowB : 1;
  return { a: { low: lowA, mid: midA, high: 1 }, b: { low: lowB, mid: midB, high: 1 } };
}

function makeEQ(c: AudioContext): {
  input: BiquadFilterNode;
  output: BiquadFilterNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
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
  return { input: low, output: high, low, mid };
}

const toDb = (level: number): number => (level - 1) * -KILL_DB; // 1 → 0dB, 0 → KILL_DB

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private raf = 0;
  private sources: AudioBufferSourceNode[] = [];
  // Pitch-locked (key-lock) renders of B's mix-in slice, keyed by the params that
  // define them, so re-pressing play in the coach is instant. Bounded FIFO; cleared
  // on track load.
  private keylockCache = new Map<string, AudioBuffer>();

  clearKeylockCache(): void {
    this.keylockCache.clear();
  }

  /**
   * Resolve B's playback source. Beatmatch/key-shift normally resample B, which
   * drags its pitch along with the tempo. When either applies, render a
   * pitch-preserving slice instead (key-lock) and play it at rate 1; falls back to
   * resampling if the render fails, so playback never breaks.
   */
  private async prepareB(b: Track, warp: number, semis: number, mixStartB: number) {
    if (warp === 1 && semis === 0) {
      return { buffer: b.buffer, offset: mixStartB, rate: 1, detune: 0, keyLocked: false };
    }
    try {
      const key = `${b.id}|${warp.toFixed(4)}|${semis}|${mixStartB.toFixed(2)}`;
      let buffer = this.keylockCache.get(key);
      if (!buffer) {
        buffer = await timeStretch(this.context(), b.buffer, {
          tempo: warp,
          pitchSemitones: semis,
          startSec: mixStartB,
          endSec: b.buffer.duration,
        });
        if (this.keylockCache.size >= 8) this.keylockCache.delete(this.keylockCache.keys().next().value!);
        this.keylockCache.set(key, buffer);
      }
      return { buffer, offset: 0, rate: 1, detune: 0, keyLocked: true };
    } catch {
      return { buffer: b.buffer, offset: mixStartB, rate: warp, detune: semis * 100, keyLocked: false };
    }
  }

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

  playTransition(
    a: Track,
    b: Track,
    plan: TransitionPlan,
    onUpdate: OnUpdate,
    onEnd: OnEnd,
    detuneCents = 0,
  ): Promise<void> {
    return this.run(
      a,
      b,
      plan,
      Math.max(0, plan.mixStartA - 4 * a.features.beat),
      onUpdate,
      onEnd,
      true,
      detuneCents,
    );
  }

  playMix(
    a: Track,
    b: Track,
    plan: TransitionPlan,
    aStart: number,
    onUpdate: OnUpdate,
    onEnd: OnEnd,
    detuneCents = 0,
  ): Promise<void> {
    return this.run(a, b, plan, aStart, onUpdate, onEnd, false, detuneCents);
  }

  private async run(
    a: Track,
    b: Track,
    plan: TransitionPlan,
    aStart: number,
    onUpdate: OnUpdate,
    onEnd: OnEnd,
    clip: boolean,
    detuneCents = 0,
  ): Promise<void> {
    this.stop();
    const c = this.context();
    await c.resume();

    const start = Math.min(Math.max(0, aStart || 0), plan.mixStartA);
    const warp = plan.warp || 1;

    // Render B's source up front (key-lock — see prepareB) so the render doesn't
    // eat into the lead time computed from t0 below.
    const bSrc = await this.prepareB(b, warp, detuneCents / 100, plan.mixStartB);

    const t0 = c.currentTime + 0.1;
    const transStart = t0 + (plan.mixStartA - start);
    const transEnd = transStart + plan.transLen;
    const barSec = plan.transLen / plan.phraseBars;

    const srcA = c.createBufferSource();
    srcA.buffer = a.buffer;
    const srcB = c.createBufferSource();
    srcB.buffer = bSrc.buffer;
    if (bSrc.rate !== 1) srcB.playbackRate.value = bSrc.rate;
    if (bSrc.detune) srcB.detune.value = bSrc.detune;

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
    // Vocal swap (mid band) mirrors the bass swap, but only when the plan calls for it.
    if (plan.vocalEase) {
      eqA.mid.gain.setValueAtTime(0, t0);
      eqB.mid.gain.setValueAtTime(KILL_DB, t0);
    }
    for (let k = 0; k <= STEPS; k++) {
      const p = k / STEPS;
      const t = transStart + p * plan.transLen;
      const { a, b } = eqBands(p, plan.beatmatch, plan.vocalEase);
      eqA.low.gain.linearRampToValueAtTime(toDb(a.low), t);
      eqB.low.gain.linearRampToValueAtTime(toDb(b.low), t);
      if (plan.vocalEase) {
        eqA.mid.gain.linearRampToValueAtTime(toDb(a.mid), t);
        eqB.mid.gain.linearRampToValueAtTime(toDb(b.mid), t);
      }
    }

    srcA.start(t0, start);
    srcB.start(transStart, bSrc.offset);
    srcA.stop(transEnd + 0.2);
    // A key-locked slice plays at rate 1, so its real-time length is the buffer
    // itself; otherwise the resampled tail is the remaining audio over `warp`.
    const bRealEnd = bSrc.keyLocked
      ? transStart + bSrc.buffer.duration
      : transStart + (b.buffer.duration - plan.mixStartB) / warp;
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

  /**
   * Play a whole set end to end: every track + chained crossfade is scheduled up
   * front on the AudioContext clock. Each incoming track is warped to the
   * outgoing one for the overlap only, then snaps back to its native tempo (no
   * compounding drift), with the same bass-swap EQ as a single transition.
   * `plans[i]` is the resolved transition from track i to track i+1.
   */
  async playSet(
    tracks: Track[],
    plans: TransitionPlan[],
    onUpdate: OnSetUpdate,
    onEnd: OnEnd,
  ): Promise<void> {
    this.stop();
    if (tracks.length < 2 || plans.length !== tracks.length - 1) return;
    const c = this.context();
    await c.resume();
    const n = tracks.length;
    const last = n - 1;
    const t0 = c.currentTime + 0.1;
    const LEAD_BARS = 8;
    const TAIL_BARS = 16;

    // Per-track buffer in/out points and the warp applied during the intro overlap.
    const rIn: number[] = [];
    const overlapIn: number[] = [];
    const inPoint: number[] = [];
    const outPoint: number[] = [];
    for (let i = 0; i < n; i++) {
      const bar = tracks[i]!.features.beat * 4;
      rIn[i] = i >= 1 ? plans[i - 1]!.warp || 1 : 1;
      overlapIn[i] = i >= 1 ? plans[i - 1]!.transLen : 0;
      inPoint[i] =
        i >= 1 ? plans[i - 1]!.mixStartB : Math.max(0, plans[0]!.mixStartA - LEAD_BARS * bar);
      const dur = tracks[i]!.buffer.duration;
      const naturalOut =
        i < last ? plans[i]!.mixStartA : Math.min(dur, inPoint[i] + TAIL_BARS * bar);
      // Guarantee room for the intro overlap plus a little solo time.
      outPoint[i] = Math.min(dur, Math.max(naturalOut, inPoint[i] + overlapIn[i] + 4 * bar));
    }

    // Absolute start time of each track (its source begins at inPoint[i]).
    const absStart: number[] = [t0];
    const absTrans: number[] = []; // start of the transition i→i+1
    for (let i = 0; i < n; i++) {
      const bufAfterIntro = inPoint[i]! + overlapIn[i]! * rIn[i]!;
      const soloReal = Math.max(0, outPoint[i]! - bufAfterIntro); // native rate after the intro
      absTrans[i] = absStart[i]! + overlapIn[i]! + soloReal;
      if (i < last) absStart[i + 1] = absTrans[i]!;
    }
    const setEnd = absTrans[last]! + 0.2;

    const STEPS = 16;
    for (let i = 0; i < n; i++) {
      const src = c.createBufferSource();
      src.buffer = tracks[i]!.buffer;
      const gain = c.createGain();
      const eq = makeEQ(c);
      src.connect(eq.input);
      eq.output.connect(gain).connect(c.destination);

      // Tempo: warped to the previous track through the intro overlap, then native.
      src.playbackRate.setValueAtTime(rIn[i]!, absStart[i]!);
      if (overlapIn[i]! > 0) src.playbackRate.setValueAtTime(1, absStart[i]! + overlapIn[i]!);

      // Volume: fade in over the intro overlap, fade out over the outro overlap.
      gain.gain.setValueAtTime(i === 0 ? 1 : 0.0001, absStart[i]!);
      if (i >= 1) gain.gain.linearRampToValueAtTime(1, absStart[i]! + overlapIn[i]!);
      if (i < last) {
        gain.gain.setValueAtTime(1, absTrans[i]!);
        gain.gain.linearRampToValueAtTime(0.0001, absTrans[i]! + plans[i]!.transLen);
      }

      // Bass-swap EQ: killed as the incoming track, swaps out as the outgoing one.
      // The mid band rides the same curve only on transitions flagged vocalEase.
      const easeIn = i >= 1 && !!plans[i - 1]!.vocalEase;
      const easeOut = i < last && !!plans[i]!.vocalEase;
      eq.low.gain.setValueAtTime(i === 0 ? 0 : KILL_DB, absStart[i]!);
      if (easeIn) eq.mid.gain.setValueAtTime(KILL_DB, absStart[i]!);
      if (i >= 1) {
        for (let k = 0; k <= STEPS; k++) {
          const p = k / STEPS;
          const { b } = eqBands(p, plans[i - 1]!.beatmatch, easeIn);
          eq.low.gain.linearRampToValueAtTime(toDb(b.low), absStart[i]! + p * overlapIn[i]!);
          if (easeIn) eq.mid.gain.linearRampToValueAtTime(toDb(b.mid), absStart[i]! + p * overlapIn[i]!);
        }
      }
      if (i < last) {
        eq.low.gain.setValueAtTime(0, absTrans[i]!);
        if (easeOut) eq.mid.gain.setValueAtTime(0, absTrans[i]!);
        for (let k = 0; k <= STEPS; k++) {
          const p = k / STEPS;
          const { a } = eqBands(p, plans[i]!.beatmatch, easeOut);
          eq.low.gain.linearRampToValueAtTime(toDb(a.low), absTrans[i]! + p * plans[i]!.transLen);
          if (easeOut) eq.mid.gain.linearRampToValueAtTime(toDb(a.mid), absTrans[i]! + p * plans[i]!.transLen);
        }
      }

      src.start(absStart[i]!, inPoint[i]!);
      src.stop(i < last ? absTrans[i]! + plans[i]!.transLen + 0.1 : setEnd);
      this.sources.push(src);
    }

    const tick = () => {
      const now = c.currentTime;
      if (now >= setEnd) {
        this.stop();
        onEnd();
        return;
      }
      let index = 0;
      for (let i = 0; i < n; i++) if (now >= absStart[i]!) index = i;
      const blending = index >= 1 && now < absStart[index]! + overlapIn[index]!;
      // The active transition is plans[index-1]; its blend spans the incoming
      // track's intro overlap, so progress + bar mirror a single coach mix.
      let mix: MixState | null = null;
      if (blending) {
        const p = clamp((now - absStart[index]!) / overlapIn[index]!, 0, 1);
        mix = { phase: "blend", progress: p, bar: Math.floor(p * plans[index - 1]!.phraseBars) };
      }
      onUpdate({
        index,
        from: blending ? index - 1 : -1,
        blending,
        progress: clamp((now - t0) / (setEnd - t0), 0, 1),
        mix,
      });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
