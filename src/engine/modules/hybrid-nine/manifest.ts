import {
  parseMeterId,
  parseParameterId,
  parsePluginId,
  type ParameterDescriptor,
} from "../../../contracts/parameters";
import type { InstrumentPluginManifest } from "../../../contracts/plugins";
import { DEFAULT_HYBRID_PARAMETERS } from "./dsp-core";
import { HYBRID_VOICE_IDS, HYBRID_VOICE_NAMES, type HybridVoiceId } from "./voices";

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("Hybrid Nine contains an invalid stable identifier.");
  return result.value;
}

const parameterId = (value: string) => required(parseParameterId(value));

const smoothing = { curve: "linear", durationMilliseconds: 8 } as const;

function moduleParameter(
  id: string,
  name: string,
  defaultValue: number,
  unit: ParameterDescriptor["unit"],
): ParameterDescriptor {
  return {
    id: parameterId(id),
    name,
    valueType: "float",
    minimum: 0,
    maximum: 1,
    defaultValue,
    step: 0.01,
    unit,
    displayPrecision: 2,
    resetValue: defaultValue,
    smoothing,
    workletRate: "message",
    automation: "step",
    modulation: "none",
  };
}

interface VoiceField {
  readonly field: string;
  readonly label: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit: ParameterDescriptor["unit"];
  readonly precision: number;
  readonly defaultFor: (voiceId: HybridVoiceId) => number;
}

const VOICE_FIELDS: readonly VoiceField[] = [
  {
    field: "tune",
    label: "Tune",
    minimum: -24,
    maximum: 24,
    step: 1,
    unit: "semitones",
    precision: 0,
    defaultFor: (voiceId) => DEFAULT_HYBRID_PARAMETERS.voices[voiceId].tune,
  },
  {
    field: "decay",
    label: "Decay",
    minimum: 0.01,
    maximum: 3,
    step: 0.01,
    unit: "seconds",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_HYBRID_PARAMETERS.voices[voiceId].decay,
  },
  {
    field: "blend",
    label: "Blend",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_HYBRID_PARAMETERS.voices[voiceId].blend,
  },
  {
    field: "start",
    label: "Start",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_HYBRID_PARAMETERS.voices[voiceId].start,
  },
  {
    field: "attack",
    label: "Attack",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_HYBRID_PARAMETERS.voices[voiceId].attack,
  },
  {
    field: "level",
    label: "Level",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_HYBRID_PARAMETERS.voices[voiceId].level,
  },
  {
    field: "pan",
    label: "Pan",
    minimum: -1,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_HYBRID_PARAMETERS.voices[voiceId].pan,
  },
];

const moduleParameters: readonly ParameterDescriptor[] = [
  moduleParameter("filter", "Filter", DEFAULT_HYBRID_PARAMETERS.filter, "ratio"),
  moduleParameter("level", "Level", DEFAULT_HYBRID_PARAMETERS.level, "ratio"),
];

const voiceParameters: readonly ParameterDescriptor[] = HYBRID_VOICE_IDS.flatMap((voiceId) =>
  VOICE_FIELDS.map((descriptor): ParameterDescriptor => {
    const defaultValue = descriptor.defaultFor(voiceId);
    return {
      id: parameterId(`${voiceId}-${descriptor.field}`),
      name: `${HYBRID_VOICE_NAMES[voiceId]} ${descriptor.label.toLowerCase()}`,
      shortLabel: descriptor.label,
      valueType: "float",
      minimum: descriptor.minimum,
      maximum: descriptor.maximum,
      defaultValue,
      step: descriptor.step,
      unit: descriptor.unit,
      displayPrecision: descriptor.precision,
      resetValue: defaultValue,
      smoothing,
      workletRate: "message",
      automation: "step",
      modulation: "none",
    };
  }),
);

const parameters: readonly ParameterDescriptor[] = Object.freeze([
  ...moduleParameters,
  ...voiceParameters,
]);

export const HYBRID_NINE_MANIFEST = Object.freeze({
  manifestSchemaVersion: 1,
  pluginId: required(parsePluginId("drum-hybrid")),
  kind: "instrument",
  productName: "Hybrid Nine",
  shortLabel: "NINE",
  pluginVersion: "1.0.0",
  stateSchemaVersion: 1,
  apiVersion: 1,
  engineProtocolVersion: 1,
  parameters,
  meters: [{ id: required(parseMeterId("output-level")), name: "Output level" }],
  defaultState: Object.fromEntries(
    parameters.map((parameter) => [parameter.id, parameter.defaultValue]),
  ),
  ui: {
    // The normative section 3.4 accent row for `NINE`. Kept in step with
    // `MODULE_ACCENTS` by tests/unit/engine/manifest-identity.test.ts.
    moduleAccent: {
      accent: "#B890FF",
      accentMuted: "#594776",
      led: "#CEB2FF",
      controlRing: "#9670D8",
    },
    // Section 15.5 gives this plate a waveform preview instead of two further
    // knobs, so only Filter and Level are promoted; per-voice controls address
    // the voice chosen in the selector, which the rack owns.
    compactControls: moduleParameters.map((parameter, position) => ({
      position,
      parameterId: parameter.id,
    })),
    detailedEditorSections: [
      { id: "module", name: "Module", parameterIds: moduleParameters.map((one) => one.id) },
      ...HYBRID_VOICE_IDS.map((voiceId) => ({
        id: voiceId,
        name: HYBRID_VOICE_NAMES[voiceId],
        parameterIds: VOICE_FIELDS.map((descriptor) =>
          parameterId(`${voiceId}-${descriptor.field}`),
        ),
      })),
    ],
  },
  automation: "step",
  cpuClass: "moderate",
  compatibility: { acceptedStateSchemaVersions: [1], migrations: [] },
  voices: HYBRID_VOICE_IDS.map((voiceId) => ({
    id: voiceId,
    name: HYBRID_VOICE_NAMES[voiceId],
    outputChannels: 2,
  })),
  acceptedEvents: [{ id: "trigger", kind: "note" }],
  patternCompatibility: ["notes"],
  voiceStealing: { maximumVoices: 9, priority: "oldest", releaseMilliseconds: 4 },
  retriggerPolicy: "restart",
  chokePolicy: "group",
  inputChannels: 0,
  outputChannels: 2,
  // The one-shot layer is generated at construction rather than decoded, so the
  // module ships no assets. User sample layers arrive with specification 009.
  supportsSampleLayers: false,
  processorFactoryKey: "hybrid-nine-worklet",
  renderCapabilities: { live: true, offline: false },
} satisfies InstrumentPluginManifest);

export const HYBRID_NINE_DEFAULT_PARAMETERS = HYBRID_NINE_MANIFEST.defaultState;
