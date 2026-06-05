import { createSchema, createYoga } from "graphql-yoga";
import Anthropic from "@anthropic-ai/sdk";

/* ------------------------------------------------------------------ *
 * Portfolio data — inlined from packages/server/src/data.ts.
 * Kept self-contained so this serverless function bundles with no
 * cross-package TypeScript resolution (deliberate for a clean deploy).
 * ------------------------------------------------------------------ */

const profile = {
  name: "Hieu Nguyen",
  role: "Senior Software Engineer · AI Systems",
  tagline:
    "I build agentic AI products end-to-end at Meta — from the agent loop and evals to the streaming UI millions of people use. I tend to choose the scalable path over the fast one.",
  location: "New York, NY",
  education: "MIT · B.S. Computer Science",
  email: "nghieu601007@gmail.com",
  github: "https://github.com/Hieuthewolf",
  linkedin: "https://linkedin.com/in/hieutannguyen",
  skills: [
    {
      group: "AI & ML",
      items: [
        "LLMs",
        "Agentic Systems",
        "Evals",
        "Multimodal",
        "Vector Search",
        "Embedding Retrieval",
        "Prompt Engineering",
        "AI Product",
      ],
    },
    {
      group: "Frontend",
      items: ["React", "React Native", "Next.js", "TypeScript", "Relay", "Tailwind", "HTML/CSS"],
    },
    {
      group: "Backend",
      items: ["Node.js", "GraphQL", "REST", "Python", "SQL", "PostgreSQL", "Redis"],
    },
    {
      group: "Practices",
      items: ["System Design", "Performance", "A/B Testing", "Data Viz"],
    },
  ],
};

const projects = [
  {
    id: "dual-editing-agent",
    index: "01",
    year: "2025",
    title: "Dual-Editing AI Agent",
    org: "Meta · Recruiting Platform",
    blurb:
      "Led product and technical direction for Meta's first dual-editing AI agent. Designed the agent loop, tool calls, and evals on new infrastructure.",
    decision: "Advocated for a scalable agentic UX over a faster short-term build.",
    metrics: ["Shipped to 100% of company", "New agent infra + evals"],
    tags: ["Agentic Systems", "Tool Calls", "Evals", "LLMs"],
  },
  {
    id: "doc-understanding",
    index: "02",
    year: "2024",
    title: "meta.ai Document Understanding",
    org: "Meta AI",
    blurb:
      "Owned the end-to-end multimodal pipeline: upload, parsing, LLM context injection, and streaming — live to over a million daily users.",
    decision: "Simplified the pipeline and added monitoring to cut systemic failures.",
    metrics: ["1M+ daily active users", "-69% failed AI sends"],
    tags: ["Multimodal", "Streaming", "LLM Context", "Reliability"],
  },
  {
    id: "embedding-retrieval",
    index: "03",
    year: "2024",
    title: "Embedding-Based Retrieval",
    org: "Meta · Hiring Manager Experience",
    blurb:
      "Used usage data and UX research to argue for low-latency vector search with cosine similarity and signal-based ranking instead of LLM text parsing.",
    decision: "Chose embeddings over LLM parsing for latency and accuracy.",
    metrics: ["93% picked from top 3", "Low-latency vector search"],
    tags: ["Vector Search", "Embeddings", "Ranking"],
  },
  {
    id: "llm-correction-tool",
    index: "04",
    year: "2024",
    title: "LLM Output Correction Tool",
    org: "Meta AI",
    blurb:
      "Independently built the UI, GraphQL, and data layer for a real-time LLM correction tool — including live election disclaimers during the VP debate.",
    decision: "Took full-stack ownership across UI, GraphQL, and data layers.",
    metrics: ["50+ live content fixes", "Real-time corrections"],
    tags: ["GraphQL", "Full-Stack", "Tooling"],
  },
];

/* ------------------------------------------------------------------ *
 * Segue transition planner — inlined from packages/server/src/planner.
 * Browser sends numeric features + sections; the LLM picks a strategy;
 * deterministic code resolves beat-aligned timestamps. Key stays here.
 * ------------------------------------------------------------------ */

