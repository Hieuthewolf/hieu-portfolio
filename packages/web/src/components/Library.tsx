import { useRef, useState } from "react";
import { graphql, useLazyLoadQuery, useMutation } from "react-relay";
import { upload } from "@vercel/blob/client";
import { theme } from "../theme";
import { AccountMenu } from "./AccountMenu";
import { AuthForm } from "./AuthForm";
import { parseRekordboxXml } from "../segue/audio/rekordbox/importXml";
import type { LibraryQuery as LibraryQueryType } from "../__generated__/LibraryQuery.graphql";
import type { LibraryImportRekordboxMutation } from "../__generated__/LibraryImportRekordboxMutation.graphql";
import type { LibraryDeleteTrackMutation } from "../__generated__/LibraryDeleteTrackMutation.graphql";
import type { LibraryDeleteSetMutation } from "../__generated__/LibraryDeleteSetMutation.graphql";
import type { LibraryCreateSetlistMutation } from "../__generated__/LibraryCreateSetlistMutation.graphql";
import type { LibraryDeleteSetlistMutation } from "../__generated__/LibraryDeleteSetlistMutation.graphql";
import type { LibraryAddSetlistTrackMutation } from "../__generated__/LibraryAddSetlistTrackMutation.graphql";
import type { LibraryRemoveSetlistTrackMutation } from "../__generated__/LibraryRemoveSetlistTrackMutation.graphql";
import type { LibraryReorderSetlistMutation } from "../__generated__/LibraryReorderSetlistMutation.graphql";

const LibraryQuery = graphql`
  query LibraryQuery {
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
        bpm
        camelot
        position
      }
    }
    myTracks {
      id
      title
      artist
      bpm
      camelot
      musicalKey
      durationSec
      audioUrl
      audioName
      rbTrackId
    }
    mySets {
      id
      name
      narrative
      plan
    }
  }
`;

