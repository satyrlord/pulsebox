import type { EffectInstanceId, ModuleInstanceId, VoiceId } from "./ids";
import type { ParameterValue, PluginId } from "./parameters";

/** The first built-in effect that can occupy a drum voice insert slot. */
export const DISTORTION_EFFECT_PLUGIN_ID = "distortion" as PluginId;

/**
 * A durable effect instance. The project owns the instance, while a voice
 * insert slot only stores a reference to it.
 */
export interface EffectInstanceState {
  readonly id: EffectInstanceId;
  readonly pluginId: PluginId;
  readonly stateVersion: number;
  readonly state: Readonly<Record<string, ParameterValue>>;
}

/** One insert slot exists for each supported drum voice. */
export type VoiceInsertSlots = Readonly<Record<VoiceId, EffectInstanceId | null>>;

/**
 * Effect instances and their routing references stay outside instrument
 * parameter maps. This keeps an insert independent from its parent module.
 */
export interface EffectsState {
  readonly instances: Readonly<Record<EffectInstanceId, EffectInstanceState>>;
  readonly voiceInserts: Readonly<Record<ModuleInstanceId, VoiceInsertSlots>>;
}
