import { type StateRevision } from "../../contracts/ids";
import type { ParameterValue } from "../../contracts/parameters";
import {
  ENGINE_PROTOCOL_LIMITS,
  ENGINE_PROTOCOL_VERSION,
  compareScheduledEvents,
  isRealtimeSafeControllerEnvelope,
  isProcessorToControllerKind,
  validateEngineMessageEnvelope,
  type AcknowledgementPayload,
  type ControllerToProcessorKind,
  type EngineFaultPayload,
  type EngineMessageEnvelope,
  type ScheduledEventPayload,
} from "../../contracts/worklet-protocol";
import { isPlainRecord } from "../../contracts/validation";
import {
  SCHEDULED_EVENT_QUEUE_CAPACITY,
  SCHEDULED_PARAMETER_QUEUE_CAPACITY,
  scheduledEventPriority,
  type ScheduledParameterChange,
  type ScheduledVoiceEvent,
} from "../transport/scheduled-event";
import type {
  VoiceAdapterOptions,
  VoiceAdapterPort,
  VoiceAdapterStatus,
  VoiceFault,
} from "../transport/voice-adapter";

/**
 * Node and session IDs are runtime protocol coordination, not durable project
 * entities: the protocol needs only an opaque non-empty string that no live
 * port reuses, so that a stale message fails its identity check. A counter that
 * every adapter in the page shares gives that without a browser handle, which
 * keeps the injected `IdFactory` the one source of durable entity IDs.
 */
let runtimeIdSequence = 0;

function nextRuntimeId(prefix: string): string {
  runtimeIdSequence += 1;
  return `${prefix}-${runtimeIdSequence.toString(36)}`;
}

/**
 * Everything that distinguishes one worklet-backed instrument from another. The
 * sequencing, acknowledgement, backpressure, fault, and recovery machinery below
 * is identical for every voice, so a new instrument supplies this descriptor
 * rather than a new adapter.
 */
export interface WorkletVoiceDescriptor {
  /** Name the processor passes to `registerProcessor`. */
  readonly processorName: string;
  /** Bundled worklet module URL. */
  readonly moduleUrl: string;
  /** Product name. Used only in operator-facing fault text. */
  readonly displayName: string;
  /** Translates manifest parameter IDs into the processor's own field names. */
  readonly mapParameters: (
    values: Readonly<Record<string, ParameterValue>>,
  ) => Readonly<Record<string, ParameterValue>>;
  /** Output channel count the node is created with. */
  readonly outputChannelCount?: number;
}

type AdapterState =
  "created" | "preparing" | "ready" | "active" | "suspended" | "disposing" | "disposed" | "faulted";

interface Handshake {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_HANDSHAKE_TIMEOUT_MILLISECONDS = 2_000;
const DISPOSE_RELEASE_MILLISECONDS = 100;
const PREVIEW_INTERVAL_MILLISECONDS = 16;

export class WorkletVoiceAdapter implements VoiceAdapterPort {
  readonly #descriptor: WorkletVoiceDescriptor;
  readonly #context: AudioContext;
  readonly #nodeId: string;
  #projectRevision: StateRevision;
  readonly #handshakeTimeoutMilliseconds: number;
  readonly #onStatus: (status: VoiceAdapterStatus) => void;
  readonly #onMeter: (level: number) => void;
  readonly #pending = new Map<number, EngineMessageEnvelope>();
  #acknowledgedParameterSnapshot: Record<string, ParameterValue> = {};
  #acknowledgedProjectRevision: StateRevision;
  #currentParameterSnapshot: Record<string, ParameterValue> = {};
  #deferredParameters: Record<string, ParameterValue> = {};
  #previewParameters: Record<string, ParameterValue> = {};
  #previewTimer: ReturnType<typeof setTimeout> | undefined;
  #node: AudioWorkletNode | undefined;
  #sessionId = "";
  #nextSequence = 0;
  #expectedProcessorSequence = 0;
  #eventId = 0;
  #destination: AudioNode | undefined;
  #handshake: Handshake | undefined;
  #disposeTimer: ReturnType<typeof setTimeout> | undefined;
  #recoveryAttempted = false;
  fault: VoiceFault | undefined;
  #state: AdapterState = "created";

