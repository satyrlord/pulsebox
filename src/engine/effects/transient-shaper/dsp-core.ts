import { decibelsToGain, finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";
export class TransientShaperDsp implements EffectFrameProcessor {
  readonly #sampleRate: number; readonly #state: EffectState; #fast = 0; #slow = 0;
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; }
  reset(): void { this.#fast = 0; this.#slow = 0; }
  process(left: number, right: number, output?: StereoFrame): StereoFrame { const peak = Math.max(Math.abs(finite(left)), Math.abs(finite(right))); const fastCoefficient = Math.exp(-1 / (this.#sampleRate * 0.005)); const slowCoefficient = Math.exp(-1 / (this.#sampleRate * 0.12)); this.#fast = Math.max(peak, this.#fast * fastCoefficient); this.#slow = peak + slowCoefficient * (this.#slow - peak); const sensitivity = numberState(this.#state, "sensitivity", 0.5, 0, 1); const transient = Math.max(0, this.#fast - this.#slow) * (1 + sensitivity * 4); const attack = numberState(this.#state, "attack", 0, -1, 1); const sustain = numberState(this.#state, "sustain", 0, -1, 1); const gain = Math.max(0, Math.min(2, 1 + attack * transient + sustain * this.#slow * 0.5)) * decibelsToGain(numberState(this.#state, "output", -3, -18, 0)); return writeStereoFrame(output, finite(left * gain), finite(right * gain)); }
}

export function createEffectProcessor(sampleRate: number, state: EffectState): EffectFrameProcessor {
  return new TransientShaperDsp(sampleRate, state);
}
