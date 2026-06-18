import { useMemo, useState } from "react";
import { theme } from "./theme";
import { useSegue } from "./hooks/useSegue";
import { TrackSlot } from "./components/TrackSlot";
import { Controls } from "./components/Controls";
import { CoachPanel } from "./components/CoachPanel";
import { MixerStrip } from "./components/MixerStrip";
import { DeckEQ } from "./components/DeckEQ";
import { Waveform } from "./components/Waveform";
import { GlossaryPanel } from "./components/GlossaryPanel";
import { SetBuilder } from "./components/SetBuilder";
import { AccountMenu } from "../components/AccountMenu";
import type { Track } from "./audio/types";

type Mode = "coach" | "set";

export function App() {
  const {
    tracks,
    plan,
    opts,
    subscribe,
    mix,
    playing,
    planning,
    preparing,
    error,
    loadFile,
    find,
    set,
    nudge,
    stop,
    playMix,
    playTransition,
    playTrack,
    seekTo,
    loadTrack,
    keyShift,
    setKeyShift,
  } = useSegue();

  const [mode, setMode] = useState<Mode>("coach");

  // Set Builder hand-off: load the chosen pair into the A/B deck and switch to the coach.
  const rehearse = (from: Track, to: Track) => {
    loadTrack("A", from);
    loadTrack("B", to);
    setMode("coach");
  };

  const { A, B } = tracks;

  // Memoized so the waveforms' (expensive) static redraw isn't re-triggered on
  // every coarse re-render — only when the plan actually changes.
  const regionA = useMemo(
    () => (plan ? { start: plan.mixStartA, end: plan.mixStartA + plan.transLen } : null),
    [plan],
  );
  const regionB = useMemo(
    () =>
      plan
        ? { start: plan.mixStartB, end: plan.mixStartB + plan.transLen * (plan.warp || 1) }
        : null,
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <a
              href="/"
              style={{
                fontFamily: theme.mono,
                fontSize: 12,
                color: theme.muted,
                textDecoration: "none",
              }}
            >
              ← Hieu Nguyen
            </a>
            <AccountMenu />
          </div>
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
          <h1
            style={{
              margin: 0,
              fontFamily: theme.serif,
              fontSize: 40,
              fontWeight: 600,
              lineHeight: 1.1,
            }}
          >
            {mode === "coach"
              ? "Two tracks in. A plan to blend them out."
              : "Drop your tracks. Build the set."}
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
            {mode === "coach"
              ? "Load the track that's playing and the one coming next. Segue reads the tempo, key, and structure of each, then asks Claude to plan a phrase-aligned transition — and walks you through it, step by step."
              : "Drop in a handful of tracks. Segue orders them into a set that rides an energy arc and keeps neighbours mixable, then lets you rehearse any transition in the coach."}
          </p>

          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            {(["coach", "set"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  fontFamily: theme.mono,
                  fontSize: 12,
                  border: `1px solid ${mode === m ? theme.ink : theme.line}`,
                  background: mode === m ? theme.ink : "transparent",
                  color: mode === m ? theme.surface : theme.ink,
                  borderRadius: 999,
                  padding: "7px 16px",
                  cursor: "pointer",
                }}
              >
                {m === "coach" ? "Transition coach" : "Set builder"}
              </button>
            ))}
          </div>
        </header>

        {mode === "set" && <SetBuilder onRehearse={rehearse} />}

        {mode === "coach" && (
          <>
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

            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
            >
              <TrackSlot
                tag="A"
                role="playing"
                track={A}
                onFile={(file) => void loadFile("A", file)}
              />
              <TrackSlot
                tag="B"
                role="incoming"
                track={B}
                onFile={(file) => void loadFile("B", file)}
              />
            </div>

            {(A || B) && (
              <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                {A && (
                  <Waveform
                    features={A.features}
                    region={regionA}
                    label="Track A"
                    mark={plan ? plan.mixStartA : null}
                    markLabel="mix out"
                    position={A.cursor}
                    playing={playing === "A"}
                    slot="A"
                    subscribe={subscribe}
                    onSeek={(t) => seekTo("A", t)}
                    onPlayPause={() => playTrack("A")}
                  />
                )}
                {B && (
                  <Waveform
                    features={B.features}
                    region={regionB}
                    label="Track B"
                    mark={plan ? plan.mixStartB : null}
                    markLabel="mix in"
                    position={B.cursor}
                    playing={playing === "B"}
                    slot="B"
                    subscribe={subscribe}
                    onSeek={(t) => seekTo("B", t)}
                    onPlayPause={() => playTrack("B")}
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
                preparing={preparing}
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
              <div style={{ marginBottom: 16 }}>
                <DeckEQ beatmatch={plan.beatmatch} vocalEase={plan.vocalEase} subscribe={subscribe} />
              </div>
            )}

            {plan && A && B && (
              <div style={{ marginBottom: 28 }}>
                <CoachPanel
                  plan={plan}
                  a={A.features}
                  b={B.features}
                  activeStep={activeStep}
                  keyShift={keyShift}
                  setKeyShift={setKeyShift}
                  subscribe={subscribe}
                />
              </div>
            )}

            <GlossaryPanel />
          </>
        )}
      </div>
    </div>
  );
}
