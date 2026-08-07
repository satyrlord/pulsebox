import {
  RACK_SLOT_IDS,
  isCanonicalUuid,
  type AutomationLaneId,
  type EffectInstanceId,
  type ModuleInstanceId,
  type PatternId,
  type ProjectRevision,
  type VoiceId,
} from "../../contracts/ids";
import type { EffectInstanceState, EffectsState } from "../../contracts/effects";
import {
  parseParameterId,
  parsePluginId,
  type ParameterDescriptor,
  type ParameterValue,
  type PluginId,
} from "../../contracts/parameters";
import { isPlainRecord, type ValidationIssue } from "../../contracts/validation";
import {
  DEFAULT_MASTER_LEVEL,
  DEFAULT_MODULE_LEVEL,
  MAXIMUM_PATTERN_COUNT,
  MINIMUM_PATTERN_COUNT,
} from "../default-state";
import {
  PATTERN_TICKS_PER_STEP,
  PATTERN_SCALES,
  type AutomationLaneState,
  type PatternEvent,
  type PatternPartState,
  type PatternScale,
  type PulseState,
  type RackModuleState,
  type VoiceCycleLengthKey,
} from "../model";

/**
 * The on-disk project document, per `docs/PROJECT-FORMAT.md` section 5.
 *
 * Only implemented data carries values. The other root fields stay present so
 * the validator can reject unknown root keys.
 */

export const PROJECT_FORMAT = "pulsebox-project";
export const PROJECT_FORMAT_VERSION = 2;

/** Guards a hostile or corrupt file before any of it is trusted. */
export const DOCUMENT_LIMITS = {
  /** PROJECT-FORMAT.md section 4.3: the project manifest is at most 8 MiB. */
  maximumBytes: 8 * 1024 * 1024,
  maximumRackSlots: RACK_SLOT_IDS.length,
  maximumPatternSteps: 64,
  maximumPatterns: MAXIMUM_PATTERN_COUNT,
  maximumEventRecords: 1_000_000,
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
  /**
   * Persisted favorite flag. The MVP has no control that sets it, so it is
   * always false. The post-MVP Favourite feature owns the interface for it.
   */
  readonly favorite: boolean;
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
  readonly name: string;
  readonly color: string;
  readonly durationBars: number;
  readonly scale: PatternScale;
  readonly humanize: number;
  readonly seed: number;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly automationLaneIds: readonly string[];
  readonly parts: readonly PatternPartDocument[];
}

export interface PatternPartDocument {
  readonly moduleId: string;
  readonly length: number;
  readonly voiceCycleLengths: Readonly<Record<string, number>>;
  readonly events: readonly PatternEvent[];
  readonly automationLaneIds: readonly string[];
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

export interface SongPlacementDocument {
  readonly id: string;
  readonly patternId: string;
  readonly repeatCount: number;
}

export interface SongDocument {
  readonly enabled: boolean;
  readonly playlist: readonly SongPlacementDocument[];
}

export interface AutomationStepDocument {
  readonly tick: number;
  readonly value: ParameterValue;
}

export interface AutomationLaneDocument {
  readonly id: string;
  readonly scope: "module";
  readonly targetId: string;
  readonly parameterId: string;
  readonly patternId: string;
  readonly stepTicks: number;
  readonly steps: readonly AutomationStepDocument[];
}

export interface MixerDocument {
  readonly masterLevel?: number;
}

export interface EffectInstanceDocument {
  readonly id: string;
  readonly pluginId: string;
  readonly stateVersion: number;
  readonly state: Readonly<Record<string, ParameterValue>>;
}

export interface VoiceInsertDocument {
  readonly moduleId: string;
  readonly voiceId: string;
  readonly effectInstanceId: string | null;
}

export interface EffectsDocument {
  readonly instances: readonly EffectInstanceDocument[];
  readonly voiceInserts: readonly VoiceInsertDocument[];
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
  readonly song: SongDocument;
  readonly activePatternId: string;
  readonly automation: readonly AutomationLaneDocument[];
  readonly mixer: MixerDocument;
  readonly effects: EffectsDocument;
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
  "activePatternId",
  "automation",
  "mixer",
  "effects",
  "assets",
  "migrations",
]);
const FORMAT_ONE_ROOT_KEYS = new Set([
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
const FORMAT_ONE_PATTERN_KEYS = new Set([
  "id",
  "moduleId",
  "name",
  "length",
  "patternIndex",
  "humanize",
  "seed",
  "events",
]);
const FORMAT_ONE_SONG_ENTRY_KEYS = new Set(["patternIndex", "repeats"]);
const MIGRATION_KEYS = new Set(["scope", "id", "fromVersion", "toVersion", "implementation"]);
const FORMAT_ONE_MIGRATION_ID = "project-format-1-to-2-pattern-bank";

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
  readonly manifestVersionFor?: (pluginId: string) => number;
}

export function serializeProject(
  state: Readonly<PulseState>,
  options: SerializeOptions,
): ProjectDocument {
  const project = state.project;
  const modules = Object.values(project.modules);
  const versionFor = options.manifestVersionFor ?? (() => 1);

  const effectInstances = Object.values(project.effects.instances);
  const plugins = [...new Set([...modules.map((module) => module.pluginId), ...effectInstances.map((instance) => instance.pluginId)])].map((pluginId) => ({
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
      // No MVP control sets this; the post-MVP Favourite feature will.
      favorite: false,
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
    patterns: project.patterns.map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      color: pattern.color,
      durationBars: pattern.durationBars,
      scale: pattern.scale,
      humanize: Math.round(pattern.humanize * 100),
      seed: pattern.seed,
      createdAt: pattern.createdAt,
      modifiedAt: pattern.modifiedAt,
      automationLaneIds: [...pattern.automationLaneIds],
      parts: Object.values(pattern.parts).map((part) => ({
        moduleId: part.moduleId,
        length: part.length,
        voiceCycleLengths: { ...part.voiceCycleLengths },
        events: part.events.map((event) => ({ ...event, data: { ...event.data } })),
        automationLaneIds: [...part.automationLaneIds],
      })),
    })),
    song: {
      enabled: project.song.enabled,
      playlist: project.song.placements.map((placement) => ({ ...placement })),
    },
    activePatternId: project.activePatternId,
    automation: Object.values(project.automationLanes).map((lane) => ({
      ...lane,
      steps: lane.steps.map((step) => ({ ...step })),
    })),
    mixer: { masterLevel: project.masterLevel },
    effects: {
      instances: effectInstances
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .map((instance) => ({
          id: instance.id,
          pluginId: instance.pluginId,
          stateVersion: instance.stateVersion,
          state: { ...instance.state },
        })),
      voiceInserts: Object.entries(project.effects.voiceInserts)
        .flatMap(([moduleId, slots]) =>
          Object.entries(slots).map(([voiceId, effectInstanceId]) => ({
            moduleId,
            voiceId,
            effectInstanceId,
          })),
        )
        .toSorted(
          (left, right) =>
            left.moduleId.localeCompare(right.moduleId) || left.voiceId.localeCompare(right.voiceId),
        ),
    },
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

function isPatternEventData(value: unknown): value is PatternEvent["data"] {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.note === "number" &&
    Number.isFinite(value.note) &&
    typeof value.velocity === "number" &&
    Number.isFinite(value.velocity) &&
    typeof value.accent === "boolean" &&
    typeof value.slide === "boolean" &&
    typeof value.probability === "number" &&
    Number.isFinite(value.probability) &&
    typeof value.microTimingTicks === "number" &&
    Number.isSafeInteger(value.microTimingTicks) &&
    typeof value.flam === "number" &&
    Number.isSafeInteger(value.flam) &&
    typeof value.roll === "number" &&
    Number.isSafeInteger(value.roll)
  );
}

function isPatternEvent(value: unknown): value is PatternEvent {
  if (!isPlainRecord(value) || !isPatternEventData(value.data)) return false;
  if (!(
    isCanonicalUuid(value.id) &&
    (value.type === "note" || value.type === "trigger") &&
    typeof value.positionTicks === "number" &&
    Number.isSafeInteger(value.positionTicks)
  )) {
    return false;
  }
  return value.type === "note"
    ? typeof value.durationTicks === "number" && Number.isSafeInteger(value.durationTicks)
    : value.durationTicks === undefined;
}

export interface ParseOptions {
  /** Instrument plugin IDs that the running build can place in a rack slot. */
  readonly knownPluginIds: readonly string[];
  /** Data-only parameter contracts copied from each registered plugin manifest. */
  readonly parameterDescriptorsByPluginId: Readonly<
    Record<string, readonly ImportParameterDescriptor[]>
  >;
  /** Effect IDs that the running build can instantiate in a drum voice slot. */
  readonly knownVoiceInsertEffectPluginIds?: readonly string[];
  /** Registered current state schema versions for every installed plugin. */
  readonly stateSchemaVersionByPluginId?: Readonly<Record<string, number>>;
  /** State contracts for effects that can occupy a drum voice insert slot. */
  readonly voiceInsertEffectsByPluginId?: Readonly<
    Record<string, ImportVoiceInsertEffectDescriptor>
  >;
  /** Stable drum voice IDs by instrument plugin. Pitched instruments omit an entry. */
  readonly voiceIdsByPluginId?: Readonly<Record<string, readonly string[]>>;
}

export type ImportParameterDescriptor = Pick<
  ParameterDescriptor,
  "id" | "valueType" | "minimum" | "maximum" | "enumValues"
>;

/**
 * The data-only effect state contract used at the import boundary. It matches
 * the persisted scalar state that a voice insert runtime can receive.
 */
export interface ImportVoiceInsertEffectDescriptor {
  readonly stateSchemaVersion: number;
  readonly parameters: readonly ImportParameterDescriptor[];
}

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
  "favorite",
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
  "name",
  "color",
  "durationBars",
  "scale",
  "humanize",
  "seed",
  "createdAt",
  "modifiedAt",
  "automationLaneIds",
  "parts",
]);
const PATTERN_PART_KEYS = new Set([
  "moduleId",
  "length",
  "voiceCycleLengths",
  "events",
  "automationLaneIds",
]);
const EVENT_KEYS = new Set(["id", "type", "positionTicks", "durationTicks", "data"]);
const EVENT_DATA_KEYS = new Set([
  "note",
  "velocity",
  "accent",
  "slide",
  "probability",
  "microTimingTicks",
  "flam",
  "roll",
]);
const SONG_KEYS = new Set(["enabled", "playlist"]);
const SONG_PLACEMENT_KEYS = new Set(["id", "patternId", "repeatCount"]);
const AUTOMATION_LANE_KEYS = new Set([
  "id",
  "scope",
  "targetId",
  "parameterId",
  "patternId",
  "stepTicks",
  "steps",
]);
const AUTOMATION_STEP_KEYS = new Set(["tick", "value"]);
const EFFECTS_KEYS = new Set(["instances", "voiceInserts"]);
const EFFECT_INSTANCE_KEYS = new Set(["id", "pluginId", "stateVersion", "state"]);
const VOICE_INSERT_KEYS = new Set(["moduleId", "voiceId", "effectInstanceId"]);

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

