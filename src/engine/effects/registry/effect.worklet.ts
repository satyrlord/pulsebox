import type {} from "../../worklets/audio-worklet-globals";

import type { StateRevision } from "../../../contracts/ids";
import type { ParameterValue } from "../../../contracts/parameters";
import {
  ENGINE_PROTOCOL_VERSION,
  isEngineParameterId,
  isEngineParameterValue,
  isRealtimeSafeControllerEnvelope,
  type AcknowledgementPayload,
  type ControllerToProcessorKind,
  type EngineFaultPayload,
  type EngineMessageEnvelope,
  type ProcessorToControllerKind,
} from "../../../contracts/worklet-protocol";
import { isPlainRecord } from "../../../contracts/validation";
import type { EffectFrameProcessor, StereoFrame } from "../dsp";
import { EffectParameterQueue } from "./parameter-queue";
import { EffectParameterSmoother, effectParameterSmoothing } from "./parameter-smoother";
import { createRegisteredEffectProcessor } from "./effect-processors.worklet";

type MutableState = Record<string, ParameterValue>;
interface EffectConfiguration { readonly pluginId: string; readonly state: MutableState; }

class PulseboxEffectProcessor extends AudioWorkletProcessor {
  readonly #scheduled = new EffectParameterQueue();
  readonly #rendered: StereoFrame = { left: 0, right: 0 };
  #processor: EffectFrameProcessor | undefined;
  #smoother: EffectParameterSmoother | undefined;
  #sessionId: string | undefined;
  #nodeId: string | undefined;
  #projectRevision: StateRevision | undefined;
  #expectedControllerSequence = 0;
  #nextProcessorSequence = 0;
  #lastAcknowledgement: EngineMessageEnvelope<"ack", AcknowledgementPayload> | undefined;
  #meterFrames = 0;
  #terminated = false;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<unknown>) => this.#receive(event.data);
  }

  #receive(value: unknown): void {
    if (this.#terminated) return;
    if (!isRealtimeSafeControllerEnvelope(value)) {
      this.#fault("malformed-controller-message", "The effect processor received an invalid protocol message.", "Replace this effect processor from its last acknowledged state.", value);
      return;
    }
    if (this.#sessionId === undefined) {
      if (value.kind !== "hello" || value.sequence !== 0 || value.projectRevision === undefined) {
        this.#fault("message-before-ready", "The effect processor received control data before a valid hello message.", "Replace this effect processor and start a new protocol session.", value);
        return;
      }
      const configuration = decodeConfiguration(value.payload);
      if (configuration === undefined || !this.#replace(configuration)) {
        this.#fault("unknown-effect-plugin", "The effect processor rejected an unknown effect or invalid initial state.", "Remove the unknown effect and rebuild this chain from the registry.", value);
        return;
      }
      this.#sessionId = value.sessionId;
      this.#nodeId = value.nodeId;
      this.#projectRevision = value.projectRevision;
      this.#expectedControllerSequence = 1;
      this.#post("ready", { acceptedProtocolVersion: ENGINE_PROTOCOL_VERSION });
      this.#acknowledge("applied");
      return;
    }
    if (value.sessionId !== this.#sessionId || value.nodeId !== this.#nodeId) {
      this.#fault("invalid-controller-session", "The effect processor received a message for another protocol session.", "Replace this effect processor and reconnect only its owning controller.", value);
      return;
    }
    if (value.sequence < this.#expectedControllerSequence) {
      if (this.#lastAcknowledgement !== undefined) this.port.postMessage(this.#lastAcknowledgement);
      return;
    }
    if (value.sequence > this.#expectedControllerSequence) {
      this.#fault("controller-sequence-gap", `The effect processor expected message ${this.#expectedControllerSequence.toString()}.`, "Replace this effect processor from its last acknowledged state.", value);
      return;
    }
    this.#expectedControllerSequence += 1;
    if (value.projectRevision !== undefined && this.#isStale(value.projectRevision)) {
      this.#acknowledge("stale");
      return;
    }
    if (value.projectRevision !== undefined) this.#projectRevision = value.projectRevision;
    if (!this.#apply(value.kind, value.payload)) return;
    this.#acknowledge("applied");
    if (value.kind === "dispose") {
      this.#post("disposed", {});
      this.#terminated = true;
      this.port.close();
    }
  }

  #isStale(revision: StateRevision): boolean {
    const current = this.#projectRevision;
    return current !== undefined && (revision.epoch !== current.epoch || revision.counter < current.counter);
  }

  #apply(kind: ControllerToProcessorKind, payload: Readonly<Record<string, unknown>>): boolean {
    if (kind === "parameter-batch") {
      if (!Array.isArray(payload.changes)) return this.#payloadFault(kind);
      for (const change of payload.changes) {
        if (!isScheduledChange(change)) return this.#payloadFault(kind);
        if (!this.#scheduled.enqueue(change.audioFrame, change.parameterId, change.value)) {
          this.#fault("effect-parameter-queue-overflow", "The effect parameter queue reached its fixed capacity.", "Replace this effect processor from its last acknowledged state.", undefined);
          return false;
        }
      }
      return true;
    }
    if (kind === "clear-scheduled-events") {
      const fromFrame = payload.fromFrame;
      if (typeof fromFrame !== "number" || !Number.isSafeInteger(fromFrame) || fromFrame < 0) return this.#payloadFault(kind);
      this.#scheduled.clearFrom(fromFrame);
      return true;
    }
    if (kind === "state-snapshot" || kind === "configure") {
      const configuration = decodeConfiguration(payload);
      if (configuration === undefined || !this.#replace(configuration)) return this.#payloadFault(kind);
      return true;
    }
    if (kind === "reset") {
      this.#processor?.reset();
      this.#scheduled.reset();
      return true;
    }
    if (kind === "dispose") {
      this.#scheduled.reset();
      this.#processor?.reset();
      return true;
    }
    if (kind === "hello") {
      this.#fault("unexpected-hello", "The effect processor received a second hello message.", "Replace this effect processor and start a new protocol session.", undefined);
      return false;
    }
    return true;
  }

  #payloadFault(kind: ControllerToProcessorKind): false {
    this.#fault("invalid-effect-payload", `The effect processor rejected the ${kind} payload.`, "Replace this effect processor from its last acknowledged state.", undefined);
    return false;
  }

  #replace(configuration: EffectConfiguration): boolean {
    const processor = createRegisteredEffectProcessor(
      configuration.pluginId,
      sampleRate,
      configuration.state,
    );
    if (processor === undefined) return false;
    this.#processor = processor;
    this.#smoother = new EffectParameterSmoother(sampleRate, configuration.state, effectParameterSmoothing(configuration.pluginId));
    this.#scheduled.reset();
    return true;
  }

  #acknowledge(disposition: AcknowledgementPayload["disposition"]): void {
    const revision = this.#projectRevision;
    if (revision === undefined) return;
    const message = this.#envelope("ack", { highestContiguousSequence: this.#expectedControllerSequence - 1, projectRevision: revision, disposition });
    this.#nextProcessorSequence += 1;
    this.#lastAcknowledgement = message;
    this.port.postMessage(message);
  }

  #post(kind: Exclude<ProcessorToControllerKind, "ack">, payload: Readonly<Record<string, unknown>>): void {
    this.port.postMessage(this.#envelope(kind, payload));
    this.#nextProcessorSequence += 1;
  }

  #envelope<TKind extends ProcessorToControllerKind, TPayload>(kind: TKind, payload: TPayload): EngineMessageEnvelope<TKind, TPayload> {
    return { protocolVersion: ENGINE_PROTOCOL_VERSION, sessionId: this.#sessionId ?? "unknown-session", nodeId: this.#nodeId ?? "unknown-node", sequence: this.#nextProcessorSequence, kind, ...(this.#projectRevision === undefined ? {} : { projectRevision: this.#projectRevision }), payload };
  }

  #fault(code: string, message: string, recoveryAction: string, source: unknown): void {
    if (this.#terminated) return;
    if (isPlainRecord(source)) {
      if (typeof source.sessionId === "string" && source.sessionId.length > 0) this.#sessionId = source.sessionId;
      if (typeof source.nodeId === "string" && source.nodeId.length > 0) this.#nodeId = source.nodeId;
    }
    const payload: EngineFaultPayload = { code, message, recoveryAction };
    this.#post("fault", { ...payload });
    this.#terminated = true;
    this.port.close();
  }

  override readonly process = (inputs: readonly (readonly Float32Array[])[], outputs: readonly (readonly Float32Array[])[]): boolean => {
    const output = outputs[0];
    const outLeft = output?.[0];
    if (this.#terminated || outLeft === undefined) return !this.#terminated;
    const outRight = output?.[1];
    const input = inputs[0];
    const inLeft = input?.[0];
    const inRight = input?.[1] ?? inLeft;
    for (let offset = 0; offset < outLeft.length; offset += 1) {
      const frame = currentFrame + offset;
      this.#smoother?.advance(frame);
      while (this.#scheduled.firstFrame <= frame) {
        const parameterId = this.#scheduled.firstParameterId;
        const value = this.#scheduled.firstValue;
        if (parameterId !== undefined && value !== undefined) this.#smoother?.apply(parameterId, value, frame);
        this.#scheduled.removeFirst();
      }
      const left = inLeft?.[offset] ?? 0;
      const right = inRight?.[offset] ?? left;
      if (this.#processor === undefined) {
        this.#rendered.left = left;
        this.#rendered.right = right;
      } else this.#processor.process(left, right, this.#rendered);
      outLeft[offset] = this.#rendered.left;
      if (outRight !== undefined) outRight[offset] = this.#rendered.right;
    }
    this.#meterFrames += outLeft.length;
    if (this.#meterFrames >= Math.max(1, Math.floor(sampleRate / 30))) {
      this.#meterFrames = 0;
      const reduction = this.#processor?.gainReductionDecibels;
      if (typeof reduction === "number" && Number.isFinite(reduction)) this.#post("meter-frame", { values: { "gain-reduction": Math.max(0, reduction) } });
    }
    return true;
  };
}

function decodeConfiguration(value: unknown): EffectConfiguration | undefined {
  if (!isPlainRecord(value) || typeof value.pluginId !== "string" || !isPlainRecord(value.state)) return undefined;
  const state: MutableState = {};
  for (const [parameterId, entry] of Object.entries(value.state)) {
    if (!isEngineParameterId(parameterId) || !isEngineParameterValue(entry)) return undefined;
    state[parameterId] = entry;
  }
  return { pluginId: value.pluginId, state };
}

function isScheduledChange(value: unknown): value is { readonly audioFrame: number; readonly parameterId: string; readonly value: ParameterValue } {
  if (!isPlainRecord(value) || !Number.isSafeInteger(value.audioFrame) || (value.audioFrame as number) < 0) return false;
  return isEngineParameterId(value.parameterId) && isEngineParameterValue(value.value);
}

registerProcessor("pulsebox-effect", PulseboxEffectProcessor);
