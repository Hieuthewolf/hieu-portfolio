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

  it("importRekordboxTracks rejects anonymous users", async () => {
    await expect(
      resolvers.Mutation.importRekordboxTracks({}, { tracks: [] }, anon),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("mySets returns an empty list for anonymous users", async () => {
    expect(await resolvers.Query.mySets({}, {}, anon)).toEqual([]);
  });

  it("saveSet / deleteSet reject anonymous users", async () => {
    await expect(
      resolvers.Mutation.saveSet({}, { input: { name: "x" } }, anon),
    ).rejects.toThrow(/Unauthorized/);
    await expect(resolvers.Mutation.deleteSet({}, { id: "x" }, anon)).rejects.toThrow(
      /Unauthorized/,
    );
  });

  it("mySetlists returns an empty list for anonymous users", async () => {
    expect(await resolvers.Query.mySetlists({}, {}, anon)).toEqual([]);
  });

  it("setlist mutations reject anonymous users", async () => {
    await expect(resolvers.Mutation.createSetlist({}, { name: "x" }, anon)).rejects.toThrow(
      /Unauthorized/,
    );
    await expect(
      resolvers.Mutation.addSetlistTrack({}, { setlistId: "s", input: { title: "t" } }, anon),
    ).rejects.toThrow(/Unauthorized/);
    await expect(resolvers.Mutation.deleteSetlist({}, { id: "x" }, anon)).rejects.toThrow(
      /Unauthorized/,
    );
  });
});
