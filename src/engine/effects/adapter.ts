import type { StateRevision } from "../../contracts/ids";
import type { ParameterValue, PluginId } from "../../contracts/parameters";
import {
  ENGINE_PROTOCOL_LIMITS,
  ENGINE_PROTOCOL_VERSION,
  isProcessorToControllerKind,
  isRealtimeSafeControllerEnvelope,
  validateEngineMessageEnvelope,
  type AcknowledgementPayload,
  type ControllerToProcessorKind,
  type EngineFaultPayload,
  type EngineMessageEnvelope,
} from "../../contracts/worklet-protocol";
import { registeredEffect } from "./registry";
import workletUrl from "./registry/effect.worklet.ts?worker&url";

interface EffectWorkletStatus {
  readonly state: "degraded" | "recovered" | "faulted";
  readonly code: string;
  readonly message: string;
  readonly recoveryAction: string;
}

interface EffectWorkletConfiguration {
  readonly pluginId: PluginId;
  readonly state: Readonly<Record<string, ParameterValue>>;
  readonly onStatus?: (status: EffectWorkletStatus) => void;
}

interface EffectWorkletPort {
  readonly input: AudioNode;
  readonly output: AudioNode;
  scheduleParameter(atFrame: number, parameterId: string, value: ParameterValue): boolean;
  clearScheduledParameters(fromFrame: number): void;
  getMeter(meterId: string): number;
  dispose(): void;
}

interface ScheduledEffectParameterChange {
  readonly audioFrame: number;
  readonly parameterId: string;
  readonly value: ParameterValue;
}

interface PendingControl {
  readonly envelope: EngineMessageEnvelope;
  readonly changes?: readonly ScheduledEffectParameterChange[];
  readonly clearFrom?: number;
}

interface Handshake {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  ready: boolean;
}

const RUNTIME_REVISION_EPOCH = "00000000-0000-4000-8000-000000000001";
const HANDSHAKE_TIMEOUT_MILLISECONDS = 2_000;
const RECOVERY_RAMP_SECONDS = 0.008;
let runtimeId = 0;
const preparations = new WeakMap<BaseAudioContext, Promise<void>>();

function prepareEffectWorklet(context: AudioContext): Promise<void> {
  const existing = preparations.get(context);
  if (existing !== undefined) return existing;
  const preparation = context.audioWorklet.addModule(workletUrl);
  preparations.set(context, preparation);
  return preparation;
}

export async function createEffectWorkletPort(
  context: AudioContext,
  configuration: EffectWorkletConfiguration,
): Promise<EffectWorkletPort> {
  if (registeredEffect(configuration.pluginId) === undefined) {
    throw new Error(`The effect registry does not contain ${configuration.pluginId}.`);
  }
  await prepareEffectWorklet(context);
  const controller = new EffectWorkletController(context, configuration);
  await controller.prepare();
  return controller;
}

class EffectWorkletController implements EffectWorkletPort {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #context: AudioContext;
  readonly #pluginId: PluginId;
  readonly #nodeId: string;
  readonly #dry: GainNode;
  readonly #wet: GainNode;
  readonly #onStatus: (status: EffectWorkletStatus) => void;
  readonly #pending = new Map<number, PendingControl>();
  readonly #meters = new Map<string, number>();
  readonly #futureAcknowledged = new Map<string, ScheduledEffectParameterChange>();
  #acknowledgedState: Record<string, ParameterValue>;
  #node: AudioWorkletNode | undefined;
  #sessionId = "";
  #nextSequence = 0;
  #expectedProcessorSequence = 0;
  #revisionCounter = 0;
  #handshake: Handshake | undefined;
  #disposed = false;
  #recoveryAttempted = false;

