import { createSchema } from "graphql-yoga";
import { resolvers } from "./resolvers.js";

const typeDefs = /* GraphQL */ `
  scalar JSON

  type Query {
    profile: Profile!
    projects: [Project!]!
    me: User
    myTracks: [SavedTrack!]!
    mySets: [SavedSet!]!
    mySetlists: [Setlist!]!
  }

  type User {
    id: ID!
    email: String!
    name: String
    image: String
  }

  type SavedTrack {
    id: ID!
    title: String!
    artist: String
    bpm: Float
    camelot: String
    musicalKey: String
    durationSec: Float
    analysis: JSON
    createdAt: String!
  }

  input SaveTrackInput {
    title: String!
    artist: String
    bpm: Float
    camelot: String
    musicalKey: String
    durationSec: Float
    analysis: JSON
  }

  type SavedSet {
    id: ID!
    name: String!
    narrative: String
    plan: JSON
    createdAt: String!
  }

  input SaveSetInput {
    name: String!
    narrative: String
    plan: JSON
  }

  # ---- Manual setlists (hand-typed tracks; links or uploaded MP3s) ----

  type Setlist {
    id: ID!
    name: String!
    createdAt: String!
    tracks: [SetlistTrack!]!
  }

  type SetlistTrack {
    id: ID!
    title: String!
    artist: String
    link: String
    audioUrl: String
    audioName: String
    bpm: Float
    camelot: String
    position: Float!
  }

  input SetlistTrackInput {
    title: String!
    artist: String
    link: String
    audioUrl: String
    audioName: String
    bpm: Float
    camelot: String
  }

  type Profile {
    name: String!
    role: String!
    tagline: String!
    location: String!
    education: String!
    email: String!
    github: String!
    linkedin: String!
    skills: [SkillGroup!]!
  }

  type SkillGroup {
    group: String!
    items: [String!]!
  }

  type Project {
    id: ID!
    index: String!
    year: String!
    title: String!
    org: String!
    blurb: String!
    decision: String!
    metrics: [String!]!
    tags: [String!]!
  }

  # ---- Segue transition planner ----

  input SectionInput {
    kind: String!
    startBar: Int!
    endBar: Int!
    startSec: Float!
  }

  input VocalRegionInput {
    startSec: Float!
    endSec: Float!
    confidence: Float!
  }

  input TrackFeaturesInput {
    bpm: Float!
    beat: Float!
    phase: Float!
    key: String
    camelot: String
    duration: Float!
    sections: [SectionInput!]!
    vocalRegions: [VocalRegionInput!]
  }

  input PlanOptionsInput {
    beatmatch: Boolean!
    phraseBars: Int!
  }

  input PlanTransitionInput {
    a: TrackFeaturesInput!
    b: TrackFeaturesInput!
    options: PlanOptionsInput!
  }

  type PlaybookStep {
    atBar: Int!
    action: String!
  }

  type TransitionPlan {
    mixStartA: Float!
    mixStartB: Float!
    transLen: Float!
    technique: String!
    difficulty: String!
    warp: Float!
    rationale: String!
    coachNote: String!
    playbook: [PlaybookStep!]!
    mixOutSection: String!
    mixOutSec: Float
    mixInSection: String!
    phraseBars: Int!
    beatmatch: Boolean!
    bpmDiff: Float!
    compatible: Boolean!
    vocalEase: Boolean!
    source: String!
  }

  # ---- Segue set builder ----

  input EnergySummaryInput {
    mean: Float!
    peak: Float!
    arc: Float!
  }

  input SetTrackInput {
    id: ID!
    features: TrackFeaturesInput!
    energy: EnergySummaryInput!
  }

  input SetOptionsInput {
    beatmatch: Boolean!
    phraseBars: Int!
    introId: ID
    outroId: ID
  }

  input PlanSetInput {
    tracks: [SetTrackInput!]!
    options: SetOptionsInput!
  }

  type SetRoleEntry {
    id: ID!
    role: String!
  }

  type SetGap {
    fromId: ID!
    toId: ID!
    technique: String!
    difficulty: String!
    bpmDiff: Float!
    compatible: Boolean!
    risk: Boolean!
    mixOutSec: Float
  }

  type SetPlan {
    order: [ID!]!
    roles: [SetRoleEntry!]!
    narrative: String!
    gaps: [SetGap!]!
    source: String!
  }

  type Mutation {
    planTransition(input: PlanTransitionInput!): TransitionPlan!
    planSet(input: PlanSetInput!): SetPlan!
    saveTrack(input: SaveTrackInput!): SavedTrack!
    deleteTrack(id: ID!): ID!
    saveSet(input: SaveSetInput!): SavedSet!
    deleteSet(id: ID!): ID!
    createSetlist(name: String!): Setlist!
    renameSetlist(id: ID!, name: String!): Setlist!
    deleteSetlist(id: ID!): ID!
    addSetlistTrack(setlistId: ID!, input: SetlistTrackInput!): SetlistTrack!
    removeSetlistTrack(id: ID!): ID!
    reorderSetlist(id: ID!, trackIds: [ID!]!): Setlist!
  }
`;

export const schema = createSchema({ typeDefs, resolvers });