function validUuidList(value: unknown, path: string, collector: IssueCollector): value is readonly string[] {
  if (!Array.isArray(value)) {
    collector.add(path, "Expected a UUID list.");
    return false;
  }
  const ids = new Set<string>();
  for (const [index, id] of value.entries()) {
    if (!isCanonicalUuid(id) || ids.has(id)) {
      collector.add(`${path}[${String(index)}]`, "Expected a unique canonical UUID.");
    } else ids.add(id);
  }
  return true;
}

function isNumberNoteKey(value: string): boolean {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return false;
  const note = Number(value);
  return Number.isSafeInteger(note) && note >= 0 && note <= 127;
}

function validVoiceCycleLengths(
  value: unknown,
  path: string,
  collector: IssueCollector,
  voiceIds: readonly string[] | undefined,
): value is Readonly<Record<string, number>> {
  if (!isPlainRecord(value)) {
    collector.add(path, "Voice cycle lengths must be an object.");
    return false;
  }
  for (const [voiceKey, length] of Object.entries(value)) {
    if (voiceIds === undefined || voiceIds.length === 0 || (!voiceIds.includes(voiceKey) && !isNumberNoteKey(voiceKey))) {
      collector.add(`${path}.${voiceKey}`, "Voice cycle key must resolve to a drum voice or numeric note.");
    }
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > DOCUMENT_LIMITS.maximumPatternSteps
    ) {
      collector.add(`${path}.${voiceKey}`, "Voice cycle length must be from 1 through 64.");
    }
  }
  return true;
}

function validPatternEvent(value: unknown, partLength: number): value is PatternEvent {
  if (!isPatternEvent(value) || !Number.isSafeInteger(partLength) || partLength < 1 || partLength > 64)
    return false;
  const event = value;
  const data = event.data;
  if (
    !Number.isInteger(data.note) ||
    data.note < 0 ||
    data.note > 127 ||
    !finiteNumber(data.velocity, 0, 1) ||
    !finiteNumber(data.probability, 0, 1) ||
    typeof data.accent !== "boolean" ||
    typeof data.slide !== "boolean" ||
    !Number.isSafeInteger(data.microTimingTicks) ||
    data.microTimingTicks < -60 ||
    data.microTimingTicks > 60 ||
    !Number.isSafeInteger(data.flam) ||
    data.flam < 0 ||
    data.flam > 3 ||
    !Number.isSafeInteger(data.roll) ||
    data.roll < 0 ||
    data.roll > 7
  ) {
    return false;
  }
  const endTicks = partLength * PATTERN_TICKS_PER_STEP;
  if (
    event.positionTicks < 0 ||
    event.positionTicks % PATTERN_TICKS_PER_STEP !== 0 ||
    event.positionTicks >= endTicks
  ) {
    return false;
  }
  return event.type !== "note" ||
    (event.durationTicks > 0 &&
      event.durationTicks % PATTERN_TICKS_PER_STEP === 0 &&
      event.positionTicks + event.durationTicks <= endTicks);
}

