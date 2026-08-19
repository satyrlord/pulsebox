import {
  RACK_SLOT_IDS,
  SEND_BUS_IDS,
  isCanonicalUuid,
} from "../../contracts/ids";
import {
  MASTER_EFFECT_CHAIN_SLOT_COUNT,
  MODULE_EFFECT_CHAIN_SLOT_COUNT,
  PROTECTED_LIMITER_EFFECT_PLUGIN_ID,
  SEND_EFFECT_CHAIN_SLOT_COUNT,
} from "../../contracts/effects";
import { parseParameterId, parsePluginId, type ParameterValue } from "../../contracts/parameters";
import { isPlainRecord, type ValidationIssue } from "../../contracts/validation";
import {
  externalAutomationImportValueIssue,
  externalAutomationParameterDescriptor,
  externalAutomationUnsupportedParameterMessage,
} from "../automation-targets";
import { DEFAULT_MODULE_LEVEL, MINIMUM_PATTERN_COUNT } from "../default-state";
import { isNumericNoteKey } from "../edit-policy";
import { PATTERN_SCALES, PATTERN_TICKS_PER_STEP, type PatternEvent, type PatternScale } from "../model";
import { hasForbiddenTextCodePoint, isValidUserVisibleName } from "../text-validation";
import {
  DOCUMENT_LIMITS,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  failure,
  type DocumentResult,
  type EffectInstanceDocument,
  type EffectsDocument,
  type ImportEffectDescriptor,
  type ImportEffectStateDescriptor,
  type ImportParameterDescriptor,
  type MasterChainDocument,
  type ModuleChainDocument,
  type ParseOptions,
  type PluginRequirementDocument,
  type ProjectDocument,
  type SendChainDocument,
} from "./project-document-schema";
import {
  AUTOMATION_LANE_KEYS,
  AUTOMATION_STEP_KEYS,
  IssueCollector,
  MAXIMUM_REPORTED_ISSUES,
  finiteNumber,
} from "./project-document-validation";

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
const MIGRATION_KEYS = new Set(["scope", "id", "fromVersion", "toVersion", "implementation"]);


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

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isSemanticVersion(value: string): boolean {
  return value.length <= 64 && SEMANTIC_VERSION_PATTERN.test(value);
}

function validName(value: unknown): value is string {
  return isValidUserVisibleName(value);
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
    if (voiceIds === undefined || voiceIds.length === 0 || (!voiceIds.includes(voiceKey) && !isNumericNoteKey(voiceKey))) {
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
        const staticDescriptor = externalAutomationParameterDescriptor("mixer", parameterId);
        if (staticDescriptor === undefined) {
          collector.add(
            `${path}.parameterId`,
            externalAutomationUnsupportedParameterMessage("mixer"),
          );
        }
        validateValue = (value) => externalAutomationImportValueIssue(staticDescriptor, value);
      } else if (lane.scope === "send") {
        if (!isCanonicalUuid(lane.targetId) || !occupiedModules.has(lane.targetId)) {
          collector.add(`${path}.targetId`, "Send automation target must resolve to an occupied module.");
        }
        const staticDescriptor = externalAutomationParameterDescriptor("send", parameterId);
        if (staticDescriptor === undefined) {
          collector.add(
            `${path}.parameterId`,
            externalAutomationUnsupportedParameterMessage("send"),
          );
        }
        validateValue = (value) => externalAutomationImportValueIssue(staticDescriptor, value);
      } else if (lane.scope === "send-return") {
        if (
          typeof lane.targetId !== "string" ||
          !SEND_BUS_IDS.some((busId) => busId === lane.targetId)
        ) {
          collector.add(`${path}.targetId`, "Send-return automation target must be send A through D.");
        }
        const staticDescriptor = externalAutomationParameterDescriptor("send-return", parameterId);
        if (staticDescriptor === undefined) {
          collector.add(
            `${path}.parameterId`,
            externalAutomationUnsupportedParameterMessage("send-return"),
          );
        }
        validateValue = (value) => externalAutomationImportValueIssue(staticDescriptor, value);
      } else if (lane.scope === "effect") {
        const effect = typeof lane.targetId === "string" ? effectById.get(lane.targetId) : undefined;
        if (!isCanonicalUuid(lane.targetId) || effect === undefined) {
          collector.add(`${path}.targetId`, "Effect automation target must resolve to an effect instance.");
        } else {
          const staticDescriptor = externalAutomationParameterDescriptor("effect", parameterId);
          if (staticDescriptor !== undefined) {
            validateValue = (value) => externalAutomationImportValueIssue(staticDescriptor, value);
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
        }
      } else {
        if (lane.targetId !== "master") {
          collector.add(`${path}.targetId`, "Master automation target must be the master bus.");
        }
        const staticDescriptor = externalAutomationParameterDescriptor("master", parameterId);
        if (staticDescriptor === undefined) {
          collector.add(
            `${path}.parameterId`,
            externalAutomationUnsupportedParameterMessage("master"),
          );
        }
        validateValue = (value) => externalAutomationImportValueIssue(staticDescriptor, value);
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
    if (hasForbiddenTextCodePoint(value)) {
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


export function scanSafeProjectValue(value: unknown): DocumentResult<Readonly<Record<string, unknown>>> {
  if (!isPlainRecord(value)) return failure("$", "A project document must be a JSON object.");
  const collector = new IssueCollector();
  scanSafeJson(value, collector);
  return collector.issues.length === 0
    ? { ok: true, value }
    : { ok: false, issues: collector.issues.slice(0, MAXIMUM_REPORTED_ISSUES) };
}

export function parseCurrentProjectDocument(
  value: Readonly<Record<string, unknown>>,
  options: ParseOptions,
): DocumentResult<ProjectDocument> {
  const collector = new IssueCollector();
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
      collector.add("project.name", "Name must contain 1 through 256 UTF-8 bytes.");
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

export function parseProjectJsonValue(json: string): DocumentResult<unknown> {
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
  return { ok: true, value: parsed };
}
