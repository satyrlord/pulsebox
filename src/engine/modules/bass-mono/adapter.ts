import {
  browserIdFactory,
  type StateRevision,
} from "../../../contracts/ids";
import {
  ENGINE_PROTOCOL_LIMITS,
  ENGINE_PROTOCOL_VERSION,
  compareScheduledEvents,
  isProcessorToControllerKind,
  validateEngineMessageEnvelope,
  type AcknowledgementPayload,
  type ControllerToProcessorKind,
  type EngineFaultPayload,
  type EngineMessageEnvelope,
  type ScheduledEventPayload,
} from "../../../contracts/worklet-protocol";
import { isPlainRecord } from "../../../contracts/validation";
import type { BassParameters } from "./dsp-core";
import workletUrl from "./bass-mono.worklet.ts?worker&url";

export interface ScheduledBassEvent {
  readonly atFrame: number;
  readonly type: "note-on" | "note-off" | "reset";
  readonly note?: number;
  readonly velocity?: number;
  readonly accent?: boolean;
  readonly slide?: boolean;
}

export interface AcidBassFault {
  readonly code: string;
  readonly message: string;
  readonly recoveryAction: string;
}

export type AcidBassAdapterStatus =
  | { readonly state: "recovering"; readonly fault: AcidBassFault }
  | { readonly state: "recovered" }
  | { readonly state: "faulted"; readonly fault: AcidBassFault };

export interface AcidBassAdapterOptions {
  readonly nodeId?: string;
  readonly projectRevision: StateRevision;
  readonly handshakeTimeoutMilliseconds?: number;
  readonly onStatus?: (status: AcidBassAdapterStatus) => void;
}

type AdapterState =
  | "created"
  | "preparing"
  | "ready"
  | "active"
  | "suspended"
  | "disposing"
  | "disposed"
  | "faulted";

interface Handshake {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_HANDSHAKE_TIMEOUT_MILLISECONDS = 2_000;
const DISPOSE_RELEASE_MILLISECONDS = 100;

export class AcidBassAdapter {
  readonly #context: AudioContext;
  readonly #nodeId: string;
  #projectRevision: StateRevision;
  readonly #handshakeTimeoutMilliseconds: number;
  readonly #onStatus: (status: AcidBassAdapterStatus) => void;
  readonly #pending = new Map<number, EngineMessageEnvelope>();
  #acknowledgedParameterSnapshot: Partial<BassParameters> = {};
  #acknowledgedProjectRevision: StateRevision;
  #currentParameterSnapshot: Partial<BassParameters> = {};
  #deferredParameters: Partial<BassParameters> = {};
  #node: AudioWorkletNode | undefined;
  #sessionId = "";
  #nextSequence = 0;
  #expectedProcessorSequence = 0;
  #eventId = 0;
  #destination: AudioNode | undefined;
  #handshake: Handshake | undefined;
  #disposeTimer: ReturnType<typeof setTimeout> | undefined;
  #recoveryAttempted = false;
  #fault: AcidBassFault | undefined;
  #state: AdapterState = "created";

  constructor(context: AudioContext, options: AcidBassAdapterOptions) {
    this.#context = context;
    this.#nodeId = options.nodeId ?? browserIdFactory.createUuid();
    this.#projectRevision = options.projectRevision;
    this.#acknowledgedProjectRevision = options.projectRevision;
    this.#handshakeTimeoutMilliseconds =
      options.handshakeTimeoutMilliseconds ??
      DEFAULT_HANDSHAKE_TIMEOUT_MILLISECONDS;
    this.#onStatus = options.onStatus ?? (() => undefined);
  }

  get state(): AdapterState {
    return this.#state;
  }

  get fault(): AcidBassFault | undefined {
    return this.#fault;
  }

  get pendingMessageCount(): number {
    return this.#pending.size;
  }

  get output(): AudioNode {
    if (this.#node === undefined) throw new Error("Acid Bass is not prepared");
    return this.#node;
  }

  async prepare(): Promise<void> {
    if (this.#state !== "created") {
      throw new Error(`Cannot prepare Acid Bass from ${this.#state}`);
    }
    this.#state = "preparing";
    try {
      await this.#context.audioWorklet.addModule(workletUrl);
      await this.#openSession();
    } catch (error) {
      if (this.#fault === undefined) {
        this.#fail(
          "prepare-failed",
          error instanceof Error ? error.message : "Acid Bass preparation failed.",
          "Retry audio activation. If it fails again, keep the instrument silent.",
          false,
        );
      }
      throw error;
    }
  }