function validateAutomationLanes(
  lanes: readonly unknown[],
  collector: IssueCollector,
  patternIds: ReadonlySet<string>,
  occupiedModules: ReadonlyMap<string, string>,
  options: ParseOptions,
): void {
  const laneIds = new Set<string>();
  for (const [index, lane] of lanes.entries()) {
    const path = `automation[${String(index)}]`;
    if (!isPlainRecord(lane)) {
      collector.add(path, "Automation lane must be an object.");
      continue;
    }
    collector.exactKeys(lane, AUTOMATION_LANE_KEYS, path);
    if (!isCanonicalUuid(lane.id) || laneIds.has(lane.id))
      collector.add(`${path}.id`, "Automation lane IDs must be unique canonical UUIDs.");
    else laneIds.add(lane.id);
    if (lane.scope !== "module") collector.add(`${path}.scope`, "Only module automation is supported.");
    if (!isCanonicalUuid(lane.targetId) || !occupiedModules.has(lane.targetId))
      collector.add(`${path}.targetId`, "Automation target must resolve to an occupied module.");
    if (typeof lane.parameterId !== "string" || lane.parameterId.length === 0)
      collector.add(`${path}.parameterId`, "Automation parameter ID must not be empty.");
    const pluginId = typeof lane.targetId === "string" ? occupiedModules.get(lane.targetId) : undefined;
    const descriptor =
      pluginId === undefined || typeof lane.parameterId !== "string"
        ? undefined
        : options.parameterDescriptorsByPluginId[pluginId]?.find(
            (candidate) => candidate.id === lane.parameterId,
          );
    if (pluginId !== undefined && descriptor === undefined) {
      collector.add(`${path}.parameterId`, "Automation parameter is not declared by the target module plugin.");
    }
    if (!isCanonicalUuid(lane.patternId) || !patternIds.has(lane.patternId))
      collector.add(`${path}.patternId`, "Automation Pattern reference must resolve in this project.");
    if (lane.stepTicks !== PATTERN_TICKS_PER_STEP)
      collector.add(`${path}.stepTicks`, "Automation step size must be 240 ticks.");
    if (!Array.isArray(lane.steps)) {
      collector.add(`${path}.steps`, "Automation steps must be an array.");
      continue;
    }
    const ticks = new Set<number>();
    let greatestTick = -1;
    for (const [stepIndex, step] of lane.steps.entries()) {
      const stepPath = `${path}.steps[${String(stepIndex)}]`;
      if (!isPlainRecord(step)) {
        collector.add(stepPath, "Automation step must be an object.");
        continue;
      }
      collector.exactKeys(step, AUTOMATION_STEP_KEYS, stepPath);
      const invalidTick =
        typeof step.tick !== "number" ||
        !Number.isSafeInteger(step.tick) ||
        step.tick < 0 ||
        step.tick % PATTERN_TICKS_PER_STEP !== 0;
      if (invalidTick || (typeof step.tick === "number" && ticks.has(step.tick))) {
        collector.add(`${stepPath}.tick`, "Automation ticks must be unique non-negative 1/16 steps.");
      } else if (typeof step.tick === "number") {
        if (step.tick <= greatestTick) {
          collector.add(`${stepPath}.tick`, "Automation steps must be in increasing tick order.");
        }
        ticks.add(step.tick);
        greatestTick = Math.max(greatestTick, step.tick);
      }
      if (
        !(typeof step.value === "number" && Number.isFinite(step.value)) &&
        typeof step.value !== "string" &&
        typeof step.value !== "boolean"
      )
        collector.add(`${stepPath}.value`, "Automation value must be a finite JSON scalar.");
      else if (descriptor !== undefined) {
        const message = validateImportedParameter(step.value, descriptor);
        if (message !== undefined) collector.add(`${stepPath}.value`, message);
      }
    }
  }
}

function validateAutomationStepBounds(
  patterns: readonly unknown[],
  lanes: readonly unknown[],
  collector: IssueCollector,
): void {
  const laneById = new Map<string, { readonly lane: Readonly<Record<string, unknown>>; readonly index: number }>();
  for (const [index, lane] of lanes.entries()) {
    if (!isPlainRecord(lane) || typeof lane.id !== "string" || laneById.has(lane.id)) continue;
    laneById.set(lane.id, { lane, index });
  }
  for (const pattern of patterns) {
    if (!isPlainRecord(pattern) || !Array.isArray(pattern.parts)) continue;
    for (const part of pattern.parts) {
      const length = isPlainRecord(part) ? part.length : undefined;
      if (
        !isPlainRecord(part) ||
        typeof part.moduleId !== "string" ||
        typeof length !== "number" ||
        !Number.isSafeInteger(length) ||
        length < 1 ||
        !Array.isArray(part.automationLaneIds)
      ) {
        continue;
      }
      for (const laneId of part.automationLaneIds) {
        if (typeof laneId !== "string") continue;
        const record = laneById.get(laneId);
        if (record === undefined || !Array.isArray(record.lane.steps)) continue;
        for (const [stepIndex, step] of record.lane.steps.entries()) {
          if (!isPlainRecord(step) || typeof step.tick !== "number") continue;
          if (step.tick >= length * PATTERN_TICKS_PER_STEP) {
            collector.add(
              `automation[${String(record.index)}].steps[${String(stepIndex)}].tick`,
              "Automation step must stay inside its Pattern part length.",
            );
          }
        }
      }
    }
  }
}

function validateAutomationReferences(
  patterns: readonly unknown[],
  lanes: readonly unknown[],
  collector: IssueCollector,
): void {
  const lanesById = new Map<string, Readonly<Record<string, unknown>>>();
  const laneIndexes = new Map<string, number>();
  for (const [index, lane] of lanes.entries()) {
    if (!isPlainRecord(lane) || typeof lane.id !== "string" || lanesById.has(lane.id)) continue;
    lanesById.set(lane.id, lane);
    laneIndexes.set(lane.id, index);
  }
  const patternLaneIds = new Map<string, Set<string>>();
  const partLaneIds = new Map<string, Set<string>>();
  for (const [patternIndex, pattern] of patterns.entries()) {
    if (!isPlainRecord(pattern) || typeof pattern.id !== "string") continue;
    const patternPath = `patterns[${String(patternIndex)}]`;
    patternLaneIds.set(pattern.id, laneIdSet(pattern.automationLaneIds));
    validateLaneReferenceList(
      pattern.automationLaneIds,
      `${patternPath}.automationLaneIds`,
      pattern.id,
      undefined,
      lanesById,
      collector,
    );
    if (!Array.isArray(pattern.parts)) continue;
    for (const [partIndex, part] of pattern.parts.entries()) {
      if (!isPlainRecord(part) || typeof part.moduleId !== "string") continue;
      partLaneIds.set(
        automationOwnerKey(pattern.id, part.moduleId),
        laneIdSet(part.automationLaneIds),
      );
      validateLaneReferenceList(
        part.automationLaneIds,
        `${patternPath}.parts[${String(partIndex)}].automationLaneIds`,
        pattern.id,
        part.moduleId,
        lanesById,
        collector,
      );
    }
  }
  for (const [laneId, lane] of lanesById) {
    if (typeof lane.patternId !== "string" || typeof lane.targetId !== "string") continue;
    const path = `automation[${String(laneIndexes.get(laneId) ?? 0)}].id`;
    if (!patternLaneIds.get(lane.patternId)?.has(laneId)) {
      collector.add(path, "Automation lane must be referenced by its owning Pattern.");
    }
    if (!partLaneIds.get(automationOwnerKey(lane.patternId, lane.targetId))?.has(laneId)) {
      collector.add(path, "Automation lane must be referenced by its owning Pattern part.");
    }
  }
}

function laneIdSet(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
}

function automationOwnerKey(patternId: string, moduleId: string): string {
  return `${patternId}\t${moduleId}`;
}

function validateLaneReferenceList(
  value: unknown,
  path: string,
  patternId: string,
  moduleId: string | undefined,
  lanesById: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  collector: IssueCollector,
): void {
  if (!Array.isArray(value)) return;
  for (const [index, rawId] of value.entries()) {
    if (typeof rawId !== "string") continue;
    const lane = lanesById.get(rawId);
    if (lane === undefined) {
      collector.add(`${path}[${String(index)}]`, "Automation lane reference does not resolve.");
    } else if (lane.patternId !== patternId || (moduleId !== undefined && lane.targetId !== moduleId)) {
      collector.add(`${path}[${String(index)}]`, "Automation lane reference has the wrong Pattern or module owner.");
    }
  }
}

