import { clamp } from "../../dsp/primitives";
import { decibelsToGain, finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";
export class LimiterDsp implements EffectFrameProcessor {
  readonly #sampleRate: number; readonly #state: EffectState; #gain = 1; gainReductionDecibels = 0;
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; }
  reset(): void { this.#gain = 1; this.gainReductionDecibels = 0; }
  process(left: number, right: number, output?: StereoFrame): StereoFrame { const ceiling = decibelsToGain(numberState(this.#state, "ceiling", -0.8, -12, 0)); const inputGain = decibelsToGain(numberState(this.#state, "input", 0, 0, 24)); const drivenLeft = finite(left) * inputGain, drivenRight = finite(right) * inputGain; const peak = Math.max(Math.abs(drivenLeft), Math.abs(drivenRight), 1e-12); const target = Math.min(1, ceiling / peak); const release = numberState(this.#state, "release", 80, 5, 1000) / 1000; const releaseCoefficient = Math.exp(-1 / (release * this.#sampleRate)); this.#gain = target < this.#gain ? target : target + releaseCoefficient * (this.#gain - target); this.#gain = clamp(this.#gain, 0, 1); this.gainReductionDecibels = -20 * Math.log10(Math.max(this.#gain, 1e-12)); return writeStereoFrame(output, clamp(finite(drivenLeft * this.#gain), -ceiling, ceiling), clamp(finite(drivenRight * this.#gain), -ceiling, ceiling)); }
}
