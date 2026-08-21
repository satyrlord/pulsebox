import {
  parseMeterId,
  parseParameterId,
  parsePluginId,
  type ParameterDescriptor,
  type ParameterValue,
  type PluginId,
} from "../../contracts/parameters";
import type {
  EffectPlacement,
  EffectPluginManifest,
  PluginEditorSection,
} from "../../contracts/plugins";

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("An effect manifest contains an invalid stable identifier.");
  return result.value;
}

function effectPluginId(value: string): PluginId {
  return required(parsePluginId(value));
}

interface NumericParameter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly defaultValue: number;
  readonly step: number;
  readonly unit?: ParameterDescriptor["unit"];
  readonly precision?: number;
  readonly smoothing?: number;
}

export function numericParameter(value: NumericParameter): ParameterDescriptor {
  return {
    id: required(parseParameterId(value.id)),
    name: value.name,
    description: value.description,
    valueType: "float",
    minimum: value.minimum,
    maximum: value.maximum,
    defaultValue: value.defaultValue,
    step: value.step,
    unit: value.unit ?? "none",
    displayPrecision: value.precision ?? 2,
    resetValue: value.defaultValue,
    smoothing: {
      curve: value.smoothing === 0 ? "none" : "linear",
      durationMilliseconds: value.smoothing ?? 8,
    },
    workletRate: "k-rate",
    automation: "step",
    modulation: "none",
  };
}

export function booleanParameter(
  id: string,
  name: string,
  description: string,
  defaultValue: boolean,
): ParameterDescriptor {
  return {
    id: required(parseParameterId(id)), name, description, valueType: "boolean", defaultValue,
    unit: "none", displayPrecision: 0, resetValue: defaultValue,
    smoothing: { curve: "none", durationMilliseconds: 0 }, workletRate: "message",
    automation: "step", modulation: "none",
  };
}

export function enumParameter(
  id: string,
  name: string,
  description: string,
  values: readonly string[],
  defaultValue: string,
): ParameterDescriptor {
  return {
    id: required(parseParameterId(id)), name, description, valueType: "enum", enumValues: values,
    defaultValue, unit: "none", displayPrecision: 0, resetValue: defaultValue,
    smoothing: { curve: "none", durationMilliseconds: 0 }, workletRate: "message",
    automation: "step", modulation: "none",
  };
}

interface EffectManifestDefinition {
  readonly id: string;
  readonly name: string;
  readonly shortLabel: string;
  readonly parameters: readonly ParameterDescriptor[];
  readonly compact: readonly string[];
  readonly sections: readonly { readonly id: string; readonly name: string; readonly parameters: readonly string[] }[];
  readonly visibility?: readonly {
    readonly parameterId: string;
    readonly gateParameterId: string;
    readonly gateValue: boolean;
  }[];
  readonly placements?: readonly EffectPlacement[];
  readonly channels?: readonly (1 | 2)[];
  readonly cpuClass?: EffectPluginManifest["cpuClass"];
  readonly tailMilliseconds?: number;
  readonly latencyFrames?: number;
  readonly meters?: readonly { readonly id: string; readonly name: string }[];
  readonly accent: readonly [string, string, string, string];
  readonly defaultMix: number;
}

export function defineEffectManifest(definition: EffectManifestDefinition): EffectPluginManifest {
  const parameterById = new Map(definition.parameters.map((parameter) => [parameter.id, parameter]));
  const defaultState: Record<string, ParameterValue> = {};
  for (const parameter of definition.parameters) defaultState[parameter.id] = parameter.defaultValue;
  const sections: PluginEditorSection[] = definition.sections.map((section) => ({
    id: section.id,
    name: section.name,
    parameterIds: section.parameters.map((id) => required(parseParameterId(id))),
  }));
  for (const id of definition.compact) {
    if (!parameterById.has(required(parseParameterId(id)))) throw new Error(`Compact effect parameter ${id} is not declared.`);
  }
  const tail = definition.tailMilliseconds ?? 0;
  const latency = definition.latencyFrames ?? 0;
  const latencyDescriptor: EffectPluginManifest["latency"] = latency === 0 ? { mode: "zero", frames: 0 } : { mode: "fixed-frames", frames: latency };
  const tailDescriptor: EffectPluginManifest["tail"] = tail === 0 ? { mode: "none", maximumMilliseconds: 0 } : { mode: "bounded-generated", maximumMilliseconds: tail };
  return Object.freeze({
    manifestSchemaVersion: 1,
    pluginId: effectPluginId(definition.id),
    kind: "effect",
    productName: definition.name,
    shortLabel: definition.shortLabel,
    pluginVersion: "1.0.0",
    stateSchemaVersion: 1,
    apiVersion: 1,
    engineProtocolVersion: 1,
    parameters: definition.parameters,
    meters: (definition.meters ?? []).map((meter) => ({ id: required(parseMeterId(meter.id)), name: meter.name })),
    defaultState,
    ui: {
      moduleAccent: {
        accent: definition.accent[0], accentMuted: definition.accent[1],
        led: definition.accent[2], controlRing: definition.accent[3],
      },
      compactControls: definition.compact.map((id, position) => ({ position, parameterId: required(parseParameterId(id)) })),
      detailedEditorSections: sections,
      ...(definition.visibility === undefined
        ? {}
        : {
            parameterVisibility: definition.visibility.map((rule) => ({
              parameterId: required(parseParameterId(rule.parameterId)),
              gateParameterId: required(parseParameterId(rule.gateParameterId)),
              gateValue: rule.gateValue,
            })),
          }),
    },
    automation: "step",
    cpuClass: definition.cpuClass ?? "moderate",
    compatibility: { acceptedStateSchemaVersions: [1], migrations: [] },
    placements: definition.placements ?? (["module-pedalboard", "send-chain", "master-chain"] as const),
    inputChannels: definition.channels ?? ([1, 2] as const),
    outputChannels: definition.channels ?? ([1, 2] as const),
    latency: latencyDescriptor,
    tail: tailDescriptor,
    bypassTransitionMilliseconds: 8,
    defaultMix: definition.defaultMix,
    safetyClampParameterIds: definition.parameters.filter((parameter) => parameter.valueType === "float").map((parameter) => parameter.id),
    processorFactoryKey: `${definition.id}-processor`,
    renderCapabilities: { live: true, offline: true },
  });
}
