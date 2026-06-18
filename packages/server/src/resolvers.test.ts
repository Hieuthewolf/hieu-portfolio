import { describe, expect, it } from "vitest";
import { resolvers } from "./resolvers.js";
import type { GraphQLContext } from "./context.js";

const anon: GraphQLContext = { user: null };

describe("track resolver auth guards", () => {
  it("myTracks returns an empty library for anonymous users", async () => {
    const result = await resolvers.Query.myTracks({}, {}, anon);
    expect(result).toEqual([]);
  });

  it("saveTrack rejects anonymous users (before touching the DB)", async () => {
    await expect(
      resolvers.Mutation.saveTrack({}, { input: { title: "x" } }, anon),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("deleteTrack rejects anonymous users (before touching the DB)", async () => {
    await expect(resolvers.Mutation.deleteTrack({}, { id: "x" }, anon)).rejects.toThrow(
      /Unauthorized/,
    );
  });
});