  constructor(
    descriptor: WorkletVoiceDescriptor,
    context: AudioContext,
    options: VoiceAdapterOptions,
  ) {
    this.#descriptor = descriptor;
    this.#context = context;
    this.#nodeId = options.nodeId ?? nextRuntimeId("node");
    this.#projectRevision = options.projectRevision;
    this.#acknowledgedProjectRevision = options.projectRevision;
    this.#handshakeTimeoutMilliseconds =
      options.handshakeTimeoutMilliseconds ?? DEFAULT_HANDSHAKE_TIMEOUT_MILLISECONDS;
    this.#onStatus = options.onStatus ?? (() => undefined);
    this.#onMeter = options.onMeter ?? (() => undefined);
  }

  get state(): AdapterState {
    return this.#state;
  }

  get pendingMessageCount(): number {
    return this.#pending.size;
  }

  async prepare(): Promise<void> {
    if (this.#state !== "created") {
      throw new Error(`Cannot prepare ${this.#descriptor.displayName} from ${this.#state}`);
    }
    this.#state = "preparing";
    try {
      await this.#context.audioWorklet.addModule(this.#descriptor.moduleUrl);
      const state = this.#currentState();
      if (state === "disposed" || state === "disposing") {
        throw new Error(`${this.#descriptor.displayName} was disposed during preparation.`);
      }
      await this.#openSession();
    } catch (error) {
      if (this.fault === undefined) {
        this.#fail(
          "prepare-failed",
          error instanceof Error
            ? error.message
            : `${this.#descriptor.displayName} preparation failed.`,
          "Retry audio activation. If it fails again, keep the instrument silent.",
          false,
        );
      }
      throw error;
    }
  }

  activate(destination: AudioNode): void {
    if (this.#node === undefined || (this.#state !== "ready" && this.#state !== "suspended")) {
      throw new Error(`Cannot activate ${this.#descriptor.displayName} from ${this.#state}`);
    }
    this.#destination = destination;
    this.#node.connect(destination);
    this.#postControl("resume", {});
    this.#state = "active";
  }

  readonly setProjectRevision = (projectRevision: StateRevision): void => {
    this.#projectRevision = projectRevision;
  };