  constructor(context: AudioContext, configuration: EffectWorkletConfiguration) {
    this.#context = context;
    this.#pluginId = configuration.pluginId;
    this.#nodeId = nextRuntimeId("effect-node");
    this.#acknowledgedState = { ...configuration.state };
    this.#onStatus = configuration.onStatus ?? (() => undefined);
    this.input = context.createGain();
    this.output = context.createGain();
    this.#dry = context.createGain();
    this.#wet = context.createGain();
    this.input.connect(this.#dry);
    this.#dry.connect(this.output);
    this.#wet.connect(this.output);
    this.#dry.gain.value = 1;
    this.#wet.gain.value = 0;
  }

  async prepare(): Promise<void> {
    await this.#openSession(false);
  }

  scheduleParameter(atFrame: number, parameterId: string, value: ParameterValue): boolean {
    if (this.#disposed || !validChange({ audioFrame: atFrame, parameterId, value })) {
      if (!this.#disposed) this.#degrade("invalid-effect-parameter", "The effect parameter update was invalid.");
      return false;
    }
    if (this.#pending.size >= ENGINE_PROTOCOL_LIMITS.backpressureEnvelopeCount) {
      this.#degrade("effect-control-backpressure", "The effect control queue reached its backpressure limit.");
      return false;
    }
    const changes = [{ audioFrame: atFrame, parameterId, value }];
    return this.#post("parameter-batch", { changes }, changes);
  }

  clearScheduledParameters(fromFrame: number): void {
    if (this.#disposed || !Number.isSafeInteger(fromFrame) || fromFrame < 0) return;
    this.#post("clear-scheduled-events", { fromFrame }, undefined, fromFrame);
  }

  getMeter(meterId: string): number {
    return this.#meters.get(meterId) ?? 0;
  }

  dispose(): void {
    if (this.#disposed) return;
    const handshake = this.#handshake;
    if (handshake !== undefined) {
      clearTimeout(handshake.timer);
      handshake.reject(new Error("The effect processor was disposed during preparation."));
      this.#handshake = undefined;
    }
    this.#post("dispose", {});
    this.#disposed = true;
    this.#releaseNode(this.#node);
    this.#node = undefined;
    this.input.disconnect();
    this.output.disconnect();
    this.#dry.disconnect();
    this.#wet.disconnect();
    this.#pending.clear();
    this.#futureAcknowledged.clear();
  }

  async #openSession(recovery: boolean): Promise<void> {
    if (this.#disposed) return;
    this.#sessionId = nextRuntimeId("effect-session");
    this.#nextSequence = 0;
    this.#expectedProcessorSequence = 0;
    this.#pending.clear();
    const node = new AudioWorkletNode(this.#context, "pulsebox-effect", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      outputChannelCount: [2],
    });
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (this.#node === node) this.#receive(event.data);
    };
    node.addEventListener("processorerror", () => {
      if (this.#node === node) this.#degrade("effect-processor-error", "The effect processor stopped unexpectedly.");
    });
    this.#node = node;
    this.input.connect(node);
    node.connect(this.#wet);

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.#node === node) this.#degrade("effect-handshake-timeout", "The effect processor did not complete its handshake.");
        reject(new Error("The effect processor did not complete its handshake."));
      }, HANDSHAKE_TIMEOUT_MILLISECONDS);
      this.#handshake = { resolve, reject, timer, ready: false };
    });
    this.#post("hello", { pluginId: this.#pluginId, state: this.#acknowledgedState });
    await ready;
    if (this.#node !== node) return;
    const now = this.#context.currentTime;
    ramp(this.#dry.gain, 0, now, RECOVERY_RAMP_SECONDS);
    ramp(this.#wet.gain, 1, now, RECOVERY_RAMP_SECONDS);
    if (recovery) {
      const currentFrame = Math.ceil(now * this.#context.sampleRate);
      const changes = [...this.#futureAcknowledged.values()].filter((change) => change.audioFrame >= currentFrame);
      for (let offset = 0; offset < changes.length; offset += ENGINE_PROTOCOL_LIMITS.maximumParameterChangesPerBatch) {
        const batch = changes.slice(offset, offset + ENGINE_PROTOCOL_LIMITS.maximumParameterChangesPerBatch);
        this.#post("parameter-batch", { changes: batch }, batch);
      }
      this.#onStatus({ state: "recovered", code: "effect-processor-recovered", message: "The effect processor recovered from its last acknowledged state.", recoveryAction: "No action is required." });
    }
  }

  #post(
    kind: ControllerToProcessorKind,
    payload: Readonly<Record<string, unknown>>,
    changes?: readonly ScheduledEffectParameterChange[],
    clearFrom?: number,
  ): boolean {
    const node = this.#node;
    if (node === undefined || this.#disposed) return false;
    if (this.#pending.size >= ENGINE_PROTOCOL_LIMITS.maximumUnacknowledgedEnvelopes) {
      this.#degrade("effect-control-overflow", "The effect control queue exceeded its fixed limit.");
      return false;
    }
    const sequence = this.#nextSequence;
    const envelope: EngineMessageEnvelope = {
      protocolVersion: ENGINE_PROTOCOL_VERSION,
      sessionId: this.#sessionId,
      nodeId: this.#nodeId,
      sequence,
      kind,
      projectRevision: this.#nextRevision(),
      payload,
    };
    if (!isRealtimeSafeControllerEnvelope(envelope)) {
      this.#degrade("effect-control-malformed", "The effect controller rejected its own outbound message.");
      return false;
    }
    this.#nextSequence += 1;
    this.#pending.set(sequence, {
      envelope,
      ...(changes === undefined ? {} : { changes }),
      ...(clearFrom === undefined ? {} : { clearFrom }),
    });
    node.port.postMessage(envelope);
    return true;
  }

  #nextRevision(): StateRevision {
    const revision = { epoch: RUNTIME_REVISION_EPOCH, counter: this.#revisionCounter } as StateRevision;
    this.#revisionCounter += 1;
    return revision;
  }

  #receive(value: unknown): void {
    if (this.#disposed) return;
    const validated = validateEngineMessageEnvelope(value);
    if (!validated.ok) {
      this.#degrade("malformed-effect-response", "The effect processor sent an invalid protocol message.");
      return;
    }
    const message = validated.value;
    if (!isProcessorToControllerKind(message.kind) || message.sessionId !== this.#sessionId || message.nodeId !== this.#nodeId) {
      this.#degrade("invalid-effect-session", "The effect processor replied on the wrong protocol session.");
      return;
    }
    if (message.sequence < this.#expectedProcessorSequence) return;
    if (message.sequence > this.#expectedProcessorSequence) {
      this.#degrade("effect-response-gap", "The effect processor skipped a protocol response.");
      return;
    }
    this.#expectedProcessorSequence += 1;
    if (message.kind === "ready") {
      if (this.#handshake !== undefined) this.#handshake.ready = true;
      return;
    }
    if (message.kind === "ack") {
      this.#acknowledge(message.payload as unknown as AcknowledgementPayload);
      return;
    }
    if (message.kind === "meter-frame") {
      const values = (message.payload as { readonly values?: unknown }).values;
      if (typeof values === "object" && values !== null) {
        for (const [meterId, reading] of Object.entries(values)) if (typeof reading === "number" && Number.isFinite(reading)) this.#meters.set(meterId, reading);
      }
      return;
    }
    if (message.kind === "fault") {
      const fault = message.payload as unknown as EngineFaultPayload;
      this.#degrade(fault.code, fault.message, fault.recoveryAction);
    }
  }

  #acknowledge(payload: AcknowledgementPayload): void {
    for (const [sequence, pending] of this.#pending) {
      if (sequence > payload.highestContiguousSequence) continue;
      this.#pending.delete(sequence);
      if (payload.disposition !== "applied") continue;
      if (pending.clearFrom !== undefined) {
        for (const [key, change] of this.#futureAcknowledged) {
          if (change.audioFrame >= pending.clearFrom) this.#futureAcknowledged.delete(key);
        }
      }
      if (pending.changes === undefined) continue;
      const currentFrame = Math.ceil(this.#context.currentTime * this.#context.sampleRate);
      for (const change of pending.changes) {
        if (change.audioFrame <= currentFrame) this.#acknowledgedState[change.parameterId] = change.value;
        else this.#futureAcknowledged.set(changeKey(change), change);
      }
    }
    const handshake = this.#handshake;
    if (handshake?.ready === true && payload.highestContiguousSequence >= 0) {
      clearTimeout(handshake.timer);
      this.#handshake = undefined;
      handshake.resolve();
    }
  }

  #degrade(code: string, message: string, recoveryAction = "Pulsebox will bypass this effect and try one replacement."): void {
    if (this.#disposed) return;
    this.#onStatus({ state: this.#recoveryAttempted ? "faulted" : "degraded", code, message, recoveryAction });
    const now = this.#context.currentTime;
    const currentFrame = Math.ceil(now * this.#context.sampleRate);
    for (const [key, change] of this.#futureAcknowledged) {
      if (change.audioFrame > currentFrame) continue;
      this.#acknowledgedState[change.parameterId] = change.value;
      this.#futureAcknowledged.delete(key);
    }
    ramp(this.#wet.gain, 0, now, RECOVERY_RAMP_SECONDS);
    ramp(this.#dry.gain, 1, now, RECOVERY_RAMP_SECONDS);
    const failed = this.#node;
    this.#node = undefined;
    this.#releaseNode(failed);
    const handshake = this.#handshake;
    if (handshake !== undefined) {
      clearTimeout(handshake.timer);
      this.#handshake = undefined;
      handshake.reject(new Error(`${message} ${recoveryAction}`));
    }
    if (this.#recoveryAttempted) return;
    this.#recoveryAttempted = true;
    void this.#openSession(true).catch((error: unknown) => {
      if (!this.#disposed) this.#onStatus({ state: "faulted", code: "effect-recovery-failed", message: error instanceof Error ? error.message : "The effect processor recovery failed.", recoveryAction: "Keep this effect bypassed and reload the audio engine." });
    });
  }

  #releaseNode(node: AudioWorkletNode | undefined): void {
    if (node === undefined) return;
    node.port.onmessage = null;
    node.port.close();
    node.disconnect();
  }
}

function nextRuntimeId(prefix: string): string {
  runtimeId += 1;
  return `${prefix}-${runtimeId.toString(36)}`;
}

function validChange(change: ScheduledEffectParameterChange): boolean {
  return Number.isSafeInteger(change.audioFrame) && change.audioFrame >= 0 && change.parameterId.length > 0 && change.parameterId.length <= 64 && ((typeof change.value === "number" && Number.isFinite(change.value)) || typeof change.value === "boolean" || (typeof change.value === "string" && change.value.length <= 256));
}

function changeKey(change: ScheduledEffectParameterChange): string {
  return `${change.audioFrame.toString()}\u0000${change.parameterId}`;
}

function ramp(parameter: AudioParam, value: number, time: number, duration: number): void {
  parameter.cancelScheduledValues(time);
  parameter.setValueAtTime(parameter.value, time);
  parameter.linearRampToValueAtTime(value, time + duration);
}