interface Section {
  kind: "intro" | "build" | "drop" | "breakdown" | "outro";
  startBar: number;
  endBar: number;
  startSec: number;
}
interface TrackFeatures {
  bpm: number;
  beat: number;
  phase: number;
  key: string | null;
  camelot: string | null;
  duration: number;
  sections: Section[];
}
interface PlanOptions {
  skill: "beginner" | "intermediate" | "advanced";
  setMoment: "warmup" | "peak" | "cooldown";
  beatmatch: boolean;
  phraseBars: number;
}
interface PlanInput {
  a: TrackFeatures;
  b: TrackFeatures;
  options: PlanOptions;
}
type Technique =
  | "Long beatmatched blend"
  | "Bass-swap blend"
  | "Breakdown swap"
  | "Phrase cut"
  | "Echo / filter out"
  | "Double drop";
type MixOutSection = "drop" | "breakdown" | "outro";
type MixInSection = "intro" | "build" | "drop";
type Difficulty = "easy" | "moderate" | "tricky";
interface PlaybookStep {
  atBar: number;
  action: string;
}
interface Strategy {
  technique: Technique;
  mixOutSection: MixOutSection;
  mixInSection: MixInSection;
  phraseBars: number;
  warpBToA: boolean;
  difficulty: Difficulty;
  rationale: string;
  coachNote: string;
  playbook: PlaybookStep[];
}
interface TransitionPlan {
  mixStartA: number;
  mixStartB: number;
  transLen: number;
  technique: Technique;
  difficulty: Difficulty;
  warp: number;
  rationale: string;
  coachNote: string;
  playbook: PlaybookStep[];
  mixOutSection: MixOutSection;
  mixInSection: MixInSection;
  phraseBars: number;
  beatmatch: boolean;
  bpmDiff: number;
  compatible: boolean;
  source: "llm" | "heuristic";
}

const MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 8000;
const TECHNIQUES: Technique[] = [
  "Long beatmatched blend",
  "Bass-swap blend",
  "Breakdown swap",
  "Phrase cut",
  "Echo / filter out",
  "Double drop",
];
const MIX_OUT: MixOutSection[] = ["drop", "breakdown", "outro"];
const MIX_IN: MixInSection[] = ["intro", "build", "drop"];
const DIFFICULTIES: Difficulty[] = ["easy", "moderate", "tricky"];
const PHRASE_BARS = [8, 16, 32];

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(x, hi));
}
function snapGrid(t: number, phase: number, period: number): number {
  return phase + Math.round((t - phase) / period) * period;
}
function camelotCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = Number(a.slice(0, -1));
  const la = a.slice(-1);
  const nb = Number(b.slice(0, -1));
  const lb = b.slice(-1);
  if (na === nb) return true;
  const diff = Math.abs(na - nb);
  return la === lb && (diff === 1 || diff === 11);
}
function findSection(sections: Section[], kind: string, preferLast: boolean): Section | null {
  const m = sections.filter((s) => s.kind === kind);
  if (m.length === 0) return null;
  return preferLast ? m[m.length - 1]! : m[0]!;
}

function resolve(input: PlanInput, s: Strategy, source: "llm" | "heuristic"): TransitionPlan {
  const { a, b } = input;
  const barA = a.beat * 4;
  const transLen = s.phraseBars * barA;
  const secA = findSection(a.sections, s.mixOutSection, true);
  const targetA = secA ? secA.startSec : a.duration * 0.7;
  const mixStartA = clamp(snapGrid(targetA, a.phase, barA), 0, Math.max(0, a.duration - transLen - 0.2));
  const secB = findSection(b.sections, s.mixInSection, false);
  const targetB = secB ? secB.startSec : 0;
  const mixStartB = clamp(snapGrid(targetB, b.phase, b.beat * 4), 0, Math.max(0, b.duration - transLen - 0.2));
  const bpmDiff = Math.abs(a.bpm - b.bpm) / ((a.bpm + b.bpm) / 2);
  return {
    mixStartA,
    mixStartB,
    transLen,
    technique: s.technique,
    difficulty: s.difficulty,
    warp: s.warpBToA ? a.bpm / b.bpm : 1,
    rationale: s.rationale,
    coachNote: s.coachNote,
    playbook: s.playbook,
    mixOutSection: s.mixOutSection,
    mixInSection: s.mixInSection,
    phraseBars: s.phraseBars,
    beatmatch: s.warpBToA,
    bpmDiff,
    compatible: camelotCompatible(a.camelot, b.camelot),
    source,
  };
}

