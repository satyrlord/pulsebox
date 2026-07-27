import {
  isPlainRecord,
  validationFailure,
  validationSuccess,
  type ValidationIssue,
  type ValidationResult,
} from "./validation";

type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type PluginId = Brand<string, "PluginId">;
export type ParameterId = Brand<string, "ParameterId">;
export type MeterId = Brand<string, "MeterId">;

export type ParameterValue = number | boolean | string;
export type ParameterUnit =
  | "none"
  | "percent"
  | "decibels"
  | "hertz"
  | "seconds"
  | "milliseconds"
  | "semitones"
  | "cents"
  | "ratio"
  | "beats"
  | "bpm";

export interface SmoothingDescriptor {
  readonly curve: "none" | "linear" | "exponential";
  readonly durationMilliseconds: number;
}

export interface ParameterDescriptor {
  readonly id: ParameterId;
  readonly name: string;
  readonly shortLabel?: string;
  readonly valueType: "float" | "integer" | "boolean" | "enum";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly defaultValue: ParameterValue;
  readonly step?: number;
  readonly enumValues?: readonly string[];
  readonly unit: ParameterUnit;
  readonly displayPrecision: number;
  readonly resetValue: ParameterValue;
  readonly smoothing: SmoothingDescriptor;
  readonly workletRate: "a-rate" | "k-rate" | "message";
  readonly automation: "step" | "none";
  readonly modulation: "none" | "internal";
}

export interface MeterDescriptor {
  readonly id: MeterId;
  readonly name: string;
}

const STABLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function parseStableId<T extends string>(
  value: unknown,
  path: string,
  label: string,
): ValidationResult<T> {
  return typeof value === "string" &&
    value.length <= 64 &&
    STABLE_ID_PATTERN.test(value)
    ? validationSuccess(value as T)
    : validationFailure(
        path,
        `${label} must be at most 64 lowercase ASCII characters in stable ID form.`,
      );
}

export function parsePluginId(
  value: unknown,
  path = "pluginId",
): ValidationResult<PluginId> {
  return parseStableId<PluginId>(value, path, "Plugin ID");
}

export function parseParameterId(
  value: unknown,
  path = "parameterId",
): ValidationResult<ParameterId> {
  return parseStableId<ParameterId>(value, path, "Parameter ID");
}

