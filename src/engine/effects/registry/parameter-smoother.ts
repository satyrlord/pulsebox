import type {
  ParameterValue,
  SmoothingDescriptor,
} from "../../../contracts/parameters";
import { CHORUS_MANIFEST } from "../chorus/manifest";
import { COMPRESSOR_MANIFEST } from "../compressor/manifest";
import { DELAY_MANIFEST } from "../delay/manifest";
import { DISTORTION_MANIFEST } from "../distortion/manifest";
import { LIMITER_MANIFEST } from "../limiter/manifest";
import { LO_FI_MANIFEST } from "../lo-fi/manifest";
import { PARAMETRIC_EQ_MANIFEST } from "../parametric-eq/manifest";
import { PATTERN_FILTER_MANIFEST } from "../pattern-filter/manifest";
import { PHASER_MANIFEST } from "../phaser/manifest";
import { REVERB_MANIFEST } from "../reverb/manifest";
import { STEREO_WIDTH_MANIFEST } from "../stereo-width/manifest";
import { TRANSIENT_SHAPER_MANIFEST } from "../transient-shaper/manifest";

type MutableState = Record<string, ParameterValue>;

interface ParameterRampSlot {
  readonly parameterId: string;
  readonly descriptor: SmoothingDescriptor;
  active: boolean;
  startFrame: number;
  endFrame: number;
  startValue: number;
  endValue: number;
}

const EFFECT_MANIFESTS = [
  LO_FI_MANIFEST,
  PATTERN_FILTER_MANIFEST,
  DISTORTION_MANIFEST,
  COMPRESSOR_MANIFEST,
  DELAY_MANIFEST,
  REVERB_MANIFEST,
  CHORUS_MANIFEST,
  PHASER_MANIFEST,
  PARAMETRIC_EQ_MANIFEST,
  TRANSIENT_SHAPER_MANIFEST,
  STEREO_WIDTH_MANIFEST,
  LIMITER_MANIFEST,
] as const;

const SMOOTHING_BY_PLUGIN = new Map(
  EFFECT_MANIFESTS.map((manifest) => [
    manifest.pluginId as string,
    new Map(
      manifest.parameters.map((parameter) => [parameter.id as string, parameter.smoothing]),
    ),
  ]),
);

export function effectParameterSmoothing(
  pluginId: string,
): ReadonlyMap<string, SmoothingDescriptor> {
  return SMOOTHING_BY_PLUGIN.get(pluginId) ?? new Map();
}

/** Mutates the shared DSP state with sample-frame parameter trajectories. */
export class EffectParameterSmoother {
  readonly #sampleRate: number;
  readonly #state: MutableState;
  readonly #ramps: readonly ParameterRampSlot[];

  constructor(
    sampleRate: number,
    state: MutableState,
    descriptors: ReadonlyMap<string, SmoothingDescriptor>,
  ) {
    this.#sampleRate = sampleRate;
    this.#state = state;
    this.#ramps = [...descriptors].map(([parameterId, descriptor]) => ({
      parameterId,
      descriptor,
      active: false,
      startFrame: 0,
      endFrame: 0,
      startValue: 0,
      endValue: 0,
    }));
  }

  advance(frame: number): void {
    let index = 0;
    while (index < this.#ramps.length) {
      const ramp = this.#ramps[index];
      index += 1;
      if (!ramp?.active) continue;
      if (frame >= ramp.endFrame) {
        this.#state[ramp.parameterId] = ramp.endValue;
        ramp.active = false;
        continue;
      }
      const progress = Math.max(
        0,
        Math.min(1, (frame - ramp.startFrame) / (ramp.endFrame - ramp.startFrame)),
      );
      this.#state[ramp.parameterId] = interpolate(ramp, progress);
    }
  }

  apply(parameterId: string, value: ParameterValue, frame: number): void {
    let ramp: ParameterRampSlot | undefined;
    let index = 0;
    while (index < this.#ramps.length) {
      const candidate = this.#ramps[index];
      index += 1;
      if (candidate?.parameterId === parameterId) {
        ramp = candidate;
        break;
      }
    }
    const descriptor = ramp?.descriptor;
    const current = this.#state[parameterId];
    if (
      typeof value !== "number" ||
      typeof current !== "number" ||
      descriptor === undefined ||
      descriptor.curve === "none" ||
      descriptor.durationMilliseconds <= 0
    ) {
      if (ramp !== undefined) ramp.active = false;
      this.#state[parameterId] = value;
      return;
    }
    const durationFrames = Math.max(
      1,
      Math.round((descriptor.durationMilliseconds * this.#sampleRate) / 1_000),
    );
    if (ramp === undefined) {
      this.#state[parameterId] = value;
      return;
    }
    ramp.active = true;
    ramp.startFrame = frame;
    ramp.endFrame = frame + durationFrames;
    ramp.startValue = current;
    ramp.endValue = value;
  }
}

function interpolate(ramp: ParameterRampSlot, progress: number): number {
  if (
    ramp.descriptor.curve === "exponential" &&
    ramp.startValue !== 0 &&
    ramp.endValue !== 0 &&
    Math.sign(ramp.startValue) === Math.sign(ramp.endValue)
  ) {
    const sign = Math.sign(ramp.startValue);
    return (
      sign *
      Math.abs(ramp.startValue) *
      (Math.abs(ramp.endValue) / Math.abs(ramp.startValue)) ** progress
    );
  }
  return ramp.startValue + (ramp.endValue - ramp.startValue) * progress;
}