  setParameters(
    parameters: Readonly<Record<string, ParameterValue>>,
    projectRevision: StateRevision,
  ): void {
    const mapped = this.#descriptor.mapParameters(parameters);
    const committedParameters = new Set(Object.keys(mapped));
    this.#previewParameters = Object.fromEntries(
      Object.entries(this.#previewParameters).filter(
        ([parameter]) => !committedParameters.has(parameter),
      ),
    );
    this.#projectRevision = projectRevision;
    Object.assign(this.#currentParameterSnapshot, mapped);
    if (!this.#canSendMusicalControl()) return;
    if (this.#pending.size >= ENGINE_PROTOCOL_LIMITS.backpressureEnvelopeCount) {
      Object.assign(this.#deferredParameters, mapped);
      return;
    }
    this.#postParameterBatch(mapped);
  }

  readonly previewParameters = (parameters: Readonly<Record<string, ParameterValue>>): void => {
    if (!this.#canSendMusicalControl()) return;
    Object.assign(this.#previewParameters, this.#descriptor.mapParameters(parameters));
    this.#schedulePreviewFlush();
  };

  readonly scheduleParameters = (changes: readonly ScheduledParameterChange[]): void => {
    if (!this.#canSendMusicalControl() || changes.length === 0) return;
    if (changes.length > SCHEDULED_PARAMETER_QUEUE_CAPACITY) {
      this.#fail(
        "parameter-batch-overflow",
        `The ${this.#descriptor.displayName} parameter horizon exceeded its queue capacity.`,
        "Pulsebox will silence and replace this processor from its latest state.",
        true,
      );
      return;
    }
    const mapped = changes.map((change) => {
      const parameters = this.#descriptor.mapParameters({ [change.parameterId]: change.value });
      const entry = Object.entries(parameters)[0];
      if (entry === undefined) return undefined;
      return {
        parameterId: entry[0],
        value: entry[1],
        audioFrame: change.atFrame,
      };
    }).filter((change): change is { parameterId: string; value: ParameterValue; audioFrame: number } =>
      change !== undefined && Number.isSafeInteger(change.audioFrame) && change.audioFrame >= 0,
    );
    for (
      let offset = 0;
      offset < mapped.length;
      offset += ENGINE_PROTOCOL_LIMITS.maximumParameterChangesPerBatch
    ) {
      this.#postControl("parameter-batch", {
        changes: mapped.slice(
          offset,
          offset + ENGINE_PROTOCOL_LIMITS.maximumParameterChangesPerBatch,
        ),
      });
    }
  };

  readonly replaceState = (
    parameters: Readonly<Record<string, ParameterValue>>,
    projectRevision: StateRevision,
  ): void => {
    const mapped = this.#descriptor.mapParameters(parameters);
    this.#projectRevision = projectRevision;
    this.#currentParameterSnapshot = { ...mapped };
    this.#deferredParameters = {};
    this.#clearPreviewParameters();
    if (this.#canSendMusicalControl()) {
      this.#postControl(
        "state-snapshot",
        { parameters: mapped },
      );
    }
  };

  readonly schedule = (events: readonly ScheduledVoiceEvent[]): void => {
    if (!this.#canSendMusicalControl() || events.length === 0) return;
    if (events.length > SCHEDULED_EVENT_QUEUE_CAPACITY) {
      this.#fail(
        "event-batch-overflow",
        `The ${this.#descriptor.displayName} event horizon exceeded its queue capacity.`,
        "Pulsebox will silence and replace this processor from its latest state.",
        true,
      );
      return;
    }
    const scheduled: ScheduledEventPayload[] = [];
    for (const event of events) {
      // An invalid frame is a scheduler bug. Discarding the batch silently
      // would drop a whole window of notes, so it faults like the overflow.
      if (!Number.isSafeInteger(event.atFrame) || event.atFrame < 0) {
        this.#fail(
          "event-batch-invalid-frame",
          `The ${this.#descriptor.displayName} event batch carried an invalid audio frame.`,
          "Pulsebox will silence and replace this processor from its latest state.",
          true,
        );
        return;
      }
      scheduled.push({
        eventId:
          event.occurrenceId === undefined
            ? `${this.#sessionId}:${this.#eventId.toString()}`
            : `${event.occurrenceId}:${event.type}`,
        audioFrame: event.atFrame,
        priority: scheduledEventPriority(event),
        data: voiceEventData(event),
      });
      this.#eventId += 1;
    }
    scheduled.sort(compareScheduledEvents);
    for (
      let offset = 0;
      offset < scheduled.length;
      offset += ENGINE_PROTOCOL_LIMITS.maximumEventsPerBatch
    ) {
      this.#postControl("event-batch", {
        events: scheduled.slice(offset, offset + ENGINE_PROTOCOL_LIMITS.maximumEventsPerBatch),
      });
    }
  };

  /**
   * Without a bound, the whole queue clears. With `fromFrame`, only events at
   * or past that frame drop and the imminent events before it keep playing
   * from the processor queue, exactly as they were sent.
   */
  readonly clearScheduledEvents = (fromFrame?: number): void => {
    if (!this.#canSendMusicalControl()) return;
    this.#postControl(
      "clear-scheduled-events",
      fromFrame !== undefined && Number.isSafeInteger(fromFrame) && fromFrame >= 0
        ? { fromFrame }
        : {},
    );
  };

  resume(): void {
    if (this.#node === undefined || this.#state !== "suspended") return;
    this.#postControl("resume", {});
    this.#state = "active";
  }

  suspend(): void {
    if (this.#node === undefined || this.#state !== "active") return;
    this.#postControl("all-notes-off", {});
    this.#postControl("suspend", {});
    this.#state = "suspended";
  }

  dispose(): void {
    if (this.#state === "disposed" || this.#state === "disposing") return;
    // A handshake still in flight would never settle: once the state below
    // becomes disposing, `#fail` ignores this adapter. Reject it first so a
    // pending `prepare()` completes.
    const handshake = this.#handshake;
    if (handshake !== undefined) {
      clearTimeout(handshake.timer);
      this.#handshake = undefined;
      handshake.reject(
        new Error(`${this.#descriptor.displayName} was disposed during preparation.`),
      );
    }
    if (this.#node === undefined) {
      this.#clearPreviewParameters();
      this.#state = "disposed";
      return;
    }
    this.#state = "disposing";
    const node = this.#node;
    this.#postControl("all-notes-off", {});
    this.#disposeTimer = setTimeout(() => {
      if (this.#currentState() !== "disposing") return;
      this.#postControl("dispose", {});
      node.disconnect();
      if (this.#currentState() !== "disposed") this.#finishDisposal();
    }, DISPOSE_RELEASE_MILLISECONDS);
  }

  /**
   * Reads the current state opaquely. Disposal and faults can run re-entrantly
   * inside postMessage, so callers must observe the field rather than a value
   * narrowed before that call.
   */
  #currentState(): AdapterState {
    return this.#state;
  }

  #canSendMusicalControl(): boolean {
    return (
      this.#node !== undefined &&
      (this.#state === "ready" || this.#state === "active" || this.#state === "suspended")
    );
  }

  async #openSession(projectRevision: StateRevision = this.#projectRevision): Promise<void> {
    this.#sessionId = nextRuntimeId("session");
    this.#nextSequence = 0;
    this.#expectedProcessorSequence = 0;
    this.#eventId = 0;
    this.#pending.clear();

    const node = new AudioWorkletNode(this.#context, this.#descriptor.processorName, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [this.#descriptor.outputChannelCount ?? 2],
    });
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (this.#node === node) this.#receive(event.data);
    };
    node.addEventListener("processorerror", () => {
      if (this.#node === node) {
        this.#fail(
          "processor-error",
          `The ${this.#descriptor.displayName} audio processor stopped unexpectedly.`,
          "Pulsebox will replace this processor once and restore its latest parameters.",
          true,
        );
      }
    });
    // `dispose` can land while `addModule` or the constructor is still in
    // flight. It has no node to release at that point, so the disposal is
    // honoured here instead; otherwise this node would stay connected for the
    // life of the context with nothing holding a reference to stop it.
    if (this.#state === "disposed" || this.#state === "disposing") {
      node.port.onmessage = null;
      node.disconnect();
      return;
    }
    this.#node = node;

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#fail(
          "handshake-timeout",
          `The ${this.#descriptor.displayName} audio processor did not complete its handshake.`,
          "Retry audio activation. If it fails again, keep the instrument silent.",
          false,
        );
      }, this.#handshakeTimeoutMilliseconds);
      this.#handshake = { resolve, reject, timer };
    });
    this.#postControl("hello", {}, projectRevision);
    await ready;
  }

  #receive(value: unknown): void {
    if (this.#state === "disposed") return;
    const validated = validateEngineMessageEnvelope(value);
    if (!validated.ok) {
      const detail = validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" ");
      this.#fail(
        "malformed-processor-message",
        `The ${this.#descriptor.displayName} processor sent an invalid message. ${detail}`,
        "Pulsebox will replace this processor once. If recovery fails, keep it silent.",
        true,
      );
      return;
    }
    const message = validated.value;
    if (
      !isProcessorToControllerKind(message.kind) ||
      message.sessionId !== this.#sessionId ||
      message.nodeId !== this.#nodeId
    ) {
      this.#fail(
        "invalid-processor-session",
        `The ${this.#descriptor.displayName} processor replied on the wrong protocol session.`,
        "Pulsebox will replace this processor once. If recovery fails, keep it silent.",
        true,
      );
      return;
    }
    if (message.sequence < this.#expectedProcessorSequence) return;
    if (message.sequence > this.#expectedProcessorSequence) {
      this.#fail(
        "processor-sequence-gap",
        `The ${this.#descriptor.displayName} processor skipped message ${this.#expectedProcessorSequence.toString()}.`,
        "Pulsebox will replace this processor once and restore its latest parameters.",
        true,
      );
      return;
    }
    this.#expectedProcessorSequence += 1;

    if (this.#state === "preparing" && message.kind !== "ready" && message.kind !== "fault") {
      this.#fail(
        "message-before-ready",
        `The ${this.#descriptor.displayName} processor sent control data before it was ready.`,
        "Retry audio activation. If it fails again, keep the instrument silent.",
        false,
      );
      return;
    }

    switch (message.kind) {
      case "ready":
        this.#completeHandshake();
        break;
      case "ack":
        this.#acknowledge(message.payload as unknown as AcknowledgementPayload);
        break;
      case "fault": {
        const payload = message.payload as unknown as EngineFaultPayload;
        this.#fail(payload.code, payload.message, payload.recoveryAction, true);
        break;
      }
      case "disposed":
        if (this.#state === "disposing") this.#finishDisposal();
        break;
      case "meter-frame": {
        const level = (message.payload as { readonly level?: unknown }).level;
        if (typeof level === "number" && Number.isFinite(level)) {
          this.#onMeter(Math.min(1, Math.max(0, level)));
        }
        break;
      }
      case "status":
      case "warning":
        break;
    }
  }

  #postParameterBatch(parameters: Readonly<Record<string, ParameterValue>>): void {
    const changes = Object.entries(parameters).map(([parameterId, value]) => ({
      parameterId,
      value,
    }));
    if (changes.length > 0) this.#postControl("parameter-batch", { changes });
  }

  #schedulePreviewFlush(): void {
    if (this.#previewTimer !== undefined || Object.keys(this.#previewParameters).length === 0) {
      return;
    }
    this.#previewTimer = setTimeout(() => {
      this.#previewTimer = undefined;
      if (
        !this.#canSendMusicalControl() ||
        this.#pending.size >= ENGINE_PROTOCOL_LIMITS.backpressureEnvelopeCount
      ) {
        return;
      }
      const parameters = this.#previewParameters;
      this.#previewParameters = {};
      this.#postParameterBatch(parameters);
    }, PREVIEW_INTERVAL_MILLISECONDS);
  }

  #clearPreviewParameters(): void {
    if (this.#previewTimer !== undefined) clearTimeout(this.#previewTimer);
    this.#previewTimer = undefined;
    this.#previewParameters = {};
  }

  #postControl(
    kind: ControllerToProcessorKind,
    payload: Readonly<Record<string, unknown>>,
    projectRevision: StateRevision = this.#projectRevision,
  ): void {
    const node = this.#node;
    if (node === undefined) return;
    if (
      this.#nextSequence > Number.MAX_SAFE_INTEGER ||
      this.#pending.size >= ENGINE_PROTOCOL_LIMITS.maximumUnacknowledgedEnvelopes
    ) {
      this.#fail(
        "controller-backpressure",
        `The ${this.#descriptor.displayName} control queue reached its safe limit.`,
        "Pulsebox will silence and replace this processor from its latest state.",
        true,
      );
      return;
    }
    const message: EngineMessageEnvelope = {
      protocolVersion: ENGINE_PROTOCOL_VERSION,
      sessionId: this.#sessionId,
      nodeId: this.#nodeId,
      sequence: this.#nextSequence,
      kind,
      projectRevision,
      payload,
    };
    if (!isRealtimeSafeControllerEnvelope(message)) {
      this.#fail(
        "invalid-control-payload",
        `The ${this.#descriptor.displayName} control data exceeded the protocol limits.`,
        "Pulsebox will silence this processor until valid state replaces it.",
        false,
      );
      return;
    }
    this.#nextSequence += 1;
    this.#pending.set(message.sequence, message);
    node.port.postMessage(message);
  }

  #acknowledge(payload: AcknowledgementPayload): void {
    // The processor stamps acknowledgements with its own current revision, which
    // legitimately runs ahead of the acknowledged envelope whenever that envelope
    // was stale. Only an acknowledgement of control data never sent is a fault.
    if (payload.highestContiguousSequence >= this.#nextSequence) {
      this.#fail(
        "invalid-acknowledgement",
        `The ${this.#descriptor.displayName} processor sent an acknowledgement for unknown control data or project state.`,
        "Pulsebox will replace this processor once and restore its latest parameters.",
        true,
      );
      return;
    }
    // A stale envelope was deliberately ignored by the processor, so its
    // parameters must not be recorded as the acknowledged snapshot.
    const applied = payload.disposition !== "stale";
    for (const [sequence, message] of this.#pending) {
      if (sequence <= payload.highestContiguousSequence) {
        if (applied) this.#recordAcknowledgedState(message);
        this.#pending.delete(sequence);
      }
    }
    if (
      this.#pending.size < ENGINE_PROTOCOL_LIMITS.backpressureEnvelopeCount &&
      Object.keys(this.#deferredParameters).length > 0
    ) {
      const deferred = this.#deferredParameters;
      this.#deferredParameters = {};
      this.#postParameterBatch(deferred);
    }
    if (this.#pending.size < ENGINE_PROTOCOL_LIMITS.backpressureEnvelopeCount) {
      this.#schedulePreviewFlush();
    }
  }

  #recordAcknowledgedState(message: EngineMessageEnvelope): void {
    if (message.projectRevision !== undefined) {
      this.#acknowledgedProjectRevision = message.projectRevision;
    }
    if (message.kind === "state-snapshot") {
      const parameters = message.payload.parameters;
      if (isPlainRecord(parameters)) {
        this.#acknowledgedParameterSnapshot = {
          ...(parameters as Record<string, ParameterValue>),
        };
      }
      return;
    }
    if (message.kind !== "parameter-batch" || !Array.isArray(message.payload.changes)) {
      return;
    }
    const acknowledged: Record<string, ParameterValue> = {
      ...this.#acknowledgedParameterSnapshot,
    };
    for (const change of message.payload.changes) {
      if (isPlainRecord(change) && typeof change.parameterId === "string") {
        acknowledged[change.parameterId] = change.value as ParameterValue;
      }
    }
    this.#acknowledgedParameterSnapshot = acknowledged;
  }

  #completeHandshake(): void {
    const handshake = this.#handshake;
    if (handshake === undefined || this.#state !== "preparing") {
      this.#fail(
        "unexpected-ready",
        `The ${this.#descriptor.displayName} processor sent an unexpected ready message.`,
        "Pulsebox will replace this processor once. If recovery fails, keep it silent.",
        true,
      );
      return;
    }
    clearTimeout(handshake.timer);
    this.#handshake = undefined;
    this.fault = undefined;
    this.#state = "ready";
    handshake.resolve();
  }

  #fail(code: string, message: string, recoveryAction: string, allowRecovery: boolean): void {
    if (this.#state === "disposed" || this.#state === "disposing") return;
    const priorState = this.#state;
    const node = this.#node;
    this.#node = undefined;
    node?.disconnect();
    node?.port.close();
    this.#pending.clear();
    this.#deferredParameters = {};
    this.#clearPreviewParameters();
    const handshake = this.#handshake;
    if (handshake !== undefined) {
      clearTimeout(handshake.timer);
      this.#handshake = undefined;
      handshake.reject(new Error(`${message} ${recoveryAction}`));
    }
    const fault = { code, message, recoveryAction };
    this.fault = fault;
    this.#state = "faulted";

    const recoverable =
      allowRecovery &&
      !this.#recoveryAttempted &&
      (priorState === "ready" || priorState === "active" || priorState === "suspended");
    this.#onStatus({
      state: recoverable ? "recovering" : "faulted",
      fault,
    });

    if (recoverable) {
      this.#recoveryAttempted = true;
      void this.#recover(priorState).catch(() => {
        // #openSession records the actionable fault and leaves this branch silent.
      });
    }
  }

  async #recover(priorState: "ready" | "active" | "suspended"): Promise<void> {
    const acknowledgedProjectRevision = this.#acknowledgedProjectRevision;
    const acknowledgedParameters = { ...this.#acknowledgedParameterSnapshot };
    this.#state = "preparing";
    await this.#openSession(acknowledgedProjectRevision);
    this.#postControl(
      "state-snapshot",
      { parameters: acknowledgedParameters },
      acknowledgedProjectRevision,
    );

    const currentProjectRevision = this.#projectRevision;
    const currentParameters = { ...this.#currentParameterSnapshot };
    if (
      !sameRevision(acknowledgedProjectRevision, currentProjectRevision) ||
      !sameParameters(acknowledgedParameters, currentParameters)
    ) {
      this.#postControl(
        "state-snapshot",
        { parameters: currentParameters },
        currentProjectRevision,
      );
    }

    if (priorState === "active" && this.#destination !== undefined) {
      this.#node?.connect(this.#destination);
      this.#postControl("resume", {});
      this.#state = "active";
    } else if (priorState === "suspended") {
      if (this.#destination !== undefined) {
        this.#node?.connect(this.#destination);
      }
      this.#postControl("suspend", {});
      this.#state = "suspended";
    }
    this.#recoveryAttempted = false;
    this.#onStatus({ state: "recovered" });
  }

  #finishDisposal(): void {
    this.#clearPreviewParameters();
    if (this.#disposeTimer !== undefined) clearTimeout(this.#disposeTimer);
    this.#disposeTimer = undefined;
    const node = this.#node;
    this.#node = undefined;
    node?.port.close();
    this.#pending.clear();
    this.#destination = undefined;
    this.#state = "disposed";
  }
}

function voiceEventData(event: ScheduledVoiceEvent): Readonly<Record<string, unknown>> {
  const data: Record<string, unknown> = { type: event.type };
  if (event.sourceStep !== undefined) data.sourceStep = event.sourceStep;
  if (event.occurrenceId !== undefined) data.occurrenceId = event.occurrenceId;
  if (event.note !== undefined) data.note = event.note;
  if (event.velocity !== undefined) data.velocity = event.velocity;
  if (event.accent !== undefined) data.accent = event.accent;
  if (event.slide !== undefined) data.slide = event.slide;
  return data;
}

function sameRevision(left: StateRevision, right: StateRevision): boolean {
  return left.epoch === right.epoch && left.counter === right.counter;
}

function sameParameters(
  left: Readonly<Record<string, ParameterValue>>,
  right: Readonly<Record<string, ParameterValue>>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => Object.is(left[key], right[key]));
}
