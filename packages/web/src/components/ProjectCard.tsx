import { graphql, useFragment } from "react-relay";
import type { ProjectCard_project$key } from "../__generated__/ProjectCard_project.graphql";
import { theme } from "../theme";

const projectFragment = graphql`
  fragment ProjectCard_project on Project {
    index
    year
    title
    org
    blurb
    decision
    metrics
    tags
  }
`;

export function ProjectCard({ project }: { project: ProjectCard_project$key }) {
  const data = useFragment(projectFragment, project);

  return (
    <article
      style={{
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        borderRadius: 14,
        padding: "28px 30px",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 26,
        alignItems: "start",
      }}
    >
      <span style={{ fontFamily: theme.mono, fontSize: 13, color: theme.accent, paddingTop: 4 }}>
        {data.index}
      </span>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ fontFamily: theme.serif, fontSize: 24, margin: 0, fontWeight: 600 }}>
            {data.title}
          </h3>
          <span style={{ fontFamily: theme.mono, fontSize: 12, color: theme.muted }}>{data.org}</span>
        </div>

        <p style={{ color: theme.muted, lineHeight: 1.6, margin: "12px 0 14px", maxWidth: 600 }}>
          {data.blurb}
        </p>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            margin: "0 0 16px",
            paddingLeft: 12,
            borderLeft: `2px solid ${theme.accent}`,
          }}
        >
          <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.accent, letterSpacing: 0.5 }}>
            THE DECISION&nbsp;&nbsp;
          </span>
          {data.decision}
        </p>

        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 16 }}>
          {data.metrics.map((metric) => (
            <span key={metric} style={{ fontFamily: theme.mono, fontSize: 13 }}>
              ↳ {metric}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontFamily: theme.mono,
                fontSize: 11,
                color: theme.muted,
                border: `1px solid ${theme.line}`,
                borderRadius: 999,
                padding: "3px 10px",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <span style={{ fontFamily: theme.mono, fontSize: 12, color: theme.muted, paddingTop: 4 }}>
        {data.year}
      </span>
    </article>
  );
}
