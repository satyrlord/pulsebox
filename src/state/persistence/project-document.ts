import {
  RACK_SLOT_IDS,
  SEND_BUS_IDS,
  isCanonicalUuid,
  type AutomationLaneId,
  type EffectInstanceId,
  type ModuleInstanceId,
  type PatternId,
  type ProjectRevision,
} from "../../contracts/ids";
import {
  EFFECT_GAIN_MAXIMUM_DECIBELS,
  EFFECT_GAIN_MINIMUM_DECIBELS,
  MASTER_EFFECT_CHAIN_SLOT_COUNT,
  MODULE_EFFECT_CHAIN_SLOT_COUNT,
  PROTECTED_LIMITER_EFFECT_PLUGIN_ID,
  SEND_EFFECT_CHAIN_SLOT_COUNT,
  type EffectInstanceState,
  type EffectsState,
} from "../../contracts/effects";
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
export const PROJECT_FORMAT_VERSION = 3;

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
  readonly kind: "instrument" | "effect";
  readonly pluginVersion: string;
  readonly apiVersion: 1;
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
  readonly sends?: readonly MixerSendDocument[];
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
  readonly scope: AutomationLaneState["scope"];
  readonly targetId: string;
  readonly parameterId: string;
  readonly patternId: string;
  readonly stepTicks: number;
  readonly steps: readonly AutomationStepDocument[];
}

export interface MixerSendDocument {
  readonly busId: string;
  readonly amount: number;
}

export interface MixerChannelDocument {
  readonly slotId: string;
  readonly moduleId: string | null;
  readonly level: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly sends: readonly MixerSendDocument[];
  /** The module ID keys its ordered module effect chain, or null for an empty slot. */
  readonly moduleChainId: string | null;
}

export interface MixerSendDefinitionDocument {
  readonly busId: string;
}

export interface MixerDocument {
  readonly channels: readonly MixerChannelDocument[];
  readonly sends: readonly MixerSendDefinitionDocument[];
  readonly master: { readonly level: number };
}

export interface EffectInstanceDocument {
  readonly id: string;
  readonly pluginId: string;
  readonly stateVersion: number;
  readonly state: Readonly<Record<string, ParameterValue>>;
  readonly bypassed: boolean;
  readonly mix: number;
  readonly gainDecibels: number;
}

export interface ModuleChainDocument {
  readonly moduleId: string;
  readonly slots: readonly (string | null)[];
  /** Absent only in early format-3 documents. */
  readonly bypassed?: boolean;
}

export interface SendChainDocument {
  readonly busId: string;
  readonly slots: readonly (string | null)[];
  readonly returnLevel: number;
  readonly bypassed: boolean;
  readonly pinnedEffectId: string | null;
}

export interface MasterChainDocument {
  readonly slots: readonly (string | null)[];
}

export interface EffectsDocument {
  readonly instances: readonly EffectInstanceDocument[];
  readonly moduleChains: readonly ModuleChainDocument[];
  readonly sendChains: readonly SendChainDocument[];
  /** Absent only in early format-3 documents. */
  readonly sendEffectsBypassed?: boolean;
  readonly masterChain: MasterChainDocument;
  readonly masterEffectsBypassed: boolean;
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
const FORMAT_TWO_MIGRATION_ID = "project-format-2-to-3-effect-stages";

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
  /** Installed plugin identity contracts from the composition registry. */
  readonly pluginMetadataByPluginId?: Readonly<Record<string, ImportPluginMetadata>>;
}

