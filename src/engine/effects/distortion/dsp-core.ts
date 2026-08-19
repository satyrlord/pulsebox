import { OnePoleLowpass } from "../../dsp/primitives";
import { enumState, finite, numberState, writeStereoFrame, type EffectFrameProcessor, type EffectState, type StereoFrame } from "../dsp";
export type DistortionModel = "drive" | "fold" | "asymmetric";
export function distortSample(input: number, drive: number, model: DistortionModel): number {
  const source = finite(input); const gain = Math.max(1, drive);
  if (model === "fold") { const folded = Math.abs(((source * gain + 1) % 4 + 4) % 4 - 2) - 1; return finite(folded / gain); }
  if (model === "asymmetric") { const driven = source * gain; return finite((driven >= 0 ? Math.tanh(driven) : Math.tanh(driven * 0.55)) / gain); }
  return finite(Math.tanh(source * gain) / gain);
}
export class DistortionDsp implements EffectFrameProcessor {
  readonly #left = new OnePoleLowpass(); readonly #right = new OnePoleLowpass(); readonly #sampleRate: number; readonly #state: EffectState;
  constructor(sampleRate: number, state: EffectState) { this.#sampleRate = sampleRate; this.#state = state; }
  reset(): void { this.#left.reset(); this.#right.reset(); }
  process(left: number, right: number, output?: StereoFrame): StereoFrame { const drive = numberState(this.#state, "drive", 3.2, 1, 12); const model = enumState(this.#state, "model", "drive" as const, ["drive", "fold", "asymmetric"] as const); const tone = numberState(this.#state, "tone", 7200, 200, 18000); const dl = this.#left.process(distortSample(left, drive, model), tone, this.#sampleRate); const dr = this.#right.process(distortSample(right, drive, model), tone, this.#sampleRate); return writeStereoFrame(output, finite(dl), finite(dr)); }
}

export function createEffectProcessor(sampleRate: number, state: EffectState): EffectFrameProcessor {
  return new DistortionDsp(sampleRate, state);
}
