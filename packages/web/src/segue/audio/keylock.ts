import { SoundTouch, SimpleFilter, WebAudioBufferSource } from "soundtouchjs";

interface StretchOpts {
  tempo: number; // tempo factor; >1 faster, <1 slower (matches the engine's `warp`)
  pitchSemitones: number; // transpose, independent of tempo
  startSec: number;
  endSec: number;
}

const BLOCK = 4096;

/**
 * Pitch-preserving time-stretch + transpose of a slice of an AudioBuffer — the
 * "key-lock" / Master-Tempo move. SoundTouch (WSOLA) changes tempo and pitch
 * independently, so the returned buffer, played back at rate 1, is tempo-scaled
 * by `tempo` but holds its original pitch (offset by `pitchSemitones`).
 *
 * Only the requested slice is processed (the engine plays B from its mix-in
 * point onward), and we yield to the event loop periodically so a multi-minute
 * track doesn't lock the UI while it renders.
 */
export async function timeStretch(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  { tempo, pitchSemitones, startSec, endSec }: StretchOpts,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const start = Math.max(0, Math.floor(startSec * sr));
  const end = Math.min(buffer.length, Math.ceil(endSec * sr));
  const sliceLen = Math.max(1, end - start);

  // Copy the slice into a standalone buffer for SoundTouch to pull from.
  const slice = ctx.createBuffer(buffer.numberOfChannels, sliceLen, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    slice.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
  }

  const st = new SoundTouch();
  st.tempo = tempo;
  st.pitchSemitones = pitchSemitones;
  const filter = new SimpleFilter(new WebAudioBufferSource(slice), st);

  // Stretching by `tempo` yields ~sliceLen/tempo frames; pad for WSOLA block edges
  // and latency. Deinterleave SoundTouch's output straight into these scratch lanes.
  const maxFrames = Math.ceil(sliceLen / tempo) + BLOCK * 8;
  const left = new Float32Array(maxFrames);
  const right = new Float32Array(maxFrames);
  const interleaved = new Float32Array(BLOCK * 2);
  let total = 0;
  let blocks = 0;
  let extracted = 0;
  while ((extracted = filter.extract(interleaved, BLOCK)) > 0) {
    const room = Math.min(extracted, maxFrames - total);
    for (let i = 0; i < room; i++) {
      left[total + i] = interleaved[i * 2];
      right[total + i] = interleaved[i * 2 + 1];
    }
    total += room;
    if (total >= maxFrames) break;
    if (++blocks % 32 === 0) await new Promise((res) => setTimeout(res, 0)); // ~3s/yield: keep UI responsive
  }

  const channels = Math.min(2, buffer.numberOfChannels);
  const out = ctx.createBuffer(channels, Math.max(1, total), sr);
  out.copyToChannel(left.subarray(0, total), 0);
  if (channels > 1) out.copyToChannel(right.subarray(0, total), 1);
  return out;
}