export function serializeProject(
  state: Readonly<PulseState>,
  options: SerializeOptions,
): ProjectDocument {
  const project = state.project;
  const modules = Object.values(project.modules);
  const versionFor = options.manifestVersionFor ?? (() => 1);
  const requirementFor = (
    pluginId: string,
    kind: "instrument" | "effect",
  ): PluginRequirementDocument => {
    const metadata = options.pluginMetadataByPluginId?.[pluginId];
    if (metadata !== undefined && metadata.kind !== kind) {
      throw new Error(`Plugin ${pluginId} has an incompatible registry kind.`);
    }
    return {
      pluginId,
      kind,
      pluginVersion: metadata?.pluginVersion ?? "1.0.0",
      apiVersion: metadata?.apiVersion ?? 1,
      stateSchemaVersion: metadata?.stateSchemaVersion ?? versionFor(pluginId),
    };
  };

  const effectInstances = Object.values(project.effects.instances);
  const instrumentRequirements: PluginRequirementDocument[] = [
    ...new Set(modules.map((module) => module.pluginId)),
  ].map((pluginId) => requirementFor(pluginId, "instrument"));
  const effectRequirements: PluginRequirementDocument[] = [
    ...new Set(effectInstances.map((instance) => instance.pluginId)),
  ].map((pluginId) => requirementFor(pluginId, "effect"));
  const plugins = [...instrumentRequirements, ...effectRequirements].toSorted(
    (left, right) => left.kind.localeCompare(right.kind) || left.pluginId.localeCompare(right.pluginId),
  );

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
        sends: SEND_BUS_IDS.map((busId) => ({
          busId,
          amount: module.sends[busId]?.amount ?? 0,
        })),
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
    automation: Object.values(project.automationLanes)
      .toSorted((left, right) => left.id.localeCompare(right.id))
      .map((lane) => ({
        ...lane,
        steps: lane.steps.map((step) => ({ ...step })),
      })),
    mixer: {
      channels: project.rackSlots.map((slot) => {
        const module = slot.moduleId === undefined ? undefined : project.modules[slot.moduleId];
        return {
          slotId: slot.id,
          moduleId: module?.id ?? null,
          level: module?.level ?? DEFAULT_MODULE_LEVEL,
          pan: module?.pan ?? 0,
          muted: module?.muted ?? false,
          solo: module?.solo ?? false,
          sends: SEND_BUS_IDS.map((busId) => ({
            busId,
            amount: module?.sends[busId]?.amount ?? 0,
          })),
          moduleChainId: module?.id ?? null,
        };
      }),
      sends: SEND_BUS_IDS.map((busId) => ({ busId })),
      master: { level: project.masterLevel },
    },
    effects: {
      instances: effectInstances
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .map((instance) => ({
          id: instance.id,
          pluginId: instance.pluginId,
          stateVersion: instance.stateVersion,
          state: { ...instance.state },
          bypassed: instance.bypassed,
          mix: instance.mix,
          gainDecibels: instance.gainDecibels,
        })),
      moduleChains: Object.entries(project.effects.moduleChains)
        .map(([moduleId, chain]) => ({
          moduleId,
          slots: [...chain.slots],
          bypassed: chain.bypassed,
        }))
        .toSorted((left, right) => left.moduleId.localeCompare(right.moduleId)),
      sendChains: SEND_BUS_IDS.map((busId) => {
        const chain = project.effects.sendChains[busId];
        if (chain === undefined) {
          throw new Error(`Send ${busId} is missing from the project state.`);
        }
        return {
          busId,
          slots: [...chain.slots],
          returnLevel: chain.returnLevel,
          bypassed: chain.bypassed,
          pinnedEffectId: chain.pinnedEffectId,
        };
      }),
      sendEffectsBypassed: project.effects.sendEffectsBypassed,
      masterChain: { slots: [...project.effects.masterChain] },
      masterEffectsBypassed: project.effects.masterEffectsBypassed,
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
  /** Registered current state schema versions for every installed plugin. */
  readonly stateSchemaVersionByPluginId?: Readonly<Record<string, number>>;
  /** Stable drum voice IDs by instrument plugin. Pitched instruments omit an entry. */
  readonly voiceIdsByPluginId?: Readonly<Record<string, readonly string[]>>;
  /** State and placement contracts for every installed effect plugin. */
  readonly effectDescriptorsByPluginId?: Readonly<Record<string, ImportEffectDescriptor>>;
  /** Installed plugin identity contracts. The browser composition passes its registry here. */
  readonly pluginMetadataByPluginId?: Readonly<Record<string, ImportPluginMetadata>>;
}

export type ImportParameterDescriptor = Pick<
  ParameterDescriptor,
  "id" | "valueType" | "minimum" | "maximum" | "enumValues"
>;

/**
 * The data-only effect state contract used at the import boundary.
 */
export interface ImportEffectStateDescriptor {
  readonly stateSchemaVersion: number;
  readonly parameters: readonly ImportParameterDescriptor[];
}

export interface ImportEffectDescriptor extends ImportEffectStateDescriptor {
  readonly placements: readonly ("module-pedalboard" | "send-chain" | "master-chain")[];
}

export interface ImportPluginMetadata {
  readonly kind: "instrument" | "effect";
  readonly pluginVersion: string;
  readonly apiVersion: 1;
  readonly stateSchemaVersion: number;
}

const MAXIMUM_REPORTED_ISSUES = 100;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SEMANTIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?$/;
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
const PLUGIN_KEYS = new Set(["pluginId", "kind", "pluginVersion", "apiVersion", "stateSchemaVersion"]);
const RACK_KEYS = new Set([
  "id",
  "moduleId",
  "pluginId",
  "parameters",
  "muted",
  "solo",
  "level",
  "pan",
  "sends",
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
const MIXER_KEYS = new Set(["channels", "sends", "master"]);
const MIXER_CHANNEL_KEYS = new Set([
  "slotId",
  "moduleId",
  "level",
  "pan",
  "muted",
  "solo",
  "sends",
  "moduleChainId",
]);
const MIXER_SEND_KEYS = new Set(["busId", "amount"]);
const MIXER_SEND_DEFINITION_KEYS = new Set(["busId"]);
const MASTER_KEYS = new Set(["level"]);
const EFFECTS_KEYS = new Set([
  "instances",
  "moduleChains",
  "sendChains",
  "sendEffectsBypassed",
  "masterChain",
  "masterEffectsBypassed",
]);
const EFFECT_INSTANCE_KEYS = new Set(["id", "pluginId", "stateVersion", "state", "bypassed", "mix", "gainDecibels"]);
const MODULE_CHAIN_KEYS = new Set(["moduleId", "slots", "bypassed"]);
const SEND_CHAIN_KEYS = new Set(["busId", "slots", "returnLevel", "bypassed", "pinnedEffectId"]);
const MASTER_CHAIN_KEYS = new Set(["slots"]);

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

function isSemanticVersion(value: string): boolean {
  return value.length <= 64 && SEMANTIC_VERSION_PATTERN.test(value);
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
  effects: EffectsDocument,
  options: ParseOptions,
): void {
  const laneIds = new Set<string>();
  const effectById = new Map(effects.instances.map((instance) => [instance.id, instance]));
  const effectDescriptors = options.effectDescriptorsByPluginId ?? {};
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
    const validScope =
      lane.scope === "module" ||
      lane.scope === "mixer" ||
      lane.scope === "send" ||
      lane.scope === "send-return" ||
      lane.scope === "effect" ||
      lane.scope === "master";
    if (!validScope) collector.add(`${path}.scope`, "Automation scope is not supported.");
    const parameterId = typeof lane.parameterId === "string" ? lane.parameterId : undefined;
    if (parameterId === undefined || parameterId.length === 0)
      collector.add(`${path}.parameterId`, "Automation parameter ID must not be empty.");
    let descriptor: ImportParameterDescriptor | undefined;
    let validateValue: ((value: ParameterValue) => string | undefined) | undefined;
    if (validScope && parameterId !== undefined) {
      if (lane.scope === "module") {
        const pluginId = typeof lane.targetId === "string" ? occupiedModules.get(lane.targetId) : undefined;
        if (!isCanonicalUuid(lane.targetId) || pluginId === undefined) {
          collector.add(`${path}.targetId`, "Automation target must resolve to an occupied module.");
        } else {
          descriptor = options.parameterDescriptorsByPluginId[pluginId]?.find(
            (candidate) => candidate.id === parameterId,
          );
          if (descriptor === undefined) {
            collector.add(
              `${path}.parameterId`,
              "Automation parameter is not declared by the target module plugin.",
            );
          }
        }
      } else if (lane.scope === "mixer") {
        if (!isCanonicalUuid(lane.targetId) || !occupiedModules.has(lane.targetId)) {
          collector.add(`${path}.targetId`, "Mixer automation target must resolve to an occupied module.");
        }
        validateValue = mixerAutomationValueValidator(parameterId, `${path}.parameterId`, collector);
      } else if (lane.scope === "send") {
        if (!isCanonicalUuid(lane.targetId) || !occupiedModules.has(lane.targetId)) {
          collector.add(`${path}.targetId`, "Send automation target must resolve to an occupied module.");
        }
        validateValue = sendAutomationValueValidator(parameterId, `${path}.parameterId`, collector);
      } else if (lane.scope === "send-return") {
        if (
          typeof lane.targetId !== "string" ||
          !SEND_BUS_IDS.some((busId) => busId === lane.targetId)
        ) {
          collector.add(`${path}.targetId`, "Send-return automation target must be send A through D.");
        }
        validateValue = sendReturnAutomationValueValidator(
          parameterId,
          `${path}.parameterId`,
          collector,
        );
      } else if (lane.scope === "effect") {
        const effect = typeof lane.targetId === "string" ? effectById.get(lane.targetId) : undefined;
        if (!isCanonicalUuid(lane.targetId) || effect === undefined) {
          collector.add(`${path}.targetId`, "Effect automation target must resolve to an effect instance.");
        } else if (parameterId === "mix") {
          validateValue = unitAutomationValue;
        } else if (parameterId === "gain") {
          validateValue = (value) =>
            finiteNumber(value, EFFECT_GAIN_MINIMUM_DECIBELS, EFFECT_GAIN_MAXIMUM_DECIBELS)
              ? undefined
              : "Automation value must be from -24 dB through 24 dB.";
        } else if (parameterId === "bypassed") {
          validateValue = booleanAutomationValue;
        } else {
          descriptor = effectDescriptors[effect.pluginId]?.parameters.find(
            (candidate) => candidate.id === parameterId,
          );
          if (descriptor === undefined && Object.keys(effectDescriptors).length > 0) {
            collector.add(
              `${path}.parameterId`,
              "Automation parameter is not declared by the target effect plugin.",
            );
          }
        }
      } else {
        if (lane.targetId !== "master") {
          collector.add(`${path}.targetId`, "Master automation target must be the master bus.");
        }
        validateValue = masterAutomationValueValidator(
          parameterId,
          `${path}.parameterId`,
          collector,
        );
      }
      if (descriptor !== undefined) {
        const declaredDescriptor = descriptor;
        validateValue = (value) => validateImportedParameter(value, declaredDescriptor);
      }
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
      else if (validateValue !== undefined) {
        const message = validateValue(step.value);
        if (message !== undefined) collector.add(`${stepPath}.value`, message);
      }
    }
  }
}

function mixerAutomationValueValidator(
  parameterId: string,
  path: string,
  collector: IssueCollector,
): (value: ParameterValue) => string | undefined {
  if (parameterId === "level") return unitAutomationValue;
  if (parameterId === "pan") {
    return (value) => finiteNumber(value, -1, 1) ? undefined : "Automation value must be from -1 through 1.";
  }
  if (parameterId === "muted" || parameterId === "solo") return booleanAutomationValue;
  collector.add(path, "Mixer automation parameter is not supported.");
  return invalidAutomationValue;
}

function sendAutomationValueValidator(
  parameterId: string,
  path: string,
  collector: IssueCollector,
): (value: ParameterValue) => string | undefined {
  if (/^send-[abcd]-amount$/u.test(parameterId)) return unitAutomationValue;
  collector.add(path, "Send automation parameter is not supported.");
  return invalidAutomationValue;
}

function sendReturnAutomationValueValidator(
  parameterId: string,
  path: string,
  collector: IssueCollector,
): (value: ParameterValue) => string | undefined {
  if (parameterId === "return-level") return unitAutomationValue;
  if (parameterId === "chain-bypassed") return booleanAutomationValue;
  collector.add(path, "Send-return automation parameter is not supported.");
  return invalidAutomationValue;
}

function masterAutomationValueValidator(
  parameterId: string,
  path: string,
  collector: IssueCollector,
): (value: ParameterValue) => string | undefined {
  if (parameterId === "level") return unitAutomationValue;
  if (parameterId === "effects-bypassed") return booleanAutomationValue;
  collector.add(path, "Master automation parameter is not supported.");
  return invalidAutomationValue;
}

function unitAutomationValue(value: ParameterValue): string | undefined {
  return finiteNumber(value, 0, 1) ? undefined : "Automation value must be from 0 through 1.";
}

function booleanAutomationValue(value: ParameterValue): string | undefined {
  return typeof value === "boolean" ? undefined : "Automation value must be boolean.";
}

function invalidAutomationValue(): string {
  return "Automation value has no supported parameter contract.";
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
    const patternLength =
      typeof pattern.durationBars === "number" && Number.isSafeInteger(pattern.durationBars)
        ? pattern.durationBars * 16 * PATTERN_TICKS_PER_STEP
        : undefined;
    if (patternLength !== undefined && Array.isArray(pattern.automationLaneIds)) {
      for (const laneId of pattern.automationLaneIds) {
        if (typeof laneId !== "string") continue;
        const record = laneById.get(laneId);
        if (
          record === undefined ||
          record.lane.scope === "module" ||
          !Array.isArray(record.lane.steps)
        ) {
          continue;
        }
        validateLaneStepMaximum(record, patternLength, "Pattern", collector);
      }
    }
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
        validateLaneStepMaximum(
          record,
          length * PATTERN_TICKS_PER_STEP,
          "Pattern part",
          collector,
        );
      }
    }
  }
}

