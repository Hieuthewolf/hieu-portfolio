import { useState } from "react";
import { graphql, useMutation } from "react-relay";
import { theme } from "../../theme";
import { useSession } from "../../authClient";
import type { Track } from "../audio/types";
import type { SaveTrackButtonMutation } from "../../__generated__/SaveTrackButtonMutation.graphql";

const SaveTrackMutation = graphql`
  mutation SaveTrackButtonMutation($input: SaveTrackInput!) {
    saveTrack(input: $input) {
      id
      title
    }
  }
`;

const pill = {
  fontFamily: theme.mono,
  fontSize: 11,
  border: `1px solid ${theme.line}`,
  background: "transparent",
  color: theme.ink,
  borderRadius: 999,
  padding: "5px 12px",
  cursor: "pointer",
};

export function SaveTrackButton({ track }: { track: Track }) {
  const { data: session } = useSession();
  const [commit, saving] = useMutation<SaveTrackButtonMutation>(SaveTrackMutation);
  const [saved, setSaved] = useState(false);

  if (!session) {
    return (
      <a href="/library" style={{ ...pill, textDecoration: "none", display: "inline-block" }}>
        sign in to save
      </a>
    );
  }

  const onSave = () => {
    const f = track.features;
    // Persist metadata + lightweight analysis (no audio, no heavy waveform peaks)
    // so the track can be reloaded into Segue without re-analysis.
    const analysis = {
      bpm: f.bpm,
      beat: f.beat,
      phase: f.phase,
      key: f.key,
      camelot: f.camelot,
      keyConfident: f.keyConfident,
      duration: f.duration,
      sections: f.sections,
      vocalRegions: f.vocalRegions,
      energySummary: f.energySummary,
    };
    commit({
      variables: {
        input: {
          title: track.name,
          bpm: f.bpm,
          camelot: f.camelot,
          musicalKey: f.key,
          durationSec: f.duration,
          analysis,
        },
      },
      onCompleted: () => setSaved(true),
    });
  };

  return (
    <button onClick={onSave} disabled={saving || saved} style={{ ...pill, opacity: saving ? 0.5 : 1 }}>
      {saved ? "✓ saved" : "save to library"}
    </button>
  );
}
