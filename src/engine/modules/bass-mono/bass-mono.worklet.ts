import type {} from "../../worklets/audio-worklet-globals";

import type { StateRevision } from "../../../contracts/ids";
import {
  ENGINE_PROTOCOL_VERSION,
  isControllerToProcessorKind,
  validateEngineMessageEnvelope,
  type AcknowledgementPayload,
  type ControllerToProcessorKind,
  type EngineFaultPayload,
  type EngineMessageEnvelope,
  type ProcessorToControllerKind,
  type ScheduledEventPayload,
} from "../../../contracts/worklet-protocol";
import { isPlainRecord } from "../../../contracts/validation";
import { AcidBassDsp, type BassParameters } from "./dsp-core";

interface BassEvent {
  readonly atFrame: number;
  readonly type: "note-on" | "note-off" | "reset";
  readonly note?: number;
  readonly velocity?: number;
  readonly accent?: boolean;
  readonly slide?: boolean;
}

const EVENT_CAPACITY = 256;
const UNKNOWN_SESSION_ID = "unknown-session";
const UNKNOWN_NODE_ID = "unknown-node";

export class AcidBassProcessor extends AudioWorkletProcessor {
  readonly #dsp = new AcidBassDsp(sampleRate);
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

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      this.#receive(event.data);
    };
  }

  #receive(value: unknown): void {
    if (this.#terminated) return;
    const validated = validateEngineMessageEnvelope(value);
    if (!validated.ok) {
      const detail = validated.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join(" ");
      this.#fault(
        "malformed-controller-message",
        `The Acid Bass processor received an invalid message. ${detail}`,
        "Replace this processor and restore it from the latest acknowledged snapshot.",
        value,
      );
      return;
    }
    const message = validated.value;
    if (!isControllerToProcessorKind(message.kind)) {
      this.#fault(
        "invalid-message-direction",
        "The Acid Bass processor received a processor-only message kind.",
        "Replace this processor and verify controller message routing.",
        message,
      );
      return;
    }

    if (this.#sessionId === undefined || this.#nodeId === undefined) {
      this.#beginSession(message);
      return;
    }
    if (
      message.sessionId !== this.#sessionId ||
      message.nodeId !== this.#nodeId
    ) {
      this.#fault(
        "session-mismatch",
        "The Acid Bass processor received a message for another session or node.",
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

    const revisionDisposition = this.#revisionDisposition(
      message.projectRevision,
      message.kind,
    );
    if (revisionDisposition === "invalid") {
      this.#fault(
        "missing-project-revision",
        "The Acid Bass processor received control data without a complete project revision.",
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
        "The Acid Bass processor requires hello message zero before other control data.",
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

  #apply(
    kind: ControllerToProcessorKind,
    payload: Readonly<Record<string, unknown>>,
  ): boolean {
    switch (kind) {
      case "configure":
        return true;
      case "state-snapshot": {
        if (payload.parameters === undefined) return true;
        const parameters = decodeParameterObject(payload.parameters);
        if (parameters === undefined) return this.#pluginPayloadFault(kind);
        this.#dsp.setParameters(parameters, "immediate");
        return true;
      }
      case "parameter-batch": {
        const parameters = decodeParameterChanges(payload.changes);
        if (parameters === undefined) return this.#pluginPayloadFault(kind);
        this.#dsp.setParameters(parameters);
        return true;
      }
      case "event-batch": {
        if (!Array.isArray(payload.events)) return this.#pluginPayloadFault(kind);
        if (payload.events.length > EVENT_CAPACITY - this.#eventCount) {
          this.#fault(
            "event-queue-overflow",
            "The Acid Bass event queue reached its declared capacity.",
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
        if (payload.command === "stop") this.#silence();
        return true;
      case "reset":
        this.#dsp.reset();
        this.#eventCount = 0;
        return true;
      case "clear-scheduled-events":
        this.#eventCount = 0;
        return true;
      case "all-notes-off":
        this.#silence();
        return true;
      case "suspend":
        this.#silence();
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
        this.#fault(
          "unsupported-sample-message",
          "Acid Bass does not accept sample transfer messages.",
          "Replace this processor and route samples only to sample-capable plugins.",
          undefined,
        );
        return false;
      case "hello":
        this.#fault(
          "unexpected-hello",
          "The Acid Bass processor received a second hello message.",
          "Replace this processor and start a new protocol session.",
          undefined,
        );
        return false;
    }
  }

  #pluginPayloadFault(kind: ControllerToProcessorKind): false {
    this.#fault(
      "invalid-plugin-payload",
      `The Acid Bass processor rejected the ${kind} payload.`,
      "Replace this processor and rebuild the message from the Acid Bass registry codec.",
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
      ...(this.#projectRevision === undefined
        ? {}
        : { projectRevision: this.#projectRevision }),
      payload,
    };
  }

  #fault(
    code: string,
    message: string,
    recoveryAction: string,
    source: unknown,
  ): void {
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
    this.#dsp.noteOff();
    this.#eventCount = 0;
  }

  #enqueue(event: BassEvent): void {
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
    while (
      this.#eventCount > 0 &&
      (this.#frames[0] ?? Number.POSITIVE_INFINITY) <= frame
    ) {
      const flags = this.#flags[0] ?? 0;
      if ((flags & 2) !== 0) this.#dsp.reset();
      else if ((flags & 1) !== 0) this.#dsp.noteOff();
      else {
        this.#dsp.noteOn(
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

  override process(
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
      const nextOffset = Math.min(
        frameCount,
        Math.max(offset + 1, nextEventFrame - currentFrame),
      );
      this.#dsp.process(left, right, offset, nextOffset);
      offset = nextOffset;
    }
    return true;
  }
}

function decodeParameterChanges(value: unknown): Partial<BassParameters> | undefined {
  if (!Array.isArray(value)) return undefined;
  const parameters: Partial<BassParameters> = {};
  for (const change of value) {
    if (
      !isPlainRecord(change) ||
      typeof change.parameterId !== "string" ||
      !setParameter(parameters, change.parameterId, change.value)
    ) {
      return undefined;
    }
  }
  return parameters;
}

function decodeParameterObject(value: unknown): Partial<BassParameters> | undefined {
  if (!isPlainRecord(value)) return undefined;
  const parameters: Partial<BassParameters> = {};
  for (const [parameterId, parameterValue] of Object.entries(value)) {
    if (!setParameter(parameters, parameterId, parameterValue)) return undefined;
  }
  return parameters;
}

function setParameter(
  target: Partial<BassParameters>,
  parameterId: string,
  value: unknown,
): boolean {
  if (parameterId === "waveform") {
    if (value !== "saw" && value !== "square") return false;
    (target as { waveform?: BassParameters["waveform"] }).waveform = value;
    return true;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  switch (parameterId) {
    case "tune":
    case "cutoff":
    case "resonance":
    case "envelopeAmount":
    case "decay":
    case "accentAmount":
    case "glide":
    case "volume":
      (target as Record<string, number>)[parameterId] = value;
      return true;
    default:
      return false;
  }
}

function decodeEvent(value: unknown): BassEvent | undefined {
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

registerProcessor("pulsebox-bass-mono", AcidBassProcessor);
