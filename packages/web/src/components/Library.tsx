import { useState } from "react";
import { graphql, useLazyLoadQuery, useMutation } from "react-relay";
import { theme } from "../theme";
import { AccountMenu } from "./AccountMenu";
import { AuthForm } from "./AuthForm";
import type { LibraryQuery as LibraryQueryType } from "../__generated__/LibraryQuery.graphql";
import type { LibraryDeleteTrackMutation } from "../__generated__/LibraryDeleteTrackMutation.graphql";

const LibraryQuery = graphql`
  query LibraryQuery {
    me {
      id
      name
      email
      image
    }
    myTracks {
      id
      title
      artist
      bpm
      camelot
      musicalKey
      durationSec
      createdAt
    }
  }
`;

const DeleteTrackMutation = graphql`
  mutation LibraryDeleteTrackMutation($id: ID!) {
    deleteTrack(id: $id)
  }
`;

function mmss(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Library() {
  const [fetchKey, setFetchKey] = useState(0);
  const data = useLazyLoadQuery<LibraryQueryType>(
    LibraryQuery,
    {},
    { fetchKey, fetchPolicy: "store-and-network" },
  );
  const [commitDelete, deleting] = useMutation<LibraryDeleteTrackMutation>(DeleteTrackMutation);

  const onDelete = (id: string) =>
    commitDelete({ variables: { id }, onCompleted: () => setFetchKey((k) => k + 1) });

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.ink }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px 80px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <a href="/segue" style={{ fontFamily: theme.mono, fontSize: 12, color: theme.muted, textDecoration: "none" }}>
              ← Segue
            </a>
            <h1 style={{ margin: "10px 0 0", fontFamily: theme.serif, fontSize: 32, fontWeight: 600 }}>
              My library
            </h1>
          </div>
          <AccountMenu />
        </header>

        {!data.me ? (
          <div style={{ fontFamily: theme.sans, fontSize: 15, color: theme.muted, display: "grid", gap: 16 }}>
            <p style={{ margin: 0 }}>Sign in to save tracks you’re interested in and revisit them here.</p>
            <AuthForm />
          </div>
        ) : data.myTracks.length === 0 ? (
          <p style={{ fontFamily: theme.sans, fontSize: 15, color: theme.muted }}>
            No saved tracks yet. Load a track in the Transition Coach and hit “Save to library”.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {data.myTracks.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  background: theme.surface,
                  border: `1px solid ${theme.line}`,
                  borderRadius: 12,
                  padding: "12px 16px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: theme.sans, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title}
                  </div>
                  <div style={{ fontFamily: theme.mono, fontSize: 11.5, color: theme.muted, marginTop: 2 }}>
                    {t.bpm ? `${Math.round(t.bpm)} BPM` : "— BPM"} · {t.camelot ?? "?"}
                    {t.musicalKey ? ` (${t.musicalKey})` : ""} · {mmss(t.durationSec)}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(t.id)}
                  disabled={deleting}
                  style={{
                    fontFamily: theme.mono,
                    fontSize: 11,
                    border: `1px solid ${theme.line}`,
                    background: "transparent",
                    color: theme.ink,
                    borderRadius: 999,
                    padding: "5px 12px",
                    cursor: "pointer",
                    opacity: deleting ? 0.5 : 1,
                  }}
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
