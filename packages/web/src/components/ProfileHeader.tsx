import { graphql, useFragment } from "react-relay";
import type { ProfileHeader_profile$key } from "../__generated__/ProfileHeader_profile.graphql";
import { theme } from "../theme";
import { initials } from "../utils/initials";
import { AgentLoop } from "./AgentLoop";

const profileFragment = graphql`
  fragment ProfileHeader_profile on Profile {
    name
    role
    tagline
    location
    education
    github
  }
`;

export function ProfileHeader({ profile }: { profile: ProfileHeader_profile$key }) {
  const data = useFragment(profileFragment, profile);

  return (
    <header>
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 0",
          borderBottom: `1px solid ${theme.line}`,
          fontFamily: theme.mono,
          fontSize: 13,
        }}
      >
        <span>
          {initials(data.name)}
          <span style={{ color: theme.accent }}>.</span>
        </span>
        <div style={{ display: "flex", gap: 18 }}>
          <a href="/segue" style={{ color: theme.muted, textDecoration: "none" }}>
            Segue
          </a>
          <a href="#contact" style={{ color: theme.muted, textDecoration: "none" }}>
            Contact
          </a>
        </div>
      </nav>

      <section
        style={{
          padding: "90px 0 40px",
          display: "grid",
          gridTemplateColumns: "1.55fr 1fr",
          gap: 40,
          alignItems: "center",
        }}
      >
        <div>
          <p style={{ fontFamily: theme.mono, fontSize: 13, color: theme.accent, letterSpacing: 1.5 }}>
            {data.role.toUpperCase()}
          </p>
          <h1 style={{ fontFamily: theme.serif, fontSize: 64, lineHeight: 1.02, letterSpacing: -1, margin: "16px 0 0", fontWeight: 600 }}>
            {data.name}
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: theme.muted, maxWidth: 440, marginTop: 24 }}>
            {data.tagline}
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 32 }}>
            <a href="#work" style={btn(theme.accent, "#fff")}>
              View work
            </a>
            <a href={data.github} target="_blank" rel="noreferrer" style={btnOutline()}>
              Source
            </a>
          </div>
        </div>
        <div style={{ aspectRatio: "1" }}>
          <AgentLoop />
        </div>
      </section>

      <div
        style={{
          borderTop: `1px solid ${theme.line}`,
          paddingTop: 10,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: theme.mono,
          fontSize: 12,
          color: theme.muted,
        }}
      >
        <span>{data.education}</span>
        <span>{data.location}</span>
      </div>
    </header>
  );
}

function btn(bg: string, color: string) {
  return {
    background: bg,
    color,
    textDecoration: "none",
    fontFamily: theme.mono,
    fontSize: 13,
    padding: "12px 20px",
    borderRadius: 8,
  } as const;
}

function btnOutline() {
  return {
    border: `1px solid ${theme.line}`,
    color: theme.ink,
    textDecoration: "none",
    fontFamily: theme.mono,
    fontSize: 13,
    padding: "12px 20px",
    borderRadius: 8,
  } as const;
}