function validateLaneStepMaximum(
  record: {
    readonly lane: Readonly<Record<string, unknown>>;
    readonly index: number;
  },
  maximumTick: number,
  owner: "Pattern" | "Pattern part",
  collector: IssueCollector,
): void {
  if (!Array.isArray(record.lane.steps)) return;
  for (const [stepIndex, step] of record.lane.steps.entries()) {
    if (!isPlainRecord(step) || typeof step.tick !== "number") continue;
    if (step.tick >= maximumTick) {
      collector.add(
        `automation[${String(record.index)}].steps[${String(stepIndex)}].tick`,
        `Automation step must stay inside its ${owner} length.`,
      );
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
    if (
      lane.scope === "module" &&
      !partLaneIds.get(automationOwnerKey(lane.patternId, lane.targetId))?.has(laneId)
    ) {
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
    } else if (
      lane.patternId !== patternId ||
      (moduleId !== undefined && (lane.scope !== "module" || lane.targetId !== moduleId))
    ) {
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

function validateSendDocuments(value: unknown, path: string, collector: IssueCollector): void {
  if (!Array.isArray(value) || value.length !== SEND_BUS_IDS.length) {
    collector.add(path, "A channel must contain exactly four sends.");
    return;
  }
  for (const [index, send] of value.entries()) {
    const sendPath = `${path}[${String(index)}]`;
    if (!isPlainRecord(send)) {
      collector.add(sendPath, "A send must be an object.");
      continue;
    }
    collector.exactKeys(send, MIXER_SEND_KEYS, sendPath);
    if (send.busId !== SEND_BUS_IDS[index]) collector.add(`${sendPath}.busId`, "Send buses must stay in A through D order.");
    if (!finiteNumber(send.amount, 0, 1)) collector.add(`${sendPath}.amount`, "Send amount must be from 0 through 1.");
  }
}

function sameSendDocuments(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const leftItems: readonly unknown[] = left;
  const rightItems: readonly unknown[] = right;
  return leftItems.every((send, index) => {
    const other = rightItems[index];
    return isPlainRecord(send) && isPlainRecord(other) &&
      send.busId === other.busId && send.amount === other.amount;
  });
}

function validateMixerDocument(
  value: unknown,
  rack: readonly unknown[],
  collector: IssueCollector,
): void {
  if (!isPlainRecord(value)) {
    collector.add("mixer", "Mixer must be an object.");
    return;
  }
  collector.exactKeys(value, MIXER_KEYS, "mixer");
  if (!Array.isArray(value.channels) || value.channels.length !== RACK_SLOT_IDS.length) {
    collector.add("mixer.channels", "Mixer must contain exactly eight fixed channels.");
  } else {
    for (const [index, channel] of value.channels.entries()) {
      const path = `mixer.channels[${String(index)}]`;
      if (!isPlainRecord(channel)) {
        collector.add(path, "Mixer channel must be an object.");
        continue;
      }
      collector.exactKeys(channel, MIXER_CHANNEL_KEYS, path);
      if (channel.slotId !== RACK_SLOT_IDS[index]) collector.add(`${path}.slotId`, "Mixer channels must stay in fixed slot order.");
      if (!finiteNumber(channel.level, 0, 1)) collector.add(`${path}.level`, "Channel level must be from 0 through 1.");
      if (!finiteNumber(channel.pan, -1, 1)) collector.add(`${path}.pan`, "Channel pan must be from -1 through 1.");
      if (typeof channel.muted !== "boolean") collector.add(`${path}.muted`, "Channel muted must be boolean.");
      if (typeof channel.solo !== "boolean") collector.add(`${path}.solo`, "Channel solo must be boolean.");
      validateSendDocuments(channel.sends, `${path}.sends`, collector);
      const slot = rack[index];
      if (!isPlainRecord(slot)) continue;
      const moduleId = typeof slot.moduleId === "string" ? slot.moduleId : null;
      if (channel.moduleId !== moduleId) collector.add(`${path}.moduleId`, "Mixer channel must match its rack slot module.");
      if (channel.moduleChainId !== moduleId) collector.add(`${path}.moduleChainId`, "Mixer channel must reference its matching module chain.");
      if (moduleId === null) {
        if (channel.level !== DEFAULT_MODULE_LEVEL || channel.pan !== 0 || channel.muted !== false || channel.solo !== false)
          collector.add(path, "An empty mixer channel must use its neutral state.");
      } else {
        for (const key of ["level", "pan", "muted", "solo"] as const) {
          if (channel[key] !== slot[key]) collector.add(`${path}.${key}`, "Mixer channel does not match its rack module state.");
        }
        if (!sameSendDocuments(channel.sends, slot.sends))
          collector.add(`${path}.sends`, "Mixer channel sends do not match its rack module state.");
      }
    }
  }
  if (!Array.isArray(value.sends) || value.sends.length !== SEND_BUS_IDS.length) {
    collector.add("mixer.sends", "Mixer must contain exactly four send definitions.");
  } else {
    for (const [index, send] of value.sends.entries()) {
      const path = `mixer.sends[${String(index)}]`;
      if (!isPlainRecord(send)) {
        collector.add(path, "Send definition must be an object.");
        continue;
      }
      collector.exactKeys(send, MIXER_SEND_DEFINITION_KEYS, path);
      if (send.busId !== SEND_BUS_IDS[index]) collector.add(`${path}.busId`, "Send definitions must stay in A through D order.");
    }
  }
  if (!isPlainRecord(value.master)) {
    collector.add("mixer.master", "Master must be an object.");
  } else {
    collector.exactKeys(value.master, MASTER_KEYS, "mixer.master");
    if (!finiteNumber(value.master.level, 0, 1)) collector.add("mixer.master.level", "Master level must be from 0 through 1.");
  }
}

function parseEffects(
  value: unknown,
  collector: IssueCollector,
  occupiedModules: ReadonlyMap<string, string>,
  requirements: ReadonlyMap<string, PluginRequirementDocument>,
  options: ParseOptions,
): ParsedEffects {
  if (!isPlainRecord(value)) {
    collector.add("effects", "Effects must be an object.");
    return { document: emptyEffectsDocument(), referencedPluginIds: new Set() };
  }
  collector.exactKeys(value, EFFECTS_KEYS, "effects");
  const effectDescriptors = options.effectDescriptorsByPluginId ?? {};
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
      let effectDescriptor: ImportEffectDescriptor | undefined;
      if (!pluginId.ok) collector.issues.push(...pluginId.issues);
      else {
        if (Object.keys(effectDescriptors).length > 0 && effectDescriptors[pluginId.value] === undefined)
          collector.add(`${path}.pluginId`, "Effect plugin is not available in this build.");
        effectDescriptor = effectDescriptors[pluginId.value];
        const requirement = requirements.get(pluginId.value);
        if (requirement === undefined) {
          collector.add(`${path}.pluginId`, "Effect plugin has no matching requirement.");
        } else if (requirement.kind !== "effect") collector.add(`${path}.pluginId`, "Effect instance requires an effect plugin.");
      }
      if (!Number.isSafeInteger(instance.stateVersion) || Number(instance.stateVersion) < 1) {
        collector.add(`${path}.stateVersion`, "Effect state version must be a positive integer.");
      } else if (
        effectDescriptor !== undefined &&
        instance.stateVersion !== effectDescriptor.stateSchemaVersion
      ) {
        collector.add(
          `${path}.stateVersion`,
          `Effect state version must be ${String(effectDescriptor.stateSchemaVersion)}.`,
        );
      }
      if (effectDescriptor !== undefined)
        validateEffectState(instance.state, effectDescriptor, `${path}.state`, collector);
      if (typeof instance.bypassed !== "boolean") collector.add(`${path}.bypassed`, "Effect bypassed must be boolean.");
      if (!finiteNumber(instance.mix, 0, 1)) collector.add(`${path}.mix`, "Effect Mix must be from 0 through 1.");
      if (!finiteNumber(instance.gainDecibels, -24, 24)) collector.add(`${path}.gainDecibels`, "Effect Gain must be from -24 dB through 24 dB.");
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
          bypassed: instance.bypassed === true,
          mix: typeof instance.mix === "number" ? instance.mix : 0,
          gainDecibels: typeof instance.gainDecibels === "number" ? instance.gainDecibels : 0,
        });
      }
    }
  }

  const references = new Map<string, number>();
  const registerReference = (id: unknown, placement: "module-pedalboard" | "send-chain" | "master-chain", path: string): void => {
    if (id === null) return;
    if (!isCanonicalUuid(id)) {
      collector.add(path, "Expected a lowercase canonical UUID version 4 or null.");
      return;
    }
    if (!instanceIds.has(id)) collector.add(path, "Effect chain references an unknown effect instance.");
    else {
      references.set(id, (references.get(id) ?? 0) + 1);
      const instance = instances.find((candidate) => candidate.id === id);
      const descriptor = instance === undefined ? undefined : effectDescriptors[instance.pluginId];
      if (descriptor !== undefined && !descriptor.placements.includes(placement))
        collector.add(path, "Effect plugin does not support this chain placement.");
      if (descriptor === undefined && Object.keys(effectDescriptors).length > 0)
        collector.add(path, "Effect plugin has no registered chain placement contract.");
    }
  };
  const moduleChains: ModuleChainDocument[] = [];
  const moduleChainIds = new Set<string>();
  if (!Array.isArray(value.moduleChains)) collector.add("effects.moduleChains", "Module chains must be an array.");
  else for (const [index, chain] of value.moduleChains.entries()) {
    const path = `effects.moduleChains[${String(index)}]`;
    if (!isPlainRecord(chain)) { collector.add(path, "Module chain must be an object."); continue; }
    collector.exactKeys(chain, MODULE_CHAIN_KEYS, path);
    if (!isCanonicalUuid(chain.moduleId) || !occupiedModules.has(chain.moduleId) || moduleChainIds.has(chain.moduleId))
      collector.add(`${path}.moduleId`, "Module chain must uniquely resolve to an occupied module.");
    else moduleChainIds.add(chain.moduleId);
    validateEffectSlots(chain.slots, MODULE_EFFECT_CHAIN_SLOT_COUNT, `${path}.slots`, "module-pedalboard", registerReference, collector);
    if (chain.bypassed !== undefined && typeof chain.bypassed !== "boolean") {
      collector.add(`${path}.bypassed`, "Module chain bypassed must be boolean.");
    }
    if (typeof chain.moduleId === "string" && Array.isArray(chain.slots)) {
      moduleChains.push({
        moduleId: chain.moduleId,
        slots: chain.slots as readonly (string | null)[],
        bypassed: chain.bypassed === true,
      });
    }
  }
  for (const moduleId of occupiedModules.keys()) if (!moduleChainIds.has(moduleId)) collector.add("effects.moduleChains", `Missing module chain for ${moduleId}.`);

  const sendChains: SendChainDocument[] = [];
  const sendChainIds = new Set<string>();
  if (!Array.isArray(value.sendChains) || value.sendChains.length !== SEND_BUS_IDS.length) collector.add("effects.sendChains", "Effects must contain exactly four send chains.");
  else for (const [index, chain] of value.sendChains.entries()) {
    const path = `effects.sendChains[${String(index)}]`;
    if (!isPlainRecord(chain)) { collector.add(path, "Send chain must be an object."); continue; }
    collector.exactKeys(chain, SEND_CHAIN_KEYS, path);
    if (chain.busId !== SEND_BUS_IDS[index] || sendChainIds.has(String(chain.busId))) collector.add(`${path}.busId`, "Send chains must stay in A through D order.");
    else sendChainIds.add(String(chain.busId));
    validateEffectSlots(chain.slots, SEND_EFFECT_CHAIN_SLOT_COUNT, `${path}.slots`, "send-chain", registerReference, collector);
    if (!finiteNumber(chain.returnLevel, 0, 1)) collector.add(`${path}.returnLevel`, "Send return level must be from 0 through 1.");
    if (typeof chain.bypassed !== "boolean") collector.add(`${path}.bypassed`, "Send chain bypassed must be boolean.");
    if (chain.pinnedEffectId !== null) {
      if (!isCanonicalUuid(chain.pinnedEffectId) || !Array.isArray(chain.slots) || !chain.slots.includes(chain.pinnedEffectId)) collector.add(`${path}.pinnedEffectId`, "Pinned effect must reference an effect in this send chain or be null.");
    }
    if (typeof chain.busId === "string" && Array.isArray(chain.slots) && typeof chain.returnLevel === "number" && typeof chain.bypassed === "boolean" && (chain.pinnedEffectId === null || typeof chain.pinnedEffectId === "string")) sendChains.push({ busId: chain.busId, slots: chain.slots as readonly (string | null)[], returnLevel: chain.returnLevel, bypassed: chain.bypassed, pinnedEffectId: chain.pinnedEffectId });
  }

  let masterChain: MasterChainDocument = { slots: [] };
  if (!isPlainRecord(value.masterChain)) collector.add("effects.masterChain", "Master chain must be an object.");
  else {
    collector.exactKeys(value.masterChain, MASTER_CHAIN_KEYS, "effects.masterChain");
    validateEffectSlots(value.masterChain.slots, MASTER_EFFECT_CHAIN_SLOT_COUNT, "effects.masterChain.slots", "master-chain", registerReference, collector);
    if (Array.isArray(value.masterChain.slots)) {
      const slots: readonly unknown[] = value.masterChain.slots;
      masterChain = { slots: slots as readonly (string | null)[] };
      const limiterId = slots.at(-1);
      const limiter = typeof limiterId === "string"
        ? instances.find((instance) => instance.id === limiterId)
        : undefined;
      if (limiter?.pluginId !== PROTECTED_LIMITER_EFFECT_PLUGIN_ID) collector.add("effects.masterChain.slots", "The final master slot must be the protected limiter.");
    }
  }
  if (
    value.sendEffectsBypassed !== undefined &&
    typeof value.sendEffectsBypassed !== "boolean"
  ) {
    collector.add(
      "effects.sendEffectsBypassed",
      "All send effects bypassed must be boolean.",
    );
  }
  if (typeof value.masterEffectsBypassed !== "boolean") collector.add("effects.masterEffectsBypassed", "Master effects bypassed must be boolean.");

  for (const instance of instances) {
    const count = references.get(instance.id) ?? 0;
    if (count !== 1) {
      collector.add(
        "effects.instances",
        count === 0
          ? "Each effect instance must have one chain reference."
          : "An effect instance cannot occupy more than one chain slot.",
      );
    }
  }
  return {
    document: {
      instances,
      moduleChains,
      sendChains,
      sendEffectsBypassed: value.sendEffectsBypassed === true,
      masterChain,
      masterEffectsBypassed: value.masterEffectsBypassed === true,
    },
    referencedPluginIds: new Set(instances.map((instance) => instance.pluginId)),
  };
}

