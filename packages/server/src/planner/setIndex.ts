/**
 * Public entry for the Set Builder: order N tracks into a set. Mirrors index.ts
 * `plan()` — try the LLM for the ordering judgment, always fall back to the
 * deterministic sequencer. One LLM call per set, never one per transition.
 */
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { isValidSetStrategy, renderSetUser, SET_SYSTEM_PROMPT, setSchema } from "./setPrompt.js";
import { deterministicSetStrategy, repairSet } from "./sequence.js";
import type { PlanSetInput, SetPlan, SetStrategy } from "./types.js";

const MODEL = "gemini-2.5-flash"; // free tier via Google AI Studio
const TIMEOUT_MS = 12000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("set planner timeout")), ms)),
  ]);
}

async function llmSetStrategy(input: PlanSetInput): Promise<SetStrategy> {
  const { object } = await generateObject({
    model: google(MODEL),
    system: SET_SYSTEM_PROMPT,
    prompt: renderSetUser(input),
    schema: setSchema,
  });
  // The AI SDK validates shape; we still enforce that the order is a real
  // permutation of the given ids (repairSet falls back to the sequencer if not).
  if (
    !isValidSetStrategy(
      object,
      input.tracks.map((t) => t.id),
    )
  )
    throw new Error("invalid set strategy from model");
  return object;
}

/** Public entry: try the LLM, fall back to the heuristic. Always returns a set plan. */
export async function planSet(input: PlanSetInput): Promise<SetPlan> {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    try {
      const strategy = await withTimeout(llmSetStrategy(input), TIMEOUT_MS);
      return repairSet(input, strategy, "llm");
    } catch (err) {
      console.warn("LLM set planner failed, using heuristic:", (err as Error).message);
    }
  }
  return repairSet(input, deterministicSetStrategy(input), "heuristic");
}
