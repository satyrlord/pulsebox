import { BitCrusher, OnePoleLowpass } from "../../dsp/primitives";
import { finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";

export class LoFiDsp implements EffectFrameProcessor {
  readonly #leftCrusher = new BitCrusher(); readonly #rightCrusher = new BitCrusher();
  readonly #leftFilter = new OnePoleLowpass(); readonly #rightFilter = new OnePoleLowpass();
  readonly #sampleRate: number; readonly #state: EffectState;
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; }
  reset(): void { this.#leftCrusher.reset(); this.#rightCrusher.reset(); this.#leftFilter.reset(); this.#rightFilter.reset(); }
  #processChannel(
    input: number,
    crusher: BitCrusher,
    filter: OnePoleLowpass,
    depth: number,
    rate: number,
    cutoff: number,
    antiAlias: number,
    character: number,
  ): number {
    const crushed = crusher.process(finite(input), depth, 1 - rate);
    const filtered = filter.process(crushed, cutoff, this.#sampleRate);
    return finite(
      crushed * (1 - antiAlias) +
      filtered * antiAlias +
      Math.tanh(crushed * 2.2) * character * 0.08,
    );
  }
  process(left: number, right: number, output?: StereoFrame): StereoFrame {
    const bits = numberState(this.#state, "bits", 10, 2, 16); const depth = (16 - bits) / 14;
    const rate = numberState(this.#state, "rate", 0.55, 0.02, 1); const character = numberState(this.#state, "character", 0.35, 0, 1);
    const antiAlias = numberState(this.#state, "anti-alias", 0.7, 0, 1); const cutoff = this.#sampleRate * (0.08 + rate * 0.4);
    return writeStereoFrame(
      output,
      this.#processChannel(left, this.#leftCrusher, this.#leftFilter, depth, rate, cutoff, antiAlias, character),
      this.#processChannel(right, this.#rightCrusher, this.#rightFilter, depth, rate, cutoff, antiAlias, character),
    );
  }
}

export function createEffectProcessor(sampleRate: number, state: EffectState): EffectFrameProcessor {
  return new LoFiDsp(sampleRate, state);
}
