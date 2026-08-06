import type { ParameterValue, PluginId } from "../../contracts/parameters";
import type { EffectPluginManifest } from "../../contracts/plugins";
import { processDistortionVoiceInsert } from "./distortion/voice-insert";
import { DISTORTION_MANIFEST } from "./distortion/manifest";

export interface VoiceInsertConfiguration {
  readonly pluginId: PluginId;
  readonly state: Readonly<Record<string, ParameterValue>>;
}

export interface VoiceInsertProcessor {
  readonly bypassTransitionMilliseconds: number;
  process(input: number): number;
}

interface BuiltInEffect {
  readonly manifest: EffectPluginManifest;
  readonly createVoiceInsertProcessor: (
    state: Readonly<Record<string, ParameterValue>>,
  ) => Omit<VoiceInsertProcessor, "bypassTransitionMilliseconds">;
}

const DISTORTION_EFFECT: BuiltInEffect = {
  manifest: DISTORTION_MANIFEST,
  createVoiceInsertProcessor: (state) => {
    // The state object remains part of the durable effect-instance contract.
    // Drive has a fixed default in this narrow first UI slice.
    void state;
    return { process: processDistortionVoiceInsert };
  },
};

/** The single engine registration point for built-in effects. */
export const BUILT_IN_EFFECTS: readonly BuiltInEffect[] = Object.freeze([DISTORTION_EFFECT]);

const VOICE_INSERT_EFFECTS = new Map<PluginId, BuiltInEffect>(
  BUILT_IN_EFFECTS.map((effect) => [effect.manifest.pluginId, effect]),
);

export function createVoiceInsertProcessor(
  configuration: VoiceInsertConfiguration,
): VoiceInsertProcessor | undefined {
  const effect = VOICE_INSERT_EFFECTS.get(configuration.pluginId);
  if (effect === undefined) return undefined;
  return {
    ...effect.createVoiceInsertProcessor(configuration.state),
    bypassTransitionMilliseconds: effect.manifest.bypassTransitionMilliseconds,
  };
}
