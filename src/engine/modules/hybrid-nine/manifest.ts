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
  if (!result.ok) throw new Error("Twin Engine contains an invalid stable identifier.");
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
    smoothing: stepped,
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
    smoothing: stepped,
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
    smoothing: smoothing,
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
    smoothing: stepped,
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
    smoothing: stepped,
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
    smoothing: smoothing,
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
    smoothing: smoothing,
    defaultFor: (voiceId) => DEFAULT_HYBRID_PARAMETERS.voices[voiceId].pan,
  },
];

const moduleParameters: readonly ParameterDescriptor[] = [
  moduleParameter("filter", "Filter", DEFAULT_HYBRID_PARAMETERS.filter, "ratio"),
  moduleParameter("level", "Level", DEFAULT_HYBRID_PARAMETERS.level, "ratio"),
];

/** Section 15.2: every voice supports mute and solo. */
function voiceToggle(voiceId: HybridVoiceId, field: "mute" | "solo"): ParameterDescriptor {
  return {
    id: parameterId(`${voiceId}-${field}`),
    name: `${HYBRID_VOICE_NAMES[voiceId]} ${field}`,
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

const voiceParameters: readonly ParameterDescriptor[] = HYBRID_VOICE_IDS.flatMap((voiceId) => [
  ...VOICE_FIELDS.map((descriptor): ParameterDescriptor => {
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

export const HYBRID_NINE_MANIFEST = Object.freeze({
  manifestSchemaVersion: 1,
  pluginId: required(parsePluginId("drum-hybrid")),
  kind: "instrument",
  productName: "Twin Engine",
  shortLabel: "MESH",
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
    // The normative section 3.4 accent row for `MESH`. Kept in step with
    // `MODULE_ACCENTS` by tests/unit/engine/manifest-identity.test.ts.
    moduleAccent: {
      accent: "#B890FF",
      accentMuted: "#594776",
      led: "#CEB2FF",
      controlRing: "#9670D8",
    },
    // Original drawing: two meshed gears with even-odd hub cutouts, for the
    // twin-engine identity. Vertices come from a one-off generator script.
    icon: {
      viewBox: "0 0 24 24",
      path: "M14.8 7.8 14.8 9.4 13.1 9.8 12.7 10.9 13.5 12.4 12.4 13.5 10.9 12.7 9.8 13.1 9.4 14.8 7.8 14.8 7.4 13.1 6.3 12.7 4.8 13.5 3.7 12.4 4.5 10.9 4.1 9.8 2.4 9.4 2.4 7.8 4.1 7.4 4.5 6.3 3.7 4.8 4.8 3.7 6.3 4.5 7.4 4.1 7.8 2.4 9.4 2.4 9.8 4.1 10.9 4.5 12.4 3.7 13.5 4.8 12.7 6.3 13.1 7.4ZM10.5 8.6a1.9 1.9 0 1 0-3.8 0 1.9 1.9 0 1 0 3.8 0ZM21.5 16.2 21.5 17.6 20.1 17.9 19.7 18.8 20.3 20 19.2 20.9 18.1 20.1 17.2 20.3 16.5 21.5 15.2 21.2 15.2 19.8 14.4 19.2 13.1 19.5 12.5 18.3 13.5 17.4 13.5 16.4 12.5 15.5 13.1 14.3 14.4 14.6 15.2 14 15.2 12.6 16.5 12.3 17.2 13.5 18.1 13.7 19.2 12.9 20.3 13.8 19.7 15 20.1 15.9ZM18.3 16.9a1.4 1.4 0 1 0-2.8 0 1.4 1.4 0 1 0 2.8 0Z",
    },
    // Section 15.5: the plate promotes start, tune, decay, attack, and the
    // selected-voice level. Selected-voice pan, mute, and solo stay in the
    // expanded editor, where the send-emphasis control will also live.
    compactControls: moduleParameters.map((parameter, position) => ({
      position,
      parameterId: parameter.id,
    })),
    voiceCompactControls: ["start", "tune", "decay", "attack", "level"].map(
      (parameterSuffix, position) => ({ position, parameterSuffix }),
    ),
    detailedEditorSections: [
      { id: "module", name: "Module", parameterIds: moduleParameters.map((one) => one.id) },
      ...HYBRID_VOICE_IDS.map((voiceId) => ({
        id: voiceId,
        name: HYBRID_VOICE_NAMES[voiceId],
        parameterIds: [
          ...VOICE_FIELDS.map((descriptor) => parameterId(`${voiceId}-${descriptor.field}`)),
          ...VOICE_TOGGLE_FIELDS.map((field) => parameterId(`${voiceId}-${field}`)),
        ],
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
