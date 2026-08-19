import { EFFECT_TRANSPORT_TEMPO_PARAMETER, booleanState, finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";
export class ChorusDsp implements EffectFrameProcessor {
  readonly #sampleRate: number; readonly #state: EffectState; readonly #left: Float32Array; readonly #right: Float32Array; #write = 0; #phase = 0;
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; const length = Math.ceil(sampleRate * 0.04); this.#left = new Float32Array(length); this.#right = new Float32Array(length); }
  reset(): void { this.#left.fill(0); this.#right.fill(0); this.#write = 0; this.#phase = 0; }
  #read(buffer: Float32Array, frames: number): number { const position = (this.#write - frames + buffer.length) % buffer.length; const index = Math.floor(position), fraction = position - index; return (buffer[index] ?? 0) * (1 - fraction) + (buffer[(index + 1) % buffer.length] ?? 0) * fraction; }
  process(left: number, right: number, output?: StereoFrame): StereoFrame { const rate = booleanState(this.#state, "tempo-sync", false) ? numberState(this.#state, EFFECT_TRANSPORT_TEMPO_PARAMETER, 120, 40, 240) / 120 : numberState(this.#state, "rate", 0.7, 0.02, 8), depth = numberState(this.#state, "depth", 0.55, 0, 1), delay = numberState(this.#state, "delay", 12, 2, 30) * this.#sampleRate / 1000; this.#phase = (this.#phase + rate / this.#sampleRate) % 1; const modulation = depth * 0.45 * delay; const wetLeft = this.#read(this.#left, delay + Math.sin(this.#phase * Math.PI * 2) * modulation), wetRight = this.#read(this.#right, delay + Math.sin((this.#phase + 0.25) * Math.PI * 2) * modulation); this.#left[this.#write] = finite(left); this.#right[this.#write] = finite(right); this.#write = (this.#write + 1) % this.#left.length; return writeStereoFrame(output, finite(wetLeft), finite(wetRight)); }
}

export function createEffectProcessor(sampleRate: number, state: EffectState): EffectFrameProcessor {
  return new ChorusDsp(sampleRate, state);
}
