import type { VoiceId } from "./ids";
import {
  parseMeterId,
  parsePluginId,
  validateParameterDescriptor,
  type MeterDescriptor,
  type ParameterDescriptor,
  type ParameterId,
  type PluginId,
} from "./parameters";
import {
  isPlainRecord,
  validationSuccess,
  type ValidationIssue,
  type ValidationResult,
} from "./validation";

export interface CompactControlDescriptor {
  readonly position: number;
  readonly parameterId: ParameterId;
}

/**
 * A compact control that addresses the voice chosen in the faceplate's voice
 * selector. The UI binds `<selected-voice-id>-<parameterSuffix>`, so one
 * descriptor serves every voice. Instruments only.
 */
export interface VoiceCompactControlDescriptor {
  readonly position: number;
  readonly parameterSuffix: string;
}

export interface PluginEditorSection {
  readonly id: string;
  readonly name: string;
  readonly parameterIds: readonly ParameterId[];
}

/**
 * Declares one parameter whose control the UI disables while a gate parameter
 * does not hold the declared value. The engine already ignores the gated
 * parameter in that state, so this makes the faceplate agree with the audio
 * path instead of showing a control that does nothing.
 */
export interface ParameterGateDescriptor {
  /** The parameter the UI disables while the gate is unmet. */
  readonly parameterId: ParameterId;
  /** The parameter whose value decides the disabled state. */
  readonly gateParameterId: ParameterId;
  /** The value the gate parameter must hold for the control to be enabled. */
  readonly gateValue: boolean;
}

export interface PluginModuleAccent {
  readonly accent: string;
  readonly accentMuted: string;
  readonly led: string;
  readonly controlRing: string;
}

/**
 * Original module iconography as one compound SVG path. The shared UI renders
 * it inline with `currentColor` and the even-odd fill rule, so subpaths cut
 * holes. Data only: the grammar admits path data, never markup or script.
 */
export interface PluginModuleIcon {
  /** Origin-anchored SVG viewBox, for example `0 0 24 24`. */
  readonly viewBox: string;
  /** One compound path in SVG path-data syntax. */
  readonly path: string;
}

export interface PluginUiManifest {
  readonly compactControls: readonly CompactControlDescriptor[];
  /** Selected-voice fast controls. Instruments with voices only. */
  readonly voiceCompactControls?: readonly VoiceCompactControlDescriptor[];
  /** Parameters the UI disables while their gate parameter is unmet. */
  readonly parameterGates?: readonly ParameterGateDescriptor[];
  readonly detailedEditorSections: readonly PluginEditorSection[];
  readonly moduleAccent: PluginModuleAccent;
  /** Module iconography for the browser thumbnail and the faceplate badge. */
  readonly icon?: PluginModuleIcon;
}

export interface PluginMigrationDescriptor {
  readonly id: string;
  readonly fromStateSchemaVersion: number;
  readonly toStateSchemaVersion: number;
  readonly implementationVersion: string;
}

export interface PluginCompatibility {
  readonly acceptedStateSchemaVersions: readonly number[];
  readonly migrations: readonly PluginMigrationDescriptor[];
}

export interface BasePluginManifest {
  readonly manifestSchemaVersion: 1;
  readonly pluginId: PluginId;
  readonly kind: "instrument" | "effect";
  readonly productName: string;
  readonly shortLabel?: string;
  readonly pluginVersion: string;
  readonly stateSchemaVersion: number;
  readonly apiVersion: 1;
  readonly engineProtocolVersion: 1;
  readonly parameters: readonly ParameterDescriptor[];
  readonly meters: readonly MeterDescriptor[];
  readonly defaultState: Readonly<Record<string, unknown>>;
  readonly ui: PluginUiManifest;
  readonly automation: "none" | "step";
  readonly cpuClass: "light" | "moderate" | "heavy";
  readonly compatibility: PluginCompatibility;
}

