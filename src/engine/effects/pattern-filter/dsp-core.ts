import { StateVariableFilter, clamp } from "../../dsp/primitives";
import { equalPowerMix, finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";
export class PatternFilterDsp implements EffectFrameProcessor {
  readonly #left = new StateVariableFilter(); readonly #right = new StateVariableFilter(); readonly #sampleRate: number; readonly #state: EffectState;
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; }
  reset(): void { this.#left.reset(); this.#right.reset(); }
  process(left: number, right: number, output?: StereoFrame): StereoFrame {
    // The fixed 1/16 Piano Roll automation lane supplies the tempo-locked
    // cutoff pattern. The DSP consumes that scheduled cutoff directly.
    const cutoff = clamp(numberState(this.#state, "cutoff", 2400, 40, 18000), 40, this.#sampleRate / 6); const damping = 2 - numberState(this.#state, "resonance", 0.25, 0, 1) * 1.6;
    const drive = numberState(this.#state, "drive", 0, 0, 1); const mix = numberState(this.#state, "mix", 1, 0, 1);
    const drivenLeft = finite(left) / (1 + drive * Math.abs(finite(left)) * 6); const drivenRight = finite(right) / (1 + drive * Math.abs(finite(right)) * 6);
    this.#left.process(drivenLeft, cutoff, damping, this.#sampleRate); this.#right.process(drivenRight, cutoff, damping, this.#sampleRate);
    return writeStereoFrame(output, finite(equalPowerMix(left, this.#left.low, mix)), finite(equalPowerMix(right, this.#right.low, mix)));
  }
}
