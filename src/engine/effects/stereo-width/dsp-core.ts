import { OnePoleHighpass, OnePoleLowpass } from "../../dsp/primitives";
import { finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";
export class StereoWidthDsp implements EffectFrameProcessor {
  readonly #highpass = new OnePoleHighpass(); readonly #lowpass = new OnePoleLowpass(); readonly #sampleRate: number; readonly #state: EffectState;
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; }
  reset(): void { this.#highpass.reset(); this.#lowpass.reset(); }
  process(left: number, right: number, output?: StereoFrame): StereoFrame { const l = finite(left), r = finite(right), mid = (l + r) * 0.5, side = (l - r) * 0.5; const hp = numberState(this.#state, "high-pass", 120, 20, 2000), lp = numberState(this.#state, "low-pass", 14000, 2000, 20000); const filteredSide = this.#lowpass.process(this.#highpass.process(side, hp, this.#sampleRate), lp, this.#sampleRate); const width = numberState(this.#state, "width", 1, 0, 2); const wetLeft = mid + filteredSide * width, wetRight = mid - filteredSide * width; return writeStereoFrame(output, finite(wetLeft), finite(wetRight)); }
}
