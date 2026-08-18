import type { EffectInstanceId, ModuleInstanceId, SendBusId } from "../../contracts/ids";
import { SEND_BUS_IDS } from "../../contracts/ids";
import type { ParameterValue } from "../../contracts/parameters";
import { EFFECT_TRANSPORT_TEMPO_PARAMETER } from "../effects/dsp";
import {
  EffectChainNode,
  type EffectChainNodeFactory,
  type RoutingEffectInstance,
} from "./effect-chain-node";

export interface ChannelSendProjection {
  readonly busId: SendBusId;
  readonly amount: number;
}

export interface ChannelRoutingProjection {
  readonly level: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly sends: readonly ChannelSendProjection[];
  readonly effects: readonly RoutingEffectInstance[];
  readonly effectsBypassed: boolean;
}

export interface SendRoutingProjection {
  readonly busId: SendBusId;
  readonly returnLevel: number;
  readonly effects: readonly RoutingEffectInstance[];
  readonly effectsBypassed: boolean;
}

export interface MasterRoutingProjection {
  readonly level: number;
  readonly effects: readonly RoutingEffectInstance[];
  readonly effectsBypassed: boolean;
  readonly limiterBypassed: boolean;
  readonly limiterState?: Readonly<Record<string, unknown>>;
  readonly limiterEffectId?: EffectInstanceId;
  readonly limiterMix?: number;
  readonly limiterGainDecibels?: number;
}

export interface RoutingMeterFrame {
  readonly left: number;
  readonly right: number;
  readonly mid: number;
  readonly side: number;
  readonly peak: boolean;
}

interface ChannelNodes {
  readonly input: GainNode;
  readonly gate: GainNode;
  readonly fader: GainNode;
  readonly panner: StereoPannerNode;
  readonly effects: EffectChainNode;
  readonly sends: ReadonlyMap<SendBusId, GainNode>;
  desiredLevel: number;
  desiredMuted: boolean;
  desiredSolo: boolean;
  readonly sendAmounts: Map<SendBusId, number>;
  levelAutomation: ScheduledValue<number>[];
  muteAutomation: ScheduledValue<boolean>[];
  soloAutomation: ScheduledValue<boolean>[];
}

interface ScheduledValue<T> {
  readonly atFrame: number;
  readonly value: T;
}

interface SendNodes {
  readonly input: GainNode;
  readonly effects: EffectChainNode;
  readonly returnGain: GainNode;
}

interface MeterBuffers {
  readonly left: AnalyserNode;
  readonly right: AnalyserNode;
  readonly leftData: Float32Array<ArrayBuffer>;
  readonly rightData: Float32Array<ArrayBuffer>;
}

interface MeterNodes extends MeterBuffers {
  readonly splitter: ChannelSplitterNode;
}

interface LimiterCeilingNodes {
  readonly shaper: WaveShaperNode;
  readonly gain: GainNode;
}

const MIX_RAMP_SECONDS = 0.01;
const EFFECT_PARAMETER_RAMP_SECONDS = 0.008;
const CHAIN_CONTROL_RAMP_SECONDS = 0.004;
const PEAK_DISPLAY_THRESHOLD = 0.98;

export interface RoutingAutomationChange {
  readonly atFrame: number;
  readonly scope: "mixer" | "send" | "send-return" | "effect" | "master";
  readonly targetId: ModuleInstanceId | SendBusId | EffectInstanceId | "master";
  readonly parameterId: string;
  readonly value: ParameterValue;
}

/** Owns the stable live mixer graph, send buses, and master chain. */
export class MixerRoutingGraph {
  readonly #context: AudioContext;
  readonly #effectFactory: EffectChainNodeFactory | undefined;
  readonly #channels = new Map<ModuleInstanceId, ChannelNodes>();
  readonly #sends = new Map<SendBusId, SendNodes>();
  readonly #programInput: GainNode;
  readonly #masterEffects: EffectChainNode;
  readonly #masterGain: GainNode;
  readonly #programLimiter: DynamicsCompressorNode;
  readonly #programCeiling: LimiterCeilingNodes | undefined;
  readonly #limiterDrive: GainNode;
  readonly #limiterDry: GainNode;
  readonly #limiterWet: GainNode;
  readonly #limiterMix: GainNode;
  readonly #limiterOutputGain: GainNode;
  readonly #limiterBypass: GainNode;
  readonly #programOutput: GainNode;
  readonly #output: GainNode;
  readonly #analyserLeft: AnalyserNode;
  readonly #analyserRight: AnalyserNode;
  readonly #analysisLeft: Float32Array<ArrayBuffer>;
  readonly #analysisRight: Float32Array<ArrayBuffer>;
  #preMasterMeter: MeterNodes | undefined;
  #postMasterMeter: MeterNodes | undefined;
  #peakLatched = false;
  #limiterEffectId: EffectInstanceId | undefined;
  #limiterBypassed = false;
  #limiterMixValue = 1;
  #limiterOutputGainDecibels = 0;
  #limiterCeilingDecibels = -1;
  #limiterInputDecibels = 0;
  #limiterReleaseMilliseconds = 80;
  readonly #limiterAutomation = new Map<string, ScheduledValue<ParameterValue>[]>();
  #transportTempo = 120;

