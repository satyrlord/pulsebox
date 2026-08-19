import { clamp } from "../../dsp/primitives";
import { decibelsToGain, finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";
export class CompressorDsp implements EffectFrameProcessor {
  readonly #sampleRate: number; readonly #state: EffectState; #gain = 1; gainReductionDecibels = 0;
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; }
  reset(): void { this.#gain = 1; this.gainReductionDecibels = 0; }
  process(left: number, right: number, output?: StereoFrame): StereoFrame { const peak = Math.max(Math.abs(finite(left)), Math.abs(finite(right)), 1e-9); const thresholdDb = numberState(this.#state, "threshold", -18, -60, 0); const ratio = numberState(this.#state, "ratio", 4, 1, 20); const peakDb = 20 * Math.log10(peak); const reductionDb = peakDb > thresholdDb ? (thresholdDb + (peakDb - thresholdDb) / ratio) - peakDb : 0; const target = decibelsToGain(reductionDb); const attack = numberState(this.#state, "attack", 10, 0.1, 200) / 1000; const release = numberState(this.#state, "release", 120, 5, 2000) / 1000; const coefficient = Math.exp(-1 / (this.#sampleRate * (target < this.#gain ? attack : release))); this.#gain = target + coefficient * (this.#gain - target); this.#gain = clamp(this.#gain, 0, 1); this.gainReductionDecibels = -20 * Math.log10(Math.max(this.#gain, 1e-9)); const gain = this.#gain * decibelsToGain(numberState(this.#state, "makeup", 0, 0, 24)); return writeStereoFrame(output, finite(left * gain), finite(right * gain)); }
}

export function createEffectProcessor(sampleRate: number, state: EffectState): EffectFrameProcessor {
  return new CompressorDsp(sampleRate, state);
}
