import {
  type EffectInstanceState,
  EFFECT_GAIN_MAXIMUM_DECIBELS,
  EFFECT_GAIN_MINIMUM_DECIBELS,
} from "../contracts/effects";
import type {
  EffectInstanceId,
  ModuleInstanceId,
  SendBusId,
} from "../contracts/ids";
import type {
  ParameterDescriptor,
  ParameterId,
  ParameterValue,
  PluginId,
} from "../contracts/parameters";
import type {
  AutomationScope,
  AutomationTargetId,
  ExternalAutomationTarget,
  ProjectState,
} from "./model";

export type ExternalAutomationScope = Exclude<AutomationScope, "module">;

function isExternalAutomationScope(value: unknown): value is ExternalAutomationScope {
  return value === "mixer" || value === "send" || value === "send-return" ||
    value === "effect" || value === "master";
}

export interface ExternalAutomationTargetCatalogOptions {
  /**
   * The composition boundary supplies effect descriptors from its registry.
   * This stays optional so imports can accept legacy effect state when the
   * caller has no effect catalog.
   */
  readonly effectParametersFor?: (
    pluginId: PluginId,
  ) => readonly ParameterDescriptor[] | undefined;
  /** The UI supplies product names without placing a UI dependency in state. */
  readonly pluginNameFor?: (pluginId: PluginId) => string | undefined;
}

export interface ExternalAutomationTargetResolution {
  readonly descriptor: ParameterDescriptor;
  readonly currentValue: ParameterValue;
  readonly ownerLabel: string;
}

export type EffectAutomationParameterValidator = (
  effect: EffectInstanceState,
  parameterId: string,
  value: ParameterValue,
) => boolean;

const staticDescriptor = (
  id: string,
  name: string,
  defaultValue: ParameterValue,
  options: {
    readonly valueType?: "float" | "boolean";
    readonly minimum?: number;
    readonly maximum?: number;
    readonly step?: number;
    readonly unit?: "none" | "percent" | "decibels";
  } = {},
): ParameterDescriptor => ({
  id: id as ParameterId,
  name,
  valueType: options.valueType ?? "float",
  ...(options.minimum === undefined ? {} : { minimum: options.minimum }),
  ...(options.maximum === undefined ? {} : { maximum: options.maximum }),
  ...(options.step === undefined ? {} : { step: options.step }),
  defaultValue,
  unit: options.unit ?? "none",
  displayPrecision: options.step !== undefined && options.step < 0.1 ? 2 : 0,
  resetValue: defaultValue,
  smoothing: { curve: "linear", durationMilliseconds: 10 },
  workletRate: "message",
  automation: "step",
  modulation: "none",
});

const MIXER_PARAMETERS = {
  level: staticDescriptor("level", "Level", 0.8, {
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "percent",
  }),
  pan: staticDescriptor("pan", "Pan", 0, { minimum: -1, maximum: 1, step: 0.01 }),
  muted: staticDescriptor("muted", "Mute", false, { valueType: "boolean" }),
  solo: staticDescriptor("solo", "Solo", false, { valueType: "boolean" }),
} as const;

const SEND_AMOUNT_PARAMETERS = Object.fromEntries(
  ["a", "b", "c", "d"].map((letter) => [
    `send-${letter}-amount`,
    staticDescriptor(`send-${letter}-amount`, "Amount", 0, {
      minimum: 0,
      maximum: 1,
      step: 0.01,
      unit: "percent",
    }),
  ]),
) as Readonly<Record<string, ParameterDescriptor>>;

const SEND_RETURN_PARAMETERS = {
  "return-level": staticDescriptor("return-level", "Return Level", 1, {
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "percent",
  }),
  "chain-bypassed": staticDescriptor("chain-bypassed", "Chain bypass", false, {
    valueType: "boolean",
  }),
} as const;

const EFFECT_STAGE_PARAMETERS = {
  mix: staticDescriptor("mix", "Mix", 1, {
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "percent",
  }),
  gain: staticDescriptor("gain", "Gain", 0, {
    minimum: EFFECT_GAIN_MINIMUM_DECIBELS,
    maximum: EFFECT_GAIN_MAXIMUM_DECIBELS,
    step: 0.1,
    unit: "decibels",
  }),
  bypassed: staticDescriptor("bypassed", "Bypass", false, { valueType: "boolean" }),
} as const;

