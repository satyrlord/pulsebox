import { isCanonicalUuid, validateStateRevision, type StateRevision } from "./ids";
import type { ParameterValue } from "./parameters";
import {
  isPlainRecord,
  validationFailure,
  validationSuccess,
  type ValidationIssue,
  type ValidationResult,
} from "./validation";

export const ENGINE_PROTOCOL_VERSION = 1 as const;

export const ENGINE_PROTOCOL_LIMITS = Object.freeze({
  maximumUnacknowledgedEnvelopes: 256,
  backpressureEnvelopeCount: 192,
  maximumOrdinaryPayloadBytes: 64 * 1024,
  maximumOrdinaryPayloadDepth: 64,
  maximumParameterChangesPerBatch: 128,
  maximumEventsPerBatch: 256,
  maximumMeterFramesPerSecond: 30,
  maximumParameterIdLength: 64,
  maximumParameterValueStringLength: 256,
  maximumSampleChunkBytes: 1024 * 1024,
  maximumSampleChunksInFlight: 4,
});

const CONTROLLER_TO_PROCESSOR_KINDS = Object.freeze([
  "hello",
  "configure",
  "state-snapshot",
  "parameter-batch",
  "event-batch",
  "transport",
  "sample-attach",
  "sample-release",
  "reset",
  "clear-scheduled-events",
  "all-notes-off",
  "suspend",
  "resume",
  "dispose",
] as const);

const PROCESSOR_TO_CONTROLLER_KINDS = Object.freeze([
  "ready",
  "ack",
  "meter-frame",
  "status",
  "warning",
  "fault",
  "disposed",
] as const);

export type ControllerToProcessorKind = (typeof CONTROLLER_TO_PROCESSOR_KINDS)[number];
export type ProcessorToControllerKind = (typeof PROCESSOR_TO_CONTROLLER_KINDS)[number];
export type EngineMessageKind = ControllerToProcessorKind | ProcessorToControllerKind;

type KnownPayloadFields = Partial<
  ParameterBatchPayload & EventBatchPayload & SampleAttachPayload & ReadyPayload
>;

export interface EngineMessageEnvelope<
  TKind extends EngineMessageKind = EngineMessageKind,
  TPayload = Readonly<Record<string, unknown>> & KnownPayloadFields,
> {
  readonly protocolVersion: 1;
  readonly sessionId: string;
  readonly nodeId: string;
  readonly sequence: number;
  readonly kind: TKind;
  readonly projectRevision?: StateRevision;
  readonly requestId?: string;
  readonly audioFrame?: number;
  readonly payload: TPayload;
}

export interface ParameterBatchPayload {
  readonly changes: readonly Readonly<Record<string, unknown>>[];
}

export interface ScheduledEventPayload {
  readonly eventId: string;
  readonly audioFrame: number;
  readonly priority: number;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface EventBatchPayload {
  readonly events: readonly ScheduledEventPayload[];
}

/**
 * `clear-scheduled-events` drops queued events. With `fromFrame`, only events
 * at or past that absolute frame are dropped and everything before it stays
 * queued, so a rebuild can replace the future tail without re-sending the
 * imminent events the listener is about to hear. Without `fromFrame`, the
 * whole queue clears.
 */
export interface ClearScheduledEventsPayload {
  readonly fromFrame?: number;
}

export interface SampleAttachPayload {
  readonly chunk: ArrayBuffer;
  readonly chunkIndex: number;
  readonly chunkCount: number;
}

export interface AcknowledgementPayload {
  readonly highestContiguousSequence: number;
  readonly projectRevision: StateRevision;
  readonly disposition: "applied" | "duplicate" | "stale";
}

export interface ReadyPayload {
  readonly acceptedProtocolVersion: 1;
}

export interface EngineFaultPayload {
  readonly code: string;
  readonly message: string;
  readonly recoveryAction: string;
}

const ALL_KINDS: ReadonlySet<string> = new Set([
  ...CONTROLLER_TO_PROCESSOR_KINDS,
  ...PROCESSOR_TO_CONTROLLER_KINDS,
]);

const CONTROLLER_KIND_SET: ReadonlySet<string> = new Set(CONTROLLER_TO_PROCESSOR_KINDS);
const PROCESSOR_KIND_SET: ReadonlySet<string> = new Set(PROCESSOR_TO_CONTROLLER_KINDS);

function isControllerToProcessorKind(value: unknown): value is ControllerToProcessorKind {
  return typeof value === "string" && CONTROLLER_KIND_SET.has(value);
}

export function isProcessorToControllerKind(value: unknown): value is ProcessorToControllerKind {
  return typeof value === "string" && PROCESSOR_KIND_SET.has(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Validates the bounded parameter key shared by controller and processor paths. */
export function isEngineParameterId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= ENGINE_PROTOCOL_LIMITS.maximumParameterIdLength
  );
}

/** Validates the scalar parameter values that can cross the engine protocol. */
export function isEngineParameterValue(value: unknown): value is ParameterValue {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean" ||
    (typeof value === "string" &&
      value.length <= ENGINE_PROTOCOL_LIMITS.maximumParameterValueStringLength)
  );
}

