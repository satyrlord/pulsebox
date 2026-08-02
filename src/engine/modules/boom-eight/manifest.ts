import {
  parseMeterId,
  parseParameterId,
  parsePluginId,
  type ParameterDescriptor,
} from "../../../contracts/parameters";
import type { InstrumentPluginManifest } from "../../../contracts/plugins";
import { DEFAULT_BOOM_PARAMETERS } from "./dsp-core";
import { BOOM_VOICE_IDS, BOOM_VOICE_NAMES, type BoomVoiceId } from "./voices";

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("Soft Thunder contains an invalid stable identifier.");
  return result.value;
}

const parameterId = (value: string) => required(parseParameterId(value));

const smoothing = { curve: "linear", durationMilliseconds: 8 } as const;
// Decision D91: only the fields the DSP actually glides declare a ramp. Tune
// and the shape fields land as steps, which carries no gain discontinuity.
const stepped = { curve: "none", durationMilliseconds: 0 } as const;

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
  readonly smoothing: ParameterDescriptor["smoothing"];
  readonly defaultFor: (voiceId: BoomVoiceId) => number;
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
    smoothing: stepped,
    defaultFor: (voiceId) => DEFAULT_BOOM_PARAMETERS.voices[voiceId].tune,
  },
  {
    field: "punch",
    label: "Punch",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    smoothing: stepped,
    defaultFor: (voiceId) => DEFAULT_BOOM_PARAMETERS.voices[voiceId].punch,
  },
  {
    field: "decay",
    label: "Decay",
    minimum: 0.01,
    maximum: 3,
    step: 0.01,
    unit: "seconds",
    precision: 2,
    smoothing: stepped,
    defaultFor: (voiceId) => DEFAULT_BOOM_PARAMETERS.voices[voiceId].decay,
  },
  {
    field: "level",
    label: "Level",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    smoothing,
    defaultFor: (voiceId) => DEFAULT_BOOM_PARAMETERS.voices[voiceId].level,
  },
  {
    field: "pan",
    label: "Pan",
    minimum: -1,
    maximum: 1,
    step: 0.01,
    unit: "ratio",
    precision: 2,
    smoothing,
    defaultFor: (voiceId) => DEFAULT_BOOM_PARAMETERS.voices[voiceId].pan,
  },
];

const moduleParameters: readonly ParameterDescriptor[] = [
  moduleParameter("tone", "Tone", DEFAULT_BOOM_PARAMETERS.tone, "ratio"),
  moduleParameter("compression", "Compression", DEFAULT_BOOM_PARAMETERS.compression, "ratio"),
  moduleParameter("level", "Level", DEFAULT_BOOM_PARAMETERS.level, "ratio"),
];

/** Section 15.2: every voice supports mute and solo. */
function voiceToggle(voiceId: BoomVoiceId, field: "mute" | "solo"): ParameterDescriptor {
  return {
    id: parameterId(`${voiceId}-${field}`),
    name: `${BOOM_VOICE_NAMES[voiceId]} ${field}`,
    shortLabel: field === "mute" ? "M" : "S",
    valueType: "boolean",
    defaultValue: false,
    unit: "none",
    displayPrecision: 0,
    resetValue: false,
    smoothing: { curve: "none", durationMilliseconds: 0 },
    workletRate: "message",
    automation: "step",
    modulation: "none",
  };
}

const VOICE_TOGGLE_FIELDS = ["mute", "solo"] as const;

const voiceParameters: readonly ParameterDescriptor[] = BOOM_VOICE_IDS.flatMap((voiceId) => [
  ...VOICE_FIELDS.map((descriptor): ParameterDescriptor => {
    const defaultValue = descriptor.defaultFor(voiceId);
    return {
      id: parameterId(`${voiceId}-${descriptor.field}`),
      name: `${BOOM_VOICE_NAMES[voiceId]} ${descriptor.label.toLowerCase()}`,
      shortLabel: descriptor.label,
      valueType: "float",
      minimum: descriptor.minimum,
      maximum: descriptor.maximum,
      defaultValue,
      step: descriptor.step,
      unit: descriptor.unit,
      displayPrecision: descriptor.precision,
      resetValue: defaultValue,
      smoothing: descriptor.smoothing,
      workletRate: "message",
      automation: "step",
      modulation: "none",
    };
  }),
  ...VOICE_TOGGLE_FIELDS.map((field) => voiceToggle(voiceId, field)),
]);

const parameters: readonly ParameterDescriptor[] = Object.freeze([
  ...moduleParameters,
  ...voiceParameters,
]);

export const BOOM_EIGHT_MANIFEST = Object.freeze({
  manifestSchemaVersion: 1,
  pluginId: required(parsePluginId("drum-analog-large")),
  kind: "instrument",
  productName: "Soft Thunder",
  shortLabel: "BOOM",
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
    // The normative section 3.4 accent row for `BOOM`. Kept in step with
    // `MODULE_ACCENTS` by tests/unit/engine/manifest-identity.test.ts.
    moduleAccent: {
      accent: "#FF6B5F",
      accentMuted: "#763B37",
      led: "#FF9188",
      controlRing: "#D84E45",
    },
    // Original drawing: a thundercloud over a bolt, for the soft-thunder
    // identity.
    icon: {
      viewBox: "0 0 24 24",
      path: "M6.2 15a3.4 3.4 0 0 1 .9-6.68 4.6 4.6 0 0 1 9-.5 3.8 3.8 0 0 1 1.7 7.18ZM12.4 15.9l-3.3 4.7h2.1l-1.2 3.2 4.9-5.4h-2.2l1.7-2.5Z",
    },
    // The faceplate carries the module controls; the section 15.4 selected-voice
    // fast controls resolve against the voice chosen in the selector.
    compactControls: moduleParameters.map((parameter, position) => ({
      position,
      parameterId: parameter.id,
    })),
    voiceCompactControls: ["tune", "punch", "decay", "pan", "mute", "solo"].map(
      (parameterSuffix, position) => ({ position, parameterSuffix }),
    ),
    detailedEditorSections: [
      { id: "module", name: "Module", parameterIds: moduleParameters.map((one) => one.id) },
      ...BOOM_VOICE_IDS.map((voiceId) => ({
        id: voiceId,
        name: BOOM_VOICE_NAMES[voiceId],
        parameterIds: [
          ...VOICE_FIELDS.map((descriptor) => parameterId(`${voiceId}-${descriptor.field}`)),
          ...VOICE_TOGGLE_FIELDS.map((field) => parameterId(`${voiceId}-${field}`)),
        ],
      })),
    ],
  },
  automation: "step",
  cpuClass: "light",
  compatibility: { acceptedStateSchemaVersions: [1], migrations: [] },
  voices: BOOM_VOICE_IDS.map((voiceId) => ({
    id: voiceId,
    name: BOOM_VOICE_NAMES[voiceId],
    outputChannels: 2,
  })),
  acceptedEvents: [{ id: "trigger", kind: "note" }],
  patternCompatibility: ["notes"],
  voiceStealing: { maximumVoices: 8, priority: "oldest", releaseMilliseconds: 5 },
  retriggerPolicy: "restart",
  chokePolicy: "group",
  inputChannels: 0,
  outputChannels: 2,
  supportsSampleLayers: false,
  processorFactoryKey: "boom-eight-worklet",
  renderCapabilities: { live: true, offline: false },
} satisfies InstrumentPluginManifest);

export const BOOM_EIGHT_DEFAULT_PARAMETERS = BOOM_EIGHT_MANIFEST.defaultState;
