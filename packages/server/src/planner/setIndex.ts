/**
 * Public entry for the Set Builder: order N tracks into a set. Mirrors index.ts
 * `plan()` — try the LLM for the ordering judgment, always fall back to the
 * deterministic sequencer. One LLM call per set, never one per transition.
 */
import Anthropic from "@anthropic-ai/sdk";
import { isValidSetStrategy, renderSetUser, SET_SYSTEM_PROMPT, SET_TOOL } from "./setPrompt.js";
import { deterministicSetStrategy, repairSet } from "./sequence.js";
import type { PlanSetInput, SetPlan, SetStrategy } from "./types.js";

const MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 8000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("set planner timeout")), ms)),
  ]);
}

async function llmSetStrategy(input: PlanSetInput): Promise<SetStrategy> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SET_SYSTEM_PROMPT.replace("{setMoment}", input.options.setMoment),
    tools: [SET_TOOL],
    tool_choice: { type: "tool", name: "emit_set" },
    messages: [{ role: "user", content: renderSetUser(input) }],
  });

  const block = resp.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("no tool_use block");

  const s = block.input as Partial<SetStrategy>;
  if (
    !isValidSetStrategy(
      s,
      input.tracks.map((t) => t.id),
    )
  )
    throw new Error("invalid set strategy from model");
  return s;
}

/** Public entry: try the LLM, fall back to the heuristic. Always returns a set plan. */
export async function planSet(input: PlanSetInput): Promise<SetPlan> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const strategy = await withTimeout(llmSetStrategy(input), TIMEOUT_MS);
      return repairSet(input, strategy, "llm");
    } catch (err) {
      console.warn("LLM set planner failed, using heuristic:", (err as Error).message);
    }
  }
  return repairSet(input, deterministicSetStrategy(input), "heuristic");
}