function heuristicStrategy(input: PlanInput): Strategy {
  const { a, b, options } = input;
  const bpmDiff = Math.abs(a.bpm - b.bpm) / ((a.bpm + b.bpm) / 2);
  const compatible = camelotCompatible(a.camelot, b.camelot);
  const phraseBars = options.phraseBars;
  const hasBreak = a.sections.some((s) => s.kind === "breakdown");
  let technique: Technique;
  let warpBToA: boolean;
  let mixOutSection: MixOutSection;
  let mixInSection: MixInSection;
  let difficulty: Difficulty;
  let rationale: string;
  if (options.beatmatch && bpmDiff < 0.08) {
    technique = "Bass-swap blend";
    warpBToA = true;
    mixOutSection = hasBreak ? "breakdown" : "outro";
    mixInSection = "intro";
    difficulty = "easy";
    rationale =
      `The tempos are close, so you can ride them together. Bring B in over A's ${mixOutSection} ` +
      `(its calmer stretch) and let B's intro build.` +
      (compatible ? ` The keys (${a.camelot} and ${b.camelot}) get along, so it'll sound smooth.` : "");
  } else {
    technique = "Phrase cut";
    warpBToA = false;
    mixOutSection = "outro";
    mixInSection = "intro";
    difficulty = "moderate";
    rationale = `These two are too far apart in speed to blend cleanly, so a quick cut on the beat is safer than a long mix.`;
  }
  const mid = Math.max(1, Math.floor(phraseBars / 2) - 2);
  const swap = Math.max(2, Math.round(phraseBars * 0.6));
  const playbook: PlaybookStep[] = [
    {
      atBar: 0,
      action:
        "On the first beat of a new phrase (a 16- or 32-bar chunk), start track B with its bass turned down and its volume up.",
    },
    {
      atBar: 0,
      action:
        "Listen for the kick drums landing together — if they drift apart, the tracks aren't beatmatched (locked to the same speed).",
    },
    {
      atBar: mid,
      action: "Slide the crossfader (the slider that blends the two songs) toward the middle so you can hear both.",
    },
    {
      atBar: swap,
      action: "Swap the bass on a beat: turn track A's low EQ (its bass knob) down, and track B's up.",
    },
    {
      atBar: phraseBars - 1,
      action: "Push the crossfader all the way to B and bring track A's volume down. You're through the mix.",
    },
  ];
  return {
    technique,
    mixOutSection,
    mixInSection,
    phraseBars,
    warpBToA,
    difficulty,
    rationale,
    coachNote:
      "Don't let both basslines play at once — that's what makes a mix sound muddy. The instant you raise B's bass, cut A's.",
    playbook,
  };
}

const SYSTEM_PROMPT = `You're a warm, encouraging DJ mentor showing a {skill} DJ how to mix track A (playing) into \
track B (incoming) during the {setMoment} of their set. You get each track's tempo, key (Camelot), duration, \
and labelled sections (intro/build/drop/breakdown/outro with bar numbers).

How to mix well:
- Start the blend on a phrase boundary (every 16 or 32 bars) so the two songs' sections line up — never start mid-phrase.
- Leave track A after a drop, usually into its breakdown or outro, and bring B in on its intro or build so B's first drop lands fresh.
- Never let both basslines play at once (that's what makes a mix sound muddy) — swap the low EQ on a downbeat.
- Match the move to skill and moment: beginners get the most forgiving option (a beatmatched bass-swap blend in \
compatible keys, or a clean cut on a phrase boundary). Save double drops for advanced. At peak time, keep the energy up.

Voice — this matters as much as the plan:
- Sound like a friendly person showing a mate the ropes, not a manual. Warm, plain, direct, short sentences.
- The first time you use a DJ term in the rationale or any step, explain it in plain words in brackets.
- No hype or filler. Don't open with "Great". Write each playbook step as one calm instruction a nervous first-timer could follow.

Always call the emit_plan tool with your decision. Reference concrete values (BPM, Camelot codes, sections). Do not \
invent timestamps — only choose the strategy and write the coaching; exact timing is resolved downstream.`;

