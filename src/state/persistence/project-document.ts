import {
  RACK_SLOT_IDS,
  isCanonicalUuid,
  type PatternId,
  type ProjectRevision,
} from "../../contracts/ids";
import {
  parseParameterId,
  parsePluginId,
  type ParameterDescriptor,
  type ParameterValue,
} from "../../contracts/parameters";
import { isPlainRecord, type ValidationIssue } from "../../contracts/validation";
import {
  createSilentSteps,
  DEFAULT_MASTER_LEVEL,
  DEFAULT_MODULE_LEVEL,
  PATTERN_SLOT_COUNT,
  PATTERN_STEP_COUNT,
} from "../default-state";
import type { PatternStep, PulseState, RackModuleState } from "../model";

/**
 * The on-disk project document, per `docs/PROJECT-FORMAT.md` section 5.
 *
 * Only the areas the application actually implements carry data. Song,
 * automation, mixer, effects, and assets are present and empty so that a
 * document written today stays readable when those features land, and so the
 * validator can already reject unknown root keys.
 */

export const PROJECT_FORMAT = "pulsebox-project";
export const PROJECT_FORMAT_VERSION = 1;

/** Guards a hostile or corrupt file before any of it is trusted. */
export const DOCUMENT_LIMITS = {
  maximumBytes: 32 * 1024 * 1024,
  maximumRackSlots: RACK_SLOT_IDS.length,
  maximumPatternSteps: 512,
  maximumEventRecords: 1_000_000,
  /** Mirrors the editor's own song ceiling, so import cannot exceed it. */
  maximumSongEntries: 128,
  maximumSongRepeats: 64,
} as const;

export interface ProjectMetadataDocument {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly lineageId: string;
  readonly revisionEpoch: string;
  readonly revision: number;
  readonly pinned: boolean;
  readonly tempo: number;
  /**
   * Global Swing, 0 through 100 percent, per decision D69. One value applies to
   * every Pattern in the MVP. Absent in format 1 documents written before it.
   */
  readonly swing?: number;
}

export interface PluginRequirementDocument {
  readonly pluginId: string;
  readonly stateSchemaVersion: number;
}

export interface PatternDocument {
  readonly id: string;
  readonly moduleId: string;
  readonly name: string;
  readonly length: number;
  /** Index into the project Pattern bank. Absent in format 1 documents. */
  readonly patternIndex?: number;
  /**
   * Pattern-owned Humanize, 0 through 100 percent. Absent in documents written
   * before deterministic humanization. An absent value plays mechanically, so an
   * old document keeps its old playback.
   */
  readonly humanize?: number;
  /** Stored Pattern seed, an unsigned 32-bit integer. Absent in old documents. */
  readonly seed?: number;
  readonly steps: readonly PatternStep[];
}

export interface RackSlotDocument {
  readonly id: string;
  readonly moduleId?: string;
  readonly pluginId?: string;
  readonly parameters?: Readonly<Record<string, ParameterValue>>;
  readonly muted?: boolean;
  readonly solo?: boolean;
  readonly level?: number;
  readonly pan?: number;
}

export interface SongEntryDocument {
  readonly patternIndex: number;
  readonly repeats: number;
}

export interface MixerDocument {
  readonly masterLevel?: number;
}

export interface MigrationRecord {
  readonly scope: "project" | "plugin";
  readonly id: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly implementation: string;
}

export interface ProjectDocument {
  readonly format: typeof PROJECT_FORMAT;
  readonly formatVersion: number;
  readonly project: ProjectMetadataDocument;
  readonly plugins: readonly PluginRequirementDocument[];
  readonly rack: readonly RackSlotDocument[];
  readonly patterns: readonly PatternDocument[];
  readonly song: readonly SongEntryDocument[];
  readonly songEnabled?: boolean;
  readonly activePatternIndex?: number;
  readonly automation: readonly unknown[];
  readonly mixer: MixerDocument;
  readonly effects: Readonly<Record<string, unknown>>;
  readonly assets: readonly unknown[];
  readonly migrations: readonly MigrationRecord[];
}

const ROOT_KEYS = new Set<keyof ProjectDocument>([
  "format",
  "formatVersion",
  "project",
  "plugins",
  "rack",
  "patterns",
  "song",
  "songEnabled",
  "activePatternIndex",
  "automation",
  "mixer",
  "effects",
  "assets",
  "migrations",
]);

export type DocumentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function failure(path: string, message: string): DocumentResult<never> {
  return { ok: false, issues: [{ path, message }] };
}

