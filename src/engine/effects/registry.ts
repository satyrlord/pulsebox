import type { EffectPluginManifest } from "../../contracts/plugins";
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
  /** Worklet-only module key. It is not part of the manifest or project data. */
  readonly workletModuleKey: string;
}

function builtInEffect(manifest: EffectPluginManifest, workletModuleKey: string): BuiltInEffect {
  return Object.freeze({
    manifest,
    processorFactoryKey: manifest.processorFactoryKey,
    workletModuleKey,
  });
}

/** The single engine registration point for built-in effects. */
export const BUILT_IN_EFFECTS: readonly BuiltInEffect[] = Object.freeze([
  builtInEffect(LO_FI_MANIFEST, "lo-fi"), builtInEffect(PATTERN_FILTER_MANIFEST, "pattern-filter"),
  builtInEffect(DISTORTION_MANIFEST, "distortion"), builtInEffect(COMPRESSOR_MANIFEST, "compressor"),
  builtInEffect(DELAY_MANIFEST, "delay"), builtInEffect(REVERB_MANIFEST, "reverb"),
  builtInEffect(CHORUS_MANIFEST, "chorus"), builtInEffect(PHASER_MANIFEST, "phaser"),
  builtInEffect(PARAMETRIC_EQ_MANIFEST, "parametric-eq"), builtInEffect(TRANSIENT_SHAPER_MANIFEST, "transient-shaper"),
  builtInEffect(STEREO_WIDTH_MANIFEST, "stereo-width"), builtInEffect(LIMITER_MANIFEST, "limiter"),
]);

const EFFECT_BY_ID = new Map<string, BuiltInEffect>(
  BUILT_IN_EFFECTS.map((effect) => [effect.manifest.pluginId, effect]),
);

export function registeredEffect(pluginId: string): BuiltInEffect | undefined {
  return EFFECT_BY_ID.get(pluginId);
}