function validateEffectSlots(
  value: unknown,
  count: number,
  path: string,
  placement: "module-pedalboard" | "send-chain" | "master-chain",
  registerReference: (id: unknown, placement: "module-pedalboard" | "send-chain" | "master-chain", path: string) => void,
  collector: IssueCollector,
): void {
  if (!Array.isArray(value) || value.length !== count) { collector.add(path, `Effect chain must contain exactly ${String(count)} slots.`); return; }
  for (const [index, id] of value.entries()) registerReference(id, placement, `${path}[${String(index)}]`);
}

function emptyEffectsDocument(): EffectsDocument {
  return {
    instances: [],
    moduleChains: [],
    sendChains: [],
    sendEffectsBypassed: false,
    masterChain: { slots: [] },
    masterEffectsBypassed: false,
  };
}

function validateEffectState(
  value: unknown,
  descriptor: ImportEffectStateDescriptor,
  path: string,
  collector: IssueCollector,
): void {
  if (!isPlainRecord(value)) {
    collector.add(path, "Effect state must be an object.");
    return;
  }
  collector.exactKeys(value, new Set(descriptor.parameters.map((parameter) => parameter.id)), path);
  for (const parameter of descriptor.parameters) {
    if (!Object.hasOwn(value, parameter.id)) {
      collector.add(`${path}.${parameter.id}`, "Effect state is missing a required value.");
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
  const migratedRack = (value.rack as readonly unknown[]).map((raw) => {
    if (!isPlainRecord(raw) || typeof raw.moduleId !== "string") return raw;
    return {
      ...raw,
      sends: SEND_BUS_IDS.map((busId) => ({ busId, amount: 0, mode: "post-fader" as const })),
    };
  });
  const migratedMixer = formatOneMixerDocument(migratedRack, value.mixer);
  const migratedEffects = formatOneEffectsDocument(value.effects, projectId, migratedRack);
  const migratedPlugins = formatOnePluginRequirements(value.plugins, migratedRack, migratedEffects.instances);
  return {
    ok: true,
    value: {
      format: value.format,
      formatVersion: 2,
      project: value.project,
      plugins: migratedPlugins,
      rack: migratedRack,
      patterns: migratedPatterns,
      song: { enabled: value.songEnabled === true, playlist },
      activePatternId,
      automation: [],
      mixer: migratedMixer,
      effects: migratedEffects,
      assets: [],
      migrations: [migratedRecord],
    },
  };
}

function formatOneMixerDocument(rack: readonly unknown[], legacyMixer: unknown): MixerDocument {
  const legacyMaster = isPlainRecord(legacyMixer) && finiteNumber(legacyMixer.masterLevel, 0, 1)
    ? legacyMixer.masterLevel
    : DEFAULT_MASTER_LEVEL;
  return {
    channels: RACK_SLOT_IDS.map((slotId, index) => {
      const slot = rack[index];
      const module = isPlainRecord(slot) && typeof slot.moduleId === "string" ? slot : undefined;
      const sends = SEND_BUS_IDS.map((busId) => ({ busId, amount: 0, mode: "post-fader" as const }));
      return {
        slotId,
        moduleId: typeof module?.moduleId === "string" ? module.moduleId : null,
        level: typeof module?.level === "number" ? module.level : DEFAULT_MODULE_LEVEL,
        pan: typeof module?.pan === "number" ? module.pan : 0,
        muted: module?.muted === true,
        solo: module?.solo === true,
        sends,
        moduleChainId: typeof module?.moduleId === "string" ? module.moduleId : null,
      };
    }),
    sends: SEND_BUS_IDS.map((busId) => ({ busId })),
    master: { level: legacyMaster },
  };
}

interface FormatTwoEffectInstanceDocument {
  readonly id: string;
  readonly pluginId: string;
  readonly stateVersion: number;
  readonly state: Readonly<Record<string, ParameterValue>>;
  readonly bypassed: boolean;
  readonly wetDry: number;
}

interface FormatTwoEffectsDocument extends Omit<EffectsDocument, "instances"> {
  readonly instances: readonly FormatTwoEffectInstanceDocument[];
}

function formatOneEffectsDocument(value: unknown, projectId: string, rack: readonly unknown[]): FormatTwoEffectsDocument {
  const old = isPlainRecord(value) ? value : {};
  const oldInstances = Array.isArray(old.instances) ? old.instances : [];
  const instances: FormatTwoEffectInstanceDocument[] = oldInstances.flatMap((raw) => {
    if (!isPlainRecord(raw) || typeof raw.id !== "string" || typeof raw.pluginId !== "string" ||
      typeof raw.stateVersion !== "number" || !isPlainRecord(raw.state)) return [];
    return [{ id: raw.id, pluginId: raw.pluginId, stateVersion: raw.stateVersion, state: raw.state as Readonly<Record<string, ParameterValue>>, bypassed: false, wetDry: 1 }];
  });
  if (
    Array.isArray(old.moduleChains) &&
    Array.isArray(old.sendChains) &&
    isPlainRecord(old.masterChain) &&
    typeof old.masterEffectsBypassed === "boolean"
  ) {
    const moduleIds = new Set(
      rack.flatMap((slot) =>
        isPlainRecord(slot) && typeof slot.moduleId === "string" ? [slot.moduleId] : [],
      ),
    );
    const moduleChains = (old.moduleChains as readonly ModuleChainDocument[]).filter((chain) =>
      moduleIds.has(chain.moduleId),
    );
    const sendChains = old.sendChains as readonly SendChainDocument[];
    const masterChain = old.masterChain as unknown as MasterChainDocument;
    const referencedIds = new Set<string>();
    for (const chain of [...moduleChains, ...sendChains, masterChain]) {
      for (const id of chain.slots) if (id !== null) referencedIds.add(id);
    }
    return {
      instances: instances.filter((instance) => referencedIds.has(instance.id)),
      moduleChains,
      sendChains,
      masterChain,
      masterEffectsBypassed: old.masterEffectsBypassed,
    };
  }
  const add = (pluginId: string, key: string): string => {
    const id = stableMigrationUuid(`${projectId}:effect:${key}`);
    instances.push({ id, pluginId, stateVersion: 1, state: {}, bypassed: false, wetDry: 1 });
    return id;
  };
  const sendChains = SEND_BUS_IDS.map((busId, index) => {
    const pluginId = ["delay", "reverb", "stereo-width", "distortion"][index] ?? "distortion";
    const id = add(pluginId, busId);
    return { busId, slots: [id, ...Array.from({ length: SEND_EFFECT_CHAIN_SLOT_COUNT - 1 }, () => null)], returnLevel: 1, bypassed: false, pinnedEffectId: id };
  });
  const compressor = add("compressor", "master-compressor");
  const equalizer = add("parametric-eq", "master-parametric-eq");
  const limiter = add(PROTECTED_LIMITER_EFFECT_PLUGIN_ID, "master-limiter");
  return {
    instances,
    moduleChains: rack.flatMap((slot) => isPlainRecord(slot) && typeof slot.moduleId === "string"
      ? [{ moduleId: slot.moduleId, slots: Array.from({ length: MODULE_EFFECT_CHAIN_SLOT_COUNT }, () => null) }]
      : []),
    sendChains,
    masterChain: {
      slots: [
        compressor,
        equalizer,
        ...Array.from({ length: MASTER_EFFECT_CHAIN_SLOT_COUNT - 3 }, () => null),
        limiter,
      ],
    },
    masterEffectsBypassed: false,
  };
}

function formatOnePluginRequirements(
  value: unknown,
  rack: readonly unknown[],
  effectInstances: readonly { readonly pluginId: string }[],
): readonly PluginRequirementDocument[] {
  const existing = Array.isArray(value) ? value : [];
  const effectIds = new Set(effectInstances.map((instance) => instance.pluginId));
  const rackIds = new Set(rack.flatMap((slot) => isPlainRecord(slot) && typeof slot.pluginId === "string" ? [slot.pluginId] : []));
  return existing.flatMap((raw) => {
    if (!isPlainRecord(raw) || typeof raw.pluginId !== "string" || typeof raw.stateSchemaVersion !== "number") return [];
    return [{ pluginId: raw.pluginId, kind: effectIds.has(raw.pluginId) && !rackIds.has(raw.pluginId) ? "effect" as const : "instrument" as const, pluginVersion: "1.0.0", apiVersion: 1 as const, stateSchemaVersion: raw.stateSchemaVersion }];
  }).concat(
    [...effectIds].filter((pluginId) => !existing.some((raw) => isPlainRecord(raw) && raw.pluginId === pluginId)).map((pluginId) => ({ pluginId, kind: "effect" as const, pluginVersion: "1.0.0", apiVersion: 1 as const, stateSchemaVersion: 1 })),
  );
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

interface LegacyEffectMixState {
  readonly dryWet: number;
  readonly pluginMix: number;
}

function collapseLegacyEffectMix(pluginMix: number, dryWet: number): {
  readonly mix: number;
  readonly gainDecibels: number;
} {
  const innerAngle = (pluginMix * Math.PI) / 2;
  const outerAngle = (dryWet * Math.PI) / 2;
  const dryCoefficient = Math.cos(outerAngle) + Math.cos(innerAngle) * Math.sin(outerAngle);
  const wetCoefficient = Math.sin(innerAngle) * Math.sin(outerAngle);
  const gain = Math.hypot(dryCoefficient, wetCoefficient);
  return {
    mix: gain === 0 ? 0 : (Math.atan2(wetCoefficient, dryCoefficient) * 2) / Math.PI,
    gainDecibels: gain === 0 ? -24 : Math.max(-24, Math.min(24, 20 * Math.log10(gain))),
  };
}

function migrateFormatTwoDocument(
  value: Readonly<Record<string, unknown>>,
): DocumentResult<Readonly<Record<string, unknown>>> {
  if (!isPlainRecord(value.effects) || !Array.isArray(value.effects.instances)) {
    return failure("effects.instances", "Format 2 effect instances must be an array.");
  }
  if (!Array.isArray(value.migrations)) {
    return failure("migrations", "Format 2 migrations must be an array.");
  }
  const legacyById = new Map<string, LegacyEffectMixState>();
  const limiterIds = new Set<string>();
  const collector = new IssueCollector();
  const legacyInstances: readonly unknown[] = value.effects.instances;
  const instances = legacyInstances.map((candidate, index) => {
    if (!isPlainRecord(candidate) || !isPlainRecord(candidate.state)) return candidate;
    const path = `effects.instances[${String(index)}]`;
    const hasPluginMix = Object.hasOwn(candidate.state, "mix");
    if (!finiteNumber(candidate.wetDry, 0, 1)) {
      collector.add(`${path}.wetDry`, "Format 2 effect wetDry must be from 0 through 1.");
    }
    if (hasPluginMix && !finiteNumber(candidate.state.mix, 0, 1)) {
      collector.add(`${path}.state.mix`, "Format 2 plugin Mix must be from 0 through 1.");
    }
    const pluginMix = finiteNumber(candidate.state.mix, 0, 1) ? candidate.state.mix : 1;
    const dryWet = finiteNumber(candidate.wetDry, 0, 1) ? candidate.wetDry : 1;
    if (typeof candidate.id === "string") legacyById.set(candidate.id, { dryWet, pluginMix });
    const collapsed = collapseLegacyEffectMix(pluginMix, dryWet);
    const state = { ...candidate.state };
    delete state.mix;
    const pluginId = typeof candidate.pluginId === "string" ? candidate.pluginId : "";
    if (pluginId === PROTECTED_LIMITER_EFFECT_PLUGIN_ID && typeof candidate.id === "string") {
      limiterIds.add(candidate.id);
    }
    if (pluginId === PROTECTED_LIMITER_EFFECT_PLUGIN_ID && typeof state.gain === "number") {
      state.input = state.gain;
      delete state.gain;
    }
    const rest = Object.fromEntries(
      Object.entries(candidate).filter(([key]) => key !== "wetDry"),
    );
    return { ...rest, state, ...collapsed };
  });
  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
  }
  const migrateSends = (candidate: unknown): unknown => {
    if (!isPlainRecord(candidate) || !Array.isArray(candidate.sends)) return candidate;
    const sends: readonly unknown[] = candidate.sends;
    return {
      ...candidate,
      sends: sends.map((send) => {
        if (!isPlainRecord(send)) return send;
        return Object.fromEntries(Object.entries(send).filter(([key]) => key !== "mode"));
      }),
    };
  };
  const rack = Array.isArray(value.rack) ? value.rack.map(migrateSends) : value.rack;
  const mixer = isPlainRecord(value.mixer) && Array.isArray(value.mixer.channels)
    ? { ...value.mixer, channels: value.mixer.channels.map(migrateSends) }
    : value.mixer;
  const automationResult = migrateFormatTwoEffectAutomation(
    value.automation,
    value.patterns,
    value.rack,
    legacyById,
    limiterIds,
    isPlainRecord(value.project) && typeof value.project.id === "string"
      ? value.project.id
      : "missing-project",
  );
  if (!automationResult.ok) return automationResult;
  const migrations: readonly unknown[] = value.migrations;
  return {
    ok: true,
    value: {
      ...value,
      formatVersion: 3,
      rack,
      mixer,
      patterns: automationResult.value.patterns,
      automation: automationResult.value.automation,
      effects: { ...value.effects, instances },
      migrations: [
        ...migrations,
        {
          scope: "project",
          id: FORMAT_TWO_MIGRATION_ID,
          fromVersion: 2,
          toVersion: 3,
          implementation: "1.0.0",
        },
      ],
    },
  };
}

function migrateFormatTwoEffectAutomation(
  rawAutomation: unknown,
  rawPatterns: unknown,
  rawRack: unknown,
  legacyById: ReadonlyMap<string, LegacyEffectMixState>,
  limiterIds: ReadonlySet<string>,
  projectId: string,
): DocumentResult<{ readonly automation: unknown; readonly patterns: unknown }> {
  if (!Array.isArray(rawAutomation) || !Array.isArray(rawPatterns)) {
    return { ok: true, value: { automation: rawAutomation, patterns: rawPatterns } };
  }
  const automationValues: readonly unknown[] = rawAutomation;
  const patternValues: readonly unknown[] = rawPatterns;
  const moduleIds = new Set(
    Array.isArray(rawRack)
      ? rawRack.flatMap((slot) =>
          isPlainRecord(slot) && typeof slot.moduleId === "string" ? [slot.moduleId] : [],
        )
      : [],
  );
  const patternIds = new Set(
    patternValues.flatMap((pattern) =>
      isPlainRecord(pattern) && typeof pattern.id === "string" ? [pattern.id] : [],
    ),
  );
  const validated = validateFormatTwoAutomationForMigration(
    automationValues,
    patternIds,
    moduleIds,
    new Set(legacyById.keys()),
  );
  if (!validated.ok) return validated;
  const source = validated.value;
  const groups = new Map<string, Readonly<Record<string, unknown>>[]>();
  const retained: Readonly<Record<string, unknown>>[] = [];
  const droppedLaneIds = new Set<string>();
  for (const lane of source) {
    if (
      lane.scope === "effect" &&
      typeof lane.targetId === "string" &&
      typeof lane.patternId === "string" &&
      (lane.parameterId === "mix" || lane.parameterId === "wet-dry")
    ) {
      const key = `${lane.patternId}:${lane.targetId}`;
      groups.set(key, [...(groups.get(key) ?? []), lane]);
      continue;
    }
    if (
      lane.scope === "send" &&
      typeof lane.parameterId === "string" &&
      /^send-[abcd]-mode$/u.test(lane.parameterId)
    ) {
      if (typeof lane.id === "string") droppedLaneIds.add(lane.id);
      continue;
    }
    if (
      lane.scope === "effect" &&
      typeof lane.targetId === "string" &&
      limiterIds.has(lane.targetId) &&
      lane.parameterId === "gain"
    ) {
      retained.push({ ...lane, parameterId: "input" });
      continue;
    }
    retained.push(lane);
  }
  const addedLaneIdsByPattern = new Map<string, string[]>();
  for (const [key, lanes] of groups) {
    const separator = key.indexOf(":");
    const patternId = key.slice(0, separator);
    const targetId = key.slice(separator + 1);
    const legacy = legacyById.get(targetId) ?? { pluginMix: 1, dryWet: 1 };
    const innerLane = lanes.find((lane) => lane.parameterId === "mix");
    const outerLane = lanes.find((lane) => lane.parameterId === "wet-dry");
    const ticks = new Set<number>();
    for (const lane of lanes) {
      if (!Array.isArray(lane.steps)) continue;
      for (const step of lane.steps) {
        if (isPlainRecord(step) && typeof step.tick === "number") ticks.add(step.tick);
      }
    }
    const orderedTicks = [...ticks].toSorted((left, right) => left - right);
    const mixSteps = orderedTicks.map((tick) => {
      const pluginMix = automationValueAt(innerLane, tick, legacy.pluginMix);
      const dryWet = automationValueAt(outerLane, tick, legacy.dryWet);
      return { tick, value: collapseLegacyEffectMix(pluginMix, dryWet).mix };
    });
    const gainSteps = orderedTicks.map((tick) => {
      const pluginMix = automationValueAt(innerLane, tick, legacy.pluginMix);
      const dryWet = automationValueAt(outerLane, tick, legacy.dryWet);
      return { tick, value: collapseLegacyEffectMix(pluginMix, dryWet).gainDecibels };
    });
    const mixTemplate = outerLane ?? innerLane;
    if (mixTemplate === undefined) continue;
    retained.push({ ...mixTemplate, parameterId: "mix", steps: mixSteps });
    const gainTemplate = innerLane !== undefined && innerLane !== mixTemplate ? innerLane : undefined;
    if (gainTemplate !== undefined || gainSteps.some((step) => Math.abs(step.value) > 1e-9)) {
      const gainId =
        typeof gainTemplate?.id === "string"
          ? gainTemplate.id
          : stableMigrationUuid(`${projectId}:${patternId}:${targetId}:effect-gain`);
      retained.push({ ...mixTemplate, ...gainTemplate, id: gainId, parameterId: "gain", steps: gainSteps });
      if (gainTemplate === undefined) {
        addedLaneIdsByPattern.set(patternId, [...(addedLaneIdsByPattern.get(patternId) ?? []), gainId]);
      }
    }
  }
  const patterns = patternValues.map((pattern) => {
    if (!isPlainRecord(pattern) || typeof pattern.id !== "string") return pattern;
    const added = addedLaneIdsByPattern.get(pattern.id) ?? [];
    if (!Array.isArray(pattern.automationLaneIds)) return pattern;
    if (added.length === 0 && droppedLaneIds.size === 0) return pattern;
    const laneIds: readonly unknown[] = pattern.automationLaneIds;
    const remaining = laneIds.filter(
      (laneId) => typeof laneId !== "string" || !droppedLaneIds.has(laneId),
    );
    return { ...pattern, automationLaneIds: [...remaining, ...added] };
  });
  return { ok: true, value: { automation: retained, patterns } };
}

function validateFormatTwoAutomationForMigration(
  values: readonly unknown[],
  patternIds: ReadonlySet<string>,
  moduleIds: ReadonlySet<string>,
  effectIds: ReadonlySet<string>,
): DocumentResult<readonly Readonly<Record<string, unknown>>[]> {
  const collector = new IssueCollector();
  const lanes: Readonly<Record<string, unknown>>[] = [];
  const laneIds = new Set<string>();
  for (const [index, candidate] of values.entries()) {
    const path = `automation[${String(index)}]`;
    if (!isPlainRecord(candidate)) {
      collector.add(path, "Format 2 automation lane must be an object.");
      continue;
    }
    lanes.push(candidate);
    collector.exactKeys(candidate, AUTOMATION_LANE_KEYS, path);
    if (!isCanonicalUuid(candidate.id) || laneIds.has(candidate.id)) {
      collector.add(`${path}.id`, "Format 2 automation lane ID must be a unique canonical UUID.");
    } else {
      laneIds.add(candidate.id);
    }
    if (!isCanonicalUuid(candidate.patternId) || !patternIds.has(candidate.patternId)) {
      collector.add(`${path}.patternId`, "Format 2 automation Pattern reference must resolve.");
    }
    if (candidate.stepTicks !== PATTERN_TICKS_PER_STEP) {
      collector.add(`${path}.stepTicks`, "Format 2 automation step size must be 240 ticks.");
    }
    if (typeof candidate.parameterId !== "string" || candidate.parameterId.length === 0) {
      collector.add(`${path}.parameterId`, "Format 2 automation parameter ID must not be empty.");
    }
    const scope = candidate.scope;
    if (scope === "module" || scope === "mixer" || scope === "send") {
      if (!isCanonicalUuid(candidate.targetId) || !moduleIds.has(candidate.targetId)) {
        collector.add(`${path}.targetId`, "Format 2 module automation target must resolve.");
      }
    } else if (scope === "effect") {
      if (!isCanonicalUuid(candidate.targetId) || !effectIds.has(candidate.targetId)) {
        collector.add(`${path}.targetId`, "Format 2 effect automation target must resolve.");
      }
    } else if (scope === "send-return") {
      if (!SEND_BUS_IDS.some((busId) => busId === candidate.targetId)) {
        collector.add(`${path}.targetId`, "Format 2 send-return target must be send A through D.");
      }
    } else if (scope === "master") {
      if (candidate.targetId !== "master") {
        collector.add(`${path}.targetId`, "Format 2 master automation target must be master.");
      }
    } else {
      collector.add(`${path}.scope`, "Format 2 automation scope is not supported.");
    }
    if (!Array.isArray(candidate.steps)) {
      collector.add(`${path}.steps`, "Format 2 automation steps must be an array.");
      continue;
    }
    const ticks = new Set<number>();
    let greatestTick = -1;
    for (const [stepIndex, step] of candidate.steps.entries()) {
      const stepPath = `${path}.steps[${String(stepIndex)}]`;
      if (!isPlainRecord(step)) {
        collector.add(stepPath, "Format 2 automation step must be an object.");
        continue;
      }
      collector.exactKeys(step, AUTOMATION_STEP_KEYS, stepPath);
      const invalidTick =
        typeof step.tick !== "number" ||
        !Number.isSafeInteger(step.tick) ||
        step.tick < 0 ||
        step.tick % PATTERN_TICKS_PER_STEP !== 0 ||
        ticks.has(step.tick) ||
        step.tick <= greatestTick;
      if (invalidTick) {
        collector.add(`${stepPath}.tick`, "Format 2 automation ticks must be unique increasing 1/16 steps.");
      } else if (typeof step.tick === "number") {
        ticks.add(step.tick);
        greatestTick = step.tick;
      }
      const scalar =
        (typeof step.value === "number" && Number.isFinite(step.value)) ||
        typeof step.value === "string" ||
        typeof step.value === "boolean";
      if (!scalar) {
        collector.add(`${stepPath}.value`, "Format 2 automation value must be a finite JSON scalar.");
      } else if (
        candidate.scope === "effect" &&
        (candidate.parameterId === "mix" || candidate.parameterId === "wet-dry") &&
        !finiteNumber(step.value, 0, 1)
      ) {
        collector.add(`${stepPath}.value`, "Format 2 effect Mix value must be from 0 through 1.");
      } else if (
        candidate.scope === "send" &&
        typeof candidate.parameterId === "string" &&
        /^send-[abcd]-mode$/u.test(candidate.parameterId) &&
        step.value !== "pre-fader" &&
        step.value !== "post-fader"
      ) {
        collector.add(`${stepPath}.value`, "Format 2 send mode must be pre-fader or post-fader.");
      }
    }
  }
  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
  }
  return { ok: true, value: lanes };
}

function automationValueAt(
  lane: Readonly<Record<string, unknown>> | undefined,
  tick: number,
  fallback: number,
): number {
  if (!Array.isArray(lane?.steps)) return fallback;
  const steps = lane.steps.filter(isPlainRecord).filter(
    (step) => typeof step.tick === "number" && typeof step.value === "number",
  );
  const prior = steps.filter((step) => Number(step.tick) <= tick).at(-1) ?? steps.at(-1);
  return typeof prior?.value === "number" ? prior.value : fallback;
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
  if (value.format === PROJECT_FORMAT && value.formatVersion === 2) {
    const migrated = migrateFormatTwoDocument(value);
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

  const knownInstruments = new Set(options.knownPluginIds);
  const effectDescriptors = options.effectDescriptorsByPluginId ?? {};
  const knownEffects = new Set(Object.keys(effectDescriptors));
  const requirements = new Map<string, PluginRequirementDocument>();
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
        const kind = requirement.kind;
        if (kind !== "instrument" && kind !== "effect") {
          collector.add(`${path}.kind`, "Plugin kind must be instrument or effect.");
        } else if (
          (kind === "instrument" && !knownInstruments.has(pluginId.value)) ||
          (kind === "effect" && knownEffects.size > 0 && !knownEffects.has(pluginId.value))
        ) {
          collector.add(
            `${path}.pluginId`,
            `This build cannot open a project that requires plugin ${pluginId.value}.`,
          );
        }
        if (typeof requirement.pluginVersion !== "string" || !isSemanticVersion(requirement.pluginVersion))
          collector.add(`${path}.pluginVersion`, "Plugin version must be semantic version text.");
        if (requirement.apiVersion !== 1)
          collector.add(`${path}.apiVersion`, "This build supports plugin API version 1 only.");
        const metadata = options.pluginMetadataByPluginId?.[pluginId.value];
        if (metadata !== undefined) {
          if (metadata.kind !== kind)
            collector.add(`${path}.kind`, "Plugin requirement kind does not match the installed plugin.");
          if (metadata.pluginVersion !== requirement.pluginVersion)
            collector.add(`${path}.pluginVersion`, "Plugin version does not match the installed plugin.");
          if (metadata.apiVersion !== requirement.apiVersion)
            collector.add(`${path}.apiVersion`, "Plugin API version does not match the installed plugin.");
          expectedStateSchemaVersion = metadata.stateSchemaVersion;
        } else {
          expectedStateSchemaVersion = options.stateSchemaVersionByPluginId?.[pluginId.value];
        }
        if (kind === "instrument" || kind === "effect") {
          requirements.set(pluginId.value, {
            pluginId: pluginId.value,
            kind,
            pluginVersion: typeof requirement.pluginVersion === "string" ? requirement.pluginVersion : "",
            apiVersion: 1,
            stateSchemaVersion: typeof requirement.stateSchemaVersion === "number" ? requirement.stateSchemaVersion : 0,
          });
        }
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
        for (const key of ["pluginId", "parameters", "muted", "solo", "level", "pan", "sends"]) {
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
        const requirement = requirements.get(parsedPlugin.value);
        if (requirement === undefined)
          collector.add(`${path}.pluginId`, "Rack plugin has no matching requirement.");
        else if (requirement.kind !== "instrument")
          collector.add(`${path}.pluginId`, "Rack plugin requirement must be an instrument.");
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
      validateSendDocuments(slot.sends, `${path}.sends`, collector);
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
  for (const [pluginId] of requirements) {
    if (!referencedPlugins.has(pluginId)) {
      collector.add(
        "plugins",
        `Plugin requirement ${pluginId} is not referenced by a module or effect instance.`,
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
  validateMixerDocument(value.mixer, Array.isArray(value.rack) ? value.rack : [], collector);
  if (!Array.isArray(value.automation)) collector.add("automation", "automation must be an array.");
  else {
    validateAutomationLanes(
      value.automation,
      collector,
      patternIds,
      occupiedModules,
      effects.document,
      options,
    );
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
  const channelsByModuleId = new Map(
    document.mixer.channels.flatMap((channel) => channel.moduleId === null ? [] : [[channel.moduleId, channel] as const]),
  );
  for (const slot of document.rack) {
    if (slot.moduleId === undefined || slot.pluginId === undefined) continue;
    const moduleId = slot.moduleId as ModuleInstanceId;
    const channel = channelsByModuleId.get(slot.moduleId);
    if (channel === undefined) continue;
    modules[moduleId] = Object.freeze({
      id: moduleId,
      pluginId: slot.pluginId as PluginId,
      parameters: Object.freeze({ ...slot.parameters }),
      muted: channel.muted,
      solo: channel.solo,
      level: channel.level,
      pan: channel.pan,
      sends: Object.freeze(Object.fromEntries(channel.sends.map((send) => [
        send.busId,
        Object.freeze({ amount: send.amount }),
      ]))) as RackModuleState["sends"],
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
        targetId: lane.targetId as AutomationLaneState["targetId"],
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
      masterLevel: document.mixer.master.level,
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
      bypassed: instance.bypassed,
      mix: instance.mix,
      gainDecibels: instance.gainDecibels,
    });
  }
  return Object.freeze({
    instances: Object.freeze(instances),
    moduleChains: Object.freeze(Object.fromEntries(document.moduleChains.map((chain) => [
      chain.moduleId as ModuleInstanceId,
      Object.freeze({
        slots: Object.freeze(
          chain.slots.map((id) => id === null ? null : id as EffectInstanceId),
        ),
        bypassed: chain.bypassed === true,
      }),
    ]))),
    sendChains: Object.freeze(Object.fromEntries(document.sendChains.map((chain) => [
      chain.busId,
      Object.freeze({
        slots: Object.freeze(chain.slots.map((id) => id === null ? null : id as EffectInstanceId)),
        returnLevel: chain.returnLevel,
        bypassed: chain.bypassed,
        pinnedEffectId: chain.pinnedEffectId === null ? null : chain.pinnedEffectId as EffectInstanceId,
      }),
    ]))) as EffectsState["sendChains"],
    sendEffectsBypassed: document.sendEffectsBypassed === true,
    masterChain: Object.freeze(document.masterChain.slots.map((id) => id === null ? null : id as EffectInstanceId)),
    masterEffectsBypassed: document.masterEffectsBypassed,
  });
}

function clampUnit(value: unknown, fallback: number, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(minimum, value));
}