function validatePatternEventConflicts(
  events: readonly PatternEvent[],
  patternPath: string,
  collector: IssueCollector,
): void {
  const types = new Set(events.map((event) => event.type));
  if (types.size > 1) {
    collector.add(`${patternPath}.events`, "A Pattern part cannot mix notes and triggers.");
    return;
  }
  const sorted = [...events].sort(
    (left, right) =>
      left.positionTicks - right.positionTicks ||
      left.data.note - right.data.note ||
      left.id.localeCompare(right.id),
  );
  if (sorted[0]?.type === "note") {
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (
        previous !== undefined &&
        current !== undefined &&
        previous.positionTicks + (previous.durationTicks ?? 0) > current.positionTicks
      ) {
        collector.add(`${patternPath}.events`, "Monophonic notes cannot overlap.");
        return;
      }
    }
    return;
  }
  const occupied = new Set<string>();
  for (const event of sorted) {
    const key = `${String(event.positionTicks)}:${String(event.data.note)}`;
    if (occupied.has(key)) {
      collector.add(
        `${patternPath}.events`,
        "A drum voice cannot have two triggers at the same step.",
      );
      return;
    }
    occupied.add(key);
  }
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

/**
 * Validates one parameter value against its declared descriptor. Returns the
 * rejection message, or undefined when the value is valid. Import parsing and
 * the `createParameterValidator` live-command policy share this one check.
 */
function validateImportedParameter(
  value: unknown,
  descriptor: ImportParameterDescriptor,
): string | undefined {
  if (descriptor.valueType === "boolean") {
    return typeof value === "boolean" ? undefined : "Expected a boolean parameter value.";
  }
  if (descriptor.valueType === "enum") {
    return typeof value === "string" && descriptor.enumValues?.includes(value) === true
      ? undefined
      : "Expected one of the parameter's declared enum values.";
  }
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    return "Expected a finite numeric parameter value.";
  }
  if (descriptor.valueType === "integer" && !Number.isInteger(value)) {
    return "Expected an integer parameter value.";
  }
  if (
    (descriptor.minimum !== undefined && value < descriptor.minimum) ||
    (descriptor.maximum !== undefined && value > descriptor.maximum)
  ) {
    return "Parameter value is outside its registered range.";
  }
  return undefined;
}

/**
 * Builds the store's live-command parameter validator from declared parameter
 * descriptors. Import parsing and live dispatch share
 * `validateImportedParameter`, so both paths accept exactly the same values and
 * no second, laxer policy can exist.
 */
export function createParameterValidator(
  descriptorsFor: (pluginId: string) => readonly ImportParameterDescriptor[] | undefined,
): (
  module: { readonly pluginId: string },
  parameter: string,
  value: number | boolean | string,
) => boolean {
  return (module, parameter, value) => {
    const descriptor = descriptorsFor(module.pluginId)?.find(
      (candidate) => candidate.id === parameter,
    );
    return descriptor !== undefined && validateImportedParameter(value, descriptor) === undefined;
  };
}

interface ParsedEffects {
  readonly document: EffectsDocument;
  readonly referencedPluginIds: ReadonlySet<string>;
}

function voiceSlotKey(moduleId: string, voiceId: string): string {
  return `${moduleId}\u0000${voiceId}`;
}

function expectedVoiceInsertDocuments(
  occupiedModules: ReadonlyMap<string, string>,
  options: ParseOptions,
): readonly VoiceInsertDocument[] {
  const voiceIdsByPluginId = options.voiceIdsByPluginId ?? {};
  return [...occupiedModules.entries()]
    .flatMap(([moduleId, pluginId]) =>
      (voiceIdsByPluginId[pluginId] ?? []).map((voiceId) => ({
        moduleId,
        voiceId,
        effectInstanceId: null,
      })),
    )
    .toSorted(
      (left, right) =>
        left.moduleId.localeCompare(right.moduleId) || left.voiceId.localeCompare(right.voiceId),
    );
}

function parseEffects(
  value: unknown,
  collector: IssueCollector,
  occupiedModules: ReadonlyMap<string, string>,
  requirements: ReadonlySet<string>,
  options: ParseOptions,
): ParsedEffects {
  const expectedSlots = expectedVoiceInsertDocuments(occupiedModules, options);
  const empty: ParsedEffects = {
    document: { instances: [], voiceInserts: expectedSlots },
    referencedPluginIds: new Set(),
  };
  if (!isPlainRecord(value)) {
    collector.add("effects", "Effects must be an object.");
    return empty;
  }
  // Existing phase-one documents wrote an empty object. Read it as the new
  // all-null slot set instead of making saved projects unreadable.
  if (Object.keys(value).length === 0) return empty;

  collector.exactKeys(value, EFFECTS_KEYS, "effects");
  const effectDescriptors = options.voiceInsertEffectsByPluginId ?? {};
  const knownEffectPlugins = new Set([
    ...(options.knownVoiceInsertEffectPluginIds ?? []),
    ...Object.keys(effectDescriptors),
  ]);
  const instances: EffectInstanceDocument[] = [];
  const instanceIds = new Set<string>();
  if (!Array.isArray(value.instances)) {
    collector.add("effects.instances", "Effect instances must be an array.");
  } else {
    for (const [index, instance] of value.instances.entries()) {
      if (collector.full) break;
      const path = `effects.instances[${String(index)}]`;
      if (!isPlainRecord(instance)) {
        collector.add(path, "Effect instance must be an object.");
        continue;
      }
      collector.exactKeys(instance, EFFECT_INSTANCE_KEYS, path);
      if (!isCanonicalUuid(instance.id)) {
        collector.add(`${path}.id`, "Expected a lowercase canonical UUID version 4.");
      } else if (instanceIds.has(instance.id)) {
        collector.add(`${path}.id`, "Effect instance IDs must be unique.");
      } else {
        instanceIds.add(instance.id);
      }
      const pluginId = parsePluginId(instance.pluginId, `${path}.pluginId`);
      let effectDescriptor: ImportVoiceInsertEffectDescriptor | undefined;
      if (!pluginId.ok) collector.issues.push(...pluginId.issues);
      else {
        if (!knownEffectPlugins.has(pluginId.value)) {
          collector.add(`${path}.pluginId`, "Effect plugin is not available for a voice insert.");
        }
        effectDescriptor = effectDescriptors[pluginId.value];
        if (effectDescriptor === undefined) {
          collector.add(
            `${path}.pluginId`,
            "Effect plugin has no registered voice-insert state contract.",
          );
        }
        if (!requirements.has(pluginId.value)) {
          collector.add(`${path}.pluginId`, "Effect plugin has no matching requirement.");
        }
      }
      if (!Number.isSafeInteger(instance.stateVersion) || Number(instance.stateVersion) < 1) {
        collector.add(`${path}.stateVersion`, "Voice insert state version must be a positive integer.");
      } else if (
        effectDescriptor !== undefined &&
        instance.stateVersion !== effectDescriptor.stateSchemaVersion
      ) {
        collector.add(
          `${path}.stateVersion`,
          `Voice insert state version must be ${String(effectDescriptor.stateSchemaVersion)}.`,
        );
      }
      if (effectDescriptor !== undefined)
        validateVoiceInsertEffectState(instance.state, effectDescriptor, `${path}.state`, collector);
      if (
        typeof instance.id === "string" &&
        typeof instance.pluginId === "string" &&
        typeof instance.stateVersion === "number" &&
        isPlainRecord(instance.state)
      ) {
        instances.push({
          id: instance.id,
          pluginId: instance.pluginId,
          stateVersion: instance.stateVersion,
          state: instance.state as Readonly<Record<string, ParameterValue>>,
        });
      }
    }
  }

  const expectedByKey = new Map(
    expectedSlots.map((slot) => [voiceSlotKey(slot.moduleId, slot.voiceId), slot]),
  );
  const voiceInserts: VoiceInsertDocument[] = [];
  const seenSlots = new Set<string>();
  const references = new Map<string, number>();
  if (!Array.isArray(value.voiceInserts)) {
    collector.add("effects.voiceInserts", "Voice insert slots must be an array.");
  } else {
    for (const [index, slot] of value.voiceInserts.entries()) {
      if (collector.full) break;
      const path = `effects.voiceInserts[${String(index)}]`;
      if (!isPlainRecord(slot)) {
        collector.add(path, "Voice insert slot must be an object.");
        continue;
      }
      collector.exactKeys(slot, VOICE_INSERT_KEYS, path);
      const key =
        typeof slot.moduleId === "string" && typeof slot.voiceId === "string"
          ? voiceSlotKey(slot.moduleId, slot.voiceId)
          : undefined;
      if (key === undefined || !expectedByKey.has(key)) {
        collector.add(path, "Voice insert slot does not resolve to a supported drum voice.");
      } else if (seenSlots.has(key)) {
        collector.add(path, "Voice insert slots must be unique.");
      } else {
        seenSlots.add(key);
      }
      if (slot.effectInstanceId !== null && !isCanonicalUuid(slot.effectInstanceId)) {
        collector.add(`${path}.effectInstanceId`, "Expected a lowercase canonical UUID version 4 or null.");
      } else if (typeof slot.effectInstanceId === "string") {
        if (!instanceIds.has(slot.effectInstanceId)) {
          collector.add(`${path}.effectInstanceId`, "Voice insert references an unknown effect instance.");
        }
        references.set(slot.effectInstanceId, (references.get(slot.effectInstanceId) ?? 0) + 1);
      }
      if (
        typeof slot.moduleId === "string" &&
        typeof slot.voiceId === "string" &&
        (slot.effectInstanceId === null || typeof slot.effectInstanceId === "string")
      ) {
        voiceInserts.push({
          moduleId: slot.moduleId,
          voiceId: slot.voiceId,
          effectInstanceId: slot.effectInstanceId,
        });
      }
    }
  }
  for (const [key, slot] of expectedByKey) {
    if (!seenSlots.has(key)) {
      collector.add(
        "effects.voiceInserts",
        `Missing voice insert slot for ${slot.moduleId}/${slot.voiceId}.`,
      );
    }
  }
  for (const instance of instances) {
    const count = references.get(instance.id) ?? 0;
    if (count !== 1) {
      collector.add(
        "effects.instances",
        count === 0
          ? "Each effect instance must have one voice insert reference."
          : "An effect instance cannot occupy more than one voice insert slot.",
      );
    }
  }
  return {
    document: { instances, voiceInserts },
    referencedPluginIds: new Set(instances.map((instance) => instance.pluginId)),
  };
}

