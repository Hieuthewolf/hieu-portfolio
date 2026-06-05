import { graphql, useLazyLoadQuery } from "react-relay";
import type { PortfolioQuery as PortfolioQueryType } from "../__generated__/PortfolioQuery.graphql";
import { theme } from "../theme";
import { ProfileHeader } from "./ProfileHeader";
import { ProjectCard } from "./ProjectCard";
import { SkillsSection } from "./SkillsSection";
import { ContactSection } from "./ContactSection";

const PortfolioQuery = graphql`
  query PortfolioQuery {
    profile {
      ...ProfileHeader_profile
      ...SkillsSection_profile
      ...ContactSection_profile
    }
    projects {
      id
      ...ProjectCard_project
    }
  }
`;

export function Portfolio() {
  const data = useLazyLoadQuery<PortfolioQueryType>(PortfolioQuery, {});

  return (
    <div style={{ background: theme.bg, color: theme.ink, fontFamily: theme.sans, minHeight: "100vh" }}>
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px" }}>
        <ProfileHeader profile={data.profile} />

        <section id="work" style={{ padding: "80px 0 30px" }}>
          <h2 style={{ fontFamily: theme.serif, fontSize: 38, fontWeight: 600, letterSpacing: -0.5, margin: 0 }}>
            Selected Work
          </h2>
          <div style={{ display: "grid", gap: 18, marginTop: 32 }}>
            {data.projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>

        <SkillsSection profile={data.profile} />
        <ContactSection profile={data.profile} />
      </main>
    </div>
  );
}
