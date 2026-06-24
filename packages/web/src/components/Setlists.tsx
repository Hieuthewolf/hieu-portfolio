import { useRef, useState, type ReactNode } from "react";
import { graphql, useLazyLoadQuery, useMutation } from "react-relay";
import { upload } from "@vercel/blob/client";
import { theme } from "../theme";
import { AccountMenu } from "./AccountMenu";
import { AuthForm } from "./AuthForm";
import type { SetlistsQuery as SetlistsQueryType } from "../__generated__/SetlistsQuery.graphql";
import type { SetlistsCreateMutation } from "../__generated__/SetlistsCreateMutation.graphql";
import type { SetlistsDeleteMutation } from "../__generated__/SetlistsDeleteMutation.graphql";
import type { SetlistsAddTrackMutation } from "../__generated__/SetlistsAddTrackMutation.graphql";
import type { SetlistsRemoveTrackMutation } from "../__generated__/SetlistsRemoveTrackMutation.graphql";
import type { SetlistsReorderMutation } from "../__generated__/SetlistsReorderMutation.graphql";

const SetlistsQuery = graphql`
  query SetlistsQuery {
    me {
      id
    }
    mySetlists {
      id
      name
      tracks {
        id
        title
        artist
        link
        audioUrl
        audioName
        position
      }
    }
  }
`;