function ordinaryPayloadByteLength(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value);
    let byteLength = 0;
    for (let index = 0; index < serialized.length; index += 1) {
      const codeUnit = serialized.charCodeAt(index);
      if (codeUnit <= 0x7f) {
        byteLength += 1;
      } else if (codeUnit <= 0x7ff) {
        byteLength += 2;
      } else if (
        codeUnit >= 0xd800 &&
        codeUnit <= 0xdbff &&
        index + 1 < serialized.length &&
        serialized.charCodeAt(index + 1) >= 0xdc00 &&
        serialized.charCodeAt(index + 1) <= 0xdfff
      ) {
        byteLength += 4;
        index += 1;
      } else {
        byteLength += 3;
      }
      if (byteLength > ENGINE_PROTOCOL_LIMITS.maximumOrdinaryPayloadBytes) {
        return byteLength;
      }
    }
    return byteLength;
  } catch {
    return undefined;
  }
}

function isJsonCompatible(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  let compatible: boolean;
  if (Array.isArray(value)) {
    compatible = value.every((entry) => isJsonCompatible(entry, seen));
  } else if (!isPlainRecord(value)) {
    compatible = false;
  } else {
    compatible = Object.values(value).every((entry) => isJsonCompatible(entry, seen));
  }
  seen.delete(value);
  return compatible;
}

/**
 * Digit count of a non-negative safe integer, without a string allocation.
 * Frames, sequences, and priorities dominate protocol payloads, so the common
 * numeric case stays off the allocator on the audio thread.
 */
function decimalDigitCount(value: number): number {
  let digits = 1;
  let remaining = value;
  while (remaining >= 10) {
    remaining /= 10;
    digits += 1;
  }
  return digits;
}

/**
 * One shared cycle-detection set. The check runs on one thread at a time and
 * never yields mid-traversal, so reuse is safe. It is cleared at each entry
 * because a rejected traversal returns early and leaves entries behind.
 */
const BYTE_LENGTH_SEEN = new Set<object>();

/** Counts JSON bytes without creating a serialized payload. */
function boundedJsonByteLength(
  value: unknown,
  seen = BYTE_LENGTH_SEEN,
  limit = ENGINE_PROTOCOL_LIMITS.maximumOrdinaryPayloadBytes,
  depth = 0,
): number | undefined {
  if (depth === 0) seen.clear();
  if (depth > ENGINE_PROTOCOL_LIMITS.maximumOrdinaryPayloadDepth) return undefined;
  if (value === null) return 4;
  if (typeof value === "boolean") return value ? 4 : 5;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    if (Number.isSafeInteger(value)) {
      return value < 0 ? 1 + decimalDigitCount(-value) : decimalDigitCount(value);
    }
    return String(value).length;
  }
  if (typeof value === "string") {
    let bytes = 2;
    for (let index = 0; index < value.length; index += 1) {
      const codeUnit = value.charCodeAt(index);
      if (codeUnit === 0x22 || codeUnit === 0x5c || codeUnit <= 0x1f) bytes += codeUnit <= 0x1f ? 6 : 2;
      else if (codeUnit <= 0x7f) bytes += 1;
      else if (codeUnit <= 0x7ff) bytes += 2;
      else if (
        codeUnit >= 0xd800 &&
        codeUnit <= 0xdbff &&
        index + 1 < value.length &&
        value.charCodeAt(index + 1) >= 0xdc00 &&
        value.charCodeAt(index + 1) <= 0xdfff
      ) {
        bytes += 4;
        index += 1;
      } else if (codeUnit >= 0xd800 && codeUnit <= 0xdfff) bytes += 6;
      else bytes += 3;
      if (bytes > limit) return bytes;
    }
    return bytes;
  }
  if (typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  let bytes = 2;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) return undefined;
      const child = boundedJsonByteLength(value[index], seen, limit - bytes, depth + 1);
      if (child === undefined) return undefined;
      bytes += child + (index === 0 ? 0 : 1);
      if (bytes > limit) return bytes;
    }
  } else {
    if (!isPlainRecord(value)) return undefined;
    // `for...in` with an own-property check, not `Object.entries`: the entries
    // array and its per-property tuples are allocations this path avoids on
    // the audio thread.
    let first = true;
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      const keyBytes = boundedJsonByteLength(key, seen, limit - bytes, depth + 1);
      const child = boundedJsonByteLength(value[key], seen, limit - bytes, depth + 1);
      if (keyBytes === undefined || child === undefined) return undefined;
      bytes += keyBytes + child + 1 + (first ? 0 : 1);
      first = false;
      if (bytes > limit) return bytes;
    }
  }
  seen.delete(value);
  return bytes;
}

