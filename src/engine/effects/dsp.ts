import type { ParameterValue } from "../../contracts/parameters";
import { clamp } from "../dsp/primitives";

export interface StereoFrame {
  left: number;
  right: number;
}

export interface EffectFrameProcessor {
  process(left: number, right: number, output?: StereoFrame): StereoFrame;
  reset(): void;
}

export type EffectState = Readonly<Record<string, ParameterValue>>;

/** Runtime-only transport tempo. Effect manifests and project documents omit this value. */
export const EFFECT_TRANSPORT_TEMPO_PARAMETER = "__transport-tempo";

export function finite(value: number): number {
  return Number.isFinite(value) ? clamp(value, -4, 4) : 0;
}

/** Writes one frame into reusable worklet storage when the caller supplies it. */
export function writeStereoFrame(
  output: StereoFrame | undefined,
  left: number,
  right: number,
): StereoFrame {
  if (output === undefined) return { left, right };
  output.left = left;
  output.right = right;
  return output;
}

export function numberState(
  state: EffectState,
  id: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = state[id];
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, minimum, maximum)
    : fallback;
}

export function booleanState(state: EffectState, id: string, fallback: boolean): boolean {
  const value = state[id];
  return typeof value === "boolean" ? value : fallback;
}

export function enumState<T extends string>(
  state: EffectState,
  id: string,
  fallback: T,
  values: readonly T[],
): T {
  const value = state[id];
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}

export function decibelsToGain(decibels: number): number {
  return 10 ** (decibels / 20);
}