const CreateSetlist = graphql`
  mutation SetlistsCreateMutation($name: String!) {
    createSetlist(name: $name) {
      id
    }
  }
`;
const DeleteSetlist = graphql`
  mutation SetlistsDeleteMutation($id: ID!) {
    deleteSetlist(id: $id)
  }
`;
const AddTrack = graphql`
  mutation SetlistsAddTrackMutation($setlistId: ID!, $input: SetlistTrackInput!) {
    addSetlistTrack(setlistId: $setlistId, input: $input) {
      id
    }
  }
`;
const RemoveTrack = graphql`
  mutation SetlistsRemoveTrackMutation($id: ID!) {
    removeSetlistTrack(id: $id)
  }
`;
const Reorder = graphql`
  mutation SetlistsReorderMutation($id: ID!, $trackIds: [ID!]!) {
    reorderSetlist(id: $id, trackIds: $trackIds) {
      id
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
  padding: "6px 12px",
  cursor: "pointer",
};
const input = {
  fontFamily: theme.sans,
  fontSize: 14,
  border: `1px solid ${theme.line}`,
  background: theme.bg,
  color: theme.ink,
  borderRadius: 8,
  padding: "8px 10px",
};

export function Setlists() {
  const [fetchKey, setFetchKey] = useState(0);
  const data = useLazyLoadQuery<SetlistsQueryType>(
    SetlistsQuery,
    {},
    { fetchKey, fetchPolicy: "store-and-network" },
  );
  const refresh = () => setFetchKey((k) => k + 1);

  const [createSetlist, creating] = useMutation<SetlistsCreateMutation>(CreateSetlist);
  const [deleteSetlist] = useMutation<SetlistsDeleteMutation>(DeleteSetlist);
  const [addTrack, adding] = useMutation<SetlistsAddTrackMutation>(AddTrack);
  const [removeTrack] = useMutation<SetlistsRemoveTrackMutation>(RemoveTrack);
  const [reorder] = useMutation<SetlistsReorderMutation>(Reorder);

  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!data.me) {
    return (
      <Shell>
        <p style={{ fontFamily: theme.sans, fontSize: 15, color: theme.muted, marginBottom: 16 }}>
          Sign in to build and save setlists.
        </p>
        <AuthForm />
      </Shell>
    );
  }

  const setlists = data.mySetlists;
  const selected = setlists.find((s) => s.id === selectedId) ?? setlists[0] ?? null;

  const onCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createSetlist({
      variables: { name },
      onCompleted: (res) => {
        setNewName("");
        if (res.createSetlist?.id) setSelectedId(res.createSetlist.id);
        refresh();
      },
    });
  };

  const commitTrack = (vars: { title: string; artist?: string; link?: string; audioUrl?: string; audioName?: string }) => {
    if (!selected) return;
    addTrack({
      variables: { setlistId: selected.id, input: vars },
      onCompleted: () => {
        setTitle("");
        setArtist("");
        setLink("");
        if (fileRef.current) fileRef.current.value = "";
        refresh();
      },
    });
  };

  const onAddLink = () => {
    if (!title.trim()) return;
    commitTrack({ title: title.trim(), artist: artist.trim() || undefined, link: link.trim() || undefined });
  };

  const onPickFile = async (file: File) => {
    if (!selected) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/blob/upload" });
      commitTrack({
        title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
        artist: artist.trim() || undefined,
        audioUrl: blob.url,
        audioName: file.name,
      });
    } catch (e) {
      setError(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    if (!selected) return;
    const ids = selected.tracks.map((t) => t.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder({ variables: { id: selected.id, trackIds: ids }, onCompleted: refresh });
  };

  return (
    <Shell>
      {/* Create */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          style={{ ...input, flex: 1 }}
          placeholder="New setlist name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
        />
        <button onClick={onCreate} disabled={creating || !newName.trim()} style={{ ...pill, opacity: creating ? 0.5 : 1 }}>
          + create
        </button>
      </div>

      {setlists.length === 0 ? (
        <p style={{ fontFamily: theme.sans, fontSize: 15, color: theme.muted }}>
          No setlists yet — name one above to start.
        </p>
      ) : (
        <>
          {/* Setlist tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {setlists.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                style={{
                  ...pill,
                  background: selected?.id === s.id ? theme.ink : "transparent",
                  color: selected?.id === s.id ? theme.surface : theme.ink,
                }}
              >
                {s.name} · {s.tracks.length}
              </button>
            ))}
          </div>

          {selected && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontFamily: theme.serif, fontSize: 22, fontWeight: 600 }}>{selected.name}</h2>
                <button
                  onClick={() => deleteSetlist({ variables: { id: selected.id }, onCompleted: () => { setSelectedId(null); refresh(); } })}
                  style={pill}
                >
                  delete setlist
                </button>
              </div>

              {/* Tracks */}
              <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
                {selected.tracks.length === 0 && (
                  <p style={{ fontFamily: theme.sans, fontSize: 14, color: theme.muted }}>No tracks yet — add one below.</p>
                )}
                {selected.tracks.map((t, i) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: theme.surface,
                      border: `1px solid ${theme.line}`,
                      borderRadius: 12,
                      padding: "10px 14px",
                    }}
                  >
                    <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.muted, width: 18 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: theme.sans, fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title}
                        {t.artist ? <span style={{ color: theme.muted, fontWeight: 400 }}> — {t.artist}</span> : null}
                      </div>
                      {t.audioUrl ? (
                        <audio controls src={t.audioUrl} style={{ height: 30, marginTop: 6, maxWidth: "100%" }} />
                      ) : t.link ? (
                        <a href={t.link} target="_blank" rel="noreferrer" style={{ fontFamily: theme.mono, fontSize: 11.5, color: theme.accent }}>
                          {t.link}
                        </a>
                      ) : null}
                    </div>
                    <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...pill, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === selected.tracks.length - 1} style={{ ...pill, opacity: i === selected.tracks.length - 1 ? 0.4 : 1 }}>↓</button>
                    <button onClick={() => removeTrack({ variables: { id: t.id }, onCompleted: refresh })} style={pill}>remove</button>
                  </div>
                ))}
              </div>

              {/* Add track */}
              <div style={{ display: "grid", gap: 8, background: theme.surface, border: `1px solid ${theme.line}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input style={{ ...input, flex: 2, minWidth: 140 }} placeholder="Track title *" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <input style={{ ...input, flex: 1, minWidth: 120 }} placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input style={{ ...input, flex: 2, minWidth: 180 }} placeholder="Paste a link (SoundCloud, etc.)" value={link} onChange={(e) => setLink(e.target.value)} />
                  <button onClick={onAddLink} disabled={adding || !title.trim()} style={{ ...pill, opacity: adding || !title.trim() ? 0.5 : 1 }}>
                    add link
                  </button>
                  <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.muted }}>or</span>
                  <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickFile(f); }} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...pill, opacity: uploading ? 0.5 : 1 }}>
                    {uploading ? "uploading…" : "upload MP3"}
                  </button>
                </div>
                {error && <div style={{ fontFamily: theme.mono, fontSize: 12, color: "#B5532F" }}>{error}</div>}
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.ink }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 80px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <a href="/segue" style={{ fontFamily: theme.mono, fontSize: 12, color: theme.muted, textDecoration: "none" }}>
              ← Segue
            </a>
            <h1 style={{ margin: "10px 0 0", fontFamily: theme.serif, fontSize: 32, fontWeight: 600 }}>Setlists</h1>
          </div>
          <AccountMenu />
        </header>
        {children}
      </div>
    </div>
  );
}
