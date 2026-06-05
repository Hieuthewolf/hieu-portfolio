import type Anthropic from "@anthropic-ai/sdk";
import type { PlanInput, TrackFeatures } from "./types.js";

export const SYSTEM_PROMPT = `You're a warm, encouraging DJ mentor showing a {skill} DJ how to mix track A (playing) into \
track B (incoming) during the {setMoment} of their set. You get each track's tempo, key (Camelot), duration, \
and labelled sections (intro/build/drop/breakdown/outro with bar numbers).

How to mix well:
- Start the blend on a phrase boundary (every 16 or 32 bars) so the two songs' sections line up — never start mid-phrase.
- Leave track A after a drop, usually into its breakdown or outro, and bring B in on its intro or build so B's first drop lands fresh.
- Never let both basslines play at once (that's what makes a mix sound muddy) — swap the low EQ on a downbeat.
- Match the move to skill and moment: beginners get the most forgiving option (a beatmatched bass-swap blend in \
compatible keys, or a clean cut on a phrase boundary). Save double drops for advanced. At peak time, keep the energy up.

Voice — this matters as much as the plan:
- Sound like a friendly person showing a mate the ropes, not a manual. Warm, plain, direct, short sentences.
- The first time you use a DJ term in the rationale or any step, explain it in plain words in brackets — e.g. \
"slide the crossfader (the slider that blends the two songs) to the middle".
- No hype or filler. Avoid words like "leverage", "utilize", "seamless", "elevate", and phrases like "it's important to note". \
Don't open with "Great". Write each playbook step as one calm instruction a nervous first-timer could follow.

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

function sectionsText(f: TrackFeatures): string {
  return f.sections.map((s) => `${s.kind}@bar${s.startBar}`).join(", ") || "none detected";
}

export function renderUser(input: PlanInput): string {
  const { a, b, options } = input;
  const line = (label: string, f: TrackFeatures) =>
    `${label}: ${f.bpm} BPM, ${f.key ?? "unknown"} (Camelot ${f.camelot ?? "?"}), ${f.duration.toFixed(0)}s.\n` +
    `  sections: ${sectionsText(f)}`;
  return [
    line("Track A (playing)", a),
    line("Track B (incoming)", b),
    `DJ skill: ${options.skill}. Set moment: ${options.setMoment}. ` +
      `Beatmatch: ${options.beatmatch}. Preferred overlap: ${options.phraseBars} bars.`,
    "Plan the transition. Call emit_plan.",
  ].join("\n\n");
}