export interface SerializeOptions {
  readonly createdAt: string;
  readonly modifiedAt: string;
  /** Last committed token, never the runtime StateRevision. */
  readonly projectRevision: ProjectRevision;
  readonly pinned?: boolean;
  readonly manifestVersionFor?: (pluginId: string) => number;
}

export function serializeProject(
  state: Readonly<PulseState>,
  options: SerializeOptions,
): ProjectDocument {
  const project = state.project;
  const modules = Object.values(project.modules);
  const versionFor = options.manifestVersionFor ?? (() => 1);

  const plugins = [...new Set(modules.map((module) => module.pluginId))].map((pluginId) => ({
    pluginId,
    stateSchemaVersion: versionFor(pluginId),
  }));

  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    project: {
      id: project.id,
      name: project.name,
      createdAt: options.createdAt,
      modifiedAt: options.modifiedAt,
      lineageId: project.lineageId,
      revisionEpoch: options.projectRevision.epoch,
      revision: options.projectRevision.counter,
      pinned: options.pinned ?? false,
      tempo: project.tempo,
      // State keeps Swing as a 0-to-1 ratio; the format stores the percent the
      // specification and the interface both speak in.
      swing: Math.round(project.swing * 100),
    },
    plugins,
    rack: project.rackSlots.map((slot) => {
      const module = slot.moduleId === undefined ? undefined : project.modules[slot.moduleId];
      if (module === undefined) return { id: slot.id };
      return {
        id: slot.id,
        moduleId: module.id,
        pluginId: module.pluginId,
        parameters: { ...module.parameters },
        muted: module.muted,
        solo: module.solo,
        level: module.level,
        pan: module.pan,
      };
    }),
    // One record per module per Pattern slot. The bank's name and length live on
    // the project, so every record for an index repeats them.
    patterns: modules.flatMap((module) =>
      module.parts.map((steps, patternIndex) => {
        const slot = project.patterns[patternIndex];
        return {
          id: `${slot?.id ?? String(patternIndex)}:${module.id}`,
          moduleId: module.id,
          patternIndex,
          name: slot?.name ?? `Pattern ${String(patternIndex + 1)}`,
          length: slot?.length ?? steps.length,
          // State keeps Humanize as a 0-to-1 ratio; the format stores percent,
          // the unit the specification and the interface both speak in.
          humanize: Math.round((slot?.humanize ?? 0) * 100),
          seed: slot?.seed ?? 0,
          steps: steps.map((step) => ({ ...step })),
        };
      }),
    ),
    song: project.song.entries.map((entry) => ({ ...entry })),
    songEnabled: project.song.enabled,
    activePatternIndex: project.activePatternIndex,
    automation: [],
    mixer: { masterLevel: project.masterLevel },
    effects: {},
    assets: [],
    migrations: [],
  };
}

export function serializeProjectToJson(
  state: Readonly<PulseState>,
  options: SerializeOptions,
): string {
  return JSON.stringify(serializeProject(state, options));
}

function isStep(value: unknown): value is PatternStep {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.active === "boolean" &&
    typeof value.note === "number" &&
    Number.isFinite(value.note) &&
    typeof value.velocity === "number" &&
    Number.isFinite(value.velocity) &&
    typeof value.accent === "boolean" &&
    typeof value.slide === "boolean"
  );
}

export interface ParseOptions {
  /** Plugin IDs the running build can actually instantiate. */
  readonly knownPluginIds: readonly string[];
  /** Data-only parameter contracts copied from each registered plugin manifest. */
  readonly parameterDescriptorsByPluginId: Readonly<
    Record<string, readonly ImportParameterDescriptor[]>
  >;
}

export type ImportParameterDescriptor = Pick<
  ParameterDescriptor,
  "id" | "valueType" | "minimum" | "maximum" | "enumValues"
>;

const MAXIMUM_REPORTED_ISSUES = 100;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PROJECT_KEYS = new Set([
  "id",
  "name",
  "createdAt",
  "modifiedAt",
  "lineageId",
  "revisionEpoch",
  "revision",
  "pinned",
  "tempo",
  "swing",
]);
const PLUGIN_KEYS = new Set(["pluginId", "stateSchemaVersion"]);
const RACK_KEYS = new Set([
  "id",
  "moduleId",
  "pluginId",
  "parameters",
  "muted",
  "solo",
  "level",
  "pan",
]);
const PATTERN_KEYS = new Set([
  "id",
  "moduleId",
  "name",
  "length",
  "patternIndex",
  "humanize",
  "seed",
  "steps",
]);
const STEP_KEYS = new Set(["active", "note", "velocity", "accent", "slide"]);
const SONG_KEYS = new Set(["patternIndex", "repeats"]);

class IssueCollector {
  readonly issues: ValidationIssue[] = [];

