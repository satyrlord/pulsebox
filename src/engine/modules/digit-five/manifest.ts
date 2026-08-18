import {
  parseMeterId,
  parseParameterId,
  parsePluginId,
  type ParameterDescriptor,
} from "../../../contracts/parameters";
import type { InstrumentPluginManifest } from "../../../contracts/plugins";
import { DEFAULT_DIGIT_FIVE_PARAMETERS } from "./dsp-core";
import {
  DIGIT_FIVE_VOICE_IDS,
  DIGIT_FIVE_VOICE_NAMES,
  digitFiveVoiceNote,
  type DigitFiveVoiceId,
} from "./voices";

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("Dusty Mosaic contains an invalid stable identifier.");
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
    smoothing: stepped,
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
    smoothing: stepped,
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
    smoothing: stepped,
    defaultFor: (voiceId) => DEFAULT_DIGIT_FIVE_PARAMETERS.voices[voiceId].noise ?? 0,
  },
  {
    field: "distortion",
    label: "Distortion",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "percent",
    precision: 2,
    smoothing,
    defaultFor: (voiceId) => DEFAULT_DIGIT_FIVE_PARAMETERS.voices[voiceId].distortion,
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
    smoothing: smoothing,
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

/** Section 15.2: every voice supports mute and solo. */
function voiceToggle(voiceId: DigitFiveVoiceId, field: "mute" | "solo"): ParameterDescriptor {
  return {
    id: parameterId(`${voiceId}-${field}`),
    name: `${DIGIT_FIVE_VOICE_NAMES[voiceId]} ${field}`,
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

const voiceParameters: readonly ParameterDescriptor[] = DIGIT_FIVE_VOICE_IDS.flatMap(
  (voiceId) => [
    ...VOICE_FIELDS.map((descriptor): ParameterDescriptor => {
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
        smoothing: descriptor.smoothing,
        workletRate: "message",
        automation: "step",
        modulation: "none",
      };
    }),
    ...VOICE_TOGGLE_FIELDS.map((field) => voiceToggle(voiceId, field)),
  ],
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
  productName: "Dusty Mosaic",
  shortLabel: "PERC",
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
    // The normative section 3.4 accent row for `PERC`. Kept in step with
    // `MODULE_ACCENTS` by tests/unit/engine/manifest-identity.test.ts.
    moduleAccent: {
      accent: "#4ADFC7",
      accentMuted: "#2B6D63",
      led: "#7FF2DF",
      controlRing: "#32B8A3",
    },
    // Original drawing: an irregular tile grid with one missing tile, for the
    // dusty-mosaic identity.
    icon: {
      viewBox: "0 0 24 24",
      path: "M3 3h5.1v5.1H3Zm7.1 0h5.1v5.1h-5.1Zm7.1 0H21v5.1h-3.8ZM3 10.1h5.1v5.1H3Zm7.1 0h5.1v5.1h-5.1ZM3 17.2h5.1V21H3Zm7.1 0h5.1V21h-5.1Zm7.1-3.4H21V21h-3.8Z",
    },
    // The faceplate carries the module controls, including the lo-fi enable
    // that section 15.7 lets the user disable. Per-voice knobs address the
    // voice chosen in the selector, which the rack owns.
    compactControls: [...moduleParameters, lofiEnabled].map((parameter, position) => ({
      position,
      parameterId: parameter.id,
    })),
    // While the lo-fi stage is off, the DSP zeroes both reducers, so the
    // faceplate disables their knobs to match the audio path.
    parameterGates: [
      {
        parameterId: parameterId("bits"),
        gateParameterId: parameterId("lofi-enabled"),
        gateValue: true,
      },
      {
        parameterId: parameterId("rate"),
        gateParameterId: parameterId("lofi-enabled"),
        gateValue: true,
      },
    ],
    // Section 15.7 selected-voice fast controls.
    voiceCompactControls: ["tune", "decay", "noise", "distortion", "pan", "mute", "solo"].map(
      (parameterSuffix, position) => ({ position, parameterSuffix }),
    ),
    detailedEditorSections: [
      {
        id: "module",
        name: "Module",
        parameterIds: [...moduleParameters.map((one) => one.id), lofiEnabled.id],
      },
      ...DIGIT_FIVE_VOICE_IDS.map((voiceId) => ({
        id: voiceId,
        name: DIGIT_FIVE_VOICE_NAMES[voiceId],
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
  voices: DIGIT_FIVE_VOICE_IDS.map((voiceId) => ({
    id: voiceId,
    name: DIGIT_FIVE_VOICE_NAMES[voiceId],
    outputChannels: 2,
    note: digitFiveVoiceNote(voiceId),
  })),
  // The first voice is the kick, the most useful default audition sound.
  auditionNote: digitFiveVoiceNote("kick"),
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