const DeleteTrack = graphql`
  mutation LibraryDeleteTrackMutation($id: ID!) {
    deleteTrack(id: $id)
  }
`;
const ImportRekordbox = graphql`
  mutation LibraryImportRekordboxMutation($tracks: [ImportTrackInput!]!) {
    importRekordboxTracks(tracks: $tracks)
  }
`;
const DeleteSet = graphql`
  mutation LibraryDeleteSetMutation($id: ID!) {
    deleteSet(id: $id)
  }
`;
const CreateSetlist = graphql`
  mutation LibraryCreateSetlistMutation($name: String!) {
    createSetlist(name: $name) {
      id
    }
  }
`;
const DeleteSetlist = graphql`
  mutation LibraryDeleteSetlistMutation($id: ID!) {
    deleteSetlist(id: $id)
  }
`;
const AddSetlistTrack = graphql`
  mutation LibraryAddSetlistTrackMutation($setlistId: ID!, $input: SetlistTrackInput!) {
    addSetlistTrack(setlistId: $setlistId, input: $input) {
      id
    }
  }
`;
const RemoveSetlistTrack = graphql`
  mutation LibraryRemoveSetlistTrackMutation($id: ID!) {
    removeSetlistTrack(id: $id)
  }
`;
const ReorderSetlist = graphql`
  mutation LibraryReorderSetlistMutation($id: ID!, $trackIds: [ID!]!) {
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
const card = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: theme.surface,
  border: `1px solid ${theme.line}`,
  borderRadius: 12,
  padding: "10px 14px",
};
const sectionLabel = {
  fontFamily: theme.mono,
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: theme.muted,
  marginBottom: 12,
};

function mmss(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function setTrackCount(plan: unknown): number | null {
  const t = (plan as { tracks?: unknown[] } | null)?.tracks;
  return Array.isArray(t) ? t.length : null;
}

type SavedTrack = LibraryQueryType["response"]["myTracks"][number];

export function Library() {
  const [fetchKey, setFetchKey] = useState(0);
  const data = useLazyLoadQuery<LibraryQueryType>(
    LibraryQuery,
    {},
    { fetchKey, fetchPolicy: "store-and-network" },
  );
  const refresh = () => setFetchKey((k) => k + 1);

  const [deleteTrack, deletingTrack] = useMutation<LibraryDeleteTrackMutation>(DeleteTrack);
  const [deleteSet, deletingSet] = useMutation<LibraryDeleteSetMutation>(DeleteSet);
  const [importRekordbox] = useMutation<LibraryImportRekordboxMutation>(ImportRekordbox);

  const importRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const onImportFile = async (file: File) => {
    setImportStatus("reading…");
    try {
      const parsed = parseRekordboxXml(await file.text());
      if (parsed.length === 0) {
        setImportStatus("No tracks found in that file.");
        return;
      }
      // Chunk to stay under the server's per-call cap.
      let imported = 0;
      for (let i = 0; i < parsed.length; i += 1000) {
        const chunk = parsed.slice(i, i + 1000);
        setImportStatus(`importing ${i + chunk.length}/${parsed.length}…`);
        imported += await new Promise<number>((resolve, reject) =>
          importRekordbox({
            variables: { tracks: chunk },
            onCompleted: (res) => resolve(res.importRekordboxTracks),
            onError: reject,
          }),
        );
      }
      setImportStatus(`Imported ${imported} of ${parsed.length} (${parsed.length - imported} already in your library).`);
      refresh();
    } catch (e) {
      setImportStatus(`Import failed: ${(e as Error).message}`);
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.ink }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px 80px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <a href="/segue" style={{ fontFamily: theme.mono, fontSize: 12, color: theme.muted, textDecoration: "none" }}>
              ← Segue
            </a>
            <h1 style={{ margin: "10px 0 0", fontFamily: theme.serif, fontSize: 32, fontWeight: 600 }}>My library</h1>
          </div>
          <AccountMenu />
        </header>

        {!data.me ? (
          <div style={{ fontFamily: theme.sans, fontSize: 15, color: theme.muted, display: "grid", gap: 16 }}>
            <p style={{ margin: 0 }}>Sign in to build setlists and save the tracks you’re interested in.</p>
            <AuthForm />
          </div>
        ) : (
          <>
            <SetlistsSection setlists={data.mySetlists} savedTracks={data.myTracks} onChange={refresh} />

            <div style={{ marginTop: 40 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ ...sectionLabel, marginBottom: 0 }}>Saved tracks</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {importStatus && <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.muted }}>{importStatus}</span>}
                  <input ref={importRef} type="file" accept=".xml" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); }} />
                  <button onClick={() => importRef.current?.click()} style={pill} title="Import your collection from a rekordbox.xml export">
                    import from Rekordbox
                  </button>
                </div>
              </div>
              {data.myTracks.length === 0 ? (
                <p style={{ fontFamily: theme.sans, fontSize: 14, color: theme.muted }}>
                  None yet — analyze a track in the Transition Coach and hit “Save to library”, or import a rekordbox.xml.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {data.myTracks.map((t) => (
                    <div key={t.id} style={{ ...card, justifyContent: "space-between" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: theme.sans, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.title}
                        </div>
                        <div style={{ fontFamily: theme.mono, fontSize: 11.5, color: theme.muted, marginTop: 2 }}>
                          {t.bpm ? `${Math.round(t.bpm)} BPM` : "— BPM"} · {t.camelot ?? "?"}
                          {t.musicalKey ? ` (${t.musicalKey})` : ""} · {mmss(t.durationSec)}
                          {t.rbTrackId ? " · Rekordbox" : ""}
                        </div>
                        {t.audioUrl ? (
                          <audio controls src={t.audioUrl} style={{ height: 30, marginTop: 6, maxWidth: "100%" }} />
                        ) : null}
                      </div>
                      <button onClick={() => deleteTrack({ variables: { id: t.id }, onCompleted: refresh })} disabled={deletingTrack} style={{ ...pill, opacity: deletingTrack ? 0.5 : 1 }}>
                        remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 40 }}>
              <div style={sectionLabel}>AI sets</div>
              {data.mySets.length === 0 ? (
                <p style={{ fontFamily: theme.sans, fontSize: 14, color: theme.muted }}>
                  None yet — build a set in the Set Builder and hit “save set”.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {data.mySets.map((s) => (
                    <div key={s.id} style={{ ...card, justifyContent: "space-between" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: theme.sans, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name}
                        </div>
                        <div style={{ fontFamily: theme.mono, fontSize: 11.5, color: theme.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {setTrackCount(s.plan) != null ? `${setTrackCount(s.plan)} tracks` : ""}
                          {s.narrative ? ` · ${s.narrative}` : ""}
                        </div>
                      </div>
                      <button onClick={() => deleteSet({ variables: { id: s.id }, onCompleted: refresh })} disabled={deletingSet} style={{ ...pill, opacity: deletingSet ? 0.5 : 1 }}>
                        remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SetlistsSection({
  setlists,
  savedTracks,
  onChange,
}: {
  setlists: LibraryQueryType["response"]["mySetlists"];
  savedTracks: readonly SavedTrack[];
  onChange: () => void;
}) {
  const [createSetlist, creating] = useMutation<LibraryCreateSetlistMutation>(CreateSetlist);
  const [deleteSetlist] = useMutation<LibraryDeleteSetlistMutation>(DeleteSetlist);
  const [addTrack, adding] = useMutation<LibraryAddSetlistTrackMutation>(AddSetlistTrack);
  const [removeTrack] = useMutation<LibraryRemoveSetlistTrackMutation>(RemoveSetlistTrack);
  const [reorder] = useMutation<LibraryReorderSetlistMutation>(ReorderSetlist);

  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const selected = setlists.find((s) => s.id === selectedId) ?? setlists[0] ?? null;

  type AddInput = { title: string; artist?: string; link?: string; audioUrl?: string; audioName?: string; bpm?: number; camelot?: string };
  const commitTrack = (vars: AddInput, reset = true) => {
    if (!selected) return;
    addTrack({
      variables: { setlistId: selected.id, input: vars },
      onCompleted: () => {
        if (reset) {
          setTitle("");
          setArtist("");
          setLink("");
          if (fileRef.current) fileRef.current.value = "";
        }
        onChange();
      },
    });
  };

  const onCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createSetlist({
      variables: { name },
      onCompleted: (res) => {
        setNewName("");
        if (res.createSetlist?.id) setSelectedId(res.createSetlist.id);
        onChange();
      },
    });
  };

  const onPickFile = async (file: File) => {
    if (!selected) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/blob/upload" });
      commitTrack({ title: title.trim() || file.name.replace(/\.[^.]+$/, ""), artist: artist.trim() || undefined, audioUrl: blob.url, audioName: file.name });
    } catch (e) {
      setError(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const addSaved = (t: SavedTrack) =>
    commitTrack(
      {
        title: t.title,
        artist: t.artist ?? undefined,
        bpm: t.bpm ?? undefined,
        camelot: t.camelot ?? undefined,
        audioUrl: t.audioUrl ?? undefined,
        audioName: t.audioName ?? undefined,
      },
      false,
    );

  const move = (index: number, dir: -1 | 1) => {
    if (!selected) return;
    const ids = selected.tracks.map((t) => t.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder({ variables: { id: selected.id, trackIds: ids }, onCompleted: onChange });
  };

  return (
    <div>
      <div style={sectionLabel}>Setlists</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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
        <p style={{ fontFamily: theme.sans, fontSize: 14, color: theme.muted }}>No setlists yet — name one above to start.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {setlists.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                style={{ ...pill, background: selected?.id === s.id ? theme.ink : "transparent", color: selected?.id === s.id ? theme.surface : theme.ink }}
              >
                {s.name} · {s.tracks.length}
              </button>
            ))}
          </div>

          {selected && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontFamily: theme.serif, fontSize: 22, fontWeight: 600 }}>{selected.name}</h2>
                <button onClick={() => deleteSetlist({ variables: { id: selected.id }, onCompleted: () => { setSelectedId(null); onChange(); } })} style={pill}>
                  delete setlist
                </button>
              </div>

              <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                {selected.tracks.length === 0 && (
                  <p style={{ fontFamily: theme.sans, fontSize: 14, color: theme.muted }}>No tracks yet — add one below.</p>
                )}
                {selected.tracks.map((t, i) => (
                  <div key={t.id} style={card}>
                    <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.muted, width: 18 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: theme.sans, fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title}
                        {t.artist ? <span style={{ color: theme.muted, fontWeight: 400 }}> — {t.artist}</span> : null}
                      </div>
                      {t.bpm != null ? (
                        <div style={{ fontFamily: theme.mono, fontSize: 11, color: theme.muted, marginTop: 2 }}>
                          {Math.round(t.bpm)} BPM · {t.camelot ?? "?"}
                        </div>
                      ) : null}
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
                    <button onClick={() => removeTrack({ variables: { id: t.id }, onCompleted: onChange })} style={pill}>remove</button>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gap: 8, background: theme.surface, border: `1px solid ${theme.line}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input style={{ ...input, flex: 2, minWidth: 140 }} placeholder="Track title *" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <input style={{ ...input, flex: 1, minWidth: 120 }} placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input style={{ ...input, flex: 2, minWidth: 180 }} placeholder="Optional link (SoundCloud, etc.)" value={link} onChange={(e) => setLink(e.target.value)} />
                  <button onClick={() => title.trim() && commitTrack({ title: title.trim(), artist: artist.trim() || undefined, link: link.trim() || undefined })} disabled={adding || !title.trim()} style={{ ...pill, opacity: adding || !title.trim() ? 0.5 : 1 }}>
                    add track
                  </button>
                  <span style={{ fontFamily: theme.mono, fontSize: 11, color: theme.muted }}>·</span>
                  <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickFile(f); }} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...pill, opacity: uploading ? 0.5 : 1 }}>
                    {uploading ? "uploading…" : "upload MP3"}
                  </button>
                </div>
                {savedTracks.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const t = savedTracks.find((x) => x.id === e.target.value);
                      if (t) addSaved(t);
                      e.target.value = "";
                    }}
                    style={{ ...input, cursor: "pointer" }}
                  >
                    <option value="">+ add from saved tracks…</option>
                    {savedTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                        {t.artist ? ` — ${t.artist}` : ""}
                        {t.bpm ? ` · ${Math.round(t.bpm)} BPM ${t.camelot ?? ""}` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {error && <div style={{ fontFamily: theme.mono, fontSize: 12, color: "#B5532F" }}>{error}</div>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