export interface InstrumentVoiceDescriptor {
  readonly id: VoiceId | string;
  readonly name: string;
  readonly outputChannels: 1 | 2;
}

export interface InstrumentEventDescriptor {
  readonly id: string;
  readonly kind: "note" | "trigger";
}

export interface InstrumentVoiceStealingDescriptor {
  readonly maximumVoices: number;
  readonly priority: "oldest" | "quietest" | "released-first";
  readonly releaseMilliseconds: number;
}

export interface PluginRenderCapabilities {
  readonly live: boolean;
  readonly offline: boolean;
}

export interface InstrumentPluginManifest extends BasePluginManifest {
  readonly kind: "instrument";
  readonly voices: readonly InstrumentVoiceDescriptor[];
  readonly acceptedEvents: readonly InstrumentEventDescriptor[];
  readonly patternCompatibility: readonly ("notes" | "triggers")[];
  readonly voiceStealing: InstrumentVoiceStealingDescriptor;
  readonly retriggerPolicy: "restart" | "legato" | "retrigger-envelope";
  readonly chokePolicy: "none" | "group";
  readonly inputChannels: 0 | 1 | 2;
  readonly outputChannels: 1 | 2;
  readonly supportsSampleLayers: boolean;
  readonly processorFactoryKey: string;
  readonly renderCapabilities: PluginRenderCapabilities;
}

export type EffectPlacement = "voice-insert" | "module-pedalboard" | "send-chain" | "master-chain";

export interface EffectLatencyDescriptor {
  readonly mode: "zero" | "fixed-frames";
  readonly frames: number;
}

export interface EffectTailDescriptor {
  readonly mode: "none" | "finite" | "bounded-generated";
  readonly maximumMilliseconds: number;
}

export interface EffectPluginManifest extends BasePluginManifest {
  readonly kind: "effect";
  readonly placements: readonly EffectPlacement[];
  readonly inputChannels: readonly (1 | 2)[];
  readonly outputChannels: readonly (1 | 2)[];
  readonly latency: EffectLatencyDescriptor;
  readonly tail: EffectTailDescriptor;
  readonly bypassTransitionMilliseconds: number;
  readonly wetDryLaw: "linear" | "equal-power";
  readonly safetyClampParameterIds: readonly ParameterId[];
  readonly processorFactoryKey: string;
  readonly renderCapabilities: PluginRenderCapabilities;
}

export type PluginManifest = InstrumentPluginManifest | EffectPluginManifest;

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?$/;
const CONTRACT_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function isSupportedSemanticVersion(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && SEMVER_PATTERN.test(value);
}

function arrayPath(name: string, index: number, suffix = ""): string {
  return `${name}[${index.toString()}]${suffix}`;
}

function isOneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function isChannelCount(value: unknown, allowZero: boolean): boolean {
  return value === 1 || value === 2 || (allowZero && value === 0);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function validateUniqueStrings(
  values: readonly string[],
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  if (new Set(values).size !== values.length) {
    issues.push({ path, message: `${label} must be unique.` });
  }
}

function isJsonData(value: unknown, stack = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || stack.has(value)) return false;
  stack.add(value);
  let valid: boolean;
  if (Array.isArray(value)) {
    valid = value.every((entry) => isJsonData(entry, stack));
  } else if (!isPlainRecord(value)) {
    valid = false;
  } else {
    valid = Object.values(value).every((entry) => isJsonData(entry, stack));
  }
  stack.delete(value);
  return valid;
}

