import { heuristicStrategy, resolve } from "./resolve.js";
import type { PlanInput, TransitionPlan } from "./types.js";

/**
 * Plan a transition. Currently heuristic-only (deterministic): it picks the
 * technique, sections, phrase length and coaching from the tracks' tempo, key
 * and structure, then resolves exact beat-aligned timestamps. An LLM strategy
 * step can be layered back in here later (see git history for the Gemini version).
 */
export async function plan(input: PlanInput): Promise<TransitionPlan> {
  return resolve(input, heuristicStrategy(input), "heuristic");
}
