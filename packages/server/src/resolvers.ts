import { GraphQLError, GraphQLScalarType } from "graphql";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { profile, projects } from "./data.js";
import { plan } from "./planner/index.js";
import { planSet } from "./planner/setIndex.js";
import type { PlanInput, PlanSetInput } from "./planner/types.js";
import { db } from "./db/index.js";
import { setlists, setlistTracks, sets, tracks } from "./db/schema.js";
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

// Drizzle returns a Date for timestamp columns; expose a stable ISO string.
const isoCreatedAt = (row: { createdAt: Date | string }) =>
  row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);

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

interface SetlistTrackInput {
  title: string;
  artist?: string | null;
  link?: string | null;
  audioUrl?: string | null;
  audioName?: string | null;
  bpm?: number | null;
  camelot?: string | null;
}

/** Load a setlist the caller owns, or throw. */
async function requireOwnedSetlist(ctx: GraphQLContext, id: string) {
  const user = requireUser(ctx);
  const [row] = await db
    .select()
    .from(setlists)
    .where(and(eq(setlists.id, id), eq(setlists.userId, user.id)));
  if (!row) throw new GraphQLError("Not found", { extensions: { code: "NOT_FOUND" } });
  return { user, setlist: row };
}

export const resolvers = {
  JSON: JSONScalar,
  SavedTrack: { createdAt: isoCreatedAt },
  SavedSet: { createdAt: isoCreatedAt },
  Setlist: {
    createdAt: isoCreatedAt,
    tracks: (row: { id: string }) =>
      db
        .select()
        .from(setlistTracks)
        .where(eq(setlistTracks.setlistId, row.id))
        .orderBy(asc(setlistTracks.position)),
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
    mySetlists: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      if (!ctx.user) return [];
      return db
        .select()
        .from(setlists)
        .where(eq(setlists.userId, ctx.user.id))
        .orderBy(desc(setlists.createdAt));
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

    createSetlist: async (_p: unknown, args: { name: string }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      const name = args.name.trim();
      if (!name || name.length > 200) {
        throw new GraphQLError("Invalid name", { extensions: { code: "BAD_INPUT" } });
      }
      const [row] = await db.insert(setlists).values({ name, userId: user.id }).returning();
      return row;
    },
    renameSetlist: async (_p: unknown, args: { id: string; name: string }, ctx: GraphQLContext) => {
      await requireOwnedSetlist(ctx, args.id);
      const name = args.name.trim();
      if (!name || name.length > 200) {
        throw new GraphQLError("Invalid name", { extensions: { code: "BAD_INPUT" } });
      }
      const [row] = await db
        .update(setlists)
        .set({ name })
        .where(eq(setlists.id, args.id))
        .returning();
      return row;
    },
    deleteSetlist: async (_p: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      await db.delete(setlists).where(and(eq(setlists.id, args.id), eq(setlists.userId, user.id)));
      return args.id;
    },
    addSetlistTrack: async (
      _p: unknown,
      args: { setlistId: string; input: SetlistTrackInput },
      ctx: GraphQLContext,
    ) => {
      await requireOwnedSetlist(ctx, args.setlistId);
      const { title, artist, link, audioUrl, audioName, bpm, camelot } = args.input;
      if (!title.trim() || title.length > 300) {
        throw new GraphQLError("Invalid title", { extensions: { code: "BAD_INPUT" } });
      }
      for (const v of [link, audioUrl]) {
        if (v && v.length > 2000) {
          throw new GraphQLError("Link too long", { extensions: { code: "BAD_INPUT" } });
        }
      }
      // Append after the current last track.
      const existing = await db
        .select({ position: setlistTracks.position })
        .from(setlistTracks)
        .where(eq(setlistTracks.setlistId, args.setlistId));
      const position = existing.reduce((m, r) => Math.max(m, r.position), 0) + 1;
      const [row] = await db
        .insert(setlistTracks)
        .values({ setlistId: args.setlistId, title, artist, link, audioUrl, audioName, bpm, camelot, position })
        .returning();
      return row;
    },
    removeSetlistTrack: async (_p: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      // Only delete if the track belongs to one of the caller's setlists.
      await db
        .delete(setlistTracks)
        .where(
          and(
            eq(setlistTracks.id, args.id),
            inArray(
              setlistTracks.setlistId,
              db.select({ id: setlists.id }).from(setlists).where(eq(setlists.userId, user.id)),
            ),
          ),
        );
      return args.id;
    },
    reorderSetlist: async (
      _p: unknown,
      args: { id: string; trackIds: string[] },
      ctx: GraphQLContext,
    ) => {
      const { setlist } = await requireOwnedSetlist(ctx, args.id);
      // Rewrite positions to match the given order; only tracks in this setlist.
      await Promise.all(
        args.trackIds.map((tid, i) =>
          db
            .update(setlistTracks)
            .set({ position: i + 1 })
            .where(and(eq(setlistTracks.id, tid), eq(setlistTracks.setlistId, setlist.id))),
        ),
      );
      return setlist;
    },
  },
};