  activate(destination: AudioNode): void {
    if (
      this.#node === undefined ||
      (this.#state !== "ready" && this.#state !== "suspended")
    ) {
      throw new Error(`Cannot activate Acid Bass from ${this.#state}`);
    }
    this.#destination = destination;
    this.#node.connect(destination);
    this.#postControl("resume", {});
    this.#state = "active";
  }

  setProjectRevision(projectRevision: StateRevision): void {
    this.#projectRevision = projectRevision;
  }

  setParameters(
    parameters: Partial<BassParameters>,
    projectRevision: StateRevision,
  ): void {
    this.#projectRevision = projectRevision;
    Object.assign(this.#currentParameterSnapshot, parameters);
    if (!this.#canSendMusicalControl()) return;
    if (
      this.#pending.size >= ENGINE_PROTOCOL_LIMITS.backpressureEnvelopeCount
    ) {
      Object.assign(this.#deferredParameters, parameters);
      return;
    }
    this.#postParameterBatch(parameters);
  }

  previewParameters(parameters: Partial<BassParameters>): void {
    if (
      !this.#canSendMusicalControl() ||
      this.#pending.size >= ENGINE_PROTOCOL_LIMITS.backpressureEnvelopeCount
    ) {
      return;
    }
    this.#postParameterBatch(parameters);
  }

  replaceState(
    parameters: Partial<BassParameters>,
    projectRevision: StateRevision,
  ): void {
    this.#projectRevision = projectRevision;
    this.#currentParameterSnapshot = { ...parameters };
    this.#deferredParameters = {};
    if (this.#canSendMusicalControl()) {
      this.#postControl("state-snapshot", {
        parameters,
      });
    }
  }

  schedule(events: readonly ScheduledBassEvent[]): void {
    if (
      !this.#canSendMusicalControl() ||
      events.length === 0 ||
      events.length > ENGINE_PROTOCOL_LIMITS.maximumEventsPerBatch
    ) {
      return;
    }
    const scheduled: ScheduledEventPayload[] = [];
    for (const event of events) {
      if (!Number.isSafeInteger(event.atFrame) || event.atFrame < 0) return;
      scheduled.push({
        eventId: `${this.#sessionId}:${this.#eventId.toString()}`,
        audioFrame: event.atFrame,
        priority: eventPriority(event),
        data: bassEventData(event),
      });
      this.#eventId += 1;
    }
    scheduled.sort(compareScheduledEvents);
    this.#postControl("event-batch", { events: scheduled });
  }

  clearScheduledEvents(): void {
    if (this.#canSendMusicalControl()) {
      this.#postControl("clear-scheduled-events", {});
    }
  }

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
    if (this.#node === undefined) {
      this.#state = "disposed";
      return;
    }
    this.#state = "disposing";
    const node = this.#node;
    this.#postControl("all-notes-off", {});
    this.#disposeTimer = setTimeout(
      () => {
        if (this.#currentState() !== "disposing") return;
        this.#postControl("dispose", {});
        node.disconnect();
        if (this.#currentState() !== "disposed") this.#finishDisposal();
      },
      DISPOSE_RELEASE_MILLISECONDS,
    );
  }

  async recover(): Promise<void> {
    if (this.#state !== "faulted") {
      throw new Error(`Cannot recover Acid Bass from ${this.#state}`);
    }
    this.#recoveryAttempted = true;
    await this.#recover("suspended");
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
      (this.#state === "ready" ||
        this.#state === "active" ||
        this.#state === "suspended")
    );
  }

  async #openSession(
    projectRevision: StateRevision = this.#projectRevision,
  ): Promise<void> {
    this.#sessionId = browserIdFactory.createUuid();
    this.#nextSequence = 0;
    this.#expectedProcessorSequence = 0;
    this.#eventId = 0;
    this.#pending.clear();

    const node = new AudioWorkletNode(this.#context, "pulsebox-bass-mono", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (this.#node === node) this.#receive(event.data);
    };
    node.addEventListener("processorerror", () => {
      if (this.#node === node) {
        this.#fail(
          "processor-error",
          "The Acid Bass audio processor stopped unexpectedly.",
          "Pulsebox will replace this processor once and restore its latest parameters.",
          true,
        );
      }
    });
    this.#node = node;

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#fail(
          "handshake-timeout",
          "The Acid Bass audio processor did not complete its handshake.",
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
      const detail = validated.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join(" ");
      this.#fail(
        "malformed-processor-message",
        `The Acid Bass processor sent an invalid message. ${detail}`,
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
        "The Acid Bass processor replied on the wrong protocol session.",
        "Pulsebox will replace this processor once. If recovery fails, keep it silent.",
        true,
      );
      return;
    }
    if (message.sequence < this.#expectedProcessorSequence) return;
    if (message.sequence > this.#expectedProcessorSequence) {
      this.#fail(
        "processor-sequence-gap",
        `The Acid Bass processor skipped message ${this.#expectedProcessorSequence.toString()}.`,
        "Pulsebox will replace this processor once and restore its latest parameters.",
        true,
      );
      return;
    }
    this.#expectedProcessorSequence += 1;