function validateVoiceInsertEffectState(
  value: unknown,
  descriptor: ImportVoiceInsertEffectDescriptor,
  path: string,
  collector: IssueCollector,
): void {
  if (!isPlainRecord(value)) {
    collector.add(path, "Voice insert state must be an object.");
    return;
  }
  collector.exactKeys(value, new Set(descriptor.parameters.map((parameter) => parameter.id)), path);
  for (const parameter of descriptor.parameters) {
    if (!Object.hasOwn(value, parameter.id)) {
      collector.add(`${path}.${parameter.id}`, "Voice insert state is missing a required value.");
      continue;
    }
    const message = validateImportedParameter(value[parameter.id], parameter);
    if (message !== undefined) collector.add(`${path}.${parameter.id}`, message);
  }
}

/**
 * Converts the released flat format-1 Pattern records before current-schema
 * validation. The migration is pure and derives every new ID from saved data.
 */
function migrateFormatOneDocument(
  value: Readonly<Record<string, unknown>>,
): DocumentResult<Readonly<Record<string, unknown>>> {
  const collector = new IssueCollector();
  const migratedRecord = {
    scope: "project" as const,
    id: FORMAT_ONE_MIGRATION_ID,
    fromVersion: 1,
    toVersion: 2,
    implementation: "1.0.0",
  };

  // Development builds briefly wrote the new shape with the old version. Keep
  // those detached candidates readable while the current validator still owns
  // every field check.
  if (isPlainRecord(value.song) && typeof value.activePatternId === "string") {
    const existingMigrations: readonly unknown[] = Array.isArray(value.migrations)
      ? value.migrations
      : [];
    return {
      ok: true,
      value: {
        ...value,
        formatVersion: 2,
        migrations: [...existingMigrations, migratedRecord],
      },
    };
  }

  collector.exactKeys(value, FORMAT_ONE_ROOT_KEYS, "$");
  if (!Array.isArray(value.patterns)) {
    collector.add("patterns", "Format 1 Patterns must be an array.");
  }
  if (!Array.isArray(value.song)) collector.add("song", "Format 1 Song data must be an array.");
  for (const key of ["automation", "assets", "migrations"] as const) {
    const field = value[key];
    if (!Array.isArray(field) || field.length > 0) {
      collector.add(key, `Format 1 ${key} must be an empty array.`);
    }
  }
  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
  }

  const patterns = value.patterns as readonly unknown[];
  const grouped = new Map<number, Readonly<Record<string, unknown>>[]>();
  for (const [recordIndex, candidate] of patterns.entries()) {
    const path = `patterns[${String(recordIndex)}]`;
    if (!isPlainRecord(candidate)) {
      collector.add(path, "A format-1 Pattern record must be an object.");
      continue;
    }
    collector.exactKeys(candidate, FORMAT_ONE_PATTERN_KEYS, path);
    const index = candidate.patternIndex ?? 0;
    if (!Number.isSafeInteger(index) || Number(index) < 0 || Number(index) >= MAXIMUM_PATTERN_COUNT) {
      collector.add(`${path}.patternIndex`, "Format-1 Pattern index is outside its range.");
      continue;
    }
    const records = grouped.get(Number(index)) ?? [];
    grouped.set(Number(index), [...records, candidate]);
  }
  const song = value.song as readonly unknown[];
  for (const [index, candidate] of song.entries()) {
    if (!isPlainRecord(candidate)) {
      collector.add(`song[${String(index)}]`, "A format-1 Song entry must be an object.");
      continue;
    }
    collector.exactKeys(candidate, FORMAT_ONE_SONG_ENTRY_KEYS, `song[${String(index)}]`);
  }
  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
  }

  const metadata = isPlainRecord(value.project) ? value.project : {};
  const projectId = typeof metadata.id === "string" ? metadata.id : "missing-project";
  const createdAt = typeof metadata.createdAt === "string" ? metadata.createdAt : "";
  const modifiedAt = typeof metadata.modifiedAt === "string" ? metadata.modifiedAt : "";
  const colors = ["#E6A23C", "#F26D6D", "#58B8F6", "#A87CFF", "#63C78F"] as const;
  const activeIndex = Number.isSafeInteger(value.activePatternIndex)
    ? Number(value.activePatternIndex)
    : 0;
  const requiredPatternIndices = new Set(grouped.keys());
  if (activeIndex >= 0 && activeIndex < MAXIMUM_PATTERN_COUNT) {
    requiredPatternIndices.add(activeIndex);
  }
  for (const candidate of song) {
    const patternIndex = isPlainRecord(candidate) ? candidate.patternIndex : undefined;
    if (
      Number.isSafeInteger(patternIndex) &&
      Number(patternIndex) >= 0 &&
      Number(patternIndex) < MAXIMUM_PATTERN_COUNT
    ) {
      requiredPatternIndices.add(Number(patternIndex));
    }
  }
  if (requiredPatternIndices.size === 0) requiredPatternIndices.add(0);
  const patternGroups = [...requiredPatternIndices]
    .map((index) => [index, grouped.get(index) ?? []] as const)
    .toSorted(([left], [right]) => left - right);
  const migratedPatterns = patternGroups.map(([index, records]) => {
    const first = records[0] ?? {};
    const patternId = formatOnePatternId(first.id, projectId, index);
    const lengths = records.flatMap((record) =>
      typeof record.length === "number" ? [record.length] : [],
    );
    const maximumLength = Math.max(16, ...lengths);
    return {
      id: patternId,
      name: typeof first.name === "string" ? first.name : `Pattern ${String(index + 1)}`,
      color: colors[index] ?? "#E6A23C",
      durationBars: Math.max(1, Math.ceil(maximumLength / 16)),
      scale: "Chromatic",
      humanize: typeof first.humanize === "number" ? first.humanize : 0,
      seed:
        typeof first.seed === "number" && Number.isSafeInteger(first.seed)
          ? first.seed
          : migrationHash(`${projectId}:pattern-seed:${String(index)}`),
      createdAt,
      modifiedAt,
      automationLaneIds: [],
      parts: records.map((record) => ({
        moduleId: record.moduleId,
        length: record.length,
        voiceCycleLengths: {},
        events: Array.isArray(record.events)
          ? record.events.map((event) => normalizeFormatOneEvent(event))
          : record.events,
        automationLaneIds: [],
      })),
    };
  });
  const patternIdByIndex = new Map(
    patternGroups.map(([index], position) => [
      index,
      migratedPatterns[position]?.id ?? "",
    ]),
  );
  const firstPatternId = migratedPatterns[0]?.id ?? "";
  const activePatternId = patternIdByIndex.get(activeIndex) ?? firstPatternId;
  const playlist =
    song.length === 0
      ? [
          {
            id: stableMigrationUuid(`${projectId}:song:empty:${String(activeIndex)}`),
            patternId: activePatternId,
            repeatCount: 1,
          },
        ]
      : song.map((candidate, index) => {
          const entry = candidate as Readonly<Record<string, unknown>>;
          const patternIndex = typeof entry.patternIndex === "number" ? entry.patternIndex : -1;
          return {
            id: stableMigrationUuid(`${projectId}:song:${String(index)}:${String(patternIndex)}`),
            patternId: patternIdByIndex.get(patternIndex) ?? "",
            repeatCount: entry.repeats,
          };
        });
  return {
    ok: true,
    value: {
      format: value.format,
      formatVersion: 2,
      project: value.project,
      plugins: value.plugins,
      rack: value.rack,
      patterns: migratedPatterns,
      song: { enabled: value.songEnabled === true, playlist },
      activePatternId,
      automation: [],
      mixer: value.mixer,
      effects: value.effects,
      assets: [],
      migrations: [migratedRecord],
    },
  };
}

