import { graphql, useFragment } from "react-relay";
import type { SkillsSection_profile$key } from "../__generated__/SkillsSection_profile.graphql";
import { theme } from "../theme";

const skillsFragment = graphql`
  fragment SkillsSection_profile on Profile {
    skills {
      group
      items
    }
  }
`;

export function SkillsSection({ profile }: { profile: SkillsSection_profile$key }) {
  const data = useFragment(skillsFragment, profile);

  return (
    <section id="skills" style={{ padding: "70px 0", borderTop: `1px solid ${theme.line}`, marginTop: 50 }}>
      <h2 style={{ fontFamily: theme.serif, fontSize: 38, fontWeight: 600, letterSpacing: -0.5, margin: "0 0 36px" }}>
        Skills
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 28 }}>
        {data.skills.map((group) => (
          <div key={group.group} style={{ borderTop: `1px solid ${theme.line}`, paddingTop: 18 }}>
            <p style={{ fontFamily: theme.mono, fontSize: 12, color: theme.accent, letterSpacing: 1, margin: "0 0 14px" }}>
              {group.group.toUpperCase()}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {group.items.map((item) => (
                <span
                  key={item}
                  style={{
                    fontFamily: theme.mono,
                    fontSize: 11,
                    color: theme.muted,
                    border: `1px solid ${theme.line}`,
                    borderRadius: 999,
                    padding: "3px 10px",
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
