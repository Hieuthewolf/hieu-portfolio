/**
 * Coaching for "risky" transitions: diagnose why a pair clashes (key vs tempo)
 * and suggest one concrete fix. Pure + deterministic (reuses camelotCompatible),
 * so it runs with no LLM call and the same logic powers the playback key-shift.
 */
import { camelotCompatible } from "./dsp";

export type ClashKind = "key" | "tempo" | "both" | "none";

export interface Fix {
  problem: ClashKind;
  keyShift: number | null; // semitones to shift the incoming track into a compatible key
  tip: string;
}

/** Shift a Camelot code by N pitch semitones. One semitone = ±7 on the wheel (a fifth), same letter. */
export function shiftCamelot(camelot: string | null, semitones: number): string | null {
  if (!camelot) return null;
  const n = Number(camelot.slice(0, -1));
  const letter = camelot.slice(-1);
  if (!Number.isFinite(n) || (letter !== "A" && letter !== "B")) return null;
  const shifted = (((n - 1 + 7 * semitones) % 12) + 12) % 12;
  return `${shifted + 1}${letter}`;
}

/** Smallest non-zero semitone shift (|s| ≤ 5) that makes the incoming key compatible, or null. */
function nearestKeyShift(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  for (let mag = 1; mag <= 5; mag++) {
    for (const s of [mag, -mag]) {
      if (camelotCompatible(a, shiftCamelot(b, s))) return s;
    }
  }
  return null;
}

const sign = (s: number) => (s > 0 ? `+${s}` : `${s}`);
const pl = (s: number) => (Math.abs(s) === 1 ? "" : "s");

/**
 * Diagnose a transition and suggest one fix. `a` = outgoing track, `b` = incoming.
 * `compatible` / `bpmDiff` come straight off the resolved plan or set gap.
 */
export function suggestFix(
  a: string | null,
  b: string | null,
  bpmDiff: number,
  compatible: boolean,
): Fix {
  const keyClash = !compatible;
  const tempoGap = bpmDiff >= 0.08;
  const problem: ClashKind =
    keyClash && tempoGap ? "both" : keyClash ? "key" : tempoGap ? "tempo" : "none";

  const pct = Math.round(bpmDiff * 100);
  const tempoTip = `~${pct}% apart in tempo — cut on a phrase boundary or blend through a breakdown rather than forcing a long beatmatch.`;

  if (problem === "none") return { problem, keyShift: null, tip: "" };
  if (problem === "tempo") return { problem, keyShift: null, tip: tempoTip };

  // Key clash (and maybe tempo too): lead with the section/EQ move, then a key-shift if one's close.
  const shift = nearestKeyShift(a, b);
  let tip = `Keys clash (${a ?? "?"}↔${b ?? "?"}). Mix out of A's drums or outro into B's intro so mostly drums overlap, and EQ out A's mids.`;
  if (shift !== null) {
    tip += ` Or shift the incoming track ${sign(shift)} semitone${pl(shift)} (→ ${shiftCamelot(b, shift)}).`;
  }
  if (problem === "both") tip += ` ${tempoTip}`;
  return { problem, keyShift: shift, tip };
}
