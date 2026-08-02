import {
  parseMeterId,
  parseParameterId,
  parsePluginId,
  type ParameterDescriptor,
} from "../../../contracts/parameters";
import type { InstrumentPluginManifest } from "../../../contracts/plugins";
import { DEFAULT_DRUMLINE_PARAMETERS } from "./dsp-core";
import { DRUM_VOICE_IDS, DRUM_VOICE_NAMES, drumVoiceNote, type DrumVoiceId } from "./voices";

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("Tin Soldier contains an invalid stable identifier.");
  return result.value;
}

const parameterId = (value: string) => required(parseParameterId(value));

const smoothing = { curve: "linear", durationMilliseconds: 8 } as const;
// Decision D91: only the fields the DSP actually glides declare a ramp. The
// stepped fields land instantly, which carries no gain discontinuity.
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
    smoothing: stepped,
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
    smoothing: stepped,
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
    smoothing: stepped,
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
    smoothing: smoothing,
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
    smoothing: smoothing,
    defaultFor: (voiceId) => DEFAULT_DRUMLINE_PARAMETERS.voices[voiceId].pan,
  },
];

const moduleParameters: readonly ParameterDescriptor[] = [
  moduleParameter("tone", "Tone", DEFAULT_DRUMLINE_PARAMETERS.tone, "ratio"),
  moduleParameter("drive", "Drive", DEFAULT_DRUMLINE_PARAMETERS.drive, "ratio"),
  moduleParameter("level", "Level", DEFAULT_DRUMLINE_PARAMETERS.level, "ratio"),
];

/** Section 15.2: every voice supports mute and solo. */
function voiceToggle(voiceId: DrumVoiceId, field: "mute" | "solo"): ParameterDescriptor {
  return {
    id: parameterId(`${voiceId}-${field}`),
    name: `${DRUM_VOICE_NAMES[voiceId]} ${field}`,
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

const voiceParameters: readonly ParameterDescriptor[] = DRUM_VOICE_IDS.flatMap((voiceId) => [
  ...VOICE_FIELDS.map((descriptor): ParameterDescriptor => {
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

export const DRUMLINE_SIX_MANIFEST = Object.freeze({
  manifestSchemaVersion: 1,
  pluginId: required(parsePluginId("drum-analog-small")),
  kind: "instrument",
  productName: "Tin Soldier",
  shortLabel: "SNAP",
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
    // The normative section 3.4 accent row for `SNAP`. Kept in step with
    // `MODULE_ACCENTS` by tests/unit/engine/manifest-identity.test.ts.
    moduleAccent: {
      accent: "#6FDE76",
      accentMuted: "#33663A",
      led: "#98F19E",
      controlRing: "#4FB558",
    },
    // Original drawing: a marching snare with crossed sticks, for the toy
    // soldier identity. The strainer band is an even-odd cutout.
    icon: {
      viewBox: "0 0 24 24",
      path: "M5.1 2.5 10 7.4 8.6 8.8 3.7 3.9ZM18.9 2.5 14 7.4l1.4 1.4 4.9-4.9ZM4 9.6h16a1.6 1.6 0 0 1 1.6 1.6v6.6a1.6 1.6 0 0 1-1.6 1.6H4a1.6 1.6 0 0 1-1.6-1.6v-6.6A1.6 1.6 0 0 1 4 9.6ZM5.4 13.3h13.2v2H5.4Z",
    },
    // The faceplate carries the module controls; the section 15.3 selected-voice
    // fast controls resolve against the voice chosen in the selector.
    compactControls: moduleParameters.map((parameter, position) => ({
      position,
      parameterId: parameter.id,
    })),
    voiceCompactControls: ["tune", "snap", "decay", "pan", "mute", "solo"].map(
      (parameterSuffix, position) => ({ position, parameterSuffix }),
    ),
    detailedEditorSections: [
      { id: "module", name: "Module", parameterIds: moduleParameters.map((one) => one.id) },
      ...DRUM_VOICE_IDS.map((voiceId) => ({
        id: voiceId,
        name: DRUM_VOICE_NAMES[voiceId],
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
  voices: DRUM_VOICE_IDS.map((voiceId) => ({
    id: voiceId,
    name: DRUM_VOICE_NAMES[voiceId],
    outputChannels: 2,
    note: drumVoiceNote(voiceId),
  })),
  // The first voice is the kick, the most useful default audition sound.
  auditionNote: drumVoiceNote("kick"),
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
