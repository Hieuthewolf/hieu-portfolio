import { createSchema } from "graphql-yoga";
import { resolvers } from "./resolvers.js";

const typeDefs = /* GraphQL */ `
  type Query {
    profile: Profile!
    projects: [Project!]!
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

  input TrackFeaturesInput {
    bpm: Float!
    beat: Float!
    phase: Float!
    key: String
    camelot: String
    duration: Float!
    sections: [SectionInput!]!
  }

  input PlanOptionsInput {
    setMoment: String!
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
    mixInSection: String!
    phraseBars: Int!
    beatmatch: Boolean!
    bpmDiff: Float!
    compatible: Boolean!
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
    setMoment: String!
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
  }
`;

export const schema = createSchema({ typeDefs, resolvers });
