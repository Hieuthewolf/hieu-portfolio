import { useEffect, useState } from "react";
import { graphql, useMutation } from "react-relay";
import { theme } from "../../theme";
import { useSession } from "../../authClient";
import type { SetPlan, Track } from "../audio/types";
import type { SaveSetButtonMutation } from "../../__generated__/SaveSetButtonMutation.graphql";

const SaveSetMutation = graphql`
  mutation SaveSetButtonMutation($input: SaveSetInput!) {
    saveSet(input: $input) {
      id
      name
    }
  }
`;

const pill = {
  fontFamily: theme.mono,
  fontSize: 12,
  border: `1px solid ${theme.line}`,
  background: "transparent",
  color: theme.ink,
  borderRadius: 999,
  padding: "8px 16px",
  cursor: "pointer",
};

export function SaveSetButton({ setPlan, ordered }: { setPlan: SetPlan; ordered: Track[] }) {
  const { data: session } = useSession();
  const [commit, saving] = useMutation<SaveSetButtonMutation>(SaveSetMutation);
  const [saved, setSaved] = useState(false);

  // A re-order produces a new plan — allow saving the new version.
  useEffect(() => setSaved(false), [setPlan]);

  if (!session) {
    return (
      <a href="/library" style={{ ...pill, textDecoration: "none" }}>
        sign in to save
      </a>
    );
  }

  const onSave = () => {
    const name =
      ordered.length >= 2
        ? `${ordered[0]!.name} → ${ordered[ordered.length - 1]!.name}`
        : `${ordered.length}-track set`;
    // Self-contained snapshot: the plan + the ordered tracks' metadata.
    const plan = {
      order: setPlan.order,
      roles: setPlan.roles,
      gaps: setPlan.gaps,
      source: setPlan.source,
      tracks: ordered.map((t) => ({
        id: t.id,
        name: t.name,
        bpm: t.features.bpm,
        camelot: t.features.camelot,
        key: t.features.key,
        durationSec: t.features.duration,
      })),
    };
    commit({
      variables: { input: { name: name.slice(0, 300), narrative: setPlan.narrative, plan } },
      onCompleted: () => setSaved(true),
    });
  };

  return (
    <button onClick={onSave} disabled={saving || saved} style={{ ...pill, opacity: saving ? 0.5 : 1 }}>
      {saved ? "✓ set saved" : "save set"}
    </button>
  );
}