function validateParameterBatch(
  payload: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  const candidate = payload as Partial<ParameterBatchPayload>;
  if (!Array.isArray(candidate.changes)) {
    issues.push({
      path: "payload.changes",
      message: "Parameter batch changes must be an array.",
    });
    return;
  }
  if (candidate.changes.length > ENGINE_PROTOCOL_LIMITS.maximumParameterChangesPerBatch) {
    issues.push({
      path: "payload.changes",
      message: "Parameter batch exceeds 128 changes.",
    });
  }
  for (const [index, change] of candidate.changes.entries()) {
    if (!isPlainRecord(change) || !isEngineParameterId(change.parameterId)) {
      issues.push({
        path: `payload.changes[${index.toString()}].parameterId`,
        message: "Parameter change ID must contain 1 through 64 characters.",
      });
    }
    if (!isPlainRecord(change) || !isEngineParameterValue(change.value)) {
      issues.push({
        path: `payload.changes[${index.toString()}].value`,
        message: "Parameter change value must be finite, boolean, or a string of at most 256 characters.",
      });
    }
  }
}

function validateEventBatch(
  payload: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  const candidate = payload as Partial<EventBatchPayload>;
  if (!Array.isArray(candidate.events)) {
    issues.push({
      path: "payload.events",
      message: "Event batch events must be an array.",
    });
    return;
  }
  if (candidate.events.length > ENGINE_PROTOCOL_LIMITS.maximumEventsPerBatch) {
    issues.push({
      path: "payload.events",
      message: "Event batch exceeds 256 events.",
    });
  }
  for (const [index, event] of candidate.events.entries()) {
    if (
      !isPlainRecord(event) ||
      typeof event.eventId !== "string" ||
      event.eventId.length === 0 ||
      !isNonNegativeSafeInteger(event.audioFrame) ||
      !isNonNegativeSafeInteger(event.priority) ||
      !isPlainRecord(event.data)
    ) {
      issues.push({
        path: `payload.events[${index.toString()}]`,
        message: "Scheduled events require an ID, absolute audio frame, priority, and data object.",
      });
    }
  }
  const scheduledEvents = candidate.events.filter(
    (event): event is ScheduledEventPayload =>
      isPlainRecord(event) &&
      typeof event.eventId === "string" &&
      isNonNegativeSafeInteger(event.audioFrame) &&
      isNonNegativeSafeInteger(event.priority) &&
      isPlainRecord(event.data),
  );
  for (let index = 1; index < scheduledEvents.length; index += 1) {
    const previous = scheduledEvents[index - 1];
    const current = scheduledEvents[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      compareScheduledEvents(previous, current) > 0
    ) {
      issues.push({
        path: "payload.events",
        message: "Scheduled events must be sorted by frame, priority, and stable ID.",
      });
      break;
    }
  }
}

function validateSampleAttach(
  payload: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  const candidate = payload as Partial<SampleAttachPayload>;
  if (
    !(candidate.chunk instanceof ArrayBuffer) ||
    candidate.chunk.byteLength > ENGINE_PROTOCOL_LIMITS.maximumSampleChunkBytes
  ) {
    issues.push({
      path: "payload.chunk",
      message: "Sample chunk must be an ArrayBuffer no larger than 1 MiB.",
    });
  }
  if (
    !isNonNegativeSafeInteger(candidate.chunkIndex) ||
    !isNonNegativeSafeInteger(candidate.chunkCount) ||
    candidate.chunkCount === 0 ||
    candidate.chunkIndex >= candidate.chunkCount
  ) {
    issues.push({
      path: "payload.chunkIndex",
      message: "Sample chunk position must fit within the declared transfer.",
    });
  }
}

