import { StateVariableFilter, clamp } from "../../dsp/primitives";
import { finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";
export class PatternFilterDsp implements EffectFrameProcessor {
  readonly #left = new StateVariableFilter(); readonly #right = new StateVariableFilter(); readonly #sampleRate: number; readonly #state: EffectState;
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; }
  reset(): void { this.#left.reset(); this.#right.reset(); }
  process(left: number, right: number, output?: StereoFrame): StereoFrame {
    // The fixed 1/16 Piano Roll automation lane supplies the tempo-locked
    // cutoff pattern. The DSP consumes that scheduled cutoff directly.
    const cutoff = clamp(numberState(this.#state, "cutoff", 2400, 40, 18000), 40, this.#sampleRate / 6); const damping = 2 - numberState(this.#state, "resonance", 0.25, 0, 1) * 1.6;
    const drive = numberState(this.#state, "drive", 0, 0, 1);
    // Unity-peak saturator per decision D103: bounded at 1 for in-range input.
    const driveMakeup = 1 + drive * 6;
    const drivenLeft = finite(left) * driveMakeup / (1 + drive * Math.abs(finite(left)) * 6); const drivenRight = finite(right) * driveMakeup / (1 + drive * Math.abs(finite(right)) * 6);
    this.#left.process(drivenLeft, cutoff, damping, this.#sampleRate); this.#right.process(drivenRight, cutoff, damping, this.#sampleRate);
    return writeStereoFrame(output, finite(this.#left.low), finite(this.#right.low));
  }
}

export function createEffectProcessor(sampleRate: number, state: EffectState): EffectFrameProcessor {
  return new PatternFilterDsp(sampleRate, state);
}
