import { profile, projects } from "./data.js";
import { plan } from "./planner/index.js";
import { planSet } from "./planner/setIndex.js";
import type { PlanInput, PlanSetInput } from "./planner/types.js";

export const resolvers = {
  Query: {
    profile: () => profile,
    projects: () => projects,
  },
  Mutation: {
    planTransition: (_parent: unknown, args: { input: PlanInput }) => plan(args.input),
    planSet: (_parent: unknown, args: { input: PlanSetInput }) => planSet(args.input),
  },
};
