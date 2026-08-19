import { StateVariableFilter } from "../../dsp/primitives";
import { decibelsToGain, finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";
class EqChannel { readonly low = new StateVariableFilter(); readonly mid = new StateVariableFilter(); readonly high = new StateVariableFilter(); reset(): void { this.low.reset(); this.mid.reset(); this.high.reset(); } }
export class ParametricEqDsp implements EffectFrameProcessor {
  readonly #sampleRate: number; readonly #state: EffectState; readonly #left = new EqChannel(); readonly #right = new EqChannel();
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; }
  reset(): void { this.#left.reset(); this.#right.reset(); }
  #process(input: number, channel: EqChannel): number { const source = finite(input); channel.low.process(source, numberState(this.#state, "low-frequency", 120, 20, 1000), 1.2, this.#sampleRate); channel.mid.process(source, numberState(this.#state, "mid-frequency", 1200, 100, 10000), Math.min(1.9, 1 / numberState(this.#state, "mid-q", 1, 0.2, 12)), this.#sampleRate); channel.high.process(source, numberState(this.#state, "high-frequency", 8000, 1000, 20000), 1.2, this.#sampleRate); const lowDelta = channel.low.low * (decibelsToGain(numberState(this.#state, "low-gain", 0, -18, 18)) - 1); const midDelta = channel.mid.band * (decibelsToGain(numberState(this.#state, "mid-gain", 0, -18, 18)) - 1); const highDelta = channel.high.high * (decibelsToGain(numberState(this.#state, "high-gain", 0, -18, 18)) - 1); return finite(source + lowDelta + midDelta + highDelta); }
  process(left: number, right: number, output?: StereoFrame): StereoFrame { return writeStereoFrame(output, this.#process(left, this.#left), this.#process(right, this.#right)); }
}

export function createEffectProcessor(sampleRate: number, state: EffectState): EffectFrameProcessor {
  return new ParametricEqDsp(sampleRate, state);
}
