import { useEffect, useRef, useState, type Ref } from "react";
import { theme } from "../theme";
import { eqBands, type PlayUpdate } from "../audio/engine";
import type { ControlRef, PlaybookStep } from "../audio/types";

/**
 * A schematic of the Pioneer/AlphaTheta DDJ-FLX4 — the entry-level 2-deck controller
 * most beginners learn on.
 *
 * Three layers:
 *  - Anticipation (React, coarse): a bar before a step fires, its controls pulse amber
 *    and a "get ready" countdown ticks down the beats — so a beginner can move their
 *    hand into place *before* the hit, not react after it. Only a few setStates/bar.
 *  - Highlight (React): when the step fires, its control(s) light solid green — "go now".
 *  - Live (imperative): while a transition plays, the LOW knobs rotate and the channel
 *    faders slide every frame to mirror the *actual* audio — the same bass-swap curve
 *    (eqBands) and linear channel fade (gA=1−p, gB=p) the engine is performing. Driven
 *    off the per-frame subscribe() stream via refs, never 60fps setState.
 */

type Dir = "up" | "down" | undefined;

const LEAD_BARS = 1; // how far ahead a move is armed (a 4-beat countdown)
const ARM = "#E0A53A"; // amber "get ready" cue

interface FLX4MapProps {
  playbook: PlaybookStep[];
  activeStep: number;
  beatmatch: boolean;
  phraseBars: number;
  subscribe: (cb: (f: PlayUpdate | null) => void) => () => void;
}

// Geometry shared between the static drawing and the live layer, so the two never drift.
const LIVE = {
  lowCy: 196, // LOW knob center y (matches ChannelStrip)
  faderTop: 290, // channel fader track top y
  faderH: 78, // channel fader track height
  capH: 14, // fader cap height
  cx: { A: 414, B: 486 } as const, // channel-strip center x per deck
  knobSwing: 140, // degrees from full (pointer up) to killed
};

const PART_LABEL: Record<ControlRef["part"], string> = {
  lowEQ: "LOW",
  midEQ: "MID",
  hiEQ: "HI",
  filter: "FILTER",
  channelFader: "VOLUME",
  crossfader: "CROSSFADER",
  play: "PLAY",
  cue: "CUE",
  jog: "JOG",
  tempo: "TEMPO",
};

const key = (c: ControlRef) => `${c.target}.${c.part}`;
const fmtControl = (c: ControlRef) =>
  `${PART_LABEL[c.part]}${c.dir ? (c.dir === "up" ? " ▲" : " ▼") : ""}${c.target !== "center" ? ` · ${c.target}` : ""}`;

const PANEL = "#1B1B21";
const METAL = "#34343C";
const RING = "#4C4C55";
const POINTER = "#9A9AA2";
const GLOW = "#10453A";
const LIT_INK = "#BFE9DB";
const LABEL = "#7E7E88";

function DirArrow({ x, y, dir }: { x: number; y: number; dir: Dir }) {
  if (!dir) return null;
  return (
    <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fill={theme.accent}>
      {dir === "up" ? "▲" : "▼"}
    </text>
  );
}