function validateAcknowledgement(
  payload: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  if (!isNonNegativeSafeInteger(payload.highestContiguousSequence)) {
    issues.push({
      path: "payload.highestContiguousSequence",
      message: "Acknowledgement sequence must be a non-negative safe integer.",
    });
  }
  const revision = validateStateRevision(payload.projectRevision, "payload.projectRevision");
  if (!revision.ok) issues.push(...revision.issues);
  if (
    payload.disposition !== "applied" &&
    payload.disposition !== "duplicate" &&
    payload.disposition !== "stale"
  ) {
    issues.push({
      path: "payload.disposition",
      message: "Acknowledgement disposition is invalid.",
    });
  }
}

function validateReady(
  payload: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  const candidate = payload as Partial<ReadyPayload>;
  if (candidate.acceptedProtocolVersion !== ENGINE_PROTOCOL_VERSION) {
    issues.push({
      path: "payload.acceptedProtocolVersion",
      message: "Ready must accept engine protocol version 1.",
    });
  }
}

function validateFault(
  payload: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  for (const key of ["code", "message", "recoveryAction"] as const) {
    if (typeof payload[key] !== "string" || payload[key].length === 0) {
      issues.push({
        path: `payload.${key}`,
        message: `Fault ${key} must not be empty.`,
      });
    }
  }
}

export function validateEngineMessageEnvelope(
  value: unknown,
): ValidationResult<EngineMessageEnvelope> {
  if (!isPlainRecord(value)) {
    return validationFailure("message", "Expected a plain message object.");
  }

  const issues: ValidationIssue[] = [];
  if (value.protocolVersion !== ENGINE_PROTOCOL_VERSION) {
    issues.push({
      path: "protocolVersion",
      message: "Engine protocol version must equal 1.",
    });
  }
  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) {
    issues.push({ path: "sessionId", message: "Session ID must not be empty." });
  }
  if (typeof value.nodeId !== "string" || value.nodeId.length === 0) {
    issues.push({ path: "nodeId", message: "Node ID must not be empty." });
  }
  if (!isNonNegativeSafeInteger(value.sequence)) {
    issues.push({
      path: "sequence",
      message: "Sequence must be a non-negative safe integer.",
    });
  }
  if (typeof value.kind !== "string" || !ALL_KINDS.has(value.kind)) {
    issues.push({ path: "kind", message: "Message kind is not registered." });
  }
  if (value.projectRevision !== undefined) {
    const revision = validateStateRevision(value.projectRevision, "projectRevision");
    if (!revision.ok) issues.push(...revision.issues);
  }
  if (
    value.requestId !== undefined &&
    (typeof value.requestId !== "string" || value.requestId.length === 0)
  ) {
    issues.push({ path: "requestId", message: "Request ID must not be empty." });
  }
  if (value.audioFrame !== undefined && !isNonNegativeSafeInteger(value.audioFrame)) {
    issues.push({
      path: "audioFrame",
      message: "Audio frame must be a non-negative safe integer.",
    });
  }
  if (!isPlainRecord(value.payload)) {
    issues.push({ path: "payload", message: "Payload must be a plain object." });
  } else if (typeof value.kind === "string" && ALL_KINDS.has(value.kind)) {
    if (value.kind === "parameter-batch") {
      validateParameterBatch(value.payload, issues);
    } else if (value.kind === "event-batch") {
      validateEventBatch(value.payload, issues);
    } else if (value.kind === "sample-attach") {
      validateSampleAttach(value.payload, issues);
    } else if (
      value.kind === "clear-scheduled-events" &&
      value.payload.fromFrame !== undefined &&
      !isNonNegativeSafeInteger(value.payload.fromFrame)
    ) {
      issues.push({
        path: "payload.fromFrame",
        message: "Clear bound must be a non-negative safe integer audio frame.",
      });
    }
    if (value.kind !== "sample-attach") {
      const payloadBytes = ordinaryPayloadByteLength(value.payload);
      if (
        payloadBytes === undefined ||
        payloadBytes > ENGINE_PROTOCOL_LIMITS.maximumOrdinaryPayloadBytes ||
        !isJsonCompatible(value.payload)
      ) {
        issues.push({
          path: "payload",
          message: "Ordinary payload must be JSON and no larger than 64 KiB.",
        });
      }
    }
    if (value.kind === "ack") {
      validateAcknowledgement(value.payload, issues);
    } else if (value.kind === "ready") {
      validateReady(value.payload, issues);
    } else if (value.kind === "fault") {
      validateFault(value.payload, issues);
    }
  }

  return issues.length === 0
    ? validationSuccess(value as unknown as EngineMessageEnvelope)
    : { ok: false, issues };
}