function validateCompatibility(manifest: PluginManifest, issues: ValidationIssue[]): void {
  const accepted = manifest.compatibility.acceptedStateSchemaVersions;
  if (
    accepted.length === 0 ||
    accepted.some((version) => !Number.isSafeInteger(version) || version <= 0) ||
    accepted.some((version) => version > manifest.stateSchemaVersion) ||
    new Set(accepted).size !== accepted.length ||
    !accepted.includes(manifest.stateSchemaVersion)
  ) {
    issues.push({
      path: "compatibility.acceptedStateSchemaVersions",
      message:
        "Accepted state schemas must be unique positive integers and include the current schema.",
    });
  }

  const migrationKeys = new Set<string>();
  for (const [index, migration] of manifest.compatibility.migrations.entries()) {
    const path = arrayPath("compatibility.migrations", index);
    if (!CONTRACT_KEY_PATTERN.test(migration.id)) {
      issues.push({ path: `${path}.id`, message: "Migration ID is invalid." });
    }
    if (
      !Number.isSafeInteger(migration.fromStateSchemaVersion) ||
      migration.fromStateSchemaVersion <= 0 ||
      migration.toStateSchemaVersion !== migration.fromStateSchemaVersion + 1 ||
      migration.toStateSchemaVersion > manifest.stateSchemaVersion
    ) {
      issues.push({
        path,
        message: "Migration must advance exactly one supported schema version.",
      });
    }
    if (!isSupportedSemanticVersion(migration.implementationVersion)) {
      issues.push({
        path: `${path}.implementationVersion`,
        message: "Migration implementation must be a supported semantic version.",
      });
    }
    const migrationKey = `${migration.fromStateSchemaVersion.toString()}:${migration.toStateSchemaVersion.toString()}`;
    if (migrationKeys.has(migrationKey)) {
      issues.push({ path, message: "Migration step is duplicated." });
    }
    migrationKeys.add(migrationKey);
  }

  for (const version of accepted) {
    for (let current = version; current < manifest.stateSchemaVersion; current += 1) {
      if (!migrationKeys.has(`${current.toString()}:${(current + 1).toString()}`)) {
        issues.push({
          path: "compatibility.migrations",
          message: `Missing migration from state schema ${current.toString()} to ${(current + 1).toString()}.`,
        });
      }
    }
  }
}

