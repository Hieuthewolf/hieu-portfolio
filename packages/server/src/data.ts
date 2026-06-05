import type { Profile, Project } from "./types.js";

export const profile: Profile = {
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

export const projects: readonly Project[] = [
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
