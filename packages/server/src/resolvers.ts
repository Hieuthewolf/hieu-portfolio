import { profile, projects } from "./data.js";
import { plan } from "./planner/index.js";
import type { PlanInput } from "./planner/types.js";

export const resolvers = {
  Query: {
    profile: () => profile,
    projects: () => projects,
  },
  Mutation: {
    planTransition: (_parent: unknown, args: { input: PlanInput }) => plan(args.input),
  },
};
