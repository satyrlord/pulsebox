import {
  parseMeterId,
  parseParameterId,
  parsePluginId,
  type ParameterDescriptor,
} from "../../../contracts/parameters";
import type { InstrumentPluginManifest } from "../../../contracts/plugins";
import { DEFAULT_DRUMLINE_PARAMETERS } from "./dsp-core";
import { DRUM_VOICE_IDS, DRUM_VOICE_NAMES, type DrumVoiceId } from "./voices";

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("Drumline Six contains an invalid stable identifier.");
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
  readonly defaultFor: (voiceId: DrumVoiceId) => number;
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
    defaultFor: (voiceId) => DEFAULT_DRUMLINE_PARAMETERS.voices[voiceId].tune,
  },
  {
    field: "snap",
    label: "Snap",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_DRUMLINE_PARAMETERS.voices[voiceId].snap,
  },
  {
    field: "decay",
    label: "Decay",
    minimum: 0.01,
    maximum: 2,
    step: 0.01,
    unit: "seconds",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_DRUMLINE_PARAMETERS.voices[voiceId].decay,
  },
  {
    field: "level",
    label: "Level",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_DRUMLINE_PARAMETERS.voices[voiceId].level,
  },
  {
    field: "pan",
    label: "Pan",
    minimum: -1,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    defaultFor: (voiceId) => DEFAULT_DRUMLINE_PARAMETERS.voices[voiceId].pan,
  },
];

const moduleParameters: readonly ParameterDescriptor[] = [
  moduleParameter("tone", "Tone", DEFAULT_DRUMLINE_PARAMETERS.tone, "ratio"),
  moduleParameter("drive", "Drive", DEFAULT_DRUMLINE_PARAMETERS.drive, "ratio"),
  moduleParameter("level", "Level", DEFAULT_DRUMLINE_PARAMETERS.level, "ratio"),
];

const voiceParameters: readonly ParameterDescriptor[] = DRUM_VOICE_IDS.flatMap((voiceId) =>
  VOICE_FIELDS.map((descriptor): ParameterDescriptor => {
    const defaultValue = descriptor.defaultFor(voiceId);
    return {
      id: parameterId(`${voiceId}-${descriptor.field}`),
      name: `${DRUM_VOICE_NAMES[voiceId]} ${descriptor.label.toLowerCase()}`,
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

export const DRUMLINE_SIX_MANIFEST = Object.freeze({
  manifestSchemaVersion: 1,
  pluginId: required(parsePluginId("drumline-six")),
  kind: "instrument",
  productName: "Drumline Six",
  shortLabel: "DRUM",
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
    moduleAccent: {
      accent: "#F2A03D",
      accentMuted: "#7A5222",
      led: "#FFC978",
      controlRing: "#C97F2B",
    },
    // The faceplate carries the module controls; per-voice knobs address the
    // voice chosen in the selector, which the rack owns.
    compactControls: moduleParameters.map((parameter, position) => ({
      position,
      parameterId: parameter.id,
    })),
    detailedEditorSections: [
      { id: "module", name: "Module", parameterIds: moduleParameters.map((one) => one.id) },
      ...DRUM_VOICE_IDS.map((voiceId) => ({
        id: voiceId,
        name: DRUM_VOICE_NAMES[voiceId],
        parameterIds: VOICE_FIELDS.map((descriptor) =>
          parameterId(`${voiceId}-${descriptor.field}`),
        ),
      })),
    ],
  },
  automation: "step",
  cpuClass: "light",
  compatibility: { acceptedStateSchemaVersions: [1], migrations: [] },
  voices: DRUM_VOICE_IDS.map((voiceId) => ({
    id: voiceId,
    name: DRUM_VOICE_NAMES[voiceId],
    outputChannels: 2,
  })),
  acceptedEvents: [{ id: "trigger", kind: "note" }],
  patternCompatibility: ["notes"],
  voiceStealing: { maximumVoices: 6, priority: "oldest", releaseMilliseconds: 4 },
  retriggerPolicy: "restart",
  chokePolicy: "group",
  inputChannels: 0,
  outputChannels: 2,
  supportsSampleLayers: false,
  processorFactoryKey: "drumline-six-worklet",
  renderCapabilities: { live: true, offline: false },
} satisfies InstrumentPluginManifest);

export const DRUMLINE_SIX_DEFAULT_PARAMETERS = DRUMLINE_SIX_MANIFEST.defaultState;