const MASTER_PARAMETERS = {
  level: staticDescriptor("level", "Level", 0.8, {
    minimum: 0,
    maximum: 1,
    step: 0.01,
    unit: "percent",
  }),
} as const;

/** Returns the data-only static descriptor for a non-plugin automation target. */
export function externalAutomationParameterDescriptor(
  scope: ExternalAutomationScope,
  parameterId: string,
): ParameterDescriptor | undefined {
  if (scope === "mixer") return MIXER_PARAMETERS[parameterId as keyof typeof MIXER_PARAMETERS];
  if (scope === "send") return SEND_AMOUNT_PARAMETERS[parameterId];
  if (scope === "send-return") {
    return SEND_RETURN_PARAMETERS[parameterId as keyof typeof SEND_RETURN_PARAMETERS];
  }
  if (scope === "effect") {
    return EFFECT_STAGE_PARAMETERS[parameterId as keyof typeof EFFECT_STAGE_PARAMETERS];
  }
  return MASTER_PARAMETERS[parameterId as keyof typeof MASTER_PARAMETERS];
}

/** Validates a value against an external target descriptor without UI or engine state. */
export function isExternalAutomationValueValid(
  descriptor: ParameterDescriptor | undefined,
  value: unknown,
): value is ParameterValue {
  if (descriptor === undefined) return false;
  if (descriptor.valueType === "boolean") return typeof value === "boolean";
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (descriptor.valueType === "integer" && !Number.isInteger(value)) return false;
  return (
    (descriptor.minimum === undefined || value >= descriptor.minimum) &&
    (descriptor.maximum === undefined || value <= descriptor.maximum)
  );
}

/** Preserves the serialized-document errors for static external parameter values. */
export function externalAutomationImportValueIssue(
  descriptor: ParameterDescriptor | undefined,
  value: ParameterValue,
): string | undefined {
  if (descriptor === undefined) return "Automation value has no supported parameter contract.";
  if (isExternalAutomationValueValid(descriptor, value)) return undefined;
  if (descriptor.valueType === "boolean") return "Automation value must be boolean.";
  if (descriptor.id === "pan") return "Automation value must be from -1 through 1.";
  if (descriptor.id === "gain") return "Automation value must be from -24 dB through 24 dB.";
  return "Automation value must be from 0 through 1.";
}

export function externalAutomationUnsupportedParameterMessage(
  scope: Exclude<ExternalAutomationScope, "effect">,
): string {
  if (scope === "mixer") return "Mixer automation parameter is not supported.";
  if (scope === "send") return "Send automation parameter is not supported.";
  if (scope === "send-return") return "Send-return automation parameter is not supported.";
  return "Master automation parameter is not supported.";
}

/** Keeps current UI targets valid while preserving command-path validation behavior. */
function externalAutomationTargetIssue(
  project: ProjectState,
  scope: unknown,
  targetId: AutomationTargetId,
  parameterId: string,
): string | undefined {
  if (!isExternalAutomationScope(scope)) {
    return "Automation scope is invalid.";
  }
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(parameterId) || parameterId.length > 64) {
    return "Automation parameter ID is invalid.";
  }
  if (scope === "mixer" || scope === "send") {
    if (project.modules[targetId as ModuleInstanceId] === undefined) {
      return "Automation target module does not exist.";
    }
    return externalAutomationParameterDescriptor(scope, parameterId) === undefined
      ? "Automation parameter is not supported."
      : undefined;
  }
  if (scope === "effect") {
    return project.effects.instances[targetId as EffectInstanceId] === undefined
      ? "Automation target effect does not exist."
      : undefined;
  }
  if (scope === "send-return") {
    if (project.effects.sendChains[targetId as SendBusId] === undefined) {
      return "Automation target send does not exist.";
    }
    return externalAutomationParameterDescriptor(scope, parameterId) === undefined
      ? "Automation parameter is not supported."
      : undefined;
  }
  if (targetId !== "master") return "Automation target must be the master bus.";
  return externalAutomationParameterDescriptor(scope, parameterId) === undefined
    ? "Automation parameter is not supported."
    : undefined;
}