  constructor(
    context: AudioContext,
    effectFactory?: EffectChainNodeFactory,
    initialModuleId?: ModuleInstanceId,
  ) {
    this.#context = context;
    this.#effectFactory = effectFactory;
    // Keep the first channel fader as the first gain allocation. Existing
    // engine hosts use this stable seam for direct mixer ramp assertions.
    const initialFader = initialModuleId === undefined ? undefined : context.createGain();
    const initialPanner = initialModuleId === undefined ? undefined : context.createStereoPanner();
    this.#programInput = context.createGain();
    this.#masterEffects = new EffectChainNode(context, effectFactory);
    this.#masterGain = context.createGain();
    this.#programLimiter = createProtectedLimiter(context);
    this.#programCeiling = createLimiterCeiling(context, -1);
    this.#limiterDrive = context.createGain();
    this.#limiterDry = context.createGain();
    this.#limiterWet = context.createGain();
    this.#limiterMix = context.createGain();
    this.#limiterOutputGain = context.createGain();
    this.#limiterBypass = context.createGain();
    this.#programOutput = context.createGain();
    this.#output = context.createGain();

    this.#programInput.connect(this.#masterEffects.input);
    this.#masterEffects.output.connect(this.#masterGain);
    this.#masterGain.connect(this.#limiterDrive);
    this.#limiterDrive.connect(this.#programLimiter);
    this.#masterGain.connect(this.#limiterDry);
    this.#programLimiter.connect(this.#limiterWet);
    this.#masterGain.connect(this.#limiterBypass);
    this.#limiterDry.connect(this.#limiterMix);
    this.#limiterWet.connect(this.#limiterMix);
    this.#limiterMix.connect(this.#limiterOutputGain);
    if (this.#programCeiling === undefined) {
      this.#limiterOutputGain.connect(this.#programOutput);
    } else {
      this.#limiterOutputGain.connect(this.#programCeiling.shaper);
      this.#programCeiling.gain.connect(this.#programOutput);
    }
    this.#limiterBypass.connect(this.#programOutput);
    this.#programOutput.connect(this.#output);
    this.#output.connect(context.destination);

    const splitter = context.createChannelSplitter(2);
    this.#output.connect(splitter);
    this.#analyserLeft = context.createAnalyser();
    this.#analyserRight = context.createAnalyser();
    for (const analyser of [this.#analyserLeft, this.#analyserRight]) {
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
    }
    splitter.connect(this.#analyserLeft, 0);
    splitter.connect(this.#analyserRight, 1);
    this.#analysisLeft = new Float32Array(this.#analyserLeft.fftSize);
    this.#analysisRight = new Float32Array(this.#analyserRight.fftSize);

    this.#programOutput.gain.value = 1;
    this.#limiterDry.gain.value = 0;
    this.#limiterWet.gain.value = 1;
    this.#limiterBypass.gain.value = 0;

    for (const busId of SEND_BUS_IDS) this.#ensureSend(busId);
    if (initialModuleId !== undefined && initialFader !== undefined && initialPanner !== undefined) {
      this.#createChannel(initialModuleId, initialFader, initialPanner);
    }
  }

  ensureChannel(moduleId: ModuleInstanceId): AudioNode {
    return this.#ensureChannel(moduleId).input;
  }

  async setChannel(moduleId: ModuleInstanceId, projection: ChannelRoutingProjection): Promise<void> {
    this.#ensureChannel(moduleId);
    await this.setChannelEffects(
      moduleId,
      projection.effects,
      projection.effectsBypassed,
    );
    this.setChannelMix(moduleId, projection.level, projection.pan, projection.muted);
    for (const busId of SEND_BUS_IDS) {
      const send = projection.sends.find((candidate) => candidate.busId === busId);
      this.setChannelSend(moduleId, busId, send?.amount ?? 0);
    }
  }

  async setChannelEffects(
    moduleId: ModuleInstanceId,
    effects: readonly RoutingEffectInstance[],
    bypassed: boolean,
  ): Promise<void> {
    const chain = this.#ensureChannel(moduleId).effects;
    await chain.replace(this.#withTransportTempo(effects), bypassed);
    chain.setRuntimeParameter(EFFECT_TRANSPORT_TEMPO_PARAMETER, this.#transportTempo);
  }

  setChannelMix(
    moduleId: ModuleInstanceId,
    level: number,
    pan: number,
    muted: boolean,
  ): void {
    const channel = this.#channels.get(moduleId);
    if (channel === undefined) return;
    ramp(channel.fader.gain, clamp01(level), this.#context.currentTime, MIX_RAMP_SECONDS);
    channel.desiredLevel = clamp01(level);
    channel.desiredMuted = muted;
    ramp(channel.panner.pan, clamp(pan, -1, 1), this.#context.currentTime, MIX_RAMP_SECONDS);
    // `applySoloMute` owns the global solo calculation. This direct call keeps
    // a new channel safe until the complete projection arrives.
    ramp(channel.gate.gain, muted ? 0 : 1, this.#context.currentTime, MIX_RAMP_SECONDS);
  }

  applySoloMute(states: ReadonlyMap<ModuleInstanceId, { muted: boolean; solo: boolean }>): void {
    const anySolo = [...states.values()].some((state) => state.solo);
    for (const [moduleId, channel] of this.#channels) {
      const state = states.get(moduleId);
      if (state !== undefined) {
        channel.desiredMuted = state.muted;
        channel.desiredSolo = state.solo;
      }
      const audible = state !== undefined && !state.muted && (!anySolo || state.solo);
      ramp(channel.gate.gain, audible ? 1 : 0, this.#context.currentTime, MIX_RAMP_SECONDS);
      ramp(
        channel.fader.gain,
        audible ? channel.desiredLevel : 0,
        this.#context.currentTime,
        MIX_RAMP_SECONDS,
      );
    }
  }

  previewChannelMix(moduleId: ModuleInstanceId, field: "level" | "pan", value: number): void {
    const channel = this.#channels.get(moduleId);
    if (channel === undefined || !Number.isFinite(value)) return;
    const parameter = field === "level" ? channel.fader.gain : channel.panner.pan;
    ramp(parameter, field === "level" ? clamp01(value) : clamp(value, -1, 1), this.#context.currentTime, MIX_RAMP_SECONDS);
  }

  setChannelSend(moduleId: ModuleInstanceId, busId: SendBusId, amount: number): void {
    const channel = this.#channels.get(moduleId);
    if (channel === undefined) return;
    const value = clamp01(amount);
    channel.sendAmounts.set(busId, value);
    ramp(channel.sends.get(busId)?.gain, value, this.#context.currentTime, MIX_RAMP_SECONDS);
  }

  previewChannelSendAmount(moduleId: ModuleInstanceId, busId: SendBusId, amount: number): void {
    const channel = this.#channels.get(moduleId);
    if (channel === undefined) return;
    ramp(channel.sends.get(busId)?.gain, clamp01(amount), this.#context.currentTime, MIX_RAMP_SECONDS);
  }

  async setSend(projection: SendRoutingProjection): Promise<void> {
    const send = this.#ensureSend(projection.busId);
    await this.setSendEffects(
      projection.busId,
      projection.effects,
      projection.effectsBypassed,
    );
    ramp(send.returnGain.gain, clamp01(projection.returnLevel), this.#context.currentTime, MIX_RAMP_SECONDS);
  }

  async setSendEffects(
    busId: SendBusId,
    effects: readonly RoutingEffectInstance[],
    bypassed: boolean,
  ): Promise<void> {
    const chain = this.#ensureSend(busId).effects;
    await chain.replace(this.#withTransportTempo(effects), bypassed);
    chain.setRuntimeParameter(EFFECT_TRANSPORT_TEMPO_PARAMETER, this.#transportTempo);
  }

  setSendReturnLevel(busId: SendBusId, returnLevel: number): void {
    const send = this.#sends.get(busId);
    if (send === undefined) return;
    ramp(send.returnGain.gain, clamp01(returnLevel), this.#context.currentTime, MIX_RAMP_SECONDS);
  }

  setSendEffectsBypassed(busId: SendBusId, bypassed: boolean): void {
    this.#sends.get(busId)?.effects.setBypassed(bypassed);
  }

  previewSendReturnLevel(busId: SendBusId, returnLevel: number): void {
    const send = this.#sends.get(busId);
    if (send === undefined) return;
    ramp(send.returnGain.gain, clamp01(returnLevel), this.#context.currentTime, MIX_RAMP_SECONDS);
  }

  previewEffectMix(effectId: EffectInstanceId, mix: number): void {
    this.setEffectMix(effectId, mix);
  }

  setEffectMix(effectId: EffectInstanceId, mix: number): void {
    if (effectId === this.#limiterEffectId) {
      this.#limiterMixValue = clamp01(mix);
      this.#applyLimiterMix();
      return;
    }
    this.#masterEffects.previewEffectMix(effectId, mix);
    for (const chain of this.#nonMasterEffectChains()) chain.previewEffectMix(effectId, mix);
  }

  previewEffectGain(effectId: EffectInstanceId, gainDecibels: number): void {
    this.setEffectGain(effectId, gainDecibels);
  }

  setEffectGain(effectId: EffectInstanceId, gainDecibels: number): void {
    if (effectId === this.#limiterEffectId) {
      this.#limiterOutputGainDecibels = clamp(gainDecibels, -24, 24);
      this.#applyLimiterMix();
      return;
    }
    this.#masterEffects.previewEffectGain(effectId, gainDecibels);
    for (const chain of this.#nonMasterEffectChains()) chain.previewEffectGain(effectId, gainDecibels);
  }

  setEffectBypassed(effectId: EffectInstanceId, bypassed: boolean): void {
    if (effectId === this.#limiterEffectId) {
      this.#limiterBypassed = bypassed;
      this.#applyLimiterMix();
      return;
    }
    if (this.#masterEffects.setEffectBypassed(effectId, bypassed)) return;
    for (const chain of this.#nonMasterEffectChains()) {
      if (chain.setEffectBypassed(effectId, bypassed)) return;
    }
  }

  previewEffectParameter(
    effectId: EffectInstanceId,
    parameterId: string,
    value: ParameterValue,
  ): void {
    this.setEffectParameter(effectId, parameterId, value);
  }

  setEffectParameter(
    effectId: EffectInstanceId,
    parameterId: string,
    value: ParameterValue,
  ): void {
    if (effectId === this.#limiterEffectId) {
      this.#setLimiterParameter(parameterId, value);
      return;
    }
    this.#masterEffects.previewEffectParameter(effectId, parameterId, value);
    for (const chain of this.#nonMasterEffectChains()) {
      chain.previewEffectParameter(effectId, parameterId, value);
    }
  }

  async setMaster(projection: MasterRoutingProjection): Promise<void> {
    await this.setMasterEffects(projection);
    ramp(this.#masterGain.gain, clamp01(projection.level), this.#context.currentTime, MIX_RAMP_SECONDS);
  }

  async setMasterEffects(projection: MasterRoutingProjection): Promise<void> {
    await this.#masterEffects.replace(
      this.#withTransportTempo(projection.effects),
      projection.effectsBypassed,
    );
    this.#masterEffects.setRuntimeParameter(
      EFFECT_TRANSPORT_TEMPO_PARAMETER,
      this.#transportTempo,
    );
    this.#limiterEffectId = projection.limiterEffectId;
    this.#limiterAutomation.clear();
    this.#limiterBypassed = projection.limiterBypassed;
    this.#limiterMixValue = clamp01(projection.limiterMix ?? 1);
    this.#limiterOutputGainDecibels = clamp(projection.limiterGainDecibels ?? 0, -24, 24);
    this.#applyLimiterMix();
    const ceiling = finiteNumber(projection.limiterState?.ceiling, -1);
    const input = finiteNumber(projection.limiterState?.input, 0);
    const release = finiteNumber(projection.limiterState?.release, 80);
    this.#limiterCeilingDecibels = clamp(ceiling, -12, 0);
    this.#limiterInputDecibels = clamp(input, 0, 24);
    this.#limiterReleaseMilliseconds = clamp(release, 5, 1_000);
    ramp(
      this.#programLimiter.threshold,
      this.#limiterCeilingDecibels,
      this.#context.currentTime,
      MIX_RAMP_SECONDS,
    );
    ramp(
      this.#programCeiling?.gain.gain,
      decibelGain(this.#limiterCeilingDecibels),
      this.#context.currentTime,
      MIX_RAMP_SECONDS,
    );
    ramp(
      this.#limiterDrive.gain,
      decibelGain(this.#limiterInputDecibels),
      this.#context.currentTime,
      MIX_RAMP_SECONDS,
    );
    ramp(
      this.#programLimiter.release,
      this.#limiterReleaseMilliseconds / 1_000,
      this.#context.currentTime,
      MIX_RAMP_SECONDS,
    );
  }

  setMasterEffectsBypassed(bypassed: boolean): void {
    this.#masterEffects.setBypassed(bypassed);
  }

  setMasterLevel(level: number): void {
    ramp(this.#masterGain.gain, clamp01(level), this.#context.currentTime, MIX_RAMP_SECONDS);
  }

  /** Applies the transport tempo to active effects without rebuilding a chain. */
  setTransportTempo(tempo: number): void {
    this.#transportTempo = clamp(tempo, 40, 240);
    this.#masterEffects.setRuntimeParameter(
      EFFECT_TRANSPORT_TEMPO_PARAMETER,
      this.#transportTempo,
    );
    for (const chain of this.#nonMasterEffectChains()) {
      chain.setRuntimeParameter(EFFECT_TRANSPORT_TEMPO_PARAMETER, this.#transportTempo);
    }
  }

  /** Queues external automation on the AudioContext frame timeline. */
  scheduleAutomation(changes: readonly RoutingAutomationChange[]): void {
    for (const change of [...changes].sort((left, right) => left.atFrame - right.atFrame)) {
      this.#scheduleAutomationChange(change);
    }
  }

  clearAutomation(fromFrame: number): void {
    const time = frameTime(this.#context, fromFrame);
    const cancel = (parameter: AudioParam | undefined) => parameter?.cancelScheduledValues(time);
    for (const channel of this.#channels.values()) {
      cancel(channel.fader.gain);
      cancel(channel.panner.pan);
      cancel(channel.gate.gain);
      for (const send of channel.sends.values()) cancel(send.gain);
      channel.levelAutomation = retainScheduledBefore(channel.levelAutomation, fromFrame);
      channel.muteAutomation = retainScheduledBefore(channel.muteAutomation, fromFrame);
      channel.soloAutomation = retainScheduledBefore(channel.soloAutomation, fromFrame);
      channel.effects.clearAutomation(fromFrame);
    }
    for (const send of this.#sends.values()) {
      cancel(send.returnGain.gain);
      send.effects.clearAutomation(fromFrame);
    }
    cancel(this.#masterGain.gain);
    this.#masterEffects.clearAutomation(fromFrame);
    cancel(this.#limiterDrive.gain);
    cancel(this.#programLimiter.threshold);
    cancel(this.#programLimiter.release);
    cancel(this.#programCeiling?.gain.gain);
    cancel(this.#limiterDry.gain);
    cancel(this.#limiterWet.gain);
    cancel(this.#limiterOutputGain.gain);
    cancel(this.#limiterBypass.gain);
    for (const [parameterId, values] of this.#limiterAutomation) {
      this.#limiterAutomation.set(parameterId, retainScheduledBefore(values, fromFrame));
    }
  }

  #scheduleAutomationChange(change: RoutingAutomationChange): void {
    const time = frameTime(this.#context, change.atFrame);
    if (change.scope === "mixer") {
      const channel = this.#channels.get(change.targetId as ModuleInstanceId);
      if (channel === undefined) return;
      if (change.parameterId === "level" && typeof change.value === "number") {
        const level = clamp01(change.value);
        recordScheduledValue(channel.levelAutomation, change.atFrame, level);
        setAtTime(channel.fader.gain, this.#channelAudibleAt(channel, change.atFrame) ? level : 0, time);
      } else if (change.parameterId === "pan" && typeof change.value === "number") {
        setAtTime(channel.panner.pan, clamp(change.value, -1, 1), time);
      } else if (change.parameterId === "muted" && typeof change.value === "boolean") {
        recordScheduledValue(channel.muteAutomation, change.atFrame, change.value);
        this.#scheduleSoloMute(time, change.atFrame);
      } else if (change.parameterId === "solo" && typeof change.value === "boolean") {
        recordScheduledValue(channel.soloAutomation, change.atFrame, change.value);
        this.#scheduleSoloMute(time, change.atFrame);
      }
      return;
    }
    if (change.scope === "send") {
      const channel = this.#channels.get(change.targetId as ModuleInstanceId);
      const match = /^send-([abcd])-amount$/.exec(change.parameterId);
      if (channel === undefined || match === null) return;
      const busId = `send-${match[1]}` as SendBusId;
      if (typeof change.value !== "number") return;
      const amount = clamp01(change.value);
      setAtTime(channel.sends.get(busId)?.gain, amount, time);
      return;
    }
    if (change.scope === "send-return") {
      const send = this.#sends.get(change.targetId as SendBusId);
      if (change.parameterId === "return-level" && typeof change.value === "number") {
        setAtTime(send?.returnGain.gain, clamp01(change.value), time);
      } else if (change.parameterId === "chain-bypassed" && typeof change.value === "boolean") {
        send?.effects.scheduleBypass(change.atFrame, change.value);
      }
      return;
    }
    if (change.scope === "master") {
      if (change.parameterId === "level" && typeof change.value === "number") {
        setAtTime(this.#masterGain.gain, clamp01(change.value), time);
      } else if (change.parameterId === "effects-bypassed" && typeof change.value === "boolean") {
        this.#masterEffects.scheduleBypass(change.atFrame, change.value);
      }
      return;
    }
    const effectId = change.targetId as EffectInstanceId;
    if (effectId === this.#limiterEffectId) {
      if (change.parameterId === "mix" && typeof change.value === "number") {
        this.#scheduleLimiterMix(change.atFrame, change.value);
      } else if (change.parameterId === "gain" && typeof change.value === "number") {
        this.#scheduleLimiterGain(change.atFrame, change.value);
      } else if (change.parameterId === "bypassed" && typeof change.value === "boolean") {
        this.#scheduleLimiterBypass(change.atFrame, change.value);
      } else {
        this.#scheduleLimiterParameter(change.atFrame, change.parameterId, change.value);
      }
      return;
    }
    const schedule = (chain: EffectChainNode) => {
      if (change.parameterId === "mix" && typeof change.value === "number") {
        chain.scheduleEffectMix(change.atFrame, effectId, change.value);
      } else if (change.parameterId === "gain" && typeof change.value === "number") {
        chain.scheduleEffectGain(change.atFrame, effectId, change.value);
      } else if (change.parameterId === "bypassed" && typeof change.value === "boolean") {
        chain.scheduleEffectBypass(change.atFrame, effectId, change.value);
      } else {
        chain.scheduleEffectParameter(change.atFrame, effectId, change.parameterId, change.value);
      }
    };
    schedule(this.#masterEffects);
    for (const chain of this.#nonMasterEffectChains()) schedule(chain);
  }

  #nonMasterEffectChains(): readonly EffectChainNode[] {
    return [
      ...[...this.#channels.values()].map((channel) => channel.effects),
      ...[...this.#sends.values()].map((send) => send.effects),
    ];
  }

  #applyLimiterMix(): void {
    const gains = routingMixGains(this.#limiterMixValue);
    const now = this.#context.currentTime;
    ramp(
      this.#limiterDry.gain,
      this.#limiterBypassed ? 0 : gains.dry,
      now,
      CHAIN_CONTROL_RAMP_SECONDS,
    );
    ramp(
      this.#limiterWet.gain,
      this.#limiterBypassed ? 0 : gains.wet,
      now,
      CHAIN_CONTROL_RAMP_SECONDS,
    );
    ramp(
      this.#limiterBypass.gain,
      this.#limiterBypassed ? 1 : 0,
      now,
      CHAIN_CONTROL_RAMP_SECONDS,
    );
    ramp(
      this.#limiterOutputGain.gain,
      this.#limiterBypassed ? 1 : decibelGain(this.#limiterOutputGainDecibels),
      now,
      CHAIN_CONTROL_RAMP_SECONDS,
    );
  }

  #setLimiterParameter(parameterId: string, value: ParameterValue): void {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const now = this.#context.currentTime;
    if (parameterId === "ceiling") {
      const ceiling = clamp(value, -12, 0);
      this.#limiterCeilingDecibels = ceiling;
      ramp(
        this.#programLimiter.threshold,
        ceiling,
        now,
        EFFECT_PARAMETER_RAMP_SECONDS,
      );
      ramp(
        this.#programCeiling?.gain.gain,
        decibelGain(ceiling),
        now,
        EFFECT_PARAMETER_RAMP_SECONDS,
      );
    } else if (parameterId === "input") {
      this.#limiterInputDecibels = clamp(value, 0, 24);
      ramp(
        this.#limiterDrive.gain,
        decibelGain(this.#limiterInputDecibels),
        now,
        EFFECT_PARAMETER_RAMP_SECONDS,
      );
    } else if (parameterId === "release") {
      this.#limiterReleaseMilliseconds = clamp(value, 5, 1_000);
      ramp(
        this.#programLimiter.release,
        this.#limiterReleaseMilliseconds / 1_000,
        now,
        EFFECT_PARAMETER_RAMP_SECONDS,
      );
    }
  }

  #scheduleLimiterMix(atFrame: number, mix: number): void {
    const priorMix = scheduledNumberAt(
      this.#limiterAutomation.get("mix"),
      atFrame,
      this.#limiterMixValue,
    );
    const bypassed = scheduledBooleanAt(
      this.#limiterAutomation.get("bypassed"),
      atFrame,
      this.#limiterBypassed,
    );
    const priorGains = routingMixGains(priorMix);
    const nextMix = clamp01(mix);
    const time = frameTime(this.#context, atFrame);
    const gains = routingMixGains(nextMix);
    scheduleRamp(this.#limiterDry.gain, bypassed ? 0 : priorGains.dry, bypassed ? 0 : gains.dry, time, CHAIN_CONTROL_RAMP_SECONDS);
    scheduleRamp(this.#limiterWet.gain, bypassed ? 0 : priorGains.wet, bypassed ? 0 : gains.wet, time, CHAIN_CONTROL_RAMP_SECONDS);
    recordLimiterValue(this.#limiterAutomation, "mix", atFrame, nextMix);
  }

  #scheduleLimiterGain(atFrame: number, gainDecibels: number): void {
    const prior = scheduledNumberAt(
      this.#limiterAutomation.get("gain"),
      atFrame,
      this.#limiterOutputGainDecibels,
    );
    const next = clamp(gainDecibels, -24, 24);
    const bypassed = scheduledBooleanAt(
      this.#limiterAutomation.get("bypassed"),
      atFrame,
      this.#limiterBypassed,
    );
    const time = frameTime(this.#context, atFrame);
    scheduleRamp(
      this.#limiterOutputGain.gain,
      bypassed ? 1 : decibelGain(prior),
      bypassed ? 1 : decibelGain(next),
      time,
      CHAIN_CONTROL_RAMP_SECONDS,
    );
    recordLimiterValue(this.#limiterAutomation, "gain", atFrame, next);
  }

  #scheduleLimiterBypass(atFrame: number, bypassed: boolean): void {
    const priorBypassed = scheduledBooleanAt(
      this.#limiterAutomation.get("bypassed"),
      atFrame,
      this.#limiterBypassed,
    );
    const mix = scheduledNumberAt(
      this.#limiterAutomation.get("mix"),
      atFrame,
      this.#limiterMixValue,
    );
    const gainDecibels = scheduledNumberAt(
      this.#limiterAutomation.get("gain"),
      atFrame,
      this.#limiterOutputGainDecibels,
    );
    const gains = routingMixGains(mix);
    const time = frameTime(this.#context, atFrame);
    scheduleRamp(this.#limiterDry.gain, priorBypassed ? 0 : gains.dry, bypassed ? 0 : gains.dry, time, CHAIN_CONTROL_RAMP_SECONDS);
    scheduleRamp(this.#limiterWet.gain, priorBypassed ? 0 : gains.wet, bypassed ? 0 : gains.wet, time, CHAIN_CONTROL_RAMP_SECONDS);
    scheduleRamp(this.#limiterBypass.gain, priorBypassed ? 1 : 0, bypassed ? 1 : 0, time, CHAIN_CONTROL_RAMP_SECONDS);
    scheduleRamp(this.#limiterOutputGain.gain, priorBypassed ? 1 : decibelGain(gainDecibels), bypassed ? 1 : decibelGain(gainDecibels), time, CHAIN_CONTROL_RAMP_SECONDS);
    recordLimiterValue(this.#limiterAutomation, "bypassed", atFrame, bypassed);
  }

  #scheduleLimiterParameter(
    atFrame: number,
    parameterId: string,
    value: ParameterValue,
  ): void {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const time = frameTime(this.#context, atFrame);
    if (parameterId === "ceiling") {
      const next = clamp(value, -12, 0);
      const prior = scheduledNumberAt(
        this.#limiterAutomation.get(parameterId),
        atFrame,
        this.#limiterCeilingDecibels,
      );
      scheduleRamp(
        this.#programLimiter.threshold,
        prior,
        next,
        time,
        EFFECT_PARAMETER_RAMP_SECONDS,
      );
      scheduleRamp(
        this.#programCeiling?.gain.gain,
        decibelGain(prior),
        decibelGain(next),
        time,
        EFFECT_PARAMETER_RAMP_SECONDS,
      );
      recordLimiterValue(this.#limiterAutomation, parameterId, atFrame, next);
    } else if (parameterId === "input") {
      const next = clamp(value, 0, 24);
      const prior = scheduledNumberAt(
        this.#limiterAutomation.get(parameterId),
        atFrame,
        this.#limiterInputDecibels,
      );
      scheduleRamp(
        this.#limiterDrive.gain,
        decibelGain(prior),
        decibelGain(next),
        time,
        EFFECT_PARAMETER_RAMP_SECONDS,
      );
      recordLimiterValue(this.#limiterAutomation, parameterId, atFrame, next);
    } else if (parameterId === "release") {
      const next = clamp(value, 5, 1_000);
      const prior = scheduledNumberAt(
        this.#limiterAutomation.get(parameterId),
        atFrame,
        this.#limiterReleaseMilliseconds,
      );
      scheduleRamp(
        this.#programLimiter.release,
        prior / 1_000,
        next / 1_000,
        time,
        EFFECT_PARAMETER_RAMP_SECONDS,
      );
      recordLimiterValue(this.#limiterAutomation, parameterId, atFrame, next);
    }
  }

  #withTransportTempo(
    effects: readonly RoutingEffectInstance[],
  ): readonly RoutingEffectInstance[] {
    return effects.map((effect) => ({
      ...effect,
      state: {
        ...effect.state,
        [EFFECT_TRANSPORT_TEMPO_PARAMETER]: this.#transportTempo,
      },
    }));
  }

  #channelAudibleAt(channel: ChannelNodes, atFrame: number): boolean {
    const solo = scheduledValueAt(channel.soloAutomation, atFrame, channel.desiredSolo);
    const muted = scheduledValueAt(channel.muteAutomation, atFrame, channel.desiredMuted);
    const anySolo = [...this.#channels.values()].some((candidate) =>
      scheduledValueAt(candidate.soloAutomation, atFrame, candidate.desiredSolo),
    );
    return !muted && (!anySolo || solo);
  }

  #scheduleSoloMute(time: number, atFrame: number): void {
    for (const channel of this.#channels.values()) {
      const audible = this.#channelAudibleAt(channel, atFrame);
      const level = scheduledValueAt(channel.levelAutomation, atFrame, channel.desiredLevel);
      setAtTime(channel.gate.gain, audible ? 1 : 0, time);
      setAtTime(channel.fader.gain, audible ? level : 0, time);
    }
  }

  connectMetronome(source: AudioNode): void {
    source.connect(this.#programLimiter);
    source.connect(this.#limiterBypass);
  }

  removeChannel(moduleId: ModuleInstanceId): void {
    const channel = this.#channels.get(moduleId);
    if (channel === undefined) return;
    channel.input.disconnect();
    channel.gate.disconnect();
    channel.fader.disconnect();
    channel.panner.disconnect();
    channel.effects.dispose();
    for (const node of channel.sends.values()) node.disconnect();
    this.#channels.delete(moduleId);
  }

  getMeter(): RoutingMeterFrame {
    const frame = readMeter({
      left: this.#analyserLeft,
      right: this.#analyserRight,
      leftData: this.#analysisLeft,
      rightData: this.#analysisRight,
    });
    this.#peakLatched ||= frame.peak;
    return { ...frame, peak: this.#peakLatched };
  }

  resetPeak(): void {
    this.#peakLatched = false;
  }

  getMasterChainMeter(position: "pre" | "post"): RoutingMeterFrame {
    let meter = position === "pre" ? this.#preMasterMeter : this.#postMasterMeter;
    if (meter === undefined) {
      meter = this.#createMeter(position === "pre" ? this.#programInput : this.#programOutput);
      if (position === "pre") this.#preMasterMeter = meter;
      else this.#postMasterMeter = meter;
    }
    return readMeter(meter);
  }

  getEffectMeter(effectId: EffectInstanceId, meterId: string): number {
    if (effectId === this.#limiterEffectId && meterId === "gain-reduction") {
      const reduction = this.#programLimiter.reduction;
      return Number.isFinite(reduction) ? Math.max(0, -reduction) : 0;
    }
    const masterValue = this.#masterEffects.getEffectMeter(effectId, meterId);
    if (masterValue !== undefined) return masterValue;
    for (const chain of this.#nonMasterEffectChains()) {
      const value = chain.getEffectMeter(effectId, meterId);
      if (value !== undefined) return value;
    }
    return 0;
  }

  #createMeter(source: AudioNode): MeterNodes {
    const splitter = this.#context.createChannelSplitter(2);
    const left = this.#context.createAnalyser();
    const right = this.#context.createAnalyser();
    for (const analyser of [left, right]) {
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
    }
    source.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);
    return {
      splitter,
      left,
      right,
      leftData: new Float32Array(left.fftSize),
      rightData: new Float32Array(right.fftSize),
    };
  }

  #disposeMeter(meter: MeterNodes | undefined): void {
    if (meter === undefined) return;
    meter.splitter.disconnect();
    meter.left.disconnect();
    meter.right.disconnect();
  }

  dispose(): void {
    this.#disposeMeter(this.#preMasterMeter);
    this.#disposeMeter(this.#postMasterMeter);
    for (const moduleId of [...this.#channels.keys()]) this.removeChannel(moduleId);
    for (const send of this.#sends.values()) {
      send.input.disconnect();
      send.effects.dispose();
      send.returnGain.disconnect();
    }
    this.#sends.clear();
    this.#masterEffects.dispose();
    for (const node of [
      this.#programInput,
      this.#masterGain,
      this.#programLimiter,
      ...(this.#programCeiling === undefined
        ? []
        : [this.#programCeiling.shaper, this.#programCeiling.gain]),
      this.#limiterDrive,
      this.#limiterDry,
      this.#limiterWet,
      this.#limiterMix,
      this.#limiterOutputGain,
      this.#limiterBypass,
      this.#programOutput,
      this.#output,
      this.#analyserLeft,
      this.#analyserRight,
    ]) node.disconnect();
  }

  #ensureChannel(moduleId: ModuleInstanceId): ChannelNodes {
    const existing = this.#channels.get(moduleId);
    if (existing !== undefined) return existing;
    const fader = this.#context.createGain();
    const panner = this.#context.createStereoPanner();
    return this.#createChannel(moduleId, fader, panner);
  }

  #createChannel(
    moduleId: ModuleInstanceId,
    fader: GainNode,
    panner: StereoPannerNode,
  ): ChannelNodes {
    const input = this.#context.createGain();
    const gate = this.#context.createGain();
    const effects = new EffectChainNode(this.#context, this.#effectFactory);
    input.connect(effects.input);
    effects.output.connect(gate);
    gate.connect(fader);
    fader.connect(panner);
    panner.connect(this.#programInput);

    const sends = new Map<SendBusId, GainNode>();
    for (const busId of SEND_BUS_IDS) {
      const send = this.#context.createGain();
      send.gain.value = 0;
      gate.connect(send);
      send.connect(this.#ensureSend(busId).input);
      sends.set(busId, send);
    }
    const channel = {
      input,
      gate,
      fader,
      panner,
      effects,
      sends,
      desiredLevel: 1,
      desiredMuted: false,
      desiredSolo: false,
      sendAmounts: new Map(),
      levelAutomation: [],
      muteAutomation: [],
      soloAutomation: [],
    };
    this.#channels.set(moduleId, channel);
    return channel;
  }

  #ensureSend(busId: SendBusId): SendNodes {
    const existing = this.#sends.get(busId);
    if (existing !== undefined) return existing;
    const input = this.#context.createGain();
    const effects = new EffectChainNode(this.#context, this.#effectFactory);
    const returnGain = this.#context.createGain();
    returnGain.gain.value = 1;
    input.connect(effects.input);
    effects.output.connect(returnGain);
    returnGain.connect(this.#programInput);
    const send = { input, effects, returnGain };
    this.#sends.set(busId, send);
    return send;
  }

}

function readMeter(meter: MeterBuffers): RoutingMeterFrame {
  meter.left.getFloatTimeDomainData(meter.leftData);
  meter.right.getFloatTimeDomainData(meter.rightData);
  let left = 0;
  let right = 0;
  let mid = 0;
  let side = 0;
  for (let index = 0; index < meter.leftData.length; index += 1) {
    const oneLeft = meter.leftData[index] ?? 0;
    const oneRight = meter.rightData[index] ?? 0;
    left = Math.max(left, Math.abs(oneLeft));
    right = Math.max(right, Math.abs(oneRight));
    mid = Math.max(mid, Math.abs((oneLeft + oneRight) / 2));
    side = Math.max(side, Math.abs((oneLeft - oneRight) / 2));
  }
  return { left, right, mid, side, peak: Math.max(left, right) >= PEAK_DISPLAY_THRESHOLD };
}

function createProtectedLimiter(context: AudioContext): DynamicsCompressorNode {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.05;
  return limiter;
}

export function createLimiterCeilingCurve(
  ceilingDecibels: number,
  length = 4097,
): Float32Array<ArrayBuffer> {
  const size = Math.max(3, Math.floor(length));
  const ceiling = 10 ** (clamp(ceilingDecibels, -12, 0) / 20);
  const curve = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    const input = (index / (size - 1)) * 2 - 1;
    curve[index] = clamp(input, -ceiling, ceiling);
  }
  return curve;
}

function createLimiterCeiling(
  context: AudioContext,
  ceilingDecibels: number,
): LimiterCeilingNodes | undefined {
  const host = context as unknown as { createWaveShaper?: () => WaveShaperNode };
  if (typeof host.createWaveShaper !== "function") return undefined;
  const shaper = host.createWaveShaper();
  const gain = context.createGain();
  shaper.curve = createLimiterCeilingCurve(0);
  // Oversampling can ring past a hard clip boundary. The final safety stage
  // uses the host-rate curve so its post-gain ceiling remains absolute.
  shaper.oversample = "none";
  gain.gain.value = decibelGain(clamp(ceilingDecibels, -12, 0));
  shaper.connect(gain);
  return { shaper, gain };
}

function ramp(parameter: AudioParam | undefined, value: number, now: number, seconds: number): void {
  if (parameter === undefined) return;
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(value, now + seconds);
}

function frameTime(context: BaseAudioContext, atFrame: number): number {
  return Math.max(context.currentTime, atFrame / context.sampleRate);
}

function setAtTime(parameter: AudioParam | undefined, value: number, time: number): void {
  parameter?.setValueAtTime(value, time);
}

function scheduleRamp(
  parameter: AudioParam | undefined,
  currentValue: number,
  nextValue: number,
  time: number,
  seconds: number,
): void {
  if (parameter === undefined) return;
  parameter.setValueAtTime(currentValue, time);
  parameter.linearRampToValueAtTime(nextValue, time + seconds);
}

function decibelGain(value: number): number {
  return 10 ** (value / 20);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function routingMixGains(mix: number): { readonly dry: number; readonly wet: number } {
  const value = clamp01(mix);
  return {
    dry: Math.cos((value * Math.PI) / 2),
    wet: Math.sin((value * Math.PI) / 2),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function scheduledValueAt<T>(
  values: readonly ScheduledValue<T>[],
  atFrame: number,
  fallback: T,
): T {
  return values.findLast((value) => value.atFrame <= atFrame)?.value ?? fallback;
}

function recordScheduledValue<T>(
  values: ScheduledValue<T>[],
  atFrame: number,
  value: T,
): void {
  const existing = values.findIndex((candidate) => candidate.atFrame === atFrame);
  if (existing >= 0) values.splice(existing, 1);
  values.push({ atFrame, value });
  values.sort((left, right) => left.atFrame - right.atFrame);
}

function retainScheduledBefore<T>(
  values: readonly ScheduledValue<T>[],
  fromFrame: number,
): ScheduledValue<T>[] {
  const prior = values.findLast((value) => value.atFrame < fromFrame);
  return prior === undefined ? [] : [prior];
}

function scheduledNumberAt(
  values: readonly ScheduledValue<ParameterValue>[] | undefined,
  atFrame: number,
  fallback: number,
): number {
  const value = values?.findLast((candidate) => candidate.atFrame <= atFrame)?.value;
  return typeof value === "number" ? value : fallback;
}

function scheduledBooleanAt(
  values: readonly ScheduledValue<ParameterValue>[] | undefined,
  atFrame: number,
  fallback: boolean,
): boolean {
  const value = values?.findLast((candidate) => candidate.atFrame <= atFrame)?.value;
  return typeof value === "boolean" ? value : fallback;
}

function recordLimiterValue(
  valuesByParameter: Map<string, ScheduledValue<ParameterValue>[]>,
  parameterId: string,
  atFrame: number,
  value: ParameterValue,
): void {
  const values = valuesByParameter.get(parameterId) ?? [];
  recordScheduledValue(values, atFrame, value);
  valuesByParameter.set(parameterId, values);
}