export function parseMeterId(
  value: unknown,
  path = "meterId",
): ValidationResult<MeterId> {
  return parseStableId<MeterId>(value, path, "Meter ID");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValueInRange(
  value: number,
  minimum: number | undefined,
  maximum: number | undefined,
): boolean {
  return (
    (minimum === undefined || value >= minimum) &&
    (maximum === undefined || value <= maximum)
  );
}

export function validateParameterDescriptor(
  value: unknown,
  path = "parameter",
): ValidationResult<ParameterDescriptor> {
  if (!isPlainRecord(value) || !isPlainRecord(value.smoothing)) {
    return validationFailure(path, "Parameter descriptor must be a plain object.");
  }
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    (value.shortLabel !== undefined && typeof value.shortLabel !== "string") ||
    (value.enumValues !== undefined &&
      (!Array.isArray(value.enumValues) ||
        value.enumValues.some((entry) => typeof entry !== "string"))) ||
    (value.valueType !== "float" &&
      value.valueType !== "integer" &&
      value.valueType !== "boolean" &&
      value.valueType !== "enum") ||
    (value.unit !== "none" &&
      value.unit !== "percent" &&
      value.unit !== "decibels" &&
      value.unit !== "hertz" &&
      value.unit !== "seconds" &&
      value.unit !== "milliseconds" &&
      value.unit !== "semitones" &&
      value.unit !== "cents" &&
      value.unit !== "ratio" &&
      value.unit !== "beats" &&
      value.unit !== "bpm") ||
    (value.smoothing.curve !== "none" &&
      value.smoothing.curve !== "linear" &&
      value.smoothing.curve !== "exponential") ||
    (value.workletRate !== "a-rate" &&
      value.workletRate !== "k-rate" &&
      value.workletRate !== "message") ||
    (value.automation !== "step" && value.automation !== "none") ||
    (value.modulation !== "none" && value.modulation !== "internal")
  ) {
    return validationFailure(
      path,
      "Parameter descriptor has a missing or invalid contract field.",
    );
  }
  const descriptor = value as unknown as ParameterDescriptor;
  const issues: ValidationIssue[] = [];
  const id = parseParameterId(descriptor.id, `${path}.id`);
  if (!id.ok) issues.push(...id.issues);
  if (descriptor.name.trim().length === 0) {
    issues.push({ path: `${path}.name`, message: "Name must not be empty." });
  }
  if (descriptor.shortLabel?.trim().length === 0) {
    issues.push({
      path: `${path}.shortLabel`,
      message: "Short label must not be empty when present.",
    });
  }
  if (
    !Number.isSafeInteger(descriptor.displayPrecision) ||
    descriptor.displayPrecision < 0
  ) {
    issues.push({
      path: `${path}.displayPrecision`,
      message: "Display precision must be a non-negative safe integer.",
    });
  }
  if (
    !isFiniteNumber(descriptor.smoothing.durationMilliseconds) ||
    descriptor.smoothing.durationMilliseconds < 0
  ) {
    issues.push({
      path: `${path}.smoothing.durationMilliseconds`,
      message: "Smoothing duration must be a finite non-negative number.",
    });
  }

  if (descriptor.valueType === "float" || descriptor.valueType === "integer") {
    if (!isFiniteNumber(descriptor.minimum)) {
      issues.push({ path: `${path}.minimum`, message: "Minimum is required." });
    }
    if (!isFiniteNumber(descriptor.maximum)) {
      issues.push({ path: `${path}.maximum`, message: "Maximum is required." });
    }
    if (
      isFiniteNumber(descriptor.minimum) &&
      isFiniteNumber(descriptor.maximum) &&
      descriptor.minimum > descriptor.maximum
    ) {
      issues.push({
        path: `${path}.maximum`,
        message: "Maximum must be greater than or equal to minimum.",
      });
    }
    if (!isFiniteNumber(descriptor.defaultValue)) {
      issues.push({
        path: `${path}.defaultValue`,
        message: "Numeric parameters require a finite numeric default.",
      });
    } else if (
      !isValueInRange(
        descriptor.defaultValue,
        descriptor.minimum,
        descriptor.maximum,
      )
    ) {
      issues.push({
        path: `${path}.defaultValue`,
        message: "Default must be inside the parameter range.",
      });
    }
    if (!isFiniteNumber(descriptor.resetValue)) {
      issues.push({
        path: `${path}.resetValue`,
        message: "Numeric parameters require a finite numeric reset value.",
      });
    } else if (
      !isValueInRange(
        descriptor.resetValue,
        descriptor.minimum,
        descriptor.maximum,
      )
    ) {
      issues.push({
        path: `${path}.resetValue`,
        message: "Reset value must be inside the parameter range.",
      });
    }
    if (!isFiniteNumber(descriptor.step) || descriptor.step <= 0) {
      issues.push({
        path: `${path}.step`,
        message: "Numeric parameters require a finite positive step.",
      });
    }
    if (
      descriptor.valueType === "integer" &&
      ((isFiniteNumber(descriptor.minimum) &&
        !Number.isInteger(descriptor.minimum)) ||
        (isFiniteNumber(descriptor.maximum) &&
          !Number.isInteger(descriptor.maximum)) ||
        (isFiniteNumber(descriptor.defaultValue) &&
          !Number.isInteger(descriptor.defaultValue)) ||
        (isFiniteNumber(descriptor.resetValue) &&
          !Number.isInteger(descriptor.resetValue)) ||
        (isFiniteNumber(descriptor.step) && !Number.isInteger(descriptor.step)))
    ) {
      issues.push({
        path,
        message: "Integer parameter bounds, values, and step must be integers.",
      });
    }
  } else if (descriptor.valueType === "boolean") {
    if (
      typeof descriptor.defaultValue !== "boolean" ||
      typeof descriptor.resetValue !== "boolean"
    ) {
      issues.push({
        path,
        message: "Boolean parameters require boolean default and reset values.",
      });
    }
  } else {
    if (
      descriptor.enumValues === undefined ||
      descriptor.enumValues.length === 0 ||
      new Set(descriptor.enumValues).size !== descriptor.enumValues.length ||
      descriptor.enumValues.some((value) => value.length === 0)
    ) {
      issues.push({
        path: `${path}.enumValues`,
        message: "Enum values must be a non-empty list of unique strings.",
      });
    } else if (
      typeof descriptor.defaultValue !== "string" ||
      !descriptor.enumValues.includes(descriptor.defaultValue) ||
      typeof descriptor.resetValue !== "string" ||
      !descriptor.enumValues.includes(descriptor.resetValue)
    ) {
      issues.push({
        path,
        message: "Enum default and reset values must be declared enum values.",
      });
    }
  }

  if (descriptor.smoothing.curve === "exponential") {
    const minimum = descriptor.minimum;
    const maximum = descriptor.maximum;
    const crossesZero =
      minimum === undefined ||
      maximum === undefined ||
      minimum === 0 ||
      maximum === 0 ||
      (minimum < 0 && maximum > 0);
    if (
      crossesZero ||
      descriptor.defaultValue === 0 ||
      descriptor.resetValue === 0
    ) {
      issues.push({
        path: `${path}.smoothing`,
        message: "Exponential smoothing must not cross or target zero.",
      });
    }
  }

  return issues.length === 0
    ? validationSuccess(descriptor)
    : { ok: false, issues };
}
