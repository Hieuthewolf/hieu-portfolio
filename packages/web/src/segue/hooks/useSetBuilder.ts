import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeBuffer } from "../audio/analyze";
import { AudioEngine } from "../audio/engine";
import { gapsFor, localSetPlan, requestSetPlan, setTimeline } from "../audio/planClient";
import type { SetOptions, SetPlan, Track } from "../audio/types";

interface NowPlaying {
  index: number;
  from: number;
  blending: boolean;
}

const DEFAULT_SET_OPTS: SetOptions = {
  skill: "beginner",
  setMoment: "peak",
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
  const [opts, setOpts] = useState<SetOptions>(DEFAULT_SET_OPTS);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const npKey = useRef("");
  const reelRef = useRef(false); // is the one-at-a-time transitions reel running?

  useEffect(() => () => engine.stop(), [engine]);

  const addFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setSetPlan(null); // a changed track list invalidates the order
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

  const setOption = useCallback(<K extends keyof SetOptions>(k: K, v: SetOptions[K]) => {
    setOpts((o) => ({ ...o, [k]: v }));
  }, []);

  const buildSet = useCallback(async () => {
    if (tracks.length < 2) return;
    setPlanning(true);
    setError(null);
    try {
      setSetPlan(await requestSetPlan(tracks, opts));
    } catch {
      setSetPlan(localSetPlan(tracks, opts)); // offline fallback
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
    const plans = setTimeline(ordered, opts);
    reelRef.current = false;
    setPlaying(true);
    npKey.current = "";
    void engine.playSet(
      ordered,
      plans,
      (u) => {
        const key = `${u.index}:${u.blending}`;
        if (key !== npKey.current) {
          npKey.current = key;
          setNowPlaying({ index: u.index, from: u.from, blending: u.blending });
        }
      },
      () => {
        setPlaying(false);
        setNowPlaying(null);
        npKey.current = "";
      },
    );
  }, [setPlan, tracks, opts, engine]);

  // Play just the transitions, one at a time, back to back: each is the same
  // lead-in + bass-swap blend as the coach, chained over consecutive pairs. The
  // jump between them lands near the next track's mix-out ("to the song's end").
  const playTransitions = useCallback(() => {
    if (!setPlan || tracks.length < 2) return;
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const ordered = setPlan.order.map((id) => byId.get(id)!).filter(Boolean);
    if (ordered.length < 2) return;
    const plans = setTimeline(ordered, opts);
    reelRef.current = true;
    setPlaying(true);
    let i = 0;
    const playOne = () => {
      if (!reelRef.current || i >= plans.length) {
        reelRef.current = false;
        setPlaying(false);
        setNowPlaying(null);
        return;
      }
      setNowPlaying({ index: i + 1, from: i, blending: true });
      void engine.playTransition(
        ordered[i]!,
        ordered[i + 1]!,
        plans[i]!,
        () => {},
        () => {
          i++;
          playOne();
        },
      );
    };
    playOne();
  }, [setPlan, tracks, opts, engine]);

  const stopPlayback = useCallback(() => {
    reelRef.current = false;
    engine.stop();
    setPlaying(false);
    setNowPlaying(null);
    npKey.current = "";
  }, [engine]);

  return {
    tracks,
    setPlan,
    opts,
    planning,
    error,
    playing,
    nowPlaying,
    addFiles,
    removeTrack,
    pinIntro,
    pinOutro,
    setOption,
    buildSet,
    reorder,
    playSet,
    playTransitions,
    stopPlayback,
  };
}
