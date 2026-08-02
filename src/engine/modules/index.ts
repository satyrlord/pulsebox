/**
 * The single registration point for built-in modules (section 6.5). Adding an
 * instrument is one module folder plus one entry in this list. Nothing else
 * enumerates the shipped plugins: the composition root builds the plugin
 * registry from this list.
 */

import type { InstrumentPluginManifest } from "../../contracts/plugins";
import type { VoiceAdapterFactory } from "../transport/voice-adapter";
import { createBassVoiceAdapter } from "./bass-mono/adapter";
import { BASS_MONO_DEFAULT_PARAMETERS, BASS_MONO_MANIFEST } from "./bass-mono/manifest";
import { createBoomVoiceAdapter } from "./boom-eight/adapter";
import { BOOM_EIGHT_DEFAULT_PARAMETERS, BOOM_EIGHT_MANIFEST } from "./boom-eight/manifest";
import { createDigitFiveVoiceAdapter } from "./digit-five/adapter";
import { DIGIT_FIVE_DEFAULT_PARAMETERS, DIGIT_FIVE_MANIFEST } from "./digit-five/manifest";
import { createDigitSevenVoiceAdapter } from "./digit-seven/adapter";
import { DIGIT_SEVEN_DEFAULT_PARAMETERS, DIGIT_SEVEN_MANIFEST } from "./digit-seven/manifest";
import { createDrumlineVoiceAdapter } from "./drumline-six/adapter";
import { DRUMLINE_SIX_DEFAULT_PARAMETERS, DRUMLINE_SIX_MANIFEST } from "./drumline-six/manifest";
import { createHybridVoiceAdapter } from "./hybrid-nine/adapter";
import { HYBRID_NINE_DEFAULT_PARAMETERS, HYBRID_NINE_MANIFEST } from "./hybrid-nine/manifest";

export interface BuiltInModule {
  readonly manifest: InstrumentPluginManifest;
  readonly defaultParameters: Readonly<Record<string, unknown>>;
  readonly createVoiceAdapter: VoiceAdapterFactory;
}

/** The six approved MVP instruments, in section 9.1 rack order. */
export const BUILT_IN_MODULES: readonly BuiltInModule[] = Object.freeze([
  {
    manifest: BASS_MONO_MANIFEST,
    defaultParameters: BASS_MONO_DEFAULT_PARAMETERS,
    createVoiceAdapter: createBassVoiceAdapter,
  },
  {
    manifest: DRUMLINE_SIX_MANIFEST,
    defaultParameters: DRUMLINE_SIX_DEFAULT_PARAMETERS,
    createVoiceAdapter: createDrumlineVoiceAdapter,
  },
  {
    manifest: BOOM_EIGHT_MANIFEST,
    defaultParameters: BOOM_EIGHT_DEFAULT_PARAMETERS,
    createVoiceAdapter: createBoomVoiceAdapter,
  },
  {
    manifest: HYBRID_NINE_MANIFEST,
    defaultParameters: HYBRID_NINE_DEFAULT_PARAMETERS,
    createVoiceAdapter: createHybridVoiceAdapter,
  },
  {
    manifest: DIGIT_SEVEN_MANIFEST,
    defaultParameters: DIGIT_SEVEN_DEFAULT_PARAMETERS,
    createVoiceAdapter: createDigitSevenVoiceAdapter,
  },
  {
    manifest: DIGIT_FIVE_MANIFEST,
    defaultParameters: DIGIT_FIVE_DEFAULT_PARAMETERS,
    createVoiceAdapter: createDigitFiveVoiceAdapter,
  },
]);

export {
  BASS_MONO_DEFAULT_PARAMETERS,
  BASS_MONO_MANIFEST,
  BOOM_EIGHT_DEFAULT_PARAMETERS,
  BOOM_EIGHT_MANIFEST,
  DIGIT_FIVE_DEFAULT_PARAMETERS,
  DIGIT_FIVE_MANIFEST,
  DIGIT_SEVEN_DEFAULT_PARAMETERS,
  DIGIT_SEVEN_MANIFEST,
  DRUMLINE_SIX_DEFAULT_PARAMETERS,
  DRUMLINE_SIX_MANIFEST,
  HYBRID_NINE_DEFAULT_PARAMETERS,
  HYBRID_NINE_MANIFEST,
};
