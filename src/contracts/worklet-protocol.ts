import { validateStateRevision, type StateRevision } from "./ids";
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
  maximumParameterChangesPerBatch: 128,
  maximumEventsPerBatch: 256,
  maximumMeterFramesPerSecond: 30,
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

export function isControllerToProcessorKind(value: unknown): value is ControllerToProcessorKind {
  return typeof value === "string" && CONTROLLER_KIND_SET.has(value);
}

export function isProcessorToControllerKind(value: unknown): value is ProcessorToControllerKind {
  return typeof value === "string" && PROCESSOR_KIND_SET.has(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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
