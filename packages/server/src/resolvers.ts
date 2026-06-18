import { GraphQLError, GraphQLScalarType } from "graphql";
import { and, desc, eq } from "drizzle-orm";
import { profile, projects } from "./data.js";
import { plan } from "./planner/index.js";
import { planSet } from "./planner/setIndex.js";
import type { PlanInput, PlanSetInput } from "./planner/types.js";
import { db } from "./db/index.js";
import { sets, tracks } from "./db/schema.js";
import type { GraphQLContext } from "./context.js";

// Pass-through JSON scalar for the stored track analysis blob.
const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  serialize: (v) => v,
  parseValue: (v) => v,
});

function requireUser(ctx: GraphQLContext) {
  if (!ctx.user) throw new GraphQLError("Unauthorized", { extensions: { code: "UNAUTHORIZED" } });
  return ctx.user;
}

interface SaveTrackInput {
  title: string;
  artist?: string | null;
  bpm?: number | null;
  camelot?: string | null;
  musicalKey?: string | null;
  durationSec?: number | null;
  analysis?: unknown;
}

interface SaveSetInput {
  name: string;
  narrative?: string | null;
  plan?: unknown;
}

export const resolvers = {
  JSON: JSONScalar,
  SavedTrack: {
    // Drizzle returns a Date for timestamp columns; expose a stable ISO string.
    createdAt: (row: { createdAt: Date | string }) =>
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  },
  SavedSet: {
    createdAt: (row: { createdAt: Date | string }) =>
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  },
  Query: {
    profile: () => profile,
    projects: () => projects,
    me: (_p: unknown, _a: unknown, ctx: GraphQLContext) => ctx.user ?? null,
    myTracks: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      // Anonymous users simply have no library — let the page show a sign-in
      // prompt instead of surfacing an error. Writes still require auth.
      if (!ctx.user) return [];
      return db.select().from(tracks).where(eq(tracks.userId, ctx.user.id)).orderBy(desc(tracks.createdAt));
    },
    mySets: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      if (!ctx.user) return [];
      return db.select().from(sets).where(eq(sets.userId, ctx.user.id)).orderBy(desc(sets.createdAt));
    },
  },
  Mutation: {
    planTransition: (_p: unknown, args: { input: PlanInput }) => plan(args.input),
    planSet: (_p: unknown, args: { input: PlanSetInput }) => planSet(args.input),
    saveTrack: async (_p: unknown, args: { input: SaveTrackInput }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      const input = args.input;
      // Bound the inputs so a client can't bloat the row (the analysis blob should
      // be lightweight metadata — no audio, no waveform peaks).
      if (!input.title.trim() || input.title.length > 300) {
        throw new GraphQLError("Invalid title", { extensions: { code: "BAD_INPUT" } });
      }
      if (input.analysis !== undefined && JSON.stringify(input.analysis).length > 200_000) {
        throw new GraphQLError("Analysis payload too large", { extensions: { code: "BAD_INPUT" } });
      }
      const [row] = await db
        .insert(tracks)
        .values({ ...input, userId: user.id })
        .returning();
      return row;
    },
    deleteTrack: async (_p: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      await db.delete(tracks).where(and(eq(tracks.id, args.id), eq(tracks.userId, user.id)));
      return args.id;
    },
    saveSet: async (_p: unknown, args: { input: SaveSetInput }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      const input = args.input;
      if (!input.name.trim() || input.name.length > 300) {
        throw new GraphQLError("Invalid name", { extensions: { code: "BAD_INPUT" } });
      }
      if (input.plan !== undefined && JSON.stringify(input.plan).length > 200_000) {
        throw new GraphQLError("Plan payload too large", { extensions: { code: "BAD_INPUT" } });
      }
      const [row] = await db
        .insert(sets)
        .values({ ...input, userId: user.id })
        .returning();
      return row;
    },
    deleteSet: async (_p: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      await db.delete(sets).where(and(eq(sets.id, args.id), eq(sets.userId, user.id)));
      return args.id;
    },
  },
};
