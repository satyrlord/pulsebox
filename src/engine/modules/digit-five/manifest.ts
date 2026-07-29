import {
  parseMeterId,
  parseParameterId,
  parsePluginId,
  type ParameterDescriptor,
} from "../../../contracts/parameters";
import type { InstrumentPluginManifest } from "../../../contracts/plugins";
import { DEFAULT_DIGIT_FIVE_PARAMETERS } from "./dsp-core";
import { DIGIT_FIVE_VOICE_IDS, DIGIT_FIVE_VOICE_NAMES, type DigitFiveVoiceId } from "./voices";

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("Digit Five contains an invalid stable identifier.");
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
  readonly defaultFor: (voiceId: DigitFiveVoiceId) => number;
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
    defaultFor: (voiceId) => DEFAULT_DIGIT_FIVE_PARAMETERS.voices[voiceId].tune,
  },
  {
    field: "decay",
    label: "Decay",
    minimum: 0.01,
    maximum: 3,
    step: 0.01,
    unit: "seconds",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_DIGIT_FIVE_PARAMETERS.voices[voiceId].decay,
  },
  {
    field: "noise",
    label: "Noise",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_DIGIT_FIVE_PARAMETERS.voices[voiceId].noise ?? 0,
  },
  {
    field: "level",
    label: "Level",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_DIGIT_FIVE_PARAMETERS.voices[voiceId].level,
  },
  {
    field: "pan",
    label: "Pan",
    minimum: -1,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_DIGIT_FIVE_PARAMETERS.voices[voiceId].pan,
  },
];

/** Section 15.7: the built-in lo-fi stage starts enabled and can be disabled. */
const lofiEnabled: ParameterDescriptor = {
  id: parameterId("lofi-enabled"),
  name: "Lo-fi stage",
  shortLabel: "Lo-fi",
  valueType: "boolean",
  defaultValue: DEFAULT_DIGIT_FIVE_PARAMETERS.lofiEnabled,
  // A toggle carries no measured quantity, so it has no unit and no precision.
  unit: "none",
  displayPrecision: 0,
  resetValue: DEFAULT_DIGIT_FIVE_PARAMETERS.lofiEnabled,
  smoothing: { curve: "none", durationMilliseconds: 0 },
  workletRate: "message",
  automation: "step",
  modulation: "none",
};

const moduleParameters: readonly ParameterDescriptor[] = [
  moduleParameter("filter", "Filter", DEFAULT_DIGIT_FIVE_PARAMETERS.filter, "ratio"),
  moduleParameter("bits", "Bit reduction", DEFAULT_DIGIT_FIVE_PARAMETERS.bits, "ratio"),
  moduleParameter("rate", "Sample-rate reduction", DEFAULT_DIGIT_FIVE_PARAMETERS.rate, "ratio"),
  moduleParameter("level", "Level", DEFAULT_DIGIT_FIVE_PARAMETERS.level, "ratio"),
];

const voiceParameters: readonly ParameterDescriptor[] = DIGIT_FIVE_VOICE_IDS.flatMap((voiceId) =>
  VOICE_FIELDS.map((descriptor): ParameterDescriptor => {
    const defaultValue = descriptor.defaultFor(voiceId);
    return {
      id: parameterId(`${voiceId}-${descriptor.field}`),
      name: `${DIGIT_FIVE_VOICE_NAMES[voiceId]} ${descriptor.label.toLowerCase()}`,
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
  lofiEnabled,
  ...voiceParameters,
]);

export const DIGIT_FIVE_MANIFEST = Object.freeze({
  manifestSchemaVersion: 1,
  pluginId: required(parsePluginId("drum-digital-b")),
  kind: "instrument",
  productName: "Digit Five",
  shortLabel: "FIVE",
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
    // The normative section 3.4 accent row for `FIVE`. Kept in step with
    // `MODULE_ACCENTS` by tests/unit/engine/manifest-identity.test.ts.
    moduleAccent: {
      accent: "#4ADFC7",
      accentMuted: "#2B6D63",
      led: "#7FF2DF",
      controlRing: "#32B8A3",
    },
    // The faceplate carries the module controls; per-voice knobs address the
    // voice chosen in the selector, which the rack owns.
    compactControls: moduleParameters.map((parameter, position) => ({
      position,
      parameterId: parameter.id,
    })),
    detailedEditorSections: [
      {
        id: "module",
        name: "Module",
        parameterIds: [...moduleParameters.map((one) => one.id), lofiEnabled.id],
      },
      ...DIGIT_FIVE_VOICE_IDS.map((voiceId) => ({
        id: voiceId,
        name: DIGIT_FIVE_VOICE_NAMES[voiceId],
        parameterIds: VOICE_FIELDS.map((descriptor) =>
          parameterId(`${voiceId}-${descriptor.field}`),
        ),
      })),
    ],
  },
  automation: "step",
  cpuClass: "light",
  compatibility: { acceptedStateSchemaVersions: [1], migrations: [] },
  voices: DIGIT_FIVE_VOICE_IDS.map((voiceId) => ({
    id: voiceId,
    name: DIGIT_FIVE_VOICE_NAMES[voiceId],
    outputChannels: 2,
  })),
  acceptedEvents: [{ id: "trigger", kind: "note" }],
  patternCompatibility: ["notes"],
  voiceStealing: { maximumVoices: 8, priority: "oldest", releaseMilliseconds: 4 },
  retriggerPolicy: "restart",
  chokePolicy: "group",
  inputChannels: 0,
  outputChannels: 2,
  // Voices play tables generated at construction rather than decoded assets.
  // User sample layers arrive with specification 009.
  supportsSampleLayers: false,
  processorFactoryKey: "digit-five-worklet",
  renderCapabilities: { live: true, offline: false },
} satisfies InstrumentPluginManifest);

export const DIGIT_FIVE_DEFAULT_PARAMETERS = DIGIT_FIVE_MANIFEST.defaultState;
