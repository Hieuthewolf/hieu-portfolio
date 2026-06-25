import { useState } from "react";
import { graphql, useMutation } from "react-relay";
import { upload } from "@vercel/blob/client";
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
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!session) {
    return (
      <a href="/library" style={{ ...pill, textDecoration: "none", display: "inline-block" }}>
        sign in to save
      </a>
    );
  }

  const onSave = async () => {
    const f = track.features;
    // Persist metadata + lightweight analysis (no waveform peaks) so the track can
    // be reloaded into Segue without re-analysis.
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
    setBusy(true);
    try {
      // Also stash the original audio file in Blob, if we still have it.
      let audioUrl: string | undefined;
      let audioName: string | undefined;
      if (track.file) {
        const blob = await upload(track.file.name, track.file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
        });
        audioUrl = blob.url;
        audioName = track.file.name;
      }
      commit({
        variables: {
          input: {
            title: track.name,
            bpm: f.bpm,
            camelot: f.camelot,
            musicalKey: f.key,
            durationSec: f.duration,
            analysis,
            audioUrl,
            audioName,
          },
        },
        onCompleted: () => setSaved(true),
        onError: () => setBusy(false),
      });
    } catch {
      setBusy(false);
    }
  };

  return (
    <button onClick={() => void onSave()} disabled={busy || saving || saved} style={{ ...pill, opacity: busy || saving ? 0.5 : 1 }}>
      {saved ? "✓ saved" : busy ? "saving…" : "save to library"}
    </button>
  );
}
