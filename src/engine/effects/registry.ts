import type { EffectPluginManifest } from "../../contracts/plugins";
import type { PluginId } from "../../contracts/parameters";
import { CHORUS_MANIFEST } from "./chorus/manifest";
import { COMPRESSOR_MANIFEST } from "./compressor/manifest";
import { DELAY_MANIFEST } from "./delay/manifest";
import { DISTORTION_MANIFEST } from "./distortion/manifest";
import { LIMITER_MANIFEST } from "./limiter/manifest";
import { LO_FI_MANIFEST } from "./lo-fi/manifest";
import { PARAMETRIC_EQ_MANIFEST } from "./parametric-eq/manifest";
import { PATTERN_FILTER_MANIFEST } from "./pattern-filter/manifest";
import { PHASER_MANIFEST } from "./phaser/manifest";
import { REVERB_MANIFEST } from "./reverb/manifest";
import { STEREO_WIDTH_MANIFEST } from "./stereo-width/manifest";
import { TRANSIENT_SHAPER_MANIFEST } from "./transient-shaper/manifest";

export interface BuiltInEffect {
  readonly manifest: EffectPluginManifest;
  readonly processorFactoryKey: string;
}

function builtInEffect(manifest: EffectPluginManifest): BuiltInEffect {
  return Object.freeze({
    manifest,
    processorFactoryKey: manifest.processorFactoryKey,
  });
}

/** The single engine registration point for built-in effects. */
export const BUILT_IN_EFFECTS: readonly BuiltInEffect[] = Object.freeze([
  builtInEffect(LO_FI_MANIFEST), builtInEffect(PATTERN_FILTER_MANIFEST),
  builtInEffect(DISTORTION_MANIFEST), builtInEffect(COMPRESSOR_MANIFEST),
  builtInEffect(DELAY_MANIFEST), builtInEffect(REVERB_MANIFEST),
  builtInEffect(CHORUS_MANIFEST), builtInEffect(PHASER_MANIFEST),
  builtInEffect(PARAMETRIC_EQ_MANIFEST), builtInEffect(TRANSIENT_SHAPER_MANIFEST),
  builtInEffect(STEREO_WIDTH_MANIFEST), builtInEffect(LIMITER_MANIFEST),
]);

const EFFECT_BY_ID = new Map(BUILT_IN_EFFECTS.map((effect) => [effect.manifest.pluginId, effect]));

export function registeredEffect(pluginId: PluginId | string): BuiltInEffect | undefined {
  return EFFECT_BY_ID.get(pluginId as PluginId);
}
