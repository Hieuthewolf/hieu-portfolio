import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeBuffer } from "../audio/analyze";
import { clamp, snapGrid } from "../audio/dsp";
import { AudioEngine, type MixState, type PlayUpdate } from "../audio/engine";
import {
  heuristicStrategy,
  requestPlan,
  resolvePlan,
  strategyFromPlan,
} from "../audio/planClient";
import type { PlanOptions, Track, TransitionPlan } from "../audio/types";

type Slot = "A" | "B";
type Tracks = { A: Track | null; B: Track | null };
type Playing = "A" | "B" | "mix" | "transition" | null;

const DEFAULT_OPTS: PlanOptions = {
  phraseBars: 16,
  beatmatch: true,
  setMoment: "peak",
  nudgeBars: 0,
};

export function useSegue() {
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  const [tracks, setTracks] = useState<Tracks>({ A: null, B: null });
  const [plan, setPlan] = useState<TransitionPlan | null>(null);
  const [opts, setOpts] = useState<PlanOptions>(DEFAULT_OPTS);
  const [mix, setMix] = useState<MixState | null>(null);
  const [playing, setPlaying] = useState<Playing>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The engine emits a PlayUpdate every animation frame (~60fps). Routing that
  // through React state re-renders the whole tree (and re-draws both waveforms)
  // 60×/sec, which is what made playback feel laggy. Instead, per-frame updates
  // are pushed to imperative subscribers — the moving playhead and crossfade bar
  // animate by writing to a canvas/DOM node directly, with zero re-renders.
  // Only *coarse* changes (mix phase / bar boundary) flow through `mix` state.
  const listenersRef = useRef(new Set<(f: PlayUpdate | null) => void>());
  const mixKeyRef = useRef("");
  const subscribe = useCallback((cb: (f: PlayUpdate | null) => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);
  const emit = useCallback((f: PlayUpdate | null) => {
    for (const cb of listenersRef.current) cb(f);
  }, []);

  // Mirrors for use inside stable callbacks without stale closures.
  const tracksRef = useRef(tracks);
  const planRef = useRef(plan);
  const playingRef = useRef(playing);
  const optsRef = useRef(opts);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  useEffect(() => () => engine.stop(), [engine]);

  const applyPlan = useCallback((p: TransitionPlan) => {
    setPlan(p);
    setTracks((prev) => (prev.B ? { ...prev, B: { ...prev.B, cursor: p.mixStartB } } : prev));
  }, []);

  const loadFile = useCallback(
    async (slot: Slot, file: File) => {
      setError(null);
      try {
        const buffer = await engine.decode(file);
        const features = analyzeBuffer(buffer);
        const track: Track = {
          id: crypto.randomUUID(),
          name: file.name,
          buffer,
          features,
          cursor: null,
        };
        setTracks((prev) => (slot === "A" ? { ...prev, A: track } : { ...prev, B: track }));
      } catch (e) {
        setError(`Could not read ${file.name}: ${(e as Error).message}`);
      }
    },
    [engine],
  );

  const runPlan = useCallback(
    async (o: PlanOptions) => {
      const { A, B } = tracksRef.current;
      if (!A || !B) return;
      setPlanning(true);
      setError(null);
      try {
        const p = await requestPlan(A.features, B.features, o); // LLM via GraphQL
        applyPlan(p);
      } catch {
        const strat = heuristicStrategy(A.features, B.features, o); // offline fallback
        applyPlan(resolvePlan(A.features, B.features, strat, 0, "heuristic"));
      } finally {
        setPlanning(false);
      }
    },
    [applyPlan],
  );

  const reResolve = useCallback(
    (o: PlanOptions) => {
      const { A, B } = tracksRef.current;
      const current = planRef.current;
      if (!A || !B || !current) return;
      const strat = { ...strategyFromPlan(current), phraseBars: o.phraseBars };
      applyPlan(resolvePlan(A.features, B.features, strat, o.nudgeBars, current.source));
    },
    [applyPlan],
  );

  const find = useCallback(() => {
    const o: PlanOptions = { ...optsRef.current, nudgeBars: 0 };
    setOpts(o);
    void runPlan(o);
  }, [runPlan]);

  const set = useCallback(
    <K extends keyof PlanOptions>(k: K, v: PlanOptions[K]) => {
      const o: PlanOptions = { ...optsRef.current };
      o[k] = v;
      if (k === "phraseBars") o.nudgeBars = 0;
      setOpts(o);
      if (!planRef.current) return;
      // Phrase length is a pure timing change → re-resolve locally.
      // Moment/beatmatch change the *decision* → ask the coach again.
      if (k === "phraseBars") reResolve(o);
      else void runPlan(o);
    },
    [runPlan, reResolve],
  );

  const nudge = useCallback(
    (d: number) => {
      const o: PlanOptions = { ...optsRef.current, nudgeBars: optsRef.current.nudgeBars + d };
      setOpts(o);
      if (planRef.current) reResolve(o);
    },
    [reResolve],
  );

  const onUpdate = useCallback(
    (u: PlayUpdate) => {
      emit(u); // smooth, per-frame — no re-render
      // Mirror to React state only when the discrete phase/bar actually changes.
      const key = u.mix ? `${u.mix.phase}:${u.mix.bar}` : "none";
      if (key !== mixKeyRef.current) {
        mixKeyRef.current = key;
        setMix(u.mix);
      }
    },
    [emit],
  );
  const onEnd = useCallback(() => {
    emit(null);
    mixKeyRef.current = "";
    setMix(null);
    setPlaying(null);
  }, [emit]);
  const stop = useCallback(() => {
    engine.stop();
    emit(null);
    mixKeyRef.current = "";
    setMix(null);
    setPlaying(null);
  }, [engine, emit]);

  const playMix = useCallback(() => {
    const { A, B } = tracksRef.current;
    if (!A || !B || !planRef.current) return;
    setPlaying("mix");
    void engine.playMix(A, B, planRef.current, A.cursor ?? 0, onUpdate, onEnd);
  }, [engine, onUpdate, onEnd]);

  const playTransition = useCallback(() => {
    const { A, B } = tracksRef.current;
    if (!A || !B || !planRef.current) return;
    setPlaying("transition");
    void engine.playTransition(A, B, planRef.current, onUpdate, onEnd);
  }, [engine, onUpdate, onEnd]);

  const playTrack = useCallback(
    (slot: Slot) => {
      const t = tracksRef.current[slot];
      if (!t) return;
      if (playingRef.current === slot) {
        stop();
        return;
      }
      setPlaying(slot);
      void engine.playTrack(t, slot, onUpdate, onEnd);
    },
    [engine, onUpdate, onEnd, stop],
  );

  // Load an already-decoded track straight into a slot (the Set Builder hand-off).
  // Clears any existing plan so the coach starts fresh on the new pair.
  const loadTrack = useCallback(
    (slot: Slot, track: Track) => {
      stop();
      setPlan(null);
      setError(null);
      setTracks((prev) =>
        slot === "A"
          ? { ...prev, A: { ...track, cursor: null } }
          : { ...prev, B: { ...track, cursor: null } },
      );
    },
    [stop],
  );

  const setMarker = useCallback((slot: Slot, time: number) => {
    setTracks((prev) => {
      const t = prev[slot];
      if (!t) return prev;
      const { phase, beat, duration } = t.features;
      const snapped = clamp(snapGrid(time, phase, beat * 4), 0, duration - 0.1);
      if (slot === "B" && planRef.current) {
        const v = Math.min(snapped, duration - planRef.current.transLen - 0.1);
        setPlan((p) => (p ? { ...p, mixStartB: v } : p));
        return { ...prev, B: { ...t, cursor: v } };
      }
      const updated: Track = { ...t, cursor: snapped };
      return slot === "A" ? { ...prev, A: updated } : { ...prev, B: updated };
    });
  }, []);

  return {
    tracks,
    plan,
    opts,
    subscribe,
    mix,
    playing,
    planning,
    error,
    loadFile,
    find,
    set,
    nudge,
    stop,
    playMix,
    playTransition,
    playTrack,
    setMarker,
    loadTrack,
  };
}
