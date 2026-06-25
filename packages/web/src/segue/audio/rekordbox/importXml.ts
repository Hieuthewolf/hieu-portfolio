import { keyToCamelot } from "../dsp";

export interface ImportedTrack {
  rbTrackId: string;
  rbLocation: string | null;
  title: string;
  artist: string | null;
  bpm: number | null;
  camelot: string | null;
  musicalKey: string | null;
  durationSec: number | null;
  analysis: unknown;
}

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

/**
 * Rekordbox `Tonality` → Camelot. Handles musical notation ("Am", "F#m", "Bb")
 * and already-Camelot/Open-Key codes ("8A"). Returns the Camelot code plus a
 * normalized "<Note> <major|minor>" key name (or nulls if unrecognized).
 */
export function tonalityToCamelot(raw: string | null | undefined): {
  camelot: string | null;
  key: string | null;
} {
  const t = (raw ?? "").trim();
  if (!t) return { camelot: null, key: null };
  if (/^\d{1,2}[ABab]$/.test(t)) return { camelot: t.toUpperCase(), key: null };
  const m = t.match(/^([A-Ga-g])([#b]?)(m?)$/);
  if (!m) return { camelot: null, key: null };
  let note = m[1].toUpperCase() + m[2];
  note = FLAT_TO_SHARP[note] ?? note.replace("b", "");
  const key = `${note} ${m[3] === "m" ? "minor" : "major"}`;
  return { camelot: keyToCamelot(key), key };
}

function attr(el: Element | null, name: string): string | null {
  const v = el?.getAttribute(name);
  return v != null && v !== "" ? v : null;
}
function numAttr(el: Element | null, name: string): number | null {
  const v = attr(el, name);
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** rekordbox stores "file://localhost/Users/…" URL-encoded; recover a readable path. */
function decodeLocation(loc: string | null): string | null {
  if (!loc) return null;
  try {
    return decodeURIComponent(loc.replace(/^file:\/\/(localhost)?/, ""));
  } catch {
    return loc;
  }
}

/**
 * Parse a rekordbox.xml collection into importable track rows. Uses
 * getElementsByTagName (case-sensitive in XML, robust across DOM impls); the
 * Name/TrackID guard skips the bare <TRACK Key="…"> references in <PLAYLISTS>.
 */
export function parseRekordboxXml(xml: string): ImportedTrack[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const trackEls = Array.from(doc.getElementsByTagName("TRACK"));
  const out: ImportedTrack[] = [];
  for (const el of trackEls) {
    const rbTrackId = attr(el, "TrackID");
    const title = attr(el, "Name");
    if (!rbTrackId || !title) continue;
    const { camelot, key } = tonalityToCamelot(attr(el, "Tonality"));
    const tempo = el.getElementsByTagName("TEMPO")[0] ?? null; // first beat marker = grid anchor
    const bpm = numAttr(el, "AverageBpm") ?? numAttr(tempo, "Bpm");
    const phase = numAttr(tempo, "Inizio"); // first-beat offset, seconds
    const beat = bpm ? 60 / bpm : null;
    const cues = Array.from(el.getElementsByTagName("POSITION_MARK")).map((c) => ({
      name: attr(c, "Name"),
      type: numAttr(c, "Type"),
      startSec: numAttr(c, "Start"),
    }));
    out.push({
      rbTrackId,
      rbLocation: decodeLocation(attr(el, "Location")),
      title,
      artist: attr(el, "Artist"),
      bpm,
      camelot,
      musicalKey: key,
      durationSec: numAttr(el, "TotalTime"),
      analysis: { source: "rekordbox", beat, phase, bpm, camelot, cues },
    });
  }
  return out;
}