const PLAN_TOOL: Anthropic.Tool = {
  name: "emit_plan",
  description: "Emit the chosen transition strategy and coaching playbook.",
  input_schema: {
    type: "object",
    properties: {
      technique: { type: "string", enum: TECHNIQUES },
      mixOutSection: { type: "string", enum: MIX_OUT },
      mixInSection: { type: "string", enum: MIX_IN },
      phraseBars: { type: "integer", enum: PHRASE_BARS },
      warpBToA: { type: "boolean" },
      difficulty: { type: "string", enum: DIFFICULTIES },
      rationale: { type: "string" },
      coachNote: { type: "string" },
      playbook: {
        type: "array",
        items: {
          type: "object",
          properties: {
            atBar: { type: "integer" },
            action: { type: "string" },
          },
          required: ["atBar", "action"],
        },
      },
    },
    required: [
      "technique",
      "mixOutSection",
      "mixInSection",
      "phraseBars",
      "warpBToA",
      "difficulty",
      "rationale",
      "coachNote",
      "playbook",
    ],
  },
};

function sectionsText(f: TrackFeatures): string {
  return f.sections.map((s) => `${s.kind}@bar${s.startBar}`).join(", ") || "none detected";
}
function renderUser(input: PlanInput): string {
  const { a, b, options } = input;
  const line = (label: string, f: TrackFeatures) =>
    `${label}: ${f.bpm} BPM, ${f.key ?? "unknown"} (Camelot ${f.camelot ?? "?"}), ${f.duration.toFixed(0)}s.\n` +
    `  sections: ${sectionsText(f)}`;
  return [
    line("Track A (playing)", a),
    line("Track B (incoming)", b),
    `DJ skill: ${options.skill}. Set moment: ${options.setMoment}. ` +
      `Beatmatch: ${options.beatmatch}. Preferred overlap: ${options.phraseBars} bars.`,
    "Plan the transition. Call emit_plan.",
  ].join("\n\n");
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("planner timeout")), ms))]);
}

function isValidStrategy(s: Partial<Strategy>): s is Strategy {
  return (
    !!s.technique &&
    TECHNIQUES.includes(s.technique) &&
    !!s.mixOutSection &&
    MIX_OUT.includes(s.mixOutSection) &&
    !!s.mixInSection &&
    MIX_IN.includes(s.mixInSection) &&
    typeof s.phraseBars === "number" &&
    PHRASE_BARS.includes(s.phraseBars) &&
    typeof s.warpBToA === "boolean" &&
    !!s.difficulty &&
    DIFFICULTIES.includes(s.difficulty) &&
    typeof s.rationale === "string" &&
    typeof s.coachNote === "string" &&
    Array.isArray(s.playbook)
  );
}

async function llmStrategy(input: PlanInput): Promise<Strategy> {
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT.replace("{skill}", input.options.skill).replace("{setMoment}", input.options.setMoment),
    tools: [PLAN_TOOL],
    tool_choice: { type: "tool", name: "emit_plan" },
    messages: [{ role: "user", content: renderUser(input) }],
  });
  const block = resp.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("no tool_use block");
  const s = block.input as Partial<Strategy>;
  if (!isValidStrategy(s)) throw new Error("invalid strategy from model");
  s.playbook = s.playbook.filter((p) => typeof p?.atBar === "number" && typeof p?.action === "string");
  return s;
}

async function plan(input: PlanInput): Promise<TransitionPlan> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const strategy = await withTimeout(llmStrategy(input), TIMEOUT_MS);
      return resolve(input, strategy, "llm");
    } catch (err) {
      console.warn("LLM planner failed, using heuristic:", (err as Error).message);
    }
  }
  return resolve(input, heuristicStrategy(input), "heuristic");
}

/* ------------------------------------------------------------------ *
 * Schema + serverless handler
 * ------------------------------------------------------------------ */

const schema = createSchema({
  typeDefs: /* GraphQL */ `
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
      skill: String!
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
    type Mutation {
      planTransition(input: PlanTransitionInput!): TransitionPlan!
    }
  `,
  resolvers: {
    Query: {
      profile: () => profile,
      projects: () => projects,
    },
    Mutation: {
      planTransition: (_parent: unknown, args: { input: PlanInput }) => plan(args.input),
    },
  },
});

export const config = { api: { bodyParser: false } };

export default createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  cors: { origin: "*" },
});