function validateUi(
  manifest: PluginManifest,
  parameterIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  const colors = [
    manifest.ui.moduleAccent.accent,
    manifest.ui.moduleAccent.accentMuted,
    manifest.ui.moduleAccent.led,
    manifest.ui.moduleAccent.controlRing,
  ];
  if (colors.some((color) => !/^#[0-9A-F]{6}$/.test(color))) {
    issues.push({
      path: "ui.moduleAccent",
      message: "Module accent colors must use opaque uppercase six-digit sRGB hex.",
    });
  }
  const icon = manifest.ui.icon;
  if (icon !== undefined) {
    if (!/^0 0 [1-9]\d{0,2} [1-9]\d{0,2}$/.test(icon.viewBox)) {
      issues.push({
        path: "ui.icon.viewBox",
        message: "Module icon viewBox must be origin-anchored, for example `0 0 24 24`.",
      });
    }
    if (
      icon.path.length === 0 ||
      icon.path.length > 2048 ||
      !/^[MmZzLlHhVvCcSsQqTtAa0-9,.\s+-]+$/.test(icon.path)
    ) {
      issues.push({
        path: "ui.icon.path",
        message: "Module icon path must be non-empty bounded SVG path data with no markup.",
      });
    }
  }
  const positions = manifest.ui.compactControls.map((control) => control.position);
  if (
    positions.some((position) => !Number.isSafeInteger(position) || position < 0) ||
    new Set(positions).size !== positions.length
  ) {
    issues.push({
      path: "ui.compactControls",
      message: "Compact control positions must be unique non-negative integers.",
    });
  }
  for (const [index, control] of manifest.ui.compactControls.entries()) {
    if (!parameterIds.has(control.parameterId)) {
      issues.push({
        path: arrayPath("ui.compactControls", index, ".parameterId"),
        message: "Compact control must reference a declared parameter.",
      });
    }
  }

  const voiceControls = manifest.ui.voiceCompactControls ?? [];
  if (voiceControls.length > 0) {
    if (manifest.kind !== "instrument" || manifest.voices.length === 0) {
      issues.push({
        path: "ui.voiceCompactControls",
        message: "Voice compact controls require an instrument with voices.",
      });
    } else {
      const voicePositions = voiceControls.map((control) => control.position);
      if (
        voicePositions.some((position) => !Number.isSafeInteger(position) || position < 0) ||
        new Set(voicePositions).size !== voicePositions.length
      ) {
        issues.push({
          path: "ui.voiceCompactControls",
          message: "Voice compact control positions must be unique non-negative integers.",
        });
      }
      for (const [index, control] of voiceControls.entries()) {
        const missing = manifest.voices.some(
          (voice) => !parameterIds.has(`${voice.id}-${control.parameterSuffix}`),
        );
        if (missing) {
          issues.push({
            path: arrayPath("ui.voiceCompactControls", index, ".parameterSuffix"),
            message: "Voice compact control must resolve to a declared parameter on every voice.",
          });
        }
      }
    }
  }
  validateUniqueStrings(
    manifest.ui.detailedEditorSections.map((section) => section.id),
    "ui.detailedEditorSections",
    "Detailed editor section IDs",
    issues,
  );
  for (const [index, section] of manifest.ui.detailedEditorSections.entries()) {
    if (!CONTRACT_KEY_PATTERN.test(section.id) || section.name.trim().length === 0) {
      issues.push({
        path: arrayPath("ui.detailedEditorSections", index),
        message: "Editor sections require a stable ID and non-empty name.",
      });
    }
    if (section.parameterIds.some((parameterId) => !parameterIds.has(parameterId))) {
      issues.push({
        path: arrayPath("ui.detailedEditorSections", index, ".parameterIds"),
        message: "Editor section references an undeclared parameter.",
      });
    }
  }
  for (const [index, gate] of (manifest.ui.parameterGates ?? []).entries()) {
    const path = arrayPath("ui.parameterGates", index);
    if (gate.parameterId === gate.gateParameterId) {
      issues.push({ path, message: "A parameter cannot gate itself." });
    }
    if (!parameterIds.has(gate.parameterId)) {
      issues.push({
        path: `${path}.parameterId`,
        message: "Gated control must reference a declared parameter.",
      });
    }
    if (!parameterIds.has(gate.gateParameterId)) {
      issues.push({
        path: `${path}.gateParameterId`,
        message: "Parameter gate must reference a declared gate parameter.",
      });
      continue;
    }
    const gateDescriptor = manifest.parameters.find((one) => one.id === gate.gateParameterId);
    if (gateDescriptor !== undefined && gateDescriptor.valueType !== "boolean") {
      issues.push({
        path: `${path}.gateParameterId`,
        message: "Parameter gate must reference a boolean parameter.",
      });
    }
  }
}

export function validatePluginManifest(value: unknown): ValidationResult<PluginManifest> {
  if (!isPlainRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "manifest", message: "Plugin manifest must be a plain object." }],
    };
  }
  const raw = value;
  if (
    typeof raw.pluginId !== "string" ||
    typeof raw.productName !== "string" ||
    (raw.shortLabel !== undefined && typeof raw.shortLabel !== "string") ||
    typeof raw.pluginVersion !== "string" ||
    typeof raw.stateSchemaVersion !== "number" ||
    typeof raw.processorFactoryKey !== "string" ||
    !Array.isArray(raw.parameters) ||
    raw.parameters.some((parameter) => !isPlainRecord(parameter)) ||
    !Array.isArray(raw.meters) ||
    raw.meters.some(
      (meter) =>
        !isPlainRecord(meter) || typeof meter.id !== "string" || typeof meter.name !== "string",
    ) ||
    !isPlainRecord(raw.defaultState) ||
    !isPlainRecord(raw.ui) ||
    !isPlainRecord(raw.ui.moduleAccent) ||
    typeof raw.ui.moduleAccent.accent !== "string" ||
    typeof raw.ui.moduleAccent.accentMuted !== "string" ||
    typeof raw.ui.moduleAccent.led !== "string" ||
    typeof raw.ui.moduleAccent.controlRing !== "string" ||
    (raw.ui.icon !== undefined &&
      (!isPlainRecord(raw.ui.icon) ||
        typeof raw.ui.icon.viewBox !== "string" ||
        typeof raw.ui.icon.path !== "string")) ||
    !Array.isArray(raw.ui.compactControls) ||
    raw.ui.compactControls.some(
      (control) =>
        !isPlainRecord(control) ||
        typeof control.position !== "number" ||
        typeof control.parameterId !== "string",
    ) ||
    (raw.ui.voiceCompactControls !== undefined &&
      (!Array.isArray(raw.ui.voiceCompactControls) ||
        raw.ui.voiceCompactControls.some(
          (control) =>
            !isPlainRecord(control) ||
            typeof control.position !== "number" ||
            typeof control.parameterSuffix !== "string",
        ))) ||
    (raw.ui.parameterGates !== undefined &&
      (!Array.isArray(raw.ui.parameterGates) ||
        raw.ui.parameterGates.some(
          (gate) =>
            !isPlainRecord(gate) ||
            typeof gate.parameterId !== "string" ||
            typeof gate.gateParameterId !== "string" ||
            typeof gate.gateValue !== "boolean",
        ))) ||
    !Array.isArray(raw.ui.detailedEditorSections) ||
    raw.ui.detailedEditorSections.some(
      (section) =>
        !isPlainRecord(section) ||
        typeof section.id !== "string" ||
        typeof section.name !== "string" ||
        !Array.isArray(section.parameterIds) ||
        section.parameterIds.some((parameterId) => typeof parameterId !== "string"),
    ) ||
    !isPlainRecord(raw.compatibility) ||
    !Array.isArray(raw.compatibility.acceptedStateSchemaVersions) ||
    !Array.isArray(raw.compatibility.migrations) ||
    raw.compatibility.migrations.some((migration) => !isPlainRecord(migration)) ||
    !isPlainRecord(raw.renderCapabilities) ||
    typeof raw.renderCapabilities.live !== "boolean" ||
    typeof raw.renderCapabilities.offline !== "boolean" ||
    (raw.kind !== "instrument" && raw.kind !== "effect")
  ) {
    return {
      ok: false,
      issues: [
        {
          path: "manifest",
          message: "Plugin manifest is missing a required structured field.",
        },
      ],
    };
  }
  if (
    raw.kind === "instrument" &&
    (!Array.isArray(raw.voices) ||
      !Array.isArray(raw.acceptedEvents) ||
      !Array.isArray(raw.patternCompatibility) ||
      !isPlainRecord(raw.voiceStealing) ||
      raw.voices.some(
        (voice) =>
          !isPlainRecord(voice) || typeof voice.id !== "string" || typeof voice.name !== "string",
      ) ||
      raw.acceptedEvents.some(
        (event) =>
          !isPlainRecord(event) ||
          typeof event.id !== "string" ||
          (event.kind !== "note" && event.kind !== "trigger"),
      ))
  ) {
    return {
      ok: false,
      issues: [
        {
          path: "manifest",
          message: "Instrument manifest is missing a required structured field.",
        },
      ],
    };
  }
  if (
    raw.kind === "effect" &&
    (!Array.isArray(raw.placements) ||
      !Array.isArray(raw.inputChannels) ||
      !Array.isArray(raw.outputChannels) ||
      !Array.isArray(raw.safetyClampParameterIds) ||
      !isPlainRecord(raw.latency) ||
      !isPlainRecord(raw.tail))
  ) {
    return {
      ok: false,
      issues: [
        {
          path: "manifest",
          message: "Effect manifest is missing a required structured field.",
        },
      ],
    };
  }

  const manifest = value as unknown as PluginManifest;
  const issues: ValidationIssue[] = [];
  const pluginId = parsePluginId(manifest.pluginId);
  if (!pluginId.ok) issues.push(...pluginId.issues);
  if (raw.manifestSchemaVersion !== 1) {
    issues.push({
      path: "manifestSchemaVersion",
      message: "Manifest schema version must be 1.",
    });
  }
  if (raw.apiVersion !== 1 || raw.engineProtocolVersion !== 1) {
    issues.push({
      path: "apiVersion",
      message: "API and engine protocol versions must both be 1.",
    });
  }
  if (manifest.productName.trim().length === 0) {
    issues.push({ path: "productName", message: "Product name must not be empty." });
  }
  if (
    manifest.shortLabel !== undefined &&
    (!/^[A-Z0-9]{1,4}$/.test(manifest.shortLabel) || manifest.shortLabel.length > 4)
  ) {
    issues.push({
      path: "shortLabel",
      message: "Short label must contain one through four uppercase characters.",
    });
  }
  if (!isSupportedSemanticVersion(manifest.pluginVersion)) {
    issues.push({
      path: "pluginVersion",
      message: "Plugin version must be SemVer without build metadata.",
    });
  }
  if (!Number.isSafeInteger(manifest.stateSchemaVersion) || manifest.stateSchemaVersion <= 0) {
    issues.push({
      path: "stateSchemaVersion",
      message: "State schema version must be a positive safe integer.",
    });
  }
  if (!isPlainRecord(manifest.defaultState)) {
    issues.push({ path: "defaultState", message: "Default state must be a plain object." });
  } else if (!isJsonData(manifest.defaultState)) {
    issues.push({
      path: "defaultState",
      message: "Default state must contain finite JSON data only.",
    });
  }
  if (
    !isOneOf(manifest.automation, ["none", "step"]) ||
    !isOneOf(manifest.cpuClass, ["light", "moderate", "heavy"])
  ) {
    issues.push({
      path: "automation",
      message: "Automation capability or CPU class is invalid.",
    });
  }

  const parameterIds = new Set<string>();
  for (const [index, parameter] of manifest.parameters.entries()) {
    const result = validateParameterDescriptor(parameter, arrayPath("parameters", index));
    if (!result.ok) issues.push(...result.issues);
    if (parameterIds.has(parameter.id)) {
      issues.push({
        path: arrayPath("parameters", index, ".id"),
        message: "Parameter ID is duplicated in this plugin.",
      });
    }
    parameterIds.add(parameter.id);
  }

  const meterIds = new Set<string>();
  for (const [index, meter] of manifest.meters.entries()) {
    const result = parseMeterId(meter.id, arrayPath("meters", index, ".id"));
    if (!result.ok) issues.push(...result.issues);
    if (meter.name.trim().length === 0) {
      issues.push({
        path: arrayPath("meters", index, ".name"),
        message: "Meter name must not be empty.",
      });
    }
    if (meterIds.has(meter.id)) {
      issues.push({
        path: arrayPath("meters", index, ".id"),
        message: "Meter ID is duplicated.",
      });
    }
    meterIds.add(meter.id);
  }

  validateCompatibility(manifest, issues);
  validateUi(manifest, parameterIds, issues);

  if (!CONTRACT_KEY_PATTERN.test(manifest.processorFactoryKey)) {
    issues.push({
      path: "processorFactoryKey",
      message: "Processor factory key must use stable ID form.",
    });
  }
  if (!manifest.renderCapabilities.live) {
    issues.push({
      path: "renderCapabilities",
      message: "Registered plugins must declare live rendering support.",
    });
  }

  if (manifest.kind === "instrument") {
    if (
      !Number.isSafeInteger(manifest.voiceStealing.maximumVoices) ||
      manifest.voiceStealing.maximumVoices <= 0 ||
      !Number.isFinite(manifest.voiceStealing.releaseMilliseconds) ||
      manifest.voiceStealing.releaseMilliseconds < 0
    ) {
      issues.push({
        path: "voiceStealing",
        message: "Voice stealing requires a positive voice limit and finite release duration.",
      });
    }
    if (
      !isOneOf(manifest.voiceStealing.priority, ["oldest", "quietest", "released-first"]) ||
      !isOneOf(manifest.retriggerPolicy, ["restart", "legato", "retrigger-envelope"]) ||
      !isOneOf(manifest.chokePolicy, ["none", "group"]) ||
      !isChannelCount(manifest.inputChannels, true) ||
      !isChannelCount(manifest.outputChannels, false) ||
      !isBoolean(manifest.supportsSampleLayers) ||
      manifest.patternCompatibility.some((kind) => !isOneOf(kind, ["notes", "triggers"])) ||
      manifest.voices.some((voice) => !isChannelCount(voice.outputChannels, false))
    ) {
      issues.push({
        path: "instrument",
        message: "Instrument specialization contains an invalid contract value.",
      });
    }
    validateUniqueStrings(
      manifest.voices.map((voice) => voice.id),
      "voices",
      "Voice IDs",
      issues,
    );
    validateUniqueStrings(
      manifest.acceptedEvents.map((event) => event.id),
      "acceptedEvents",
      "Event type IDs",
      issues,
    );
    if (
      manifest.voices.some(
        (voice) => !CONTRACT_KEY_PATTERN.test(voice.id) || voice.name.trim().length === 0,
      ) ||
      manifest.acceptedEvents.some((event) => !CONTRACT_KEY_PATTERN.test(event.id))
    ) {
      issues.push({
        path: "voices",
        message: "Voice and event descriptors require stable IDs and names.",
      });
    }
  } else {
    if (
      manifest.placements.some(
        (placement) =>
          !isOneOf(placement, ["voice-insert", "module-pedalboard", "send-chain", "master-chain"]),
      ) ||
      manifest.inputChannels.length === 0 ||
      manifest.inputChannels.some((channels) => !isChannelCount(channels, false)) ||
      manifest.outputChannels.length === 0 ||
      manifest.outputChannels.some((channels) => !isChannelCount(channels, false)) ||
      !isOneOf(manifest.latency.mode, ["zero", "fixed-frames"]) ||
      !isOneOf(manifest.tail.mode, ["none", "finite", "bounded-generated"]) ||
      !isOneOf(manifest.wetDryLaw, ["linear", "equal-power"])
    ) {
      issues.push({
        path: "effect",
        message: "Effect specialization contains an invalid contract value.",
      });
    }
    if (
      manifest.placements.length === 0 ||
      new Set(manifest.placements).size !== manifest.placements.length
    ) {
      issues.push({
        path: "placements",
        message: "Effect placements must be a non-empty unique list.",
      });
    }
    if (manifest.ui.compactControls.length > 4) {
      issues.push({
        path: "ui.compactControls",
        message: "An effect may expose at most four compact controls.",
      });
    }
    if (
      !Number.isSafeInteger(manifest.latency.frames) ||
      manifest.latency.frames < 0 ||
      (manifest.latency.mode === "zero" && manifest.latency.frames !== 0)
    ) {
      issues.push({ path: "latency", message: "Effect latency is invalid." });
    }
    if (
      !Number.isFinite(manifest.tail.maximumMilliseconds) ||
      manifest.tail.maximumMilliseconds < 0 ||
      (manifest.tail.mode === "none" && manifest.tail.maximumMilliseconds !== 0)
    ) {
      issues.push({ path: "tail", message: "Effect tail bound is invalid." });
    }
    if (
      !Number.isFinite(manifest.bypassTransitionMilliseconds) ||
      manifest.bypassTransitionMilliseconds < 0
    ) {
      issues.push({
        path: "bypassTransitionMilliseconds",
        message: "Bypass transition must be finite and non-negative.",
      });
    }
    if (manifest.safetyClampParameterIds.some((parameterId) => !parameterIds.has(parameterId))) {
      issues.push({
        path: "safetyClampParameterIds",
        message: "Safety clamps must reference declared parameters.",
      });
    }
  }

  return issues.length === 0 ? validationSuccess(manifest) : { ok: false, issues };
}
