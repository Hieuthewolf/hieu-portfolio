import type Anthropic from "@anthropic-ai/sdk";
import type { PlanSetInput, SetRole, SetStrategy, SetTrack } from "./types.js";

const ROLES: SetRole[] = ["opener", "builder", "peak", "bridge", "closer"];

export const SET_SYSTEM_PROMPT = `You're a warm, encouraging DJ mentor helping someone who's still learning order a pile of tracks into a \
set for the {setMoment}. For each track you get its tempo, key (Camelot), an energy level (0–1) and whether that energy is \
rising/steady/falling, and its labelled sections.

How to order a set well:
- Build an energy ARC that fits the moment — warmup eases the room up, peak rises to a crest then settles, cooldown winds down. \
Don't just sort by tempo; a melodic, lower-energy track is often the right bridge between two bangers.
- Keep neighbours mixable: close tempos and friendly keys (Camelot ±1, or relative major/minor) make for smooth blends. \
A big tempo jump or a key clash is a rough edge — only use it on purpose.
- Honour any pinned intro/outro: they must stay first/last.

Voice — this matters as much as the order:
- Sound like a friendly person, not a manual. Warm, plain, short. No hype or filler ("seamless", "elevate", "leverage").
- The narrative is one or two plain sentences describing the journey of the set.

Always call the emit_set tool. Use the exact track ids you were given, each exactly once. Do not invent timestamps or \
per-step coaching — only the order, a role per track, and the short narrative.`;

export const SET_TOOL: Anthropic.Tool = {
  name: "emit_set",
  description: "Emit the chosen set order, a role per track, and a one-line narrative.",
  input_schema: {
    type: "object",
    properties: {
      order: {
        type: "array",
        items: { type: "string" },
        description: "Every track id, exactly once, in play order.",
      },
      roles: {
        type: "array",
        description: "One entry per track: its role in the set.",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            role: { type: "string", enum: ROLES },
          },
          required: ["id", "role"],
        },
      },
      narrative: {
        type: "string",
        description: "<=2 plain sentences describing the set's energy journey.",
      },
    },
    required: ["order", "roles", "narrative"],
  },
};

function arcWord(arc: number): string {
  return arc > 0.05 ? "rising" : arc < -0.05 ? "falling" : "steady";
}

function trackLine(t: SetTrack): string {
  const f = t.features;
  const secs = f.sections.map((s) => s.kind).join(",") || "none";
  return `id=${t.id} | ${f.bpm} BPM | ${f.camelot ?? "?"} | energy ${t.energy.mean.toFixed(2)} (${arcWord(t.energy.arc)}) | sections: ${secs}`;
}

export function renderSetUser(input: PlanSetInput): string {
  const { tracks, options } = input;
  const pins = [
    options.introId ? `pinned intro: ${options.introId}` : null,
    options.outroId ? `pinned outro: ${options.outroId}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  return [
    `Order these ${tracks.length} tracks into a set. Set moment: ${options.setMoment}.`,
    tracks.map(trackLine).join("\n"),
    pins || "no pinned tracks",
    "Call emit_set with the full order (every id once), a role per track, and a one-line narrative.",
  ].join("\n\n");
}

/** Trust the model's order (the valuable judgment) only if it's a real permutation. Roles are repaired downstream. */
export function isValidSetStrategy(s: Partial<SetStrategy>, ids: string[]): s is SetStrategy {
  if (!s || !Array.isArray(s.order) || typeof s.narrative !== "string" || !Array.isArray(s.roles))
    return false;
  if (s.order.length !== ids.length) return false;
  const want = new Set(ids);
  const seen = new Set<string>();
  for (const id of s.order) {
    if (typeof id !== "string" || !want.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}
