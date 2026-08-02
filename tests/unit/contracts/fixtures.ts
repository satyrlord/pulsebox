import type { IdFactory } from "../../../src/contracts/ids";
import {
  parseMeterId,
  parseParameterId,
  parsePluginId,
  type MeterId,
  type ParameterDescriptor,
  type ParameterId,
  type PluginId,
} from "../../../src/contracts/parameters";
import type { InstrumentPluginManifest } from "../../../src/contracts/plugins";

export const TEST_UUID = "abcdef12-3456-4abc-8def-1234567890ab";

export const deterministicIdFactory: IdFactory = {
  createUuid: () => TEST_UUID,
};

function requiredValue<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T {
  if (!result.ok) throw new Error("Invalid contract test fixture.");
  return result.value;
}

export function pluginId(value: string): PluginId {
  return requiredValue(parsePluginId(value));
}

export function parameterId(value: string): ParameterId {
  return requiredValue(parseParameterId(value));
}

export function meterId(value: string): MeterId {
  return requiredValue(parseMeterId(value));
}

export function createFloatParameter(id = "cutoff"): ParameterDescriptor {
  return {
    id: parameterId(id),
    name: "Cutoff",
    shortLabel: "Cut",
    valueType: "float",
    minimum: 20,
    maximum: 20_000,
    defaultValue: 440,
    step: 1,
    unit: "hertz",
    displayPrecision: 0,
    resetValue: 440,
    smoothing: { curve: "exponential", durationMilliseconds: 12 },
    workletRate: "a-rate",
    automation: "step",
    modulation: "internal",
  };
}

export function createInstrumentManifest(id = "bass-mono"): InstrumentPluginManifest {
  const parameter = createFloatParameter();
  return {
    manifestSchemaVersion: 1,
    pluginId: pluginId(id),
    kind: "instrument",
    productName: "Silver Serpent",
    shortLabel: "ACID",
    pluginVersion: "1.0.0",
    stateSchemaVersion: 1,
    apiVersion: 1,
    engineProtocolVersion: 1,
    parameters: [parameter],
    meters: [{ id: meterId("output-level"), name: "Output level" }],
    defaultState: { cutoff: 440 },
    ui: {
      moduleAccent: {
        accent: "#F2D530",
        accentMuted: "#6E6118",
        led: "#FFE95E",
        controlRing: "#C7A81F",
      },
      icon: { viewBox: "0 0 24 24", path: "M4 4h16v16H4Zm4 4v8h8V8Z" },
      compactControls: [{ position: 0, parameterId: parameter.id }],
      detailedEditorSections: [
        {
          id: "filter",
          name: "Filter",
          parameterIds: [parameter.id],
        },
      ],
    },
    automation: "step",
    cpuClass: "light",
    compatibility: {
      acceptedStateSchemaVersions: [1],
      migrations: [],
    },
    voices: [{ id: "main", name: "Main voice", outputChannels: 2 }],
    auditionNote: 36,
    acceptedEvents: [{ id: "note", kind: "note" }],
    patternCompatibility: ["notes"],
    voiceStealing: {
      maximumVoices: 1,
      priority: "oldest",
      releaseMilliseconds: 4,
    },
    retriggerPolicy: "legato",
    chokePolicy: "none",
    inputChannels: 0,
    outputChannels: 2,
    supportsSampleLayers: false,
    processorFactoryKey: "bass-mono-worklet",
    renderCapabilities: { live: true, offline: true },
  };
}