function normalizeFormatOneEvent(value: unknown): unknown {
  if (!isPlainRecord(value) || !isPlainRecord(value.data)) return value;
  return {
    ...value,
    data: {
      ...value.data,
      probability: typeof value.data.probability === "number" ? value.data.probability : 1,
      microTimingTicks:
        typeof value.data.microTimingTicks === "number" ? value.data.microTimingTicks : 0,
      flam: typeof value.data.flam === "number" ? value.data.flam : 0,
      roll: typeof value.data.roll === "number" ? value.data.roll : 0,
    },
  };
}

function formatOnePatternId(value: unknown, projectId: string, index: number): string {
  if (typeof value === "string") {
    const prefix = value.split(":", 1)[0];
    if (prefix !== undefined && isCanonicalUuid(prefix)) return prefix;
  }
  return stableMigrationUuid(`${projectId}:pattern:${String(index)}`);
}

function migrationHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

function stableMigrationUuid(value: string): string {
  const hex = [0, 1, 2, 3]
    .map((index) => migrationHash(`${String(index)}:${value}`).toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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
  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
  }
  if (value.format === PROJECT_FORMAT && value.formatVersion === 1) {
    const migrated = migrateFormatOneDocument(value);
    if (!migrated.ok) return migrated;
    return parseProjectDocument(migrated.value, options);
  }
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
    if (typeof metadata.favorite !== "boolean")
      collector.add("project.favorite", "Favorite must be boolean.");
    if (!finiteNumber(metadata.tempo, 40, 240))
      collector.add("project.tempo", "Tempo must be between 40 and 240 BPM.");
    // Global Swing, per decision D69. Absent in documents written before it.
    if (metadata.swing !== undefined && !finiteNumber(metadata.swing, 0, 100))
      collector.add("project.swing", "Swing must be between 0 and 100 percent.");
  }

  const known = new Set([
    ...options.knownPluginIds,
    ...(options.knownVoiceInsertEffectPluginIds ?? []),
    ...Object.keys(options.voiceInsertEffectsByPluginId ?? {}),
  ]);
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
      let expectedStateSchemaVersion: number | undefined;
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
        expectedStateSchemaVersion = options.stateSchemaVersionByPluginId?.[pluginId.value];
      }
      if (
        !Number.isSafeInteger(requirement.stateSchemaVersion) ||
        Number(requirement.stateSchemaVersion) < 1
      )
        collector.add(
          `${path}.stateSchemaVersion`,
          "State schema version must be a positive safe integer.",
        );
      else if (
        expectedStateSchemaVersion !== undefined &&
        requirement.stateSchemaVersion !== expectedStateSchemaVersion
      )
        collector.add(
          `${path}.stateSchemaVersion`,
          `This build requires state schema version ${String(expectedStateSchemaVersion)}.`,
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
              const message = validateImportedParameter(parameter, descriptor);
              if (message !== undefined) collector.add(`${path}.parameters.${id}`, message);
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

  const patternIds = new Set<string>();
  const patternNames = new Set<string>();
  const eventIds = new Set<string>();
  let eventRecords = 0;
  if (!Array.isArray(value.patterns)) {
    collector.add("patterns", "Patterns must be an array.");
  } else {
    if (
      value.patterns.length < MINIMUM_PATTERN_COUNT ||
      value.patterns.length > DOCUMENT_LIMITS.maximumPatterns
    ) {
      collector.add(
        "patterns",
        `A project needs ${String(MINIMUM_PATTERN_COUNT)} through ${String(DOCUMENT_LIMITS.maximumPatterns)} Patterns.`,
      );
    }
    for (const [index, pattern] of value.patterns.entries()) {
      if (collector.full) break;
      const path = `patterns[${String(index)}]`;
      if (!isPlainRecord(pattern)) {
        collector.add(path, "A Pattern must be an object.");
        continue;
      }
      collector.exactKeys(pattern, PATTERN_KEYS, path);
      if (!isCanonicalUuid(pattern.id) || patternIds.has(pattern.id))
        collector.add(`${path}.id`, "Pattern IDs must be unique canonical UUIDs.");
      else patternIds.add(pattern.id);
      if (!validName(pattern.name)) {
        collector.add(`${path}.name`, "Pattern name must contain 1 through 256 characters.");
      } else if (patternNames.has(pattern.name.toLocaleLowerCase())) {
        collector.add(`${path}.name`, "Pattern names must be unique.");
      } else patternNames.add(pattern.name.toLocaleLowerCase());
      if (typeof pattern.color !== "string" || !/^#[0-9A-F]{6}$/.test(pattern.color))
        collector.add(`${path}.color`, "Pattern color must be an uppercase six-digit hex color.");
      if (!Number.isSafeInteger(pattern.durationBars) || Number(pattern.durationBars) < 1)
        collector.add(`${path}.durationBars`, "Pattern duration must be a positive whole bar count.");
      if (typeof pattern.scale !== "string" || !PATTERN_SCALES.includes(pattern.scale as PatternScale))
        collector.add(`${path}.scale`, "Pattern scale is not supported.");
      if (!finiteNumber(pattern.humanize, 0, 100))
        collector.add(`${path}.humanize`, "Humanize must be between 0 and 100 percent.");
      if (!Number.isSafeInteger(pattern.seed) || Number(pattern.seed) < 0 || Number(pattern.seed) > 0xffff_ffff)
        collector.add(`${path}.seed`, "A Pattern seed must be an unsigned 32-bit integer.");
      if (!validTimestamp(pattern.createdAt))
        collector.add(`${path}.createdAt`, "Expected a UTC timestamp with three fractional digits.");
      if (!validTimestamp(pattern.modifiedAt))
        collector.add(`${path}.modifiedAt`, "Expected a UTC timestamp with three fractional digits.");
      if (validTimestamp(pattern.createdAt) && validTimestamp(pattern.modifiedAt) && pattern.modifiedAt < pattern.createdAt)
        collector.add(`${path}.modifiedAt`, "Modified time must not precede created time.");
      if (!validUuidList(pattern.automationLaneIds, `${path}.automationLaneIds`, collector)) continue;
      if (!Array.isArray(pattern.parts)) {
        collector.add(`${path}.parts`, "Pattern parts must be an array.");
        continue;
      }
      const partModuleIds = new Set<string>();
      for (const [partIndex, part] of pattern.parts.entries()) {
        const partPath = `${path}.parts[${String(partIndex)}]`;
        if (!isPlainRecord(part)) {
          collector.add(partPath, "A Pattern part must be an object.");
          continue;
        }
        collector.exactKeys(part, PATTERN_PART_KEYS, partPath);
        if (!isCanonicalUuid(part.moduleId) || !occupiedModules.has(part.moduleId))
          collector.add(`${partPath}.moduleId`, "Pattern part module must resolve to an occupied rack module.");
        else if (partModuleIds.has(part.moduleId))
          collector.add(`${partPath}.moduleId`, "A Pattern has at most one part per module.");
        else partModuleIds.add(part.moduleId);
        if (!Number.isSafeInteger(part.length) || Number(part.length) < 1 || Number(part.length) > DOCUMENT_LIMITS.maximumPatternSteps)
          collector.add(`${partPath}.length`, "Pattern part length must be from 1 through 64.");
        const partPluginId = typeof part.moduleId === "string" ? occupiedModules.get(part.moduleId) : undefined;
        if (!validVoiceCycleLengths(
          part.voiceCycleLengths,
          `${partPath}.voiceCycleLengths`,
          collector,
          partPluginId === undefined ? undefined : options.voiceIdsByPluginId?.[partPluginId],
        )) continue;
        if (!validUuidList(part.automationLaneIds, `${partPath}.automationLaneIds`, collector)) continue;
        if (!Array.isArray(part.events)) {
          collector.add(`${partPath}.events`, "A Pattern part needs an event list.");
          continue;
        }
        eventRecords += part.events.length;
        const validEvents: PatternEvent[] = [];
        for (const [eventIndex, event] of part.events.entries()) {
          const eventPath = `${partPath}.events[${String(eventIndex)}]`;
          if (!isPlainRecord(event)) {
            collector.add(eventPath, "An event record is malformed.");
            continue;
          }
          collector.exactKeys(event, EVENT_KEYS, eventPath);
          if (isPlainRecord(event.data)) collector.exactKeys(event.data, EVENT_DATA_KEYS, `${eventPath}.data`);
          if (!validPatternEvent(event, Number(part.length))) {
            collector.add(eventPath, "An event record is malformed or outside its range.");
            continue;
          }
          if (eventIds.has(event.id)) {
            collector.add(`${eventPath}.id`, "Event IDs must be unique in the project.");
            continue;
          }
          eventIds.add(event.id);
          validEvents.push(event);
        }
        const pluginId = typeof part.moduleId === "string" ? occupiedModules.get(part.moduleId) : undefined;
        if (pluginId !== undefined) {
          const expectedType = (options.voiceIdsByPluginId?.[pluginId]?.length ?? 0) > 0 ? "trigger" : "note";
          if (validEvents.some((event) => event.type !== expectedType))
            collector.add(`${partPath}.events`, `The module accepts ${expectedType} events, not the stored event type.`);
        }
        validatePatternEventConflicts(validEvents, partPath, collector);
      }
    }
  }
  if (eventRecords > DOCUMENT_LIMITS.maximumEventRecords)
    collector.add("patterns", "The document exceeds its total event-record limit.");
  const effects = parseEffects(value.effects, collector, occupiedModules, requirements, options);
  const referencedPlugins = new Set([...occupiedModules.values(), ...effects.referencedPluginIds]);
  for (const requirement of requirements) {
    if (!referencedPlugins.has(requirement)) {
      collector.add(
        "plugins",
        `Plugin requirement ${requirement} is not referenced by a module or effect instance.`,
      );
    }
  }

  if (!isPlainRecord(value.song)) collector.add("song", "Song must be an object.");
  else {
    collector.exactKeys(value.song, SONG_KEYS, "song");
    if (typeof value.song.enabled !== "boolean") collector.add("song.enabled", "Song enabled must be boolean.");
    if (!Array.isArray(value.song.playlist) || value.song.playlist.length === 0) {
      collector.add("song.playlist", "A Song needs at least one Playlist placement.");
    } else {
      const placementIds = new Set<string>();
      for (const [index, placement] of value.song.playlist.entries()) {
        const path = `song.playlist[${String(index)}]`;
        if (!isPlainRecord(placement)) {
          collector.add(path, "Playlist placement must be an object.");
          continue;
        }
        collector.exactKeys(placement, SONG_PLACEMENT_KEYS, path);
        if (!isCanonicalUuid(placement.id) || placementIds.has(placement.id))
          collector.add(`${path}.id`, "Playlist placement IDs must be unique canonical UUIDs.");
        else placementIds.add(placement.id);
        if (!isCanonicalUuid(placement.patternId) || !patternIds.has(placement.patternId))
          collector.add(`${path}.patternId`, "Playlist Pattern reference must resolve in this project.");
        if (
          typeof placement.repeatCount !== "number" ||
          !Number.isSafeInteger(placement.repeatCount) ||
          placement.repeatCount < 1 ||
          placement.repeatCount > DOCUMENT_LIMITS.maximumSongRepeats
        )
          collector.add(`${path}.repeatCount`, `Repeat count must be from 1 through ${String(DOCUMENT_LIMITS.maximumSongRepeats)}.`);
      }
    }
  }
  if (!isCanonicalUuid(value.activePatternId) || !patternIds.has(value.activePatternId))
    collector.add("activePatternId", "Active Pattern reference must resolve in this project.");
  if (!isPlainRecord(value.mixer)) collector.add("mixer", "Mixer must be an object.");
  else {
    collector.exactKeys(value.mixer, new Set(["masterLevel"]), "mixer");
    if (value.mixer.masterLevel !== undefined && !finiteNumber(value.mixer.masterLevel, 0, 1))
      collector.add("mixer.masterLevel", "Master level must be from 0 through 1.");
  }
  if (!Array.isArray(value.automation)) collector.add("automation", "automation must be an array.");
  else {
    validateAutomationLanes(value.automation, collector, patternIds, occupiedModules, options);
    if (Array.isArray(value.patterns)) {
      validateAutomationReferences(value.patterns, value.automation, collector);
      validateAutomationStepBounds(value.patterns, value.automation, collector);
    }
  }
  if (!Array.isArray(value.assets)) collector.add("assets", "assets must be an array.");
  else if (value.assets.length > 0)
    collector.add("assets", "Asset records are not supported by this build.");
  if (!Array.isArray(value.migrations)) collector.add("migrations", "migrations must be an array.");
  else validateMigrationRecords(value.migrations, collector);
  return collector.issues.length === 0
    ? {
        ok: true,
        value: { ...(value as unknown as ProjectDocument), effects: effects.document },
      }
    : { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
}

function validateMigrationRecords(
  migrations: readonly unknown[],
  collector: IssueCollector,
): void {
  for (const [index, migration] of migrations.entries()) {
    const path = `migrations[${String(index)}]`;
    if (!isPlainRecord(migration)) {
      collector.add(path, "A migration record must be an object.");
      continue;
    }
    collector.exactKeys(migration, MIGRATION_KEYS, path);
    if (migration.scope !== "project" && migration.scope !== "plugin") {
      collector.add(`${path}.scope`, "Migration scope must be project or plugin.");
    }
    if (typeof migration.id !== "string" || migration.id.length === 0) {
      collector.add(`${path}.id`, "Migration ID must be a nonempty string.");
    }
    if (!Number.isSafeInteger(migration.fromVersion) || Number(migration.fromVersion) < 1) {
      collector.add(`${path}.fromVersion`, "Migration source version must be positive.");
    }
    if (
      !Number.isSafeInteger(migration.toVersion) ||
      Number(migration.toVersion) !== Number(migration.fromVersion) + 1
    ) {
      collector.add(`${path}.toVersion`, "Migration target version must be the next version.");
    }
    if (
      typeof migration.implementation !== "string" ||
      !/^\d+\.\d+\.\d+$/.test(migration.implementation)
    ) {
      collector.add(
        `${path}.implementation`,
        "Migration implementation must be a semantic version.",
      );
    }
  }
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

/**
 * Rebuilds store state from a validated document. Every identifier it needs is
 * already in the document, so no ID factory is involved.
 */
export function documentToState(document: ProjectDocument, base: Readonly<PulseState>): PulseState {
  const modules: Record<ModuleInstanceId, RackModuleState> = {};
  for (const slot of document.rack) {
    if (slot.moduleId === undefined || slot.pluginId === undefined) continue;
    const moduleId = slot.moduleId as ModuleInstanceId;
    modules[moduleId] = Object.freeze({
      id: moduleId,
      pluginId: slot.pluginId as PluginId,
      parameters: Object.freeze({ ...slot.parameters }),
      muted: slot.muted ?? false,
      solo: slot.solo ?? false,
      level: clampUnit(slot.level, DEFAULT_MODULE_LEVEL, 0),
      pan: clampUnit(slot.pan, 0, -1),
    } as RackModuleState);
  }
  const patterns = document.patterns.map((record) => {
    const parts = Object.fromEntries(
      record.parts.map((part) => [
        part.moduleId,
        Object.freeze({
          moduleId: part.moduleId as ModuleInstanceId,
          length: part.length,
          voiceCycleLengths: Object.freeze(
            Object.fromEntries(
              Object.entries(part.voiceCycleLengths).map(([key, length]) => [
                key as VoiceCycleLengthKey,
                length,
              ]),
            ),
          ) as Readonly<Record<VoiceCycleLengthKey, number>>,
          events: Object.freeze(
            part.events.map((event) => Object.freeze({ ...event, data: Object.freeze({ ...event.data }) })),
          ),
          automationLaneIds: Object.freeze(part.automationLaneIds.map((id) => id as AutomationLaneId)),
        }),
      ]),
    ) as Readonly<Record<ModuleInstanceId, PatternPartState>>;
    return Object.freeze({
      id: record.id as PatternId,
      name: record.name,
      color: record.color,
      durationBars: record.durationBars,
      scale: record.scale,
      humanize: record.humanize / 100,
      seed: record.seed,
      parts,
      automationLaneIds: Object.freeze(record.automationLaneIds.map((id) => id as AutomationLaneId)),
      createdAt: record.createdAt,
      modifiedAt: record.modifiedAt,
    });
  });
  const automationLanes = Object.fromEntries(
    document.automation.map((lane) => [
      lane.id,
      Object.freeze({
        id: lane.id as AutomationLaneId,
        scope: lane.scope,
        targetId: lane.targetId as ModuleInstanceId,
        parameterId: lane.parameterId,
        patternId: lane.patternId as PatternId,
        stepTicks: lane.stepTicks as typeof PATTERN_TICKS_PER_STEP,
        steps: Object.freeze(lane.steps.map((step) => Object.freeze({ ...step }))),
      } satisfies AutomationLaneState),
    ]),
  ) as Readonly<Record<AutomationLaneId, AutomationLaneState>>;
  const firstModuleId = Object.keys(modules)[0] as ModuleInstanceId | undefined;
  const effects = effectsStateFromDocument(document.effects);

  return Object.freeze({
    ...base,
    project: Object.freeze({
      ...base.project,
      id: document.project.id as PulseState["project"]["id"],
      lineageId: document.project.lineageId as PulseState["project"]["lineageId"],
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
              : { id: slot.id as PulseState["project"]["rackSlots"][number]["id"], moduleId: slot.moduleId as ModuleInstanceId },
          ),
        ),
      ),
      modules: Object.freeze(modules),
      effects,
      patterns: Object.freeze(patterns),
      activePatternId: document.activePatternId as PatternId,
      automationLanes: Object.freeze(automationLanes),
      song: Object.freeze({
        enabled: document.song.enabled,
        placements: Object.freeze(
          document.song.playlist.map((placement) =>
            Object.freeze({
              id: placement.id as PulseState["project"]["song"]["placements"][number]["id"],
              patternId: placement.patternId as PatternId,
              repeatCount: placement.repeatCount,
            }),
          ),
        ),
      }),
    }),
    ui: Object.freeze({
      ...base.ui,
      selectedModuleId: firstModuleId,
    }),
  } as PulseState);
}

