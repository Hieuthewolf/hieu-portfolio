import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeBuffer } from "../audio/analyze";
import { AudioEngine, type MixState, type PlayUpdate } from "../audio/engine";
import {
  gapsFor,
  localSetPlan,
  requestSetPlan,
  requestSetTimeline,
  setTimeline,
} from "../audio/planClient";
import type { SetOptions, SetPlan, Track, TransitionPlan } from "../audio/types";

interface NowPlaying {
  index: number;
  from: number;
  blending: boolean;
}

const DEFAULT_SET_OPTS: SetOptions = {
  beatmatch: true,
  phraseBars: 16,
  nudgeBars: 0,
  introId: null,
  outroId: null,
};

export function useSetBuilder() {
  // The set builder only decodes/analyses — playback (rehearsal) is the A/B
  // deck's engine. A dedicated engine here just gives us decodeAudioData.
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  const [tracks, setTracks] = useState<Track[]>([]);
  const [setPlan, setSetPlan] = useState<SetPlan | null>(null);
  // The LLM-resolved per-pair schedule, cached from the last Build. Cleared on any
  // edit (reorder/add/remove/option) so rehearsal falls back to the instant local
  // heuristic timeline — which is itself now mid-song-capable.
  const [timeline, setTimelineState] = useState<TransitionPlan[] | null>(null);
  const [opts, setOpts] = useState<SetOptions>(DEFAULT_SET_OPTS);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  // The transition currently blending (for the FLX4 board) + its coarse mix state
  // (phase/bar, for the active-step highlight). Per-frame motion rides `subscribe`.
  const [transitionPlan, setTransitionPlan] = useState<TransitionPlan | null>(null);
  const [blendMix, setBlendMix] = useState<MixState | null>(null);
  const npKey = useRef("");
  const mixKey = useRef("");
  const reelRef = useRef(false); // is the one-at-a-time transitions reel running?

  // Per-frame PlayUpdates go to imperative subscribers (FLX4 knobs/faders), never
  // through React state — same pattern as useSegue. Coarse changes use state above.
  const listenersRef = useRef(new Set<(f: PlayUpdate | null) => void>());
  const subscribe = useCallback((cb: (f: PlayUpdate | null) => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);
  const emit = useCallback((f: PlayUpdate | null) => {
    for (const cb of listenersRef.current) cb(f);
  }, []);

  // Mirror a per-frame mix into the coarse state only when phase/bar actually change.
  const pushCoarseMix = useCallback((mix: MixState | null) => {
    const k = mix ? `${mix.phase}:${mix.bar}` : "none";
    if (k !== mixKey.current) {
      mixKey.current = k;
      setBlendMix(mix);
    }
  }, []);

  useEffect(() => () => engine.stop(), [engine]);

  const addFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setSetPlan(null); // a changed track list invalidates the order
      setTimelineState(null);
      for (const file of files) {
        try {
          const buffer = await engine.decode(file);
          const features = analyzeBuffer(buffer);
          const track: Track = {
            id: crypto.randomUUID(),
            name: file.name,
            buffer,
            features,
            cursor: null,
            file,
          };
          setTracks((prev) => [...prev, track]);
        } catch (e) {
          setError(`Could not read ${file.name}: ${(e as Error).message}`);
        }
      }
    },
    [engine],
  );

  const removeTrack = useCallback((id: string) => {
    setSetPlan(null);
    setTimelineState(null);
    setTracks((prev) => prev.filter((t) => t.id !== id));
    setOpts((o) => ({
      ...o,
      introId: o.introId === id ? null : o.introId,
      outroId: o.outroId === id ? null : o.outroId,
    }));
  }, []);

  // Pins toggle; they take effect on the next Build.
  const pinIntro = useCallback((id: string) => {
    setOpts((o) => ({
      ...o,
      introId: o.introId === id ? null : id,
      outroId: o.outroId === id ? null : o.outroId,
    }));
  }, []);
  const pinOutro = useCallback((id: string) => {
    setOpts((o) => ({
      ...o,
      outroId: o.outroId === id ? null : id,
      introId: o.introId === id ? null : o.introId,
    }));
  }, []);

  const buildSet = useCallback(async () => {
    if (tracks.length < 2) return;
    setPlanning(true);
    setError(null);
    try {
      const plan = await requestSetPlan(tracks, opts);
      setSetPlan(plan);
      const byId = new Map(tracks.map((t) => [t.id, t]));
      const ordered = plan.order.map((id) => byId.get(id)!).filter(Boolean);
      setTimelineState(await requestSetTimeline(ordered, opts));
    } catch {
      setSetPlan(localSetPlan(tracks, opts)); // offline fallback
      setTimelineState(null); // rehearsal uses the local heuristic timeline
    } finally {
      setPlanning(false);
    }
  }, [tracks, opts]);

  // Manual reorder: move within the current order and recompute gaps locally
  // (instant, no round trip) — the user's override wins over the AI order.
  const reorder = useCallback(
    (from: number, to: number) => {
      setSetPlan((prev) => {
        if (!prev) return prev;
        const order = [...prev.order];
        if (from < 0 || to < 0 || from >= order.length || to >= order.length) return prev;
        const [moved] = order.splice(from, 1);
        order.splice(to, 0, moved!);
        const byId = new Map(tracks.map((t) => [t.id, t]));
        const orderedTracks = order.map((id) => byId.get(id)!).filter(Boolean);
        return { ...prev, order, gaps: gapsFor(orderedTracks, opts) };
      });
      setTimelineState(null); // a manual reorder restages the local heuristic timeline
    },
    [tracks, opts],
  );

  // Play the whole set end to end. Current-track changes are coarse (a handful
  // over a set), so they go through React state; nothing per-frame does.
  const playSet = useCallback(() => {
    if (!setPlan || tracks.length < 2) return;
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const ordered = setPlan.order.map((id) => byId.get(id)!).filter(Boolean);
    if (ordered.length < 2) return;
    const plans =
      timeline && timeline.length === ordered.length - 1 ? timeline : setTimeline(ordered, opts);
    reelRef.current = false;
    setPlaying(true);
    npKey.current = "";
    mixKey.current = "";
    void engine.playSet(
      ordered,
      plans,
      (u) => {
        emit({ slot: u.blending ? "B" : "A", head: 0, mix: u.mix });
        const key = `${u.index}:${u.blending}`;
        if (key !== npKey.current) {
          npKey.current = key;
          setNowPlaying({ index: u.index, from: u.from, blending: u.blending });
          setTransitionPlan(u.blending ? plans[u.from] ?? null : null);
        }
        pushCoarseMix(u.mix);
      },
      () => {
        emit(null);
        setPlaying(false);
        setNowPlaying(null);
        setTransitionPlan(null);
        setBlendMix(null);
        npKey.current = "";
        mixKey.current = "";
      },
    );
  }, [setPlan, tracks, opts, timeline, engine, emit, pushCoarseMix]);

  // Play just the transitions, one at a time, back to back: each is the same
  // lead-in + bass-swap blend as the coach, chained over consecutive pairs. The
  // jump between them lands near the next track's mix-out ("to the song's end").
  const playTransitions = useCallback(() => {
    if (!setPlan || tracks.length < 2) return;
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const ordered = setPlan.order.map((id) => byId.get(id)!).filter(Boolean);
    if (ordered.length < 2) return;
    const plans =
      timeline && timeline.length === ordered.length - 1 ? timeline : setTimeline(ordered, opts);
    reelRef.current = true;
    setPlaying(true);
    mixKey.current = "";
    let i = 0;
    const playOne = () => {
      if (!reelRef.current || i >= plans.length) {
        reelRef.current = false;
        emit(null);
        setPlaying(false);
        setNowPlaying(null);
        setTransitionPlan(null);
        setBlendMix(null);
        return;
      }
      setNowPlaying({ index: i + 1, from: i, blending: true });
      setTransitionPlan(plans[i]!);
      void engine.playTransition(
        ordered[i]!,
        ordered[i + 1]!,
        plans[i]!,
        (u) => {
          emit(u);
          pushCoarseMix(u.mix);
        },
        () => {
          i++;
          playOne();
        },
      );
    };
    playOne();
  }, [setPlan, tracks, opts, timeline, engine, emit, pushCoarseMix]);

  const stopPlayback = useCallback(() => {
    reelRef.current = false;
    engine.stop();
    emit(null);
    setPlaying(false);
    setNowPlaying(null);
    setTransitionPlan(null);
    setBlendMix(null);
    npKey.current = "";
    mixKey.current = "";
  }, [engine, emit]);

  return {
    tracks,
    setPlan,
    opts,
    planning,
    error,
    playing,
    nowPlaying,
    transitionPlan,
    blendMix,
    subscribe,
    addFiles,
    removeTrack,
    pinIntro,
    pinOutro,
    buildSet,
    reorder,
    playSet,
    playTransitions,
    stopPlayback,
  };
}