/** Validates target existence and parameter support for live state operations. */
export function externalAutomationTargetSupportIssue(
  project: ProjectState,
  scope: unknown,
  targetId: AutomationTargetId,
  parameterId: string,
  validateEffectParameter?: EffectAutomationParameterValidator,
): string | undefined {
  const issue = externalAutomationTargetIssue(project, scope, targetId, parameterId);
  if (issue !== undefined || scope !== "effect") return issue;
  if (externalAutomationParameterDescriptor(scope, parameterId) !== undefined) return undefined;
  const effect = project.effects.instances[targetId as EffectInstanceId];
  if (effect === undefined || validateEffectParameter === undefined) {
    return "Automation parameter is not supported.";
  }
  const value = effect.state[parameterId];
  const supported = value !== undefined
    ? validateEffectParameter(effect, parameterId, value)
    : validateEffectParameter(effect, parameterId, 0) ||
      validateEffectParameter(effect, parameterId, false) ||
      validateEffectParameter(effect, parameterId, "");
  return supported ? undefined : "Automation parameter is not supported.";
}

/**
 * Resolves the current descriptor, value, and owner label for external
 * automation. The caller injects registered effect descriptors and names.
 */
export function resolveExternalAutomationTarget(
  project: ProjectState,
  target: ExternalAutomationTarget | undefined,
  options: ExternalAutomationTargetCatalogOptions = {},
): ExternalAutomationTargetResolution | undefined {
  if (
    target === undefined ||
    externalAutomationTargetIssue(project, target.scope, target.targetId, target.parameterId) !== undefined
  ) {
    return undefined;
  }
  const staticDescriptor = externalAutomationParameterDescriptor(target.scope, target.parameterId);
  if (target.scope === "mixer" || target.scope === "send") {
    const module = project.modules[target.targetId as ModuleInstanceId];
    if (module === undefined || staticDescriptor === undefined) return undefined;
    const moduleName = options.pluginNameFor?.(module.pluginId) ?? "Module";
    if (target.scope === "mixer") {
      const currentValue = target.parameterId === "level"
        ? module.level
        : target.parameterId === "pan"
          ? module.pan
          : target.parameterId === "muted"
            ? module.muted
            : target.parameterId === "solo"
              ? module.solo
              : undefined;
      return currentValue === undefined
        ? undefined
        : { descriptor: staticDescriptor, ownerLabel: `${moduleName} mixer`, currentValue };
    }
    const sendMatch = /^send-([abcd])-amount$/u.exec(target.parameterId);
    const sendBusId = sendMatch?.[1];
    if (sendBusId === undefined) return undefined;
    const send = module.sends[`send-${sendBusId}` as SendBusId];
    return send === undefined
      ? undefined
      : {
          descriptor: staticDescriptor,
          ownerLabel: `${moduleName} send ${sendBusId.toUpperCase()}`,
          currentValue: send.amount,
        };
  }
  if (target.scope === "send-return") {
    const send = project.effects.sendChains[target.targetId as SendBusId];
    if (send === undefined || staticDescriptor === undefined) return undefined;
    return {
      descriptor: staticDescriptor,
      ownerLabel: `Send ${target.targetId.at(-1)?.toUpperCase() ?? ""}`,
      currentValue: target.parameterId === "return-level" ? send.returnLevel : send.bypassed,
    };
  }
  if (target.scope === "master") {
    if (staticDescriptor === undefined) return undefined;
    return {
      descriptor: staticDescriptor,
      ownerLabel: "Master",
      currentValue: project.masterLevel,
    };
  }
  const effect = project.effects.instances[target.targetId as EffectInstanceId];
  if (effect === undefined) return undefined;
  const descriptor = staticDescriptor ?? options.effectParametersFor?.(effect.pluginId)?.find(
    (candidate) => candidate.id === target.parameterId && candidate.automation === "step",
  );
  if (descriptor === undefined) return undefined;
  const currentValue = target.parameterId === "mix"
    ? effect.mix
    : target.parameterId === "gain"
      ? effect.gainDecibels
      : target.parameterId === "bypassed"
        ? effect.bypassed
        : effect.state[descriptor.id] ?? descriptor.defaultValue;
  return {
    descriptor,
    ownerLabel: options.pluginNameFor?.(effect.pluginId) ?? "Effect",
    currentValue,
  };
}