/**
 * Checks controller data on the audio thread without JSON serialization or an
 * issue-array allocation. The controller applies this same bounded check before
 * each send. This check also keeps the processor safe if another sender reaches
 * its port.
 */
export function isRealtimeSafeControllerEnvelope(
  value: unknown,
): value is EngineMessageEnvelope<ControllerToProcessorKind> {
  if (!isPlainRecord(value)) return false;
  if (
    value.protocolVersion !== ENGINE_PROTOCOL_VERSION ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    typeof value.nodeId !== "string" ||
    value.nodeId.length === 0 ||
    !isNonNegativeSafeInteger(value.sequence) ||
    !isControllerToProcessorKind(value.kind) ||
    !isPlainRecord(value.payload)
  ) {
    return false;
  }
  // The envelope contract makes `projectRevision` optional. A kind that needs
  // it, such as hello, enforces its presence at the receiver.
  if (
    value.projectRevision !== undefined &&
    (!isPlainRecord(value.projectRevision) ||
      !isCanonicalUuid(value.projectRevision.epoch) ||
      !isNonNegativeSafeInteger(value.projectRevision.counter))
  ) {
    return false;
  }
  if (
    value.requestId !== undefined &&
    (typeof value.requestId !== "string" || value.requestId.length === 0)
  ) {
    return false;
  }
  if (value.audioFrame !== undefined && !isNonNegativeSafeInteger(value.audioFrame)) {
    return false;
  }

  const payload = value.payload;
  if (value.kind !== "sample-attach") {
    const payloadBytes = boundedJsonByteLength(payload);
    if (
      payloadBytes === undefined ||
      payloadBytes > ENGINE_PROTOCOL_LIMITS.maximumOrdinaryPayloadBytes
    ) {
      return false;
    }
  }
  if (value.kind === "parameter-batch") {
    if (
      !Array.isArray(payload.changes) ||
      payload.changes.length > ENGINE_PROTOCOL_LIMITS.maximumParameterChangesPerBatch
    ) {
      return false;
    }
    for (const change of payload.changes) {
      if (
        !isPlainRecord(change) ||
        !isEngineParameterId(change.parameterId) ||
        !isEngineParameterValue(change.value)
      ) return false;
    }
  } else if (value.kind === "event-batch") {
    if (
      !Array.isArray(payload.events) ||
      payload.events.length > ENGINE_PROTOCOL_LIMITS.maximumEventsPerBatch
    ) {
      return false;
    }
    let previous: ScheduledEventPayload | undefined;
    for (const event of payload.events) {
      if (
        !isPlainRecord(event) ||
        typeof event.eventId !== "string" ||
        event.eventId.length === 0 ||
        !isNonNegativeSafeInteger(event.audioFrame) ||
        !isNonNegativeSafeInteger(event.priority) ||
        !isPlainRecord(event.data)
      ) {
        return false;
      }
      const scheduled = event as unknown as ScheduledEventPayload;
      if (previous !== undefined && compareScheduledEvents(previous, scheduled) > 0) return false;
      previous = scheduled;
    }
  } else if (value.kind === "sample-attach") {
    if (
      !(payload.chunk instanceof ArrayBuffer) ||
      payload.chunk.byteLength > ENGINE_PROTOCOL_LIMITS.maximumSampleChunkBytes ||
      !isNonNegativeSafeInteger(payload.chunkIndex) ||
      !isNonNegativeSafeInteger(payload.chunkCount) ||
      payload.chunkCount === 0 ||
      payload.chunkIndex >= payload.chunkCount
    ) {
      return false;
    }
  } else if (value.kind === "clear-scheduled-events") {
    if (payload.fromFrame !== undefined && !isNonNegativeSafeInteger(payload.fromFrame)) {
      return false;
    }
  }
  return true;
}

export function compareScheduledEvents(
  left: ScheduledEventPayload,
  right: ScheduledEventPayload,
): number {
  return (
    left.audioFrame - right.audioFrame ||
    left.priority - right.priority ||
    (left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0)
  );
}