  add(path: string, message: string): void {
    if (this.issues.length < MAXIMUM_REPORTED_ISSUES) this.issues.push({ path, message });
  }

  get full(): boolean {
    return this.issues.length >= MAXIMUM_REPORTED_ISSUES;
  }

  exactKeys(
    value: Readonly<Record<string, unknown>>,
    keys: ReadonlySet<string>,
    path: string,
  ): void {
    for (const key of Object.keys(value)) {
      if (!keys.has(key)) this.add(path, `Unknown key ${key}.`);
    }
  }
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 256;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Object.is(value, -0) &&
    value >= minimum &&
    value <= maximum
  );
}

function hasForbiddenStringCodePoint(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) return true;
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function scanSafeJson(value: unknown, collector: IssueCollector, path = "$", depth = 0): void {
  if (depth > 32) {
    collector.add(path, "JSON nesting exceeds 32 containers.");
    return;
  }
  if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) {
    collector.add(path, "Numbers must be finite and must not be negative zero.");
    return;
  }
  if (typeof value === "string") {
    if (hasForbiddenStringCodePoint(value)) {
      collector.add(path, "String contains a forbidden control or surrogate character.");
    }
    if (new TextEncoder().encode(value).length > 65_536) {
      collector.add(path, "String exceeds 65,536 UTF-8 bytes.");
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 1_000_000) collector.add(path, "Array exceeds 1,000,000 elements.");
    for (let index = 0; index < Math.min(value.length, 1_000_000) && !collector.full; index += 1) {
      scanSafeJson(value[index], collector, `${path}[${String(index)}]`, depth + 1);
    }
    return;
  }
  if (!isPlainRecord(value)) return;
  const keys = Object.keys(value);
  if (keys.length > 4_096) collector.add(path, "Object exceeds 4,096 members.");
  for (const key of keys) {
    if (collector.full) break;
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      collector.add(`${path}.${key}`, "Forbidden object key.");
    }
    scanSafeJson(value[key], collector, `${path}.${key}`, depth + 1);
  }
}

function validateImportedParameter(
  value: unknown,
  descriptor: ImportParameterDescriptor,
  path: string,
  collector: IssueCollector,
): void {
  if (descriptor.valueType === "boolean") {
    if (typeof value !== "boolean") collector.add(path, "Expected a boolean parameter value.");
    return;
  }
  if (descriptor.valueType === "enum") {
    if (typeof value !== "string" || !descriptor.enumValues?.includes(value)) {
      collector.add(path, "Expected one of the parameter's declared enum values.");
    }
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    collector.add(path, "Expected a finite numeric parameter value.");
    return;
  }
  if (descriptor.valueType === "integer" && !Number.isInteger(value)) {
    collector.add(path, "Expected an integer parameter value.");
    return;
  }
  if (
    (descriptor.minimum !== undefined && value < descriptor.minimum) ||
    (descriptor.maximum !== undefined && value > descriptor.maximum)
  ) {
    collector.add(path, "Parameter value is outside its registered range.");
  }
}

/**
 * Treats the document as untrusted. Rejects unknown root keys, executable
 * content, over-cap racks, unknown plugins, and out-of-range scalars before any
 * value reaches the store.
 */