    if (this.#state === "preparing" && message.kind !== "ready" && message.kind !== "fault") {
      this.#fail(
        "message-before-ready",
        "The Acid Bass processor sent control data before it was ready.",
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
      case "meter-frame":
      case "status":
      case "warning":
        break;
    }
  }

  #postParameterBatch(parameters: Partial<BassParameters>): void {
    const changes = Object.entries(parameters).map(([parameterId, value]) => ({
      parameterId,
      value,
    }));
    if (changes.length > 0) this.#postControl("parameter-batch", { changes });
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
        "The Acid Bass control queue reached its safe limit.",
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
        "The Acid Bass processor sent an acknowledgement for unknown control data or project state.",
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
  }

  #recordAcknowledgedState(message: EngineMessageEnvelope): void {
    if (message.projectRevision !== undefined) {
      this.#acknowledgedProjectRevision = message.projectRevision;
    }
    if (message.kind === "state-snapshot") {
      const parameters = message.payload.parameters;
      if (isPlainRecord(parameters)) {
        this.#acknowledgedParameterSnapshot = {
          ...(parameters as Partial<BassParameters>),
        };
      }
      return;
    }
    if (
      message.kind !== "parameter-batch" ||
      !Array.isArray(message.payload.changes)
    ) {
      return;
    }
    const acknowledged = { ...this.#acknowledgedParameterSnapshot };
    for (const change of message.payload.changes) {
      if (
        isPlainRecord(change) &&
        typeof change.parameterId === "string"
      ) {
        (acknowledged as Record<string, unknown>)[change.parameterId] =
          change.value;
      }
    }
    this.#acknowledgedParameterSnapshot = acknowledged;
  }

  #completeHandshake(): void {
    const handshake = this.#handshake;
    if (handshake === undefined || this.#state !== "preparing") {
      this.#fail(
        "unexpected-ready",
        "The Acid Bass processor sent an unexpected ready message.",
        "Pulsebox will replace this processor once. If recovery fails, keep it silent.",
        true,
      );
      return;
    }
    clearTimeout(handshake.timer);
    this.#handshake = undefined;
    this.#fault = undefined;
    this.#state = "ready";
    handshake.resolve();
  }

  #fail(
    code: string,
    message: string,
    recoveryAction: string,
    allowRecovery: boolean,
  ): void {
    if (this.#state === "disposed" || this.#state === "disposing") return;
    const priorState = this.#state;
    const node = this.#node;
    this.#node = undefined;
    node?.disconnect();
    node?.port.close();
    this.#pending.clear();
    this.#deferredParameters = {};
    const handshake = this.#handshake;
    if (handshake !== undefined) {
      clearTimeout(handshake.timer);
      this.#handshake = undefined;
      handshake.reject(new Error(`${message} ${recoveryAction}`));
    }
    const fault = { code, message, recoveryAction };
    this.#fault = fault;
    this.#state = "faulted";

    const recoverable =
      allowRecovery &&
      !this.#recoveryAttempted &&
      (priorState === "ready" ||
        priorState === "active" ||
        priorState === "suspended");
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
    const acknowledgedParameters = {
      ...this.#acknowledgedParameterSnapshot,
    };
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

function eventPriority(event: ScheduledBassEvent): number {
  return event.type === "note-off" ? 0 : event.type === "reset" ? 1 : 2;
}

function bassEventData(
  event: ScheduledBassEvent,
): Readonly<Record<string, unknown>> {
  const data: Record<string, unknown> = { type: event.type };
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
  left: Partial<BassParameters>,
  right: Partial<BassParameters>,
): boolean {
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...keys].every((key) => Object.is(leftRecord[key], rightRecord[key]));
}
