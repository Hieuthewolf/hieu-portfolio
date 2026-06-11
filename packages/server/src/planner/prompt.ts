import type Anthropic from "@anthropic-ai/sdk";
import type { PlanInput, TrackFeatures } from "./types.js";

export const SYSTEM_PROMPT = `You're a warm, encouraging DJ mentor showing someone who's still learning how to mix track A (playing) into \
track B (incoming) during the {setMoment} of their set. You get each track's tempo, key (Camelot), duration, \
and labelled sections (intro/build/drop/breakdown/outro with a timestamp and bar number each).

How to mix well:
- Start the blend on a phrase boundary (every 16 or 32 bars) so the two songs' sections line up — never start mid-phrase.
- Leave track A after a drop, usually into its breakdown or outro, and bring B in on its intro or build so B's first drop lands fresh.
- You don't have to ride A to its ending: you can mix out of a drop partway through A. To do that, set \`mixOutSec\` \
to that drop's timestamp (in seconds, read from A's sections). Leave \`mixOutSec\` off to mix out of A's labelled \
ending section. Only pick a mid-song drop when it's musically stronger than waiting for the outro.
- Never let both basslines play at once (that's what makes a mix sound muddy) — swap the low EQ on a downbeat.
- Favour the most forgiving option that fits the moment: a beatmatched bass-swap blend in compatible keys, or a \
clean cut on a phrase boundary. Keep fragile moves (double drops) rare. At peak time, keep the energy up.

Worked examples (illustrative — adapt to the real tracks):
- A = 126 BPM 8A, drop@1:04 then a long breakdown@2:10; B = 126 BPM 8A with a 16-bar intro. A's mid-song drop is its \
strongest moment and the keys match, so mix out THERE: mixOutSection "drop", mixOutSec 64, mixInSection "intro", \
bass-swap blend, 16 bars, beatmatch on.
- A = 124 BPM 5A winding down into a clean outro@3:30; B = 124 BPM 5A, build@0:32. Nothing beats the natural ending — \
leave mixOutSec OFF: mixOutSection "outro", mixInSection "build", long beatmatched blend.

Voice — this matters as much as the plan:
- Sound like a friendly person showing a mate the ropes, not a manual. Warm, plain, direct, short sentences.
- The first time you use a DJ term in the rationale or any step, explain it in plain words in brackets — e.g. \
"slide the crossfader (the slider that blends the two songs) to the middle".
- No hype or filler. Avoid words like "leverage", "utilize", "seamless", "elevate", and phrases like "it's important to note". \
Don't open with "Great". Write each playbook step as one calm instruction a nervous first-timer could follow. \
They're on a DDJ-FLX4 (entry-level 2-deck controller), so for any step that touches the gear, tag the physical \
control(s) in \`controls\` — its 3-band EQ knobs, channel faders, crossfader, filter, play. Leave \`controls\` off \
for pure listening steps.

Always call the emit_plan tool with your decision. Reference concrete values (BPM, Camelot codes, sections). Do not \
invent timestamps — only choose the strategy and write the coaching; exact timing is resolved downstream from the section grid.`;

export const PLAN_TOOL: Anthropic.Tool = {
  name: "emit_plan",
  description: "Emit the chosen transition strategy and coaching playbook.",
  input_schema: {
    type: "object",
    properties: {
      technique: {
        type: "string",
        enum: [
          "Long beatmatched blend",
          "Bass-swap blend",
          "Breakdown swap",
          "Phrase cut",
          "Echo / filter out",
          "Double drop",
        ],
      },
      mixOutSection: { type: "string", enum: ["drop", "breakdown", "outro"], description: "Section of A to mix out of." },
      mixOutSec: {
        type: "number",
        description:
          "Optional exact out-point in seconds — set it to mix out of a SPECIFIC section, e.g. a drop in the middle " +
          "of A (read the timestamp from A's sections). Omit to use A's labelled mixOutSection (its ending).",
      },
      mixInSection: { type: "string", enum: ["intro", "build", "drop"], description: "Section of B to mix into." },
      phraseBars: { type: "integer", enum: [8, 16, 32], description: "Overlap length in bars." },
      warpBToA: { type: "boolean", description: "Warp B's tempo to match A (beatmatch)." },
      difficulty: { type: "string", enum: ["easy", "moderate", "tricky"] },
      rationale: {
        type: "string",
        description: "<=2 short, plain-language sentences referencing BPM/Camelot/sections.",
      },
      coachNote: { type: "string", description: "The one mistake to avoid, in plain words." },
      playbook: {
        type: "array",
        description: "Ordered, plain-language steps a first-timer can follow.",
        items: {
          type: "object",
          properties: {
            atBar: { type: "integer", description: "Bar offset within the transition where this step happens." },
            action: { type: "string", description: "One calm instruction." },
            controls: {
              type: "array",
              description:
                "The physical control(s) on the DDJ-FLX4 this step touches, so we can highlight them. " +
                "Omit for ear-only steps (e.g. 'listen for the kicks'). target: A=left channel/deck, " +
                "B=right channel/deck, center=crossfader.",
              items: {
                type: "object",
                properties: {
                  target: { type: "string", enum: ["A", "B", "center"] },
                  part: {
                    type: "string",
                    enum: [
                      "lowEQ",
                      "midEQ",
                      "hiEQ",
                      "filter",
                      "channelFader",
                      "crossfader",
                      "play",
                      "cue",
                      "jog",
                      "tempo",
                    ],
                  },
                  dir: { type: "string", enum: ["up", "down"], description: "Which way to move it, if it's a knob/fader." },
                },
                required: ["target", "part"],
              },
            },
          },
          required: ["atBar", "action"],
        },
      },
    },
    required: [
      "technique",
      "mixOutSection",
      "mixInSection",
      "phraseBars",
      "warpBToA",
      "difficulty",
      "rationale",
      "coachNote",
      "playbook",
    ],
  },
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function sectionsText(f: TrackFeatures): string {
  return (
    f.sections.map((s) => `${s.kind}@${fmtTime(s.startSec)} (bar${s.startBar}, ${s.startSec.toFixed(0)}s)`).join(", ") ||
    "none detected"
  );
}

export function renderUser(input: PlanInput): string {
  const { a, b, options } = input;
  const line = (label: string, f: TrackFeatures) =>
    `${label}: ${f.bpm} BPM, ${f.key ?? "unknown"} (Camelot ${f.camelot ?? "?"}), ${f.duration.toFixed(0)}s.\n` +
    `  sections: ${sectionsText(f)}`;
  return [
    line("Track A (playing)", a),
    line("Track B (incoming)", b),
    `Set moment: ${options.setMoment}. ` +
      `Beatmatch: ${options.beatmatch}. Preferred overlap: ${options.phraseBars} bars.`,
    "Plan the transition. Call emit_plan.",
  ].join("\n\n");
}
