import { validationFailure, validationSuccess, type ValidationResult } from "./validation";

type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type CanonicalUuid = Brand<string, "CanonicalUuid">;
export type ProjectId = Brand<string, "ProjectId">;
export type ProjectLineageId = Brand<string, "ProjectLineageId">;
export type RevisionEpoch = Brand<string, "RevisionEpoch">;
export type StateRevisionEpoch = Brand<string, "StateRevisionEpoch">;
export type RackSlotId = Brand<string, "RackSlotId">;
export type SendBusId = Brand<string, "SendBusId">;
export type ModuleInstanceId = Brand<string, "ModuleInstanceId">;
export type VoiceId = Brand<string, "VoiceId">;
export type PatternId = Brand<string, "PatternId">;
export type NoteEventId = Brand<string, "NoteEventId">;
export type EffectInstanceId = Brand<string, "EffectInstanceId">;
export type AutomationLaneId = Brand<string, "AutomationLaneId">;
export type AssetId = Brand<string, "AssetId">;
export type ContentId = Brand<string, "ContentId">;
export type CommandId = Brand<string, "CommandId">;
export type GestureId = Brand<string, "GestureId">;

export interface ProjectRevision {
  readonly epoch: RevisionEpoch;
  readonly counter: number;
}

export interface StateRevision {
  readonly epoch: StateRevisionEpoch;
  readonly counter: number;
}

export interface IdFactory {
  createUuid(): string;
}

type GeneratedUuidId =
  | ProjectId
  | ProjectLineageId
  | RevisionEpoch
  | StateRevisionEpoch
  | ModuleInstanceId
  | VoiceId
  | PatternId
  | NoteEventId
  | EffectInstanceId
  | AutomationLaneId
  | AssetId
  | CommandId
  | GestureId;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTENT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;

function fixedRackSlotId(value: string): RackSlotId {
  return value as RackSlotId;
}

function fixedSendBusId(value: string): SendBusId {
  return value as SendBusId;
}

export const RACK_SLOT_IDS = Object.freeze([
  fixedRackSlotId("slot-01"),
  fixedRackSlotId("slot-02"),
  fixedRackSlotId("slot-03"),
  fixedRackSlotId("slot-04"),
  fixedRackSlotId("slot-05"),
  fixedRackSlotId("slot-06"),
  fixedRackSlotId("slot-07"),
  fixedRackSlotId("slot-08"),
] as const);

export const SEND_BUS_IDS = Object.freeze([
  fixedSendBusId("send-a"),
  fixedSendBusId("send-b"),
  fixedSendBusId("send-c"),
  fixedSendBusId("send-d"),
] as const);

export function isCanonicalUuid(value: unknown): value is CanonicalUuid {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function parseCanonicalUuid(value: unknown, path = "id"): ValidationResult<CanonicalUuid> {
  return isCanonicalUuid(value)
    ? validationSuccess(value)
    : validationFailure(path, "Expected a lowercase canonical UUID version 4.");
}

export function createCanonicalUuid(factory: IdFactory): CanonicalUuid {
  const candidate = factory.createUuid();
  if (!isCanonicalUuid(candidate)) {
    throw new TypeError("IdFactory returned a non-canonical UUID version 4.");
  }
  return candidate;
}

function createGeneratedUuidId(factory: IdFactory): GeneratedUuidId {
  return createCanonicalUuid(factory) as string as GeneratedUuidId;
}

export function createProjectId(factory: IdFactory): ProjectId {
  return createGeneratedUuidId(factory) as string as ProjectId;
}

export function createProjectLineageId(factory: IdFactory): ProjectLineageId {
  return createGeneratedUuidId(factory) as string as ProjectLineageId;
}

export function createRevisionEpoch(factory: IdFactory): RevisionEpoch {
  return createGeneratedUuidId(factory) as string as RevisionEpoch;
}

export function createStateRevisionEpoch(factory: IdFactory): StateRevisionEpoch {
  return createGeneratedUuidId(factory) as string as StateRevisionEpoch;
}

export function createModuleInstanceId(factory: IdFactory): ModuleInstanceId {
  return createGeneratedUuidId(factory) as string as ModuleInstanceId;
}

export function createPatternId(factory: IdFactory): PatternId {
  return createGeneratedUuidId(factory) as string as PatternId;
}

export function createNoteEventId(factory: IdFactory): NoteEventId {
  return createGeneratedUuidId(factory) as string as NoteEventId;
}

export function createEffectInstanceId(factory: IdFactory): EffectInstanceId {
  return createGeneratedUuidId(factory) as string as EffectInstanceId;
}

export function createCommandId(factory: IdFactory): CommandId {
  return createGeneratedUuidId(factory) as string as CommandId;
}

export function createGestureId(factory: IdFactory): GestureId {
  return createGeneratedUuidId(factory) as string as GestureId;
}

export function parseRackSlotId(value: unknown, path = "rackSlotId"): ValidationResult<RackSlotId> {
  const match = RACK_SLOT_IDS.find((candidate) => candidate === value);
  return match === undefined
    ? validationFailure(path, "Expected one of slot-01 through slot-08.")
    : validationSuccess(match);
}

export function parseContentId(value: unknown, path = "contentId"): ValidationResult<ContentId> {
  return typeof value === "string" && CONTENT_ID_PATTERN.test(value)
    ? validationSuccess(value as ContentId)
    : validationFailure(path, "Expected sha256: followed by 64 lowercase hexadecimal characters.");
}

export function validateProjectRevision(
  value: unknown,
  path = "projectRevision",
): ValidationResult<ProjectRevision> {
  const result = validateRevision(value, path);
  return result.ok
    ? validationSuccess({
        epoch: result.value.epoch as string as RevisionEpoch,
        counter: result.value.counter,
      })
    : result;
}

export function validateStateRevision(
  value: unknown,
  path = "stateRevision",
): ValidationResult<StateRevision> {
  const result = validateRevision(value, path);
  return result.ok
    ? validationSuccess({
        epoch: result.value.epoch as string as StateRevisionEpoch,
        counter: result.value.counter,
      })
    : result;
}

function validateRevision(
  value: unknown,
  path: string,
): ValidationResult<{ readonly epoch: CanonicalUuid; readonly counter: number }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return validationFailure(path, "Expected a revision object.");
  }
  const record = value as Readonly<Record<string, unknown>>;
  const epoch = parseCanonicalUuid(record.epoch, `${path}.epoch`);
  if (!epoch.ok) return epoch;
  if (
    !Number.isSafeInteger(record.counter) ||
    typeof record.counter !== "number" ||
    record.counter < 0
  ) {
    return validationFailure(`${path}.counter`, "Expected a non-negative safe integer.");
  }
  return validationSuccess({ epoch: epoch.value, counter: record.counter });
}
