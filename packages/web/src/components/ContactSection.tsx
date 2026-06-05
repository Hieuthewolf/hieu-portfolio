import { graphql, useFragment } from "react-relay";
import type { ContactSection_profile$key } from "../__generated__/ContactSection_profile.graphql";
import { theme } from "../theme";

const contactFragment = graphql`
  fragment ContactSection_profile on Profile {
    email
    github
    linkedin
  }
`;

export function ContactSection({ profile }: { profile: ContactSection_profile$key }) {
  const data = useFragment(contactFragment, profile);

  const links = [
    { label: data.email, href: `mailto:${data.email}` },
    { label: "LinkedIn", href: data.linkedin },
    { label: "GitHub", href: data.github },
  ];

  return (
    <section id="contact" style={{ padding: "70px 0 90px", borderTop: `1px solid ${theme.line}` }}>
      <h2 style={{ fontFamily: theme.serif, fontSize: 46, fontWeight: 600, letterSpacing: -0.8, margin: "0 0 10px" }}>
        Let&apos;s talk<span style={{ color: theme.accent }}>.</span>
      </h2>
      <p style={{ color: theme.muted, fontSize: 17, maxWidth: 460, lineHeight: 1.6, marginBottom: 30 }}>
        Open to conversations about senior AI engineering roles. The fastest way to reach me is email.
      </p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            style={{
              textDecoration: "none",
              color: theme.ink,
              border: `1px solid ${theme.line}`,
              background: theme.surface,
              borderRadius: 10,
              padding: "13px 18px",
              fontFamily: theme.mono,
              fontSize: 13,
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}