function Knob({
  cx,
  cy,
  label,
  active,
  arming,
  dir,
  pointerRef,
}: {
  cx: number;
  cy: number;
  label: string;
  active: boolean;
  arming?: boolean;
  dir: Dir;
  pointerRef?: Ref<SVGLineElement>;
}) {
  const r = 13;
  return (
    <g>
      {active && (
        <circle
          cx={cx}
          cy={cy}
          r={r + 6}
          fill="none"
          stroke={theme.accent}
          strokeWidth={2}
          opacity={0.45}
          filter="url(#flxGlow)"
        />
      )}
      {arming && !active && (
        <circle className="flx-arm" cx={cx} cy={cy} r={r + 6} fill="none" stroke={ARM} strokeWidth={2} strokeDasharray="3 3" />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={active ? GLOW : METAL}
        stroke={active ? theme.accent : RING}
        strokeWidth={active ? 2 : 1.2}
      />
      <line
        ref={pointerRef}
        x1={cx}
        y1={cy}
        x2={cx}
        y2={cy - r + 3}
        stroke={active ? LIT_INK : POINTER}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <text
        x={cx}
        y={cy + r + 11}
        textAnchor="middle"
        fontSize={9}
        fontFamily={theme.mono}
        fill={active ? LIT_INK : LABEL}
        letterSpacing="0.05em"
      >
        {label}
      </text>
      {active && <DirArrow x={cx + r + 8} y={cy} dir={dir} />}
    </g>
  );
}

function VFader({
  x,
  yTop,
  h,
  label,
  active,
  arming,
  dir,
  capRef,
}: {
  x: number;
  yTop: number;
  h: number;
  label: string;
  active: boolean;
  arming?: boolean;
  dir: Dir;
  capRef?: Ref<SVGRectElement>;
}) {
  // Cap sits where the step wants the fader: up = top, down = bottom, else mid.
  const capY = dir === "up" ? yTop + 6 : dir === "down" ? yTop + h - 20 : yTop + h / 2 - 7;
  return (
    <g>
      {active && (
        <rect
          x={x - 8}
          y={yTop - 6}
          width={16}
          height={h + 12}
          rx={8}
          fill="none"
          stroke={theme.accent}
          strokeWidth={1.6}
          opacity={0.4}
          filter="url(#flxGlow)"
        />
      )}
      {arming && !active && (
        <rect className="flx-arm" x={x - 8} y={yTop - 6} width={16} height={h + 12} rx={8} fill="none" stroke={ARM} strokeWidth={1.6} strokeDasharray="3 3" />
      )}
      <line x1={x} y1={yTop} x2={x} y2={yTop + h} stroke={RING} strokeWidth={3} strokeLinecap="round" />
      <rect
        ref={capRef}
        x={x - 9}
        y={capY}
        width={18}
        height={14}
        rx={3}
        fill={active ? GLOW : METAL}
        stroke={active ? theme.accent : RING}
        strokeWidth={active ? 2 : 1.2}
      />
      <text
        x={x}
        y={yTop + h + 13}
        textAnchor="middle"
        fontSize={9}
        fontFamily={theme.mono}
        fill={active ? LIT_INK : LABEL}
        letterSpacing="0.05em"
      >
        {label}
      </text>
    </g>
  );
}

function Btn({
  x,
  y,
  w,
  h,
  label,
  active,
  arming,
  accentIdle,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  active: boolean;
  arming?: boolean;
  accentIdle?: string;
}) {
  return (
    <g>
      {active && (
        <rect
          x={x - 4}
          y={y - 4}
          width={w + 8}
          height={h + 8}
          rx={9}
          fill="none"
          stroke={theme.accent}
          strokeWidth={1.8}
          opacity={0.45}
          filter="url(#flxGlow)"
        />
      )}
      {arming && !active && (
        <rect className="flx-arm" x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx={9} fill="none" stroke={ARM} strokeWidth={1.8} strokeDasharray="3 3" />
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill={active ? GLOW : METAL}
        stroke={active ? theme.accent : accentIdle ?? RING}
        strokeWidth={active ? 2 : 1.2}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 4}
        textAnchor="middle"
        fontSize={10}
        fontFamily={theme.mono}
        fill={active ? LIT_INK : LABEL}
        letterSpacing="0.06em"
      >
        {label}
      </text>
    </g>
  );
}

/** A non-interactive knob drawn for visual fidelity (TRIM, MASTER) — never highlighted. */
function PlainKnob({ cx, cy, r = 11, label }: { cx: number; cy: number; r?: number; label?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={METAL} stroke={RING} strokeWidth={1.2} />
      <line x1={cx} y1={cy} x2={cx} y2={cy - r + 2} stroke={POINTER} strokeWidth={1.6} strokeLinecap="round" />
      {label && (
        <text x={cx} y={cy + r + 9} textAnchor="middle" fontSize={8} fontFamily={theme.mono} fill={LABEL} letterSpacing="0.05em">
          {label}
        </text>
      )}
    </g>
  );
}

/** A round transport button (play / cue), the way the FLX4's sit at the deck's bottom corner. */
function RoundBtn({ cx, cy, label, active, arming, ring }: { cx: number; cy: number; label: string; active: boolean; arming?: boolean; ring?: string }) {
  const r = 17;
  return (
    <g>
      {active && <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={theme.accent} strokeWidth={1.8} opacity={0.45} filter="url(#flxGlow)" />}
      {arming && !active && <circle className="flx-arm" cx={cx} cy={cy} r={r + 5} fill="none" stroke={ARM} strokeWidth={1.8} strokeDasharray="3 3" />}
      <circle cx={cx} cy={cy} r={r} fill={active ? GLOW : METAL} stroke={active ? theme.accent : ring ?? RING} strokeWidth={active ? 2 : 1.2} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontFamily={theme.mono} fill={active ? LIT_INK : LABEL}>
        {label}
      </text>
    </g>
  );
}

interface SideProps {
  side: "A" | "B";
  on: (id: string) => boolean;
  arming: (id: string) => boolean;
  dirOf: (id: string) => Dir;
}

const DECK_W = 330;

/** One deck: top buttons, a big jog wheel up high, then pads + transport + tempo along the bottom. */
function Deck({ side, ox, on, arming, dirOf }: SideProps & { ox: number }) {
  const cx = ox + DECK_W / 2;
  const jogOn = on(`${side}.jog`);
  const jogArm = arming(`${side}.jog`);
  // Transport on the outer edge, tempo fader on the inner edge (toward the mixer).
  const transportX = side === "A" ? ox + 36 : ox + DECK_W - 36;
  const tempoX = side === "A" ? ox + DECK_W - 26 : ox + 26;

  const pads: JSX.Element[] = [];
  const padLeft = cx - 80;
  for (let i = 0; i < 8; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    pads.push(
      <rect
        key={i}
        x={padLeft + col * 42}
        y={300 + row * 36}
        width={34}
        height={28}
        rx={4}
        fill="#26222B"
        stroke="#4A3F52"
        strokeWidth={1}
      />,
    );
  }

  return (
    <g>
      {/* top button row */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={cx - 100 + i * 42} y={26} width={32} height={12} rx={6} fill="#23232A" stroke={RING} strokeWidth={0.8} />
      ))}

      {/* jog wheel — dominates the top of the deck */}
      {jogOn && <circle cx={cx} cy={155} r={88} fill="none" stroke={theme.accent} strokeWidth={2} opacity={0.4} filter="url(#flxGlow)" />}
      {jogArm && !jogOn && <circle className="flx-arm" cx={cx} cy={155} r={88} fill="none" stroke={ARM} strokeWidth={2} strokeDasharray="4 4" />}
      <circle cx={cx} cy={155} r={82} fill="#202027" stroke={jogOn ? theme.accent : RING} strokeWidth={jogOn ? 2.4 : 1.5} />
      <circle cx={cx} cy={155} r={54} fill="#17171C" stroke={RING} strokeWidth={1} />
      <circle cx={cx} cy={155} r={16} fill="#23232A" stroke={RING} strokeWidth={0.8} />
      <text x={cx} y={159} textAnchor="middle" fontSize={12} fontFamily={theme.mono} fill={LABEL} letterSpacing="0.18em">
        {side}
      </text>

      {/* performance pads (bottom), with mode-row caption */}
      <text x={cx} y={288} textAnchor="middle" fontSize={7.5} fontFamily={theme.mono} fill={LABEL} letterSpacing="0.1em">
        HOT CUE · PAD FX · BEAT JUMP · SAMPLER
      </text>
      {pads}

      {/* tempo fader, inner edge */}
      <VFader x={tempoX} yTop={262} h={96} label="TEMPO" active={on(`${side}.tempo`)} arming={arming(`${side}.tempo`)} dir={dirOf(`${side}.tempo`)} />

      {/* transport, outer corner */}
      <RoundBtn cx={transportX} cy={272} label="CUE" active={on(`${side}.cue`)} arming={arming(`${side}.cue`)} />
      <RoundBtn cx={transportX} cy={330} label="▶" active={on(`${side}.play`)} arming={arming(`${side}.play`)} ring="#3A5A4E" />
    </g>
  );
}

/** One mixer channel strip: trim, 3-band EQ, CFX filter (bottom), cue, channel fader. */
function ChannelStrip({
  side,
  cx,
  on,
  arming,
  dirOf,
  lowRef,
  faderRef,
}: SideProps & { cx: number; lowRef?: Ref<SVGLineElement>; faderRef?: Ref<SVGRectElement> }) {
  return (
    <g>
      <PlainKnob cx={cx} cy={84} label="TRIM" />
      <Knob cx={cx} cy={120} label="HI" active={on(`${side}.hiEQ`)} arming={arming(`${side}.hiEQ`)} dir={dirOf(`${side}.hiEQ`)} />
      <Knob cx={cx} cy={158} label="MID" active={on(`${side}.midEQ`)} arming={arming(`${side}.midEQ`)} dir={dirOf(`${side}.midEQ`)} />
      <Knob cx={cx} cy={LIVE.lowCy} label="LOW" active={on(`${side}.lowEQ`)} arming={arming(`${side}.lowEQ`)} dir={dirOf(`${side}.lowEQ`)} pointerRef={lowRef} />
      <Knob cx={cx} cy={234} label="CFX" active={on(`${side}.filter`)} arming={arming(`${side}.filter`)} dir={dirOf(`${side}.filter`)} />
      <Btn x={cx - 16} y={258} w={32} h={20} label="♪" active={on(`${side}.cue`)} arming={arming(`${side}.cue`)} />
      <VFader
        x={cx}
        yTop={LIVE.faderTop}
        h={LIVE.faderH}
        label={side}
        active={on(`${side}.channelFader`)}
        arming={arming(`${side}.channelFader`)}
        dir={dirOf(`${side}.channelFader`)}
        capRef={faderRef}
      />
    </g>
  );
}

export function FLX4Map({ playbook, activeStep, beatmatch, phraseBars, subscribe }: FLX4MapProps) {
  const controls = (activeStep >= 0 ? playbook[activeStep]?.controls : undefined) ?? [];
  const active = new Map<string, Dir>(controls.map((c) => [key(c), c.dir]));
  const on = (id: string) => active.has(id);
  const dirOf = (id: string): Dir => active.get(id);

  // Anticipation: the step about to fire (within LEAD_BARS) + beats until it does.
  const [arm, setArm] = useState<{ step: number; beats: number }>({ step: -1, beats: 0 });
  const armControls = (arm.step >= 0 ? playbook[arm.step]?.controls : undefined) ?? [];
  const armSet = new Set(armControls.map(key));
  const arming = (id: string) => armSet.has(id);

  useEffect(() => {
    let lastStep = -1;
    let lastBeats = -1;
    return subscribe((f) => {
      if (!f || !f.mix || f.mix.phase !== "blend") {
        if (lastStep !== -1) {
          lastStep = -1;
          lastBeats = -1;
          setArm({ step: -1, beats: 0 });
        }
        return;
      }
      const barFloat = f.mix.progress * phraseBars;
      const next = playbook.findIndex((s) => s.atBar > barFloat + 1e-3);
      const barsAway = next >= 0 ? playbook[next].atBar - barFloat : Infinity;
      const step = barsAway <= LEAD_BARS ? next : -1;
      const beats = step >= 0 ? Math.max(1, Math.ceil(barsAway * 4)) : 0;
      // Coarse: fires only when the armed step or the beat count changes (~once/beat).
      if (step !== lastStep || beats !== lastBeats) {
        lastStep = step;
        lastBeats = beats;
        setArm({ step, beats });
      }
    });
  }, [subscribe, phraseBars, playbook]);

  // Live layer: rotate the LOW knobs and slide the channel faders to match the audio.
  const aLow = useRef<SVGLineElement>(null);
  const bLow = useRef<SVGLineElement>(null);
  const aFader = useRef<SVGRectElement>(null);
  const bFader = useRef<SVGRectElement>(null);

  useEffect(() => {
    const rotate = (el: SVGLineElement | null, cx: number, level: number) => {
      // level 1 = pointer up (full); 0 = killed, swung counter-clockwise.
      if (el) el.setAttribute("transform", `rotate(${-(1 - level) * LIVE.knobSwing} ${cx} ${LIVE.lowCy})`);
    };
    const slide = (el: SVGRectElement | null, gain: number) => {
      // gain 1 = cap at top of the track, 0 = bottom.
      if (el) el.setAttribute("y", String(LIVE.faderTop + (1 - gain) * (LIVE.faderH - LIVE.capH)));
    };
    // p === null → resting: lows open, A up (playing), B down (cued, not yet in).
    const apply = (p: number | null) => {
      const bands = p === null ? null : eqBands(p, beatmatch);
      rotate(aLow.current, LIVE.cx.A, bands ? bands.a.low : 1);
      rotate(bLow.current, LIVE.cx.B, bands ? bands.b.low : 1);
      slide(aFader.current, p === null ? 1 : 1 - p);
      slide(bFader.current, p === null ? 0 : p);
    };
    apply(null);
    return subscribe((f) =>
      apply(f && f.mix && f.mix.phase !== "runup" ? f.mix.progress : null),
    );
  }, [subscribe, beatmatch]);

  const xfActive = on("center.crossfader");
  const xfArm = arming("center.crossfader");
  const summary = controls.map(fmtControl).join("   +   ");
  const armSummary = armControls.map(fmtControl).join("   +   ");

  return (
    <div
      style={{
        background: "#131318",
        border: `1px solid ${theme.line}`,
        borderRadius: 12,
        padding: "14px 16px 10px",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: theme.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A92" }}>
          On your DDJ-FLX4
        </span>
        {arm.step >= 0 ? (
          <span style={{ fontFamily: theme.mono, fontSize: 11, color: ARM }}>
            get ready · {armSummary} · in {arm.beats}
          </span>
        ) : (
          <span style={{ fontFamily: theme.mono, fontSize: 11, color: summary ? LIT_INK : LABEL }}>
            {summary || (activeStep < 0 ? "press play to follow along" : "listen — hands off")}
          </span>
        )}
      </div>

      <svg viewBox="0 0 900 480" width="100%" style={{ display: "block" }} role="img" aria-label={summary ? `FLX4: ${summary}` : "DDJ-FLX4 controller"}>
        <defs>
          <filter id="flxGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          <style>{`@keyframes flxArm{0%,100%{opacity:.25}50%{opacity:.8}}.flx-arm{animation:flxArm .85s ease-in-out infinite}`}</style>
        </defs>

        {/* chassis: wide decks flanking a narrow, dense center mixer */}
        <rect x="2" y="2" width="896" height="476" rx="16" fill="#101015" stroke="#2A2A30" strokeWidth="1.5" />
        <rect x="14" y="14" width="330" height="452" rx="10" fill={PANEL} />
        <rect x="352" y="14" width="196" height="452" rx="10" fill="#16161B" />
        <rect x="556" y="14" width="330" height="452" rx="10" fill={PANEL} />

        <Deck side="A" ox={14} on={on} arming={arming} dirOf={dirOf} />

        {/* mixer — master up top, EQ stacks either side of a VU meter, crossfader at the foot */}
        <PlainKnob cx={450} cy={48} r={14} label="MASTER" />
        <text x="450" y="78" textAnchor="middle" fontSize="7" fontFamily={theme.mono} fill={LABEL} letterSpacing="0.18em">
          DDJ-FLX4
        </text>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const seg = ["#2E5A3F", "#2E5A3F", "#2E5A3F", "#3F5A2E", "#5A552E", "#5A3F2E", "#5A2E2E"][i];
          return <rect key={i} x={445} y={196 - i * 16} width={10} height={11} rx={1.5} fill={seg} opacity={0.6} />;
        })}
        <ChannelStrip side="A" cx={LIVE.cx.A} on={on} arming={arming} dirOf={dirOf} lowRef={aLow} faderRef={aFader} />
        <ChannelStrip side="B" cx={LIVE.cx.B} on={on} arming={arming} dirOf={dirOf} lowRef={bLow} faderRef={bFader} />

        {/* crossfader */}
        {xfActive && (
          <rect x="378" y="420" width="144" height="22" rx="11" fill="none" stroke={theme.accent} strokeWidth="1.8" opacity="0.4" filter="url(#flxGlow)" />
        )}
        {xfArm && !xfActive && (
          <rect className="flx-arm" x="378" y="420" width="144" height="22" rx="11" fill="none" stroke={ARM} strokeWidth="1.8" strokeDasharray="4 4" />
        )}
        <line x1="386" y1="431" x2="514" y2="431" stroke={RING} strokeWidth="3" strokeLinecap="round" />
        <rect x="441" y="423" width="18" height="16" rx="3" fill={xfActive ? GLOW : METAL} stroke={xfActive ? theme.accent : RING} strokeWidth={xfActive ? 2 : 1.2} />
        <text x="450" y="456" textAnchor="middle" fontSize="8.5" fontFamily={theme.mono} fill={xfActive ? LIT_INK : LABEL} letterSpacing="0.08em">
          CROSSFADER
        </text>

        <Deck side="B" ox={556} on={on} arming={arming} dirOf={dirOf} />
      </svg>
    </div>
  );
}