export function parseProjectDocument(
  value: unknown,
  options: ParseOptions,
): DocumentResult<ProjectDocument> {
  if (!isPlainRecord(value)) return failure("$", "A project document must be a JSON object.");
  const collector = new IssueCollector();
  scanSafeJson(value, collector);
  collector.exactKeys(value, ROOT_KEYS, "$");

  if (value.format !== PROJECT_FORMAT)
    collector.add("format", `Format must be "${PROJECT_FORMAT}".`);
  if (!Number.isSafeInteger(value.formatVersion) || Number(value.formatVersion) < 1) {
    collector.add("formatVersion", "Format version must be a positive safe integer.");
  } else if (Number(value.formatVersion) > PROJECT_FORMAT_VERSION) {
    collector.add(
      "formatVersion",
      `This build reads project format ${String(PROJECT_FORMAT_VERSION)} and cannot open format ${String(value.formatVersion)}.`,
    );
  }

  const metadata = value.project;
  if (!isPlainRecord(metadata)) {
    collector.add("project", "Project metadata is required.");
  } else {
    collector.exactKeys(metadata, PROJECT_KEYS, "project");
    for (const key of ["id", "lineageId", "revisionEpoch"] as const) {
      if (!isCanonicalUuid(metadata[key]))
        collector.add(`project.${key}`, "Expected a lowercase canonical UUID version 4.");
    }
    if (!validName(metadata.name))
      collector.add("project.name", "Name must contain 1 through 256 characters.");
    if (!validTimestamp(metadata.createdAt))
      collector.add("project.createdAt", "Expected a UTC timestamp with three fractional digits.");
    if (!validTimestamp(metadata.modifiedAt))
      collector.add("project.modifiedAt", "Expected a UTC timestamp with three fractional digits.");
    if (
      validTimestamp(metadata.createdAt) &&
      validTimestamp(metadata.modifiedAt) &&
      metadata.modifiedAt < metadata.createdAt
    ) {
      collector.add("project.modifiedAt", "Modified time must not precede created time.");
    }
    if (!Number.isSafeInteger(metadata.revision) || Number(metadata.revision) < 0)
      collector.add("project.revision", "Revision must be a non-negative safe integer.");
    if (typeof metadata.pinned !== "boolean")
      collector.add("project.pinned", "Pinned must be boolean.");
    if (!finiteNumber(metadata.tempo, 40, 240))
      collector.add("project.tempo", "Tempo must be between 40 and 240 BPM.");
    // Global Swing, per decision D69. Absent in documents written before it.
    if (metadata.swing !== undefined && !finiteNumber(metadata.swing, 0, 100))
      collector.add("project.swing", "Swing must be between 0 and 100 percent.");
  }

  const known = new Set(options.knownPluginIds);
  const requirements = new Set<string>();
  if (!Array.isArray(value.plugins)) {
    collector.add("plugins", "Plugins must be an array.");
  } else {
    for (const [index, requirement] of value.plugins.entries()) {
      if (collector.full) break;
      const path = `plugins[${String(index)}]`;
      if (!isPlainRecord(requirement)) {
        collector.add(path, "A plugin requirement must be an object.");
        continue;
      }
      collector.exactKeys(requirement, PLUGIN_KEYS, path);
      const pluginId = parsePluginId(requirement.pluginId, `${path}.pluginId`);
      if (!pluginId.ok) collector.issues.push(...pluginId.issues);
      else {
        if (requirements.has(pluginId.value))
          collector.add(`${path}.pluginId`, "Plugin requirement IDs must be unique.");
        requirements.add(pluginId.value);
        if (!known.has(pluginId.value))
          collector.add(
            `${path}.pluginId`,
            `This build cannot open a project that requires plugin ${pluginId.value}.`,
          );
      }
      if (
        !Number.isSafeInteger(requirement.stateSchemaVersion) ||
        Number(requirement.stateSchemaVersion) < 1
      )
        collector.add(
          `${path}.stateSchemaVersion`,
          "State schema version must be a positive safe integer.",
        );
    }
  }

  const occupiedModules = new Map<string, string>();
  if (!Array.isArray(value.rack)) {
    collector.add("rack", "Rack must be an array.");
  } else {
    if (value.rack.length !== DOCUMENT_LIMITS.maximumRackSlots)
      collector.add(
        "rack",
        `Format 1 requires exactly ${String(DOCUMENT_LIMITS.maximumRackSlots)} rack slots.`,
      );
    for (const [index, slot] of value.rack.entries()) {
      if (collector.full) break;
      const path = `rack[${String(index)}]`;
      if (index >= DOCUMENT_LIMITS.maximumRackSlots) {
        collector.add(
          path,
          `The MVP rack holds ${String(DOCUMENT_LIMITS.maximumRackSlots)} slots.`,
        );
        continue;
      }
      if (!isPlainRecord(slot)) {
        collector.add(path, "Rack slot must be an object.");
        continue;
      }
      collector.exactKeys(slot, RACK_KEYS, path);
      if (slot.id !== RACK_SLOT_IDS[index])
        collector.add(`${path}.id`, `Expected fixed slot ${RACK_SLOT_IDS[index]}.`);
      const hasModule = slot.moduleId !== undefined;
      if (!hasModule) {
        for (const key of ["pluginId", "parameters", "muted", "solo", "level", "pan"]) {
          if (slot[key] !== undefined)
            collector.add(`${path}.${key}`, "Empty slots must not contain module state.");
        }
        continue;
      }
      if (!isCanonicalUuid(slot.moduleId))
        collector.add(`${path}.moduleId`, "Expected a lowercase canonical UUID version 4.");
      else if (occupiedModules.has(slot.moduleId))
        collector.add(`${path}.moduleId`, "Module instance IDs must be unique.");
      const parsedPlugin = parsePluginId(slot.pluginId, `${path}.pluginId`);
      let parameterDescriptors: readonly ImportParameterDescriptor[] | undefined;
      if (!parsedPlugin.ok) collector.issues.push(...parsedPlugin.issues);
      else {
        if (!requirements.has(parsedPlugin.value))
          collector.add(`${path}.pluginId`, "Rack plugin has no matching requirement.");
        parameterDescriptors = options.parameterDescriptorsByPluginId[parsedPlugin.value];
        if (parameterDescriptors === undefined) {
          collector.add(
            `${path}.pluginId`,
            `This build has no parameter validation contract for plugin ${parsedPlugin.value}.`,
          );
        }
        if (typeof slot.moduleId === "string")
          occupiedModules.set(slot.moduleId, parsedPlugin.value);
      }
      if (!isPlainRecord(slot.parameters))
        collector.add(`${path}.parameters`, "Module parameters must be an object.");
      else
        for (const [id, parameter] of Object.entries(slot.parameters)) {
          const parsedId = parseParameterId(id, `${path}.parameters.${id}`);
          if (!parsedId.ok) collector.issues.push(...parsedId.issues);
          else if (parameterDescriptors !== undefined) {
            const descriptor = parameterDescriptors.find((entry) => entry.id === parsedId.value);
            if (descriptor === undefined) {
              collector.add(
                `${path}.parameters.${id}`,
                "Parameter ID is not declared by the registered plugin.",
              );
            } else {
              validateImportedParameter(
                parameter,
                descriptor,
                `${path}.parameters.${id}`,
                collector,
              );
            }
          } else if (!(
            typeof parameter === "boolean" ||
            typeof parameter === "string" ||
            finiteNumber(parameter, -Number.MAX_VALUE, Number.MAX_VALUE)
          )) {
            collector.add(
              `${path}.parameters.${id}`,
              "Parameter value must be a finite JSON scalar.",
            );
          }
        }
      if (typeof slot.muted !== "boolean") collector.add(`${path}.muted`, "Muted must be boolean.");
      if (typeof slot.solo !== "boolean") collector.add(`${path}.solo`, "Solo must be boolean.");
      if (!finiteNumber(slot.level, 0, 1))
        collector.add(`${path}.level`, "Level must be from 0 through 1.");
      if (!finiteNumber(slot.pan, -1, 1))
        collector.add(`${path}.pan`, "Pan must be from -1 through 1.");
    }
  }

  const patternKeys = new Set<string>();
  let stepRecords = 0;
  if (!Array.isArray(value.patterns)) {
    collector.add("patterns", "Patterns must be an array.");
  } else {
    for (const [index, pattern] of value.patterns.entries()) {
      if (collector.full) break;
      const path = `patterns[${String(index)}]`;
      if (!isPlainRecord(pattern)) {
        collector.add(path, "A pattern must be an object.");
        continue;
      }
      collector.exactKeys(pattern, PATTERN_KEYS, path);
      if (typeof pattern.id !== "string" || pattern.id.length === 0 || patternKeys.has(pattern.id))
        collector.add(`${path}.id`, "Pattern record ID must be a unique non-empty string.");
      else patternKeys.add(pattern.id);
      if (!isCanonicalUuid(pattern.moduleId) || !occupiedModules.has(pattern.moduleId))
        collector.add(
          `${path}.moduleId`,
          "Pattern module reference must resolve to an occupied rack module.",
        );
      if (!validName(pattern.name))
        collector.add(`${path}.name`, "Pattern name must contain 1 through 256 characters.");
      if (
        !Number.isSafeInteger(pattern.length) ||
        Number(pattern.length) < 1 ||
        Number(pattern.length) > 64
      )
        collector.add(`${path}.length`, "Pattern length must be from 1 through 64.");
      if (
        pattern.patternIndex !== undefined &&
        (!Number.isSafeInteger(pattern.patternIndex) ||
          Number(pattern.patternIndex) < 0 ||
          Number(pattern.patternIndex) >= PATTERN_SLOT_COUNT)
      )
        collector.add(
          `${path}.patternIndex`,
          `Pattern index must be from 0 through ${String(PATTERN_SLOT_COUNT - 1)}.`,
        );
      if (pattern.humanize !== undefined && !finiteNumber(pattern.humanize, 0, 100))
        collector.add(`${path}.humanize`, "Humanize must be between 0 and 100 percent.");
      if (
        pattern.seed !== undefined &&
        (!Number.isSafeInteger(pattern.seed) ||
          Number(pattern.seed) < 0 ||
          Number(pattern.seed) > 0xffff_ffff)
      )
        collector.add(`${path}.seed`, "A Pattern seed must be an unsigned 32-bit integer.");
      if (!Array.isArray(pattern.steps)) {
        collector.add(`${path}.steps`, "A pattern needs a step list.");
        continue;
      }
      if (pattern.steps.length < 1 || pattern.steps.length > DOCUMENT_LIMITS.maximumPatternSteps)
        collector.add(`${path}.steps`, "Pattern exceeds its step limit.");
      stepRecords += pattern.steps.length;
      for (const [stepIndex, step] of pattern.steps.entries()) {
        if (stepIndex >= DOCUMENT_LIMITS.maximumPatternSteps) break;
        const stepPath = `${path}.steps[${String(stepIndex)}]`;
        if (!isPlainRecord(step)) {
          collector.add(stepPath, "A step record is malformed.");
          continue;
        }
        collector.exactKeys(step, STEP_KEYS, stepPath);
        if (
          !isStep(step) ||
          !Number.isInteger(step.note) ||
          step.note < 0 ||
          step.note > 127 ||
          step.velocity < 0 ||
          step.velocity > 1
        )
          collector.add(stepPath, "A step record is malformed or outside its range.");
      }
    }
  }
  if (stepRecords > DOCUMENT_LIMITS.maximumEventRecords)
    collector.add("patterns", "The document exceeds its total event-record limit.");
  for (const requirement of requirements) {
    if (![...occupiedModules.values()].includes(requirement)) {
      collector.add(
        "plugins",
        `Plugin requirement ${requirement} is not referenced by a rack module.`,
      );
    }
  }

  if (!Array.isArray(value.song)) collector.add("song", "Song must be an array.");
  else {
    // The editor caps the chain, and the scheduler expands it by repeat count,
    // so an imported chain must not be able to exceed what a user could build.
    if (value.song.length > DOCUMENT_LIMITS.maximumSongEntries)
      collector.add(
        "song",
        `A song holds at most ${String(DOCUMENT_LIMITS.maximumSongEntries)} steps.`,
      );
    for (const [index, entry] of value.song.entries()) {
      if (collector.full) break;
      const path = `song[${String(index)}]`;
      if (!isPlainRecord(entry)) {
        collector.add(path, "Song entry must be an object.");
        continue;
      }
      collector.exactKeys(entry, SONG_KEYS, path);
      if (
        !Number.isSafeInteger(entry.patternIndex) ||
        Number(entry.patternIndex) < 0 ||
        Number(entry.patternIndex) >= PATTERN_SLOT_COUNT
      )
        collector.add(`${path}.patternIndex`, "Song pattern index is out of range.");
      if (
        !Number.isSafeInteger(entry.repeats) ||
        Number(entry.repeats) < 1 ||
        Number(entry.repeats) > DOCUMENT_LIMITS.maximumSongRepeats
      )
        collector.add(
          `${path}.repeats`,
          `Repeat count must be from 1 through ${String(DOCUMENT_LIMITS.maximumSongRepeats)}.`,
        );
    }
  }
  if (value.songEnabled !== undefined && typeof value.songEnabled !== "boolean")
    collector.add("songEnabled", "Song enabled must be boolean.");
  if (
    value.activePatternIndex !== undefined &&
    (!Number.isSafeInteger(value.activePatternIndex) ||
      Number(value.activePatternIndex) < 0 ||
      Number(value.activePatternIndex) >= PATTERN_SLOT_COUNT)
  )
    collector.add("activePatternIndex", "Active Pattern index is out of range.");
  if (!isPlainRecord(value.mixer)) collector.add("mixer", "Mixer must be an object.");
  else {
    collector.exactKeys(value.mixer, new Set(["masterLevel"]), "mixer");
    if (value.mixer.masterLevel !== undefined && !finiteNumber(value.mixer.masterLevel, 0, 1))
      collector.add("mixer.masterLevel", "Master level must be from 0 through 1.");
  }
  for (const key of ["automation", "assets", "migrations"] as const) {
    const field = value[key];
    if (!Array.isArray(field)) collector.add(key, `${key} must be an array.`);
    else if (field.length > 0)
      collector.add(key, `${key} records are not supported by this build.`);
  }
  if (!isPlainRecord(value.effects) || Object.keys(value.effects).length > 0)
    collector.add("effects", "Effects must be an empty object in this build.");

  return collector.issues.length === 0
    ? { ok: true, value: migrateDocument(value as unknown as ProjectDocument) }
    : { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
}

class JsonDuplicateKeyScanner {
  readonly #collector = new IssueCollector();
  readonly #numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  #index = 0;

  constructor(readonly json: string) {}

  scan(): { readonly validSyntax: boolean; readonly issues: readonly ValidationIssue[] } {
    this.#skipWhitespace();
    const valid = this.#value("$", 0);
    this.#skipWhitespace();
    return {
      validSyntax: valid && this.#index === this.json.length,
      issues: this.#collector.issues,
    };
  }

  #value(path: string, depth: number): boolean {
    if (depth > 32) {
      this.#collector.add(path, "JSON nesting exceeds 32 containers.");
      return false;
    }
    const character = this.json[this.#index];
    if (character === "{") return this.#object(path, depth);
    if (character === "[") return this.#array(path, depth);
    if (character === '"') return this.#string() !== undefined;
    if (character === "t") return this.#literal("true");
    if (character === "f") return this.#literal("false");
    if (character === "n") return this.#literal("null");
    return this.#number();
  }

  #object(path: string, depth: number): boolean {
    this.#index += 1;
    this.#skipWhitespace();
    if (this.json[this.#index] === "}") {
      this.#index += 1;
      return true;
    }
    const keys = new Set<string>();
    while (this.#index < this.json.length) {
      const key = this.#string();
      if (key === undefined) return false;
      const keyPath = `${path}.${key}`;
      if (keys.has(key)) this.#collector.add(keyPath, `Duplicate object key ${key}.`);
      else keys.add(key);
      this.#skipWhitespace();
      if (this.json[this.#index] !== ":") return false;
      this.#index += 1;
      this.#skipWhitespace();
      if (!this.#value(keyPath, depth + 1)) return false;
      this.#skipWhitespace();
      const separator = this.json[this.#index];
      if (separator === "}") {
        this.#index += 1;
        return true;
      }
      if (separator !== ",") return false;
      this.#index += 1;
      this.#skipWhitespace();
    }
    return false;
  }

  #array(path: string, depth: number): boolean {
    this.#index += 1;
    this.#skipWhitespace();
    if (this.json[this.#index] === "]") {
      this.#index += 1;
      return true;
    }
    let item = 0;
    while (this.#index < this.json.length) {
      if (!this.#value(`${path}[${String(item)}]`, depth + 1)) return false;
      item += 1;
      this.#skipWhitespace();
      const separator = this.json[this.#index];
      if (separator === "]") {
        this.#index += 1;
        return true;
      }
      if (separator !== ",") return false;
      this.#index += 1;
      this.#skipWhitespace();
    }
    return false;
  }

  #string(): string | undefined {
    if (this.json[this.#index] !== '"') return undefined;
    const start = this.#index;
    this.#index += 1;
    while (this.#index < this.json.length) {
      const character = this.json[this.#index];
      if (character === '"') {
        this.#index += 1;
        try {
          return JSON.parse(this.json.slice(start, this.#index)) as string;
        } catch {
          return undefined;
        }
      }
      if (character === "\\") {
        this.#index += 2;
      } else {
        this.#index += 1;
      }
    }
    return undefined;
  }

  #literal(value: "true" | "false" | "null"): boolean {
    if (!this.json.startsWith(value, this.#index)) return false;
    this.#index += value.length;
    return true;
  }

  #number(): boolean {
    this.#numberPattern.lastIndex = this.#index;
    const match = this.#numberPattern.exec(this.json);
    if (match === null) return false;
    this.#index = this.#numberPattern.lastIndex;
    return true;
  }

  #skipWhitespace(): void {
    while (
      this.json[this.#index] === " " ||
      this.json[this.#index] === "\t" ||
      this.json[this.#index] === "\n" ||
      this.json[this.#index] === "\r"
    ) {
      this.#index += 1;
    }
  }
}

export function parseProjectJson(
  json: string,
  options: ParseOptions,
): DocumentResult<ProjectDocument> {
  if (json.length > DOCUMENT_LIMITS.maximumBytes) {
    return failure("$", "The project file exceeds its size limit.");
  }
  const lexical = new JsonDuplicateKeyScanner(json).scan();
  if (lexical.issues.length > 0) return { ok: false, issues: lexical.issues };
  if (!lexical.validSyntax) return failure("$", "The project file is not valid JSON.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return failure("$", "The project file is not valid JSON.");
  }
  return parseProjectDocument(parsed, options);
}

type DocumentMigration = (document: ProjectDocument) => ProjectDocument;

/**
 * Ordered upgrades from one format version to the next. Empty until format 2
 * ships; the chain exists so adding one is a data change, not a redesign.
 */
const DOCUMENT_MIGRATIONS: ReadonlyMap<number, DocumentMigration> = new Map();

function migrateDocument(document: ProjectDocument): ProjectDocument {
  let current = document;
  while (current.formatVersion < PROJECT_FORMAT_VERSION) {
    const migration = DOCUMENT_MIGRATIONS.get(current.formatVersion);
    if (migration === undefined) break;
    current = migration(current);
  }
  return current;
}

/**
 * Rebuilds store state from a validated document. Every identifier it needs is
 * already in the document, so no ID factory is involved.
 */
export function documentToState(document: ProjectDocument, base: Readonly<PulseState>): PulseState {
  const slotCount = Math.max(base.project.patterns.length, PATTERN_SLOT_COUNT);

  // A record without `patternIndex` comes from a format-1 document, where each
  // module had exactly one pattern. Those land in slot 0 and the rest go silent.
  const partsByModule = new Map<string, (readonly PatternStep[])[]>();
  for (const record of document.patterns) {
    const index = record.patternIndex ?? 0;
    if (!Number.isInteger(index) || index < 0 || index >= slotCount) continue;
    const parts =
      partsByModule.get(record.moduleId) ??
      Array.from<readonly PatternStep[]>({ length: slotCount });
    parts[index] = Object.freeze(record.steps.map((step) => Object.freeze({ ...step })));
    partsByModule.set(record.moduleId, parts);
  }

  const modules: Record<string, RackModuleState> = {};
  for (const slot of document.rack) {
    if (slot.moduleId === undefined || slot.pluginId === undefined) continue;
    const stored = partsByModule.get(slot.moduleId) ?? [];
    modules[slot.moduleId] = Object.freeze({
      id: slot.moduleId,
      pluginId: slot.pluginId,
      parameters: Object.freeze({ ...slot.parameters }),
      parts: Object.freeze(
        Array.from({ length: slotCount }, (_, index) => stored[index] ?? createSilentSteps()),
      ),
      muted: slot.muted ?? false,
      solo: slot.solo ?? false,
      level: clampUnit(slot.level, DEFAULT_MODULE_LEVEL, 0),
      pan: clampUnit(slot.pan, 0, -1),
    } as RackModuleState);
  }

  const firstModuleId = Object.keys(modules)[0];
  const namesByIndex = new Map<number, PatternDocument>();
  for (const record of document.patterns) namesByIndex.set(record.patternIndex ?? 0, record);

  const activePatternIndex =
    Number.isInteger(document.activePatternIndex) &&
    (document.activePatternIndex ?? 0) >= 0 &&
    (document.activePatternIndex ?? 0) < slotCount
      ? (document.activePatternIndex ?? 0)
      : 0;

  return Object.freeze({
    ...base,
    project: Object.freeze({
      ...base.project,
      id: document.project.id,
      lineageId: document.project.lineageId,
      name: document.project.name,
      tempo: document.project.tempo,
      swing: clampUnit(
        typeof document.project.swing === "number" ? document.project.swing / 100 : undefined,
        0,
        0,
      ),
      masterLevel: clampUnit(document.mixer.masterLevel, DEFAULT_MASTER_LEVEL, 0),
      rackSlots: Object.freeze(
        document.rack.map((slot) =>
          Object.freeze(
            slot.moduleId === undefined
              ? { id: slot.id }
              : { id: slot.id, moduleId: slot.moduleId },
          ),
        ),
      ),
      modules: Object.freeze(modules),
      patterns: Object.freeze(
        Array.from({ length: slotCount }, (_, index) => {
          const existing = base.project.patterns[index];
          const record = namesByIndex.get(index);
          return Object.freeze({
            id: existing?.id ?? (`${document.project.id}-pattern-${String(index)}` as PatternId),
            name: record?.name ?? existing?.name ?? `Pattern ${String(index + 1)}`,
            length: record?.length ?? existing?.length ?? PATTERN_STEP_COUNT,
            // An old document has no Humanize record: it keeps playing
            // mechanically instead of adopting the new-project default.
            humanize: clampUnit(
              typeof record?.humanize === "number" ? record.humanize / 100 : undefined,
              0,
              0,
            ),
            seed:
              typeof record?.seed === "number" && Number.isSafeInteger(record.seed)
                ? record.seed
                : Math.imul(index + 1, 0x9e3779b1) >>> 0,
          });
        }),
      ),
      activePatternIndex,
      song: Object.freeze({
        enabled: document.songEnabled === true,
        entries: Object.freeze(
          document.song
            .filter(
              (entry) =>
                Number.isInteger(entry.patternIndex) &&
                entry.patternIndex >= 0 &&
                entry.patternIndex < slotCount &&
                Number.isInteger(entry.repeats) &&
                entry.repeats >= 1,
            )
            .map((entry) => Object.freeze({ ...entry })),
        ),
      }),
    }),
    ui: Object.freeze({
      ...base.ui,
      selectedModuleId: firstModuleId,
    }),
  } as PulseState);
}

function clampUnit(value: unknown, fallback: number, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(minimum, value));
}
