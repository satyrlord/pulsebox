import type {} from "./audio-worklet-globals";

import type { StateRevision } from "../../contracts/ids";
import {
  ENGINE_PROTOCOL_VERSION,
  isRealtimeSafeControllerEnvelope,
  type AcknowledgementPayload,
  type ClearScheduledEventsPayload,
  type ControllerToProcessorKind,
  type EngineFaultPayload,
  type EngineMessageEnvelope,
  type ProcessorToControllerKind,
  type ScheduledEventPayload,
} from "../../contracts/worklet-protocol";
import { isPlainRecord } from "../../contracts/validation";

interface VoiceEvent {
  readonly atFrame: number;
  readonly type: "note-on" | "note-off" | "reset";
  readonly note?: number;
  readonly velocity?: number;
  readonly accent?: boolean;
  readonly slide?: boolean;
}

const EVENT_CAPACITY = 256;
/** 30 frames per second is the protocol ceiling; one frame per 30 ms is under it. */
const METER_INTERVAL_SECONDS = 1 / 30;
const UNKNOWN_SESSION_ID = "unknown-session";
const UNKNOWN_NODE_ID = "unknown-node";

/**
 * Every worklet-backed voice shares this processor: session handshake, sequence
 * checking, revision disposition, acknowledgement, fault reporting, and the
 * sample-accurate event queue that splits each render block at event boundaries.
 *
 * A concrete voice supplies only its DSP through the abstract members below.
 */
export abstract class WorkletVoiceProcessor<TParameters> extends AudioWorkletProcessor {
  readonly #frames = new Float64Array(EVENT_CAPACITY);
  readonly #notes = new Uint8Array(EVENT_CAPACITY);
  readonly #velocities = new Float32Array(EVENT_CAPACITY);
  readonly #flags = new Uint8Array(EVENT_CAPACITY);
  #eventCount = 0;
  #sessionId: string | undefined;
  #nodeId: string | undefined;
  #projectRevision: StateRevision | undefined;
  #expectedControllerSequence = 0;
  #nextProcessorSequence = 0;
  #lastAcknowledgement: EngineMessageEnvelope<"ack", AcknowledgementPayload> | undefined;
  #suspended = true;
  #terminated = false;
  #meterPeak = 0;
  #meterFrames = 0;

  /** Product name. Used only in operator-facing fault text. */
  protected abstract readonly displayName: string;

  /** Parses a whole-state parameter object, or returns undefined to fault. */
  protected abstract decodeParameterObject(value: unknown): TParameters | undefined;

  /** Parses an incremental `{ parameterId, value }` list, or undefined to fault. */
  protected abstract decodeParameterChanges(value: unknown): TParameters | undefined;

  protected abstract applyParameters(parameters: TParameters, immediate: boolean): void;

  protected abstract triggerNoteOn(
    note: number,
    velocity: number,
    accent: boolean,
    slide: boolean,
  ): void;

  protected abstract triggerNoteOff(): void;

  protected abstract resetDsp(): void;

  /** Renders `[start, end)` of the current block. Never assumes a block size. */
  protected abstract renderBlock(
    left: Float32Array,
    right: Float32Array | undefined,
    start: number,
    end: number,
  ): void;

