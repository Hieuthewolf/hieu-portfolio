import Anthropic from "@anthropic-ai/sdk";
import { PLAN_TOOL, renderUser, SYSTEM_PROMPT } from "./prompt.js";
import { heuristicStrategy, resolve } from "./resolve.js";
import type {
  Difficulty,
  MixInSection,
  MixOutSection,
  PlanInput,
  Strategy,
  Technique,
  TransitionPlan,
} from "./types.js";

const MODEL = "claude-sonnet-4-6"; // swap to opus for quality, haiku for cost/latency
const TIMEOUT_MS = 8000;

const TECHNIQUES: Technique[] = [
  "Long beatmatched blend",
  "Bass-swap blend",
  "Breakdown swap",
  "Phrase cut",
  "Echo / filter out",
  "Double drop",
];
const MIX_OUT: MixOutSection[] = ["drop", "breakdown", "outro"];
const MIX_IN: MixInSection[] = ["intro", "build", "drop"];
const DIFFICULTIES: Difficulty[] = ["easy", "moderate", "tricky"];
const PHRASE_BARS = [8, 16, 32];

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("planner timeout")), ms)),
  ]);
}

function isValidStrategy(s: Partial<Strategy>): s is Strategy {
  return (
    !!s.technique &&
    TECHNIQUES.includes(s.technique) &&
    !!s.mixOutSection &&
    MIX_OUT.includes(s.mixOutSection) &&
    !!s.mixInSection &&
    MIX_IN.includes(s.mixInSection) &&
    typeof s.phraseBars === "number" &&
    PHRASE_BARS.includes(s.phraseBars) &&
    typeof s.warpBToA === "boolean" &&
    !!s.difficulty &&
    DIFFICULTIES.includes(s.difficulty) &&
    typeof s.rationale === "string" &&
    typeof s.coachNote === "string" &&
    Array.isArray(s.playbook)
  );
}

async function llmStrategy(input: PlanInput): Promise<Strategy> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT.replace("{setMoment}", input.options.setMoment),
    tools: [PLAN_TOOL],
    tool_choice: { type: "tool", name: "emit_plan" },
    messages: [{ role: "user", content: renderUser(input) }],
  });

  const block = resp.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("no tool_use block");

  const s = block.input as Partial<Strategy>;
  if (!isValidStrategy(s)) throw new Error("invalid strategy from model");

  // Drop any malformed playbook entries the model may have emitted.
  s.playbook = s.playbook.filter((p) => typeof p?.atBar === "number" && typeof p?.action === "string");
  // mixOutSec is optional; ignore anything that isn't a sane positive number.
  if (typeof s.mixOutSec !== "number" || !Number.isFinite(s.mixOutSec) || s.mixOutSec <= 0) {
    delete s.mixOutSec;
  }
  return s;
}

/** Public entry: try the LLM, fall back to the heuristic. Always returns a plan. */
export async function plan(input: PlanInput): Promise<TransitionPlan> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const strategy = await withTimeout(llmStrategy(input), TIMEOUT_MS);
      return resolve(input, strategy, "llm");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("LLM planner failed, using heuristic:", (err as Error).message);
    }
  }
  return resolve(input, heuristicStrategy(input), "heuristic");
}