function effectsStateFromDocument(document: EffectsDocument): EffectsState {
  const instances: Record<EffectInstanceId, EffectInstanceState> = {};
  for (const instance of document.instances) {
    const id = instance.id as EffectInstanceId;
    instances[id] = Object.freeze({
      id,
      pluginId: instance.pluginId as PluginId,
      stateVersion: instance.stateVersion,
      state: Object.freeze({ ...instance.state }),
    });
  }
  const voiceInserts: Record<ModuleInstanceId, Record<VoiceId, EffectInstanceId | null>> = {};
  for (const slot of document.voiceInserts) {
    const moduleId = slot.moduleId as ModuleInstanceId;
    const slots = voiceInserts[moduleId] ?? {};
    slots[slot.voiceId as VoiceId] =
      slot.effectInstanceId === null ? null : (slot.effectInstanceId as EffectInstanceId);
    voiceInserts[moduleId] = slots;
  }
  return Object.freeze({
    instances: Object.freeze(instances),
    voiceInserts: Object.freeze(
      Object.fromEntries(
        Object.entries(voiceInserts).map(([moduleId, slots]) => [
          moduleId,
          Object.freeze(slots),
        ]),
      ),
    ),
  });
}

function clampUnit(value: unknown, fallback: number, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(minimum, value));
}
