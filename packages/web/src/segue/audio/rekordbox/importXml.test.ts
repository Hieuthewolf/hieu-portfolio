// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseRekordboxXml, tonalityToCamelot } from "./importXml";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="2">
    <TRACK TrackID="101" Name="Nightlight" Artist="Illenium" AverageBpm="150.00" Tonality="Am" TotalTime="225" Location="file://localhost/Users/me/Music/Night%20light.mp3">
      <TEMPO Inizio="0.025" Bpm="150.00" Metro="4/4" Battito="1"/>
      <POSITION_MARK Name="Drop" Type="0" Start="80.5" Num="-1"/>
    </TRACK>
    <TRACK TrackID="102" Name="Good Things Fall Apart" Artist="Illenium" AverageBpm="144.00" Tonality="8B" TotalTime="200" Location="file://localhost/Users/me/Music/gtfa.mp3"/>
  </COLLECTION>
  <PLAYLISTS><NODE Type="0" Name="ROOT"/></PLAYLISTS>
</DJ_PLAYLISTS>`;

describe("tonalityToCamelot", () => {
  it("maps musical notation and passes through Camelot codes", () => {
    expect(tonalityToCamelot("Am").camelot).toBe("8A");
    expect(tonalityToCamelot("C").camelot).toBe("8B");
    expect(tonalityToCamelot("Bb").camelot).toBe("6B"); // A# major
    expect(tonalityToCamelot("F#m").camelot).toBe("11A");
    expect(tonalityToCamelot("8A")).toEqual({ camelot: "8A", key: null });
    expect(tonalityToCamelot("")).toEqual({ camelot: null, key: null });
  });
});

describe("parseRekordboxXml", () => {
  it("maps tracks, beatgrid, key→camelot, cues, and location", () => {
    const tracks = parseRekordboxXml(SAMPLE);
    expect(tracks).toHaveLength(2);

    const a = tracks[0]!;
    expect(a.rbTrackId).toBe("101");
    expect(a.title).toBe("Nightlight");
    expect(a.artist).toBe("Illenium");
    expect(a.bpm).toBe(150);
    expect(a.camelot).toBe("8A"); // A minor
    expect(a.durationSec).toBe(225);
    expect(a.rbLocation).toBe("/Users/me/Music/Night light.mp3"); // decoded
    const an = a.analysis as { phase: number; beat: number; cues: { startSec: number }[] };
    expect(an.phase).toBeCloseTo(0.025);
    expect(an.beat).toBeCloseTo(60 / 150);
    expect(an.cues[0]!.startSec).toBe(80.5);

    expect(tracks[1]!.camelot).toBe("8B"); // already-Camelot Tonality
  });

  it("returns an empty list for XML with no tracks", () => {
    expect(parseRekordboxXml("<nope/>")).toEqual([]);
  });
});
