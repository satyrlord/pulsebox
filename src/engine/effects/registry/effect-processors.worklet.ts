import type { ParameterValue } from "../../../contracts/parameters";
import type { EffectFrameProcessor, EffectProcessorFactory } from "../dsp";
import { registeredEffect } from "../registry";

/**
 * This module is only part of the effect AudioWorklet bundle. It eagerly loads
 * each effect DSP core, while the main-thread registry remains metadata-only.
 */
export const EFFECT_PROCESSOR_FACTORIES = import.meta.glob<EffectProcessorFactory>(
  "../*/dsp-core.ts",
  { eager: true, import: "createEffectProcessor" },
);

export function createRegisteredEffectProcessor(
  pluginId: string,
  sampleRate: number,
  state: Readonly<Record<string, ParameterValue>>,
): EffectFrameProcessor | undefined {
  const moduleKey = registeredEffect(pluginId)?.workletModuleKey;
  if (moduleKey === undefined) return undefined;
  return EFFECT_PROCESSOR_FACTORIES[`../${moduleKey}/dsp-core.ts`]?.(sampleRate, state);
}
