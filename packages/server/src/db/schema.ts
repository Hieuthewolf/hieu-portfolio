/**
 * Drizzle schema. The first four tables are Better Auth's required models (pg);
 * `tracks` is our own saved-library table. If a Better Auth upgrade changes its
 * expected columns, regenerate with `npx @better-auth/cli generate` and reconcile.
 */
import { boolean, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * A track the user saved to their library. We persist metadata + the lightweight
 * analysis (bpm/key/sections/vocalRegions/energy) as JSON so a track can be
 * reloaded into Segue without re-analysis — not the audio itself, and not the
 * heavy waveform peaks (those are recomputed on load).
 */
export const tracks = pgTable("tracks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  artist: text("artist"),
  bpm: real("bpm"),
  camelot: text("camelot"),
  musicalKey: text("musical_key"),
  durationSec: real("duration_sec"),
  analysis: jsonb("analysis"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TrackRow = typeof tracks.$inferSelect;

/**
 * A set the user produced in the Set Builder and saved. `plan` is the full set
 * plan (order/roles/gaps/narrative) plus a snapshot of the ordered tracks'
 * metadata, so the set is self-contained without referencing the tracks table.
 */
export const sets = pgTable("sets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  narrative: text("narrative"),
  plan: jsonb("plan"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SetRow = typeof sets.$inferSelect;

/**
 * Manual, hand-assembled setlists of typed tracks (no audio analysis). Each track
 * has a title + optional artist and a flexible source: an external `link` (e.g. a
 * SoundCloud URL) and/or an uploaded MP3 stored in Vercel Blob (`audioUrl`).
 */
export const setlists = pgTable("setlists", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const setlistTracks = pgTable("setlist_tracks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  setlistId: text("setlist_id")
    .notNull()
    .references(() => setlists.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  artist: text("artist"),
  link: text("link"),
  audioUrl: text("audio_url"),
  audioName: text("audio_name"),
  position: real("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SetlistRow = typeof setlists.$inferSelect;
export type SetlistTrackRow = typeof setlistTracks.$inferSelect;
