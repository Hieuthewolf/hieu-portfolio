import { deterministicSetStrategy, repairSet } from "./sequence.js";
import type { PlanSetInput, SetPlan } from "./types.js";

/**
 * Order N tracks into a set. Currently heuristic-only (deterministic): the
 * sequencer arranges tracks along an energy arc while keeping neighbours mixable.
 * An LLM ordering step can be layered back in here later (see git history).
 */
export async function planSet(input: PlanSetInput): Promise<SetPlan> {
  return repairSet(input, deterministicSetStrategy(input), "heuristic");
}
