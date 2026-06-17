// soundtouchjs ships no types — declare only the offline pull API we use.
declare module "soundtouchjs" {
  export class SoundTouch {
    tempo: number;
    pitch: number;
    pitchSemitones: number;
    rate: number;
  }
  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
  }
  export class SimpleFilter {
    constructor(source: WebAudioBufferSource, pipe: SoundTouch);
    extract(target: Float32Array, numFrames: number): number;
  }
}
