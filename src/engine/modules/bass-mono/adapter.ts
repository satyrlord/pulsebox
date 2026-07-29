import type { ParameterValue } from "../../../contracts/parameters";
import type { VoiceAdapterFactory } from "../../transport/voice-adapter";
import {
  WorkletVoiceAdapter,
  type WorkletVoiceDescriptor,
} from "../../worklets/worklet-voice-adapter";
import type { BassParameters } from "./dsp-core";
import workletUrl from "./bass-mono.worklet.ts?worker&url";

type NumericBassParameter = Exclude<keyof BassParameters, "waveform">;
type MutableBassParameters = { -readonly [Key in keyof BassParameters]?: BassParameters[Key] };

/**
 * Manifest parameter ID to processor field. The manifest uses kebab-case stable
 * IDs; the DSP core uses camelCase fields. This module owns that translation so
 * the transport only ever deals in manifest IDs.
 */
const NUMERIC_PARAMETER_FIELDS: Readonly<Record<string, NumericBassParameter>> = {
  tune: "tune",
  cutoff: "cutoff",
  resonance: "resonance",
  "envelope-amount": "envelopeAmount",
  decay: "decay",
  "accent-amount": "accentAmount",
  glide: "glide",
  volume: "volume",
};

function toBassParameters(
  values: Readonly<Record<string, ParameterValue>>,
): Partial<BassParameters> {
  const result: MutableBassParameters = {};
  for (const [parameterId, field] of Object.entries(NUMERIC_PARAMETER_FIELDS)) {
    const value = values[parameterId];
    if (typeof value === "number" && Number.isFinite(value)) result[field] = value;
  }
  const waveform = values.waveform;
  if (waveform === "saw" || waveform === "square") result.waveform = waveform;
  return result;
}

const DESCRIPTOR: WorkletVoiceDescriptor = {
  processorName: "pulsebox-bass-mono",
  moduleUrl: workletUrl,
  displayName: "Acid Bass",
  mapParameters: toBassParameters,
};

export class AcidBassAdapter extends WorkletVoiceAdapter {
  constructor(context: AudioContext, options: Parameters<VoiceAdapterFactory>[1]) {
    super(DESCRIPTOR, context, options);
  }
}

/** Registry entry point: one adapter instance per rack module. */
export const createBassVoiceAdapter: VoiceAdapterFactory = (context, options) =>
  new AcidBassAdapter(context, options);
