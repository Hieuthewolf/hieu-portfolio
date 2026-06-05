import { useMemo } from "react";
import { theme } from "./theme";
import { useSegue } from "./hooks/useSegue";
import { TrackSlot } from "./components/TrackSlot";
import { Controls } from "./components/Controls";
import { CoachPanel } from "./components/CoachPanel";
import { MixerStrip } from "./components/MixerStrip";
import { Waveform } from "./components/Waveform";
import { GlossaryPanel } from "./components/GlossaryPanel";

export function App() {
  const {
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
  } = useSegue();

  const { A, B } = tracks;

  // Memoized so the waveforms' (expensive) static redraw isn't re-triggered on
  // every coarse re-render — only when the plan actually changes.
  const regionA = useMemo(
    () => (plan ? { start: plan.mixStartA, end: plan.mixStartA + plan.transLen } : null),
    [plan],
  );
  const regionB = useMemo(
    () => (plan ? { start: plan.mixStartB, end: plan.mixStartB + plan.transLen * (plan.warp || 1) } : null),
    [plan],
  );

  const activeStep = (() => {
    if (!plan || !mix || mix.phase === "runup") return -1;
    let idx = -1;
    plan.playbook.forEach((s, i) => {
      if (s.atBar <= mix.bar) idx = i;
    });
    return idx;
  })();

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.ink }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 24px 80px" }}>
        <header style={{ marginBottom: 36 }}>
          <a
            href="/"
            style={{
              fontFamily: theme.mono,
              fontSize: 12,
              color: theme.muted,
              textDecoration: "none",
              display: "inline-block",
              marginBottom: 18,
            }}
          >
            ← Hieu Nguyen
          </a>
          <div
            style={{
              fontFamily: theme.mono,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: theme.accent,
              marginBottom: 10,
            }}
          >
            Segue · AI DJ Coach
          </div>
          <h1 style={{ margin: 0, fontFamily: theme.serif, fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>
            Two tracks in. A plan to blend them out.
          </h1>
          <p
            style={{
              margin: "14px 0 0",
              maxWidth: 620,
              fontFamily: theme.sans,
              fontSize: 16,
              lineHeight: 1.55,
              color: theme.muted,
            }}
          >
            Load the track that's playing and the one coming next. Segue reads the tempo, key, and structure of
            each, then asks Claude to plan a phrase-aligned transition — and walks you through it, step by step.
          </p>
        </header>

        {error && (
          <div
            style={{
              fontFamily: theme.sans,
              fontSize: 14,
              color: "#B5532F",
              background: "#FBEEE8",
              border: "1px solid #E8C9BC",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <TrackSlot
            tag="A"
            role="playing"
            track={A}
            isPlaying={playing === "A"}
            onFile={(file) => void loadFile("A", file)}
            onPlayToggle={() => playTrack("A")}
          />
          <TrackSlot
            tag="B"
            role="incoming"
            track={B}
            isPlaying={playing === "B"}
            onFile={(file) => void loadFile("B", file)}
            onPlayToggle={() => playTrack("B")}
          />
        </div>

        {(A || B) && (
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {A && (
              <Waveform
                features={A.features}
                region={regionA}
                label="Track A"
                cursor={plan ? plan.mixStartA : A.cursor}
                cursorLabel={plan ? "mix out" : null}
                slot="A"
                subscribe={subscribe}
                onSeek={(t) => setMarker("A", t)}
              />
            )}
            {B && (
              <Waveform
                features={B.features}
                region={regionB}
                label="Track B"
                cursor={B.cursor}
                cursorLabel={plan ? "mix in" : null}
                slot="B"
                subscribe={subscribe}
                onSeek={(t) => setMarker("B", t)}
              />
            )}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <Controls
            opts={opts}
            canPlan={!!A && !!B}
            hasPlan={!!plan}
            planning={planning}
            isMixing={playing === "mix" || playing === "transition"}
            set={set}
            onFind={find}
            onPlayMix={playMix}
            onPlayTransition={playTransition}
            onStop={stop}
            onNudge={nudge}
          />
        </div>

        {plan && (mix || playing === "mix" || playing === "transition") && (
          <div style={{ marginBottom: 16 }}>
            <MixerStrip mix={mix} subscribe={subscribe} />
          </div>
        )}

        {plan && A && B && (
          <div style={{ marginBottom: 28 }}>
            <CoachPanel plan={plan} a={A.features} b={B.features} activeStep={activeStep} />
          </div>
        )}

        <GlossaryPanel />
      </div>
    </div>
  );
}
