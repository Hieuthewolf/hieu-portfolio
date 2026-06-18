import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { planSchema, renderUser, SYSTEM_PROMPT } from "./prompt.js";
import { heuristicStrategy, resolve } from "./resolve.js";
import type { PlanInput, Strategy, TransitionPlan } from "./types.js";

const MODEL = "gemini-2.5-flash"; // free tier via Google AI Studio
const TIMEOUT_MS = 12000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("planner timeout")), ms)),
  ]);
}

/** Snap the model's bar count to the phrase lengths the resolver understands. */
function snapPhraseBars(n: number): 8 | 16 | 32 {
  return [8, 16, 32].reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), 16) as 8 | 16 | 32;
}

async function llmStrategy(input: PlanInput): Promise<Strategy> {
  const { object } = await generateObject({
    model: google(MODEL),
    system: SYSTEM_PROMPT,
    prompt: renderUser(input),
    schema: planSchema, // the AI SDK validates the response against this
  });

  const s: Strategy = { ...object, phraseBars: snapPhraseBars(object.phraseBars) };
  // mixOutSec is optional; ignore anything that isn't a sane positive number.
  if (typeof s.mixOutSec !== "number" || !Number.isFinite(s.mixOutSec) || s.mixOutSec <= 0) {
    delete s.mixOutSec;
  }
  return s;
}

/** Public entry: try the LLM, fall back to the heuristic. Always returns a plan. */
export async function plan(input: PlanInput): Promise<TransitionPlan> {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
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
