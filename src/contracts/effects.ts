import { SEND_BUS_IDS, type EffectInstanceId, type ModuleInstanceId, type SendBusId } from "./ids";
import type { ParameterId, ParameterValue, PluginId } from "./parameters";

const DISTORTION_EFFECT_PLUGIN_ID = "distortion" as PluginId;

/**
 * A durable effect instance. The project owns the instance, while a chain slot
 * only stores a reference to it.
 */
export interface EffectInstanceState {
  readonly id: EffectInstanceId;
  readonly pluginId: PluginId;
  readonly stateVersion: number;
  readonly state: Readonly<Record<string, ParameterValue>>;
  /** A bypass leaves the instance in its chain and keeps its automation target stable. */
  readonly bypassed: boolean;
  /** The effect-local equal-power balance, from dry at 0 through wet at 1. */
  readonly mix: number;
  /** Gain after this effect's Mix stage. */
  readonly gainDecibels: number;
}

/** A chain keeps its fixed slots so reordering never changes effect identity. */
export type EffectChainSlots = readonly (EffectInstanceId | null)[];

export interface SendEffectChainState {
  readonly slots: EffectChainSlots;
  /** Return level from silence through unity. This is not an effect Mix value. */
  readonly returnLevel: number;
  /** Bypasses every effect in this return chain without changing its instances. */
  readonly bypassed: boolean;
  /** The effect whose compact controls appear on the send card. */
  readonly pinnedEffectId: EffectInstanceId | null;
}

export const MODULE_EFFECT_CHAIN_SLOT_COUNT = 8;
export const SEND_EFFECT_CHAIN_SLOT_COUNT = 8;
export const MASTER_EFFECT_CHAIN_SLOT_COUNT = 6;
export const EFFECT_GAIN_MINIMUM_DECIBELS = -24;
export const EFFECT_GAIN_MAXIMUM_DECIBELS = 24;
const EFFECT_MIX_PARAMETER_ID = "mix" as ParameterId;
const EFFECT_GAIN_PARAMETER_ID = "gain" as ParameterId;

/** Shared stage controls use these IDs outside plugin-owned state. */
export function isEffectStageParameterId(value: string): boolean {
  return value === EFFECT_MIX_PARAMETER_ID || value === EFFECT_GAIN_PARAMETER_ID;
}

export const PROTECTED_LIMITER_EFFECT_PLUGIN_ID = "limiter" as PluginId;

export const DEFAULT_SEND_EFFECT_PLUGIN_IDS: Readonly<Record<SendBusId, PluginId>> = Object.freeze(
  Object.fromEntries(
    SEND_BUS_IDS.map((id, index) => [
      id,
      (["delay", "reverb", "stereo-width", DISTORTION_EFFECT_PLUGIN_ID] as const)[index],
    ]),
  ) as Record<SendBusId, PluginId>,
);

export const DEFAULT_MASTER_EFFECT_PLUGIN_IDS = Object.freeze([
  "compressor" as PluginId,
  "parametric-eq" as PluginId,
  PROTECTED_LIMITER_EFFECT_PLUGIN_ID,
] as const);

/**
 * Effect instances and their routing references stay outside instrument
 * parameter maps. This keeps a pedal independent from its parent module.
 */
export interface EffectsState {
  readonly instances: Readonly<Record<EffectInstanceId, EffectInstanceState>>;
  /** Eight fixed pedalboard slots exist for every loaded module. */
  readonly moduleChains: Readonly<Record<ModuleInstanceId, EffectChainSlots>>;
  /** The four fixed send paths each have an independently focused return chain. */
  readonly sendChains: Readonly<Record<SendBusId, SendEffectChainState>>;
  /** The final non-null slot is the protected limiter. */
  readonly masterChain: EffectChainSlots;
  /** Bypasses user master effects but never master gain or the final limiter. */
  readonly masterEffectsBypassed: boolean;
}