  /**
   * Sample-backed voices override this to accept transferred buffers. The
   * default refuses, which is what a purely synthesized voice should do.
   */
  protected applySampleMessage(
    kind: ControllerToProcessorKind,
    payload: Readonly<Record<string, unknown>>,
  ): boolean {
    void kind;
    void payload;
    return false;
  }

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    Object.defineProperty(this, "process", {
      configurable: false,
      enumerable: false,
      value: (
        inputs: readonly (readonly Float32Array[])[],
        outputs: readonly (readonly Float32Array[])[],
      ) => this.#process(inputs, outputs),
      writable: false,
    });
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      this.#receive(event.data);
    };
  }

  #receive(value: unknown): void {
    if (this.#terminated) return;
    if (!isRealtimeSafeControllerEnvelope(value)) {
      this.#fault(
        "malformed-controller-message",
        `The ${this.displayName} processor received an invalid message.`,
        "Replace this processor and restore it from the latest acknowledged snapshot.",
        value,
      );
      return;
    }
    // `isRealtimeSafeControllerEnvelope` already narrows the kind to a
    // controller-to-processor kind, so no direction check is needed here.
    const message = value;
    if (this.#sessionId === undefined || this.#nodeId === undefined) {
      this.#beginSession(message);
      return;
    }
    if (message.sessionId !== this.#sessionId || message.nodeId !== this.#nodeId) {
      this.#fault(
        "session-mismatch",
        `The ${this.displayName} processor received a message for another session or node.`,
        "Replace the affected processor and verify port ownership.",
        message,
      );
      return;
    }
    if (message.sequence < this.#expectedControllerSequence) {
      if (this.#lastAcknowledgement !== undefined) {
        this.port.postMessage(this.#lastAcknowledgement);
      }
      return;
    }
    if (message.sequence > this.#expectedControllerSequence) {
      this.#fault(
        "controller-sequence-gap",
        `Expected controller message ${this.#expectedControllerSequence.toString()} but received ${message.sequence.toString()}.`,
        "Replace this processor and restore it from the latest acknowledged snapshot.",
        message,
      );
      return;
    }

    const revisionDisposition = this.#revisionDisposition(message.projectRevision, message.kind);
    if (revisionDisposition === "invalid") {
      this.#fault(
        "missing-project-revision",
        `The ${this.displayName} processor received control data without a complete project revision.`,
        "Replace this processor and resend one current bounded snapshot.",
        message,
      );
      return;
    }
    if (revisionDisposition === "stale") {
      this.#expectedControllerSequence += 1;
      this.#acknowledge("stale");
      return;
    }

    const applied = this.#apply(message.kind, message.payload);
    if (!applied) return;
    this.#projectRevision = message.projectRevision;
    this.#expectedControllerSequence += 1;
    this.#acknowledge("applied");
    if (message.kind === "dispose") {
      this.#post("disposed", {});
      this.port.close();
    }
  }

  #beginSession(message: EngineMessageEnvelope): void {
    if (
      message.kind !== "hello" ||
      message.sequence !== 0 ||
      message.projectRevision === undefined
    ) {
      this.#fault(
        "message-before-ready",
        `The ${this.displayName} processor requires hello message zero before other control data.`,
        "Create a new processor and begin its session with a valid hello envelope.",
        message,
      );
      return;
    }
    this.#sessionId = message.sessionId;
    this.#nodeId = message.nodeId;
    this.#projectRevision = message.projectRevision;
    this.#expectedControllerSequence = 1;
    this.#post("ready", { acceptedProtocolVersion: ENGINE_PROTOCOL_VERSION });
    this.#acknowledge("applied");
  }

  #revisionDisposition(
    revision: StateRevision | undefined,
    kind: ControllerToProcessorKind,
  ): "current" | "stale" | "invalid" {
    const current = this.#projectRevision;
    if (revision === undefined || current === undefined) return "invalid";
    if (revision.epoch !== current.epoch) {
      return kind === "state-snapshot" ? "current" : "stale";
    }
    return revision.counter < current.counter ? "stale" : "current";
  }

  #apply(kind: ControllerToProcessorKind, payload: Readonly<Record<string, unknown>>): boolean {
    switch (kind) {
      case "configure":
        return true;
      case "state-snapshot": {
        if (payload.parameters === undefined) return true;
        const parameters = this.decodeParameterObject(payload.parameters);
        if (parameters === undefined) return this.#pluginPayloadFault(kind);
        this.applyParameters(parameters, true);
        return true;
      }
      case "parameter-batch": {
        const parameters = this.decodeParameterChanges(payload.changes);
        if (parameters === undefined) return this.#pluginPayloadFault(kind);
        this.applyParameters(parameters, false);
        return true;
      }
      case "event-batch": {
        if (!Array.isArray(payload.events)) return this.#pluginPayloadFault(kind);
        if (payload.events.length > EVENT_CAPACITY - this.#eventCount) {
          this.#fault(
            "event-queue-overflow",
            `The ${this.displayName} event queue reached its declared capacity.`,
            "Silence and replace this processor, then reduce scheduling lookahead.",
            undefined,
          );
          return false;
        }
        for (const value of payload.events) {
          const event = decodeEvent(value);
          if (event === undefined) return this.#pluginPayloadFault(kind);
          this.#enqueue(event);
        }
        return true;
      }
      case "transport":
        if (payload.command === "stop") this.#silenceAndReportMeter();
        return true;
      case "reset":
        this.resetDsp();
        this.#eventCount = 0;
        return true;
      case "clear-scheduled-events": {
        const { fromFrame } = payload as ClearScheduledEventsPayload;
        if (typeof fromFrame !== "number") {
          this.#eventCount = 0;
          return true;
        }
        // The queue is kept sorted by frame, so a bounded clear truncates the
        // tail. Everything before `fromFrame` keeps playing from this queue.
        while (
          this.#eventCount > 0 &&
          (this.#frames[this.#eventCount - 1] ?? 0) >= fromFrame
        ) {
          this.#eventCount -= 1;
        }
        return true;
      }
      case "all-notes-off":
        this.#silenceAndReportMeter();
        return true;
      case "suspend":
        this.#silenceAndReportMeter();
        this.#suspended = true;
        return true;
      case "resume":
        this.#suspended = false;
        return true;
      case "dispose":
        this.#silence();
        this.#terminated = true;
        return true;
      case "sample-attach":
      case "sample-release":
        if (this.applySampleMessage(kind, payload)) return true;
        this.#fault(
          "unsupported-sample-message",
          `${this.displayName} does not accept sample transfer messages.`,
          "Replace this processor and route samples only to sample-capable plugins.",
          undefined,
        );
        return false;
      case "hello":
        this.#fault(
          "unexpected-hello",
          `The ${this.displayName} processor received a second hello message.`,
          "Replace this processor and start a new protocol session.",
          undefined,
        );
        return false;
    }
  }

  #pluginPayloadFault(kind: ControllerToProcessorKind): false {
    this.#fault(
      "invalid-plugin-payload",
      `The ${this.displayName} processor rejected the ${kind} payload.`,
      "Replace this processor and rebuild the message from the owning plugin codec.",
      undefined,
    );
    return false;
  }

  #acknowledge(disposition: AcknowledgementPayload["disposition"]): void {
    const revision = this.#projectRevision;
    if (revision === undefined) return;
    const acknowledgement = this.#envelope("ack", {
      highestContiguousSequence: this.#expectedControllerSequence - 1,
      projectRevision: revision,
      disposition,
    });
    this.#nextProcessorSequence += 1;
    this.#lastAcknowledgement = acknowledgement;
    this.port.postMessage(acknowledgement);
  }

  #post(
    kind: Exclude<ProcessorToControllerKind, "ack">,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    const message = this.#envelope(kind, payload);
    this.#nextProcessorSequence += 1;
    this.port.postMessage(message);
  }

  #envelope<TKind extends ProcessorToControllerKind, TPayload>(
    kind: TKind,
    payload: TPayload,
  ): EngineMessageEnvelope<TKind, TPayload> {
    return {
      protocolVersion: ENGINE_PROTOCOL_VERSION,
      sessionId: this.#sessionId ?? UNKNOWN_SESSION_ID,
      nodeId: this.#nodeId ?? UNKNOWN_NODE_ID,
      sequence: this.#nextProcessorSequence,
      kind,
      ...(this.#projectRevision === undefined ? {} : { projectRevision: this.#projectRevision }),
      payload,
    };
  }

  #fault(code: string, message: string, recoveryAction: string, source: unknown): void {
    if (this.#terminated) return;
    if (isPlainRecord(source)) {
      if (typeof source.sessionId === "string" && source.sessionId.length > 0) {
        this.#sessionId = source.sessionId;
      }
      if (typeof source.nodeId === "string" && source.nodeId.length > 0) {
        this.#nodeId = source.nodeId;
      }
    }
    this.#silence();
    const payload: EngineFaultPayload = { code, message, recoveryAction };
    this.#post("fault", { ...payload });
    this.#terminated = true;
    this.port.close();
  }

  #silence(): void {
    this.triggerNoteOff();
    this.#eventCount = 0;
    this.#meterPeak = 0;
    this.#meterFrames = 0;
  }

  /**
   * Stops the voice and tells the controller its level is now zero.
   *
   * `process` returns early while suspended, so a suspend or stop would
   * otherwise leave the last peak standing and the meter lit for a voice that
   * is no longer sounding. A fault deliberately does not come through here: that
   * processor is terminating and its next message must be the fault itself.
   */
  #silenceAndReportMeter(): void {
    this.#silence();
    if (!this.#terminated && this.#sessionId !== undefined) this.#post("meter-frame", { level: 0 });
  }

  #enqueue(event: VoiceEvent): void {
    let insertion = this.#eventCount;
    while (insertion > 0 && (this.#frames[insertion - 1] ?? 0) > event.atFrame) {
      this.#frames[insertion] = this.#frames[insertion - 1] ?? 0;
      this.#notes[insertion] = this.#notes[insertion - 1] ?? 0;
      this.#velocities[insertion] = this.#velocities[insertion - 1] ?? 0;
      this.#flags[insertion] = this.#flags[insertion - 1] ?? 0;
      insertion -= 1;
    }
    this.#frames[insertion] = event.atFrame;
    this.#notes[insertion] = event.note ?? 0;
    this.#velocities[insertion] = event.velocity ?? 1;
    this.#flags[insertion] =
      event.type === "note-off"
        ? 1
        : event.type === "reset"
          ? 2
          : (event.accent ? 4 : 0) | (event.slide ? 8 : 0);
    this.#eventCount += 1;
  }

  #applyDueEvents(frame: number): void {
    while (this.#eventCount > 0 && (this.#frames[0] ?? Number.POSITIVE_INFINITY) <= frame) {
      const eventFrame = this.#frames[0] ?? frame;
      const flags = this.#flags[0] ?? 0;
      if ((flags & 2) !== 0) this.resetDsp();
      else if ((flags & 1) !== 0) this.triggerNoteOff();
      // A note-on that arrived after its target is expired. Replaying several
      // expired onsets on one sample causes the burst heard after a UI stall.
      // Releases and resets still apply because they make the graph safer.
      else if (eventFrame === frame) {
        this.triggerNoteOn(
          this.#notes[0] ?? 0,
          this.#velocities[0] ?? 1,
          (flags & 4) !== 0,
          (flags & 8) !== 0,
        );
      }

      this.#eventCount -= 1;
      for (let index = 0; index < this.#eventCount; index += 1) {
        this.#frames[index] = this.#frames[index + 1] ?? 0;
        this.#notes[index] = this.#notes[index + 1] ?? 0;
        this.#velocities[index] = this.#velocities[index + 1] ?? 0;
        this.#flags[index] = this.#flags[index + 1] ?? 0;
      }
    }
  }

  #process(
    _inputs: readonly (readonly Float32Array[])[],
    outputs: readonly (readonly Float32Array[])[],
  ): boolean {
    const output = outputs[0];
    const left = output?.[0];
    if (this.#terminated || left === undefined) return !this.#terminated;
    const right = output?.[1];
    const frameCount = left.length;

    if (this.#suspended) {
      left.fill(0);
      right?.fill(0);
      return true;
    }

    let offset = 0;
    while (offset < frameCount) {
      this.#applyDueEvents(currentFrame + offset);
      const nextEventFrame =
        this.#eventCount > 0
          ? (this.#frames[0] ?? Number.POSITIVE_INFINITY)
          : Number.POSITIVE_INFINITY;
      const nextOffset = Math.min(frameCount, Math.max(offset + 1, nextEventFrame - currentFrame));
      this.renderBlock(left, right, offset, nextOffset);
      offset = nextOffset;
    }

    this.#observeMeter(left, right, frameCount);
    return true;
  }

  /**
   * Peak over both emitted channels, rate-limited to the protocol ceiling. This
   * measures the signal actually produced, so the meter can never show level
   * for a voice that is silent. A voice panned hard to one side still meters,
   * because the peak takes the louder channel of each frame.
   */
  #observeMeter(left: Float32Array, right: Float32Array | undefined, frameCount: number): void {
    for (let index = 0; index < frameCount; index += 1) {
      const leftMagnitude = Math.abs(left[index] ?? 0);
      const magnitude =
        right === undefined
          ? leftMagnitude
          : Math.max(leftMagnitude, Math.abs(right[index] ?? 0));
      if (magnitude > this.#meterPeak) this.#meterPeak = magnitude;
    }
    this.#meterFrames += frameCount;
    if (this.#meterFrames < sampleRate * METER_INTERVAL_SECONDS) return;
    const peak = this.#meterPeak;
    this.#meterFrames = 0;
    this.#meterPeak = 0;
    this.#post("meter-frame", { level: peak });
  }
}

function decodeEvent(value: unknown): VoiceEvent | undefined {
  if (!isPlainRecord(value)) return undefined;
  const scheduled = value as unknown as ScheduledEventPayload;
  const data = scheduled.data;
  if (
    !isPlainRecord(data) ||
    (data.type !== "note-on" && data.type !== "note-off" && data.type !== "reset")
  ) {
    return undefined;
  }
  if (data.note !== undefined && (typeof data.note !== "number" || !Number.isFinite(data.note))) {
    return undefined;
  }
  if (
    data.velocity !== undefined &&
    (typeof data.velocity !== "number" || !Number.isFinite(data.velocity))
  ) {
    return undefined;
  }
  if (data.accent !== undefined && typeof data.accent !== "boolean") return undefined;
  if (data.slide !== undefined && typeof data.slide !== "boolean") return undefined;
  return {
    atFrame: scheduled.audioFrame,
    type: data.type,
    ...(data.note === undefined ? {} : { note: data.note }),
    ...(data.velocity === undefined ? {} : { velocity: data.velocity }),
    ...(data.accent === undefined ? {} : { accent: data.accent }),
    ...(data.slide === undefined ? {} : { slide: data.slide }),
  };
}
