import type { EffectInstanceId } from "../../contracts/ids";
import type { ParameterValue, PluginId } from "../../contracts/parameters";

/** The bounded effect state that crosses from a project projection into the live graph. */
export interface RoutingEffectInstance {
  readonly id: EffectInstanceId;
  readonly pluginId: PluginId;
  readonly state: Readonly<Record<string, ParameterValue>>;
  readonly bypassed: boolean;
  readonly wetDry: number;
  readonly wetDryLaw: "linear" | "equal-power";
}

/**
 * A live effect node stays inside the engine. The factory can load an
 * AudioWorklet module before it returns the prepared input and output nodes.
 */
export interface EffectAudioNodePort {
  readonly input: AudioNode;
  readonly output: AudioNode;
  scheduleParameter?(atFrame: number, parameterId: string, value: ParameterValue): void;
  clearScheduledParameters?(fromFrame: number): void;
  getMeter?(meterId: string): number;
  dispose(): void;
}

export type EffectChainNodeFactory = (
  context: AudioContext,
  effect: RoutingEffectInstance,
) => Promise<EffectAudioNodePort>;

interface ChainBranch {
  readonly entry: GainNode;
  readonly exit: GainNode;
  readonly nodes: readonly EffectAudioNodePort[];
  readonly ownedNodes: readonly AudioNode[];
  readonly controls: ReadonlyMap<EffectInstanceId, EffectControl>;
}

interface EffectControl {
  readonly node: EffectAudioNodePort;
  readonly dry: GainNode;
  readonly wet: GainNode;
  wetDry: number;
  bypassed: boolean;
  readonly wetDryLaw: "linear" | "equal-power";
}

const CHAIN_SWITCH_SECONDS = 0.004;

/**
 * Owns one stable chain input and output. A replacement builds beside the old
 * branch and crossfades once, so channel and bus wiring never changes.
 */
export class EffectChainNode {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #context: AudioContext;
  readonly #factory: EffectChainNodeFactory | undefined;
  readonly #bypassDry: GainNode;
  readonly #bypassWet: GainNode;
  #active: ChainBranch;
  #generation = 0;
  #bypassed = false;
  readonly #cleanupTimers = new Set<ReturnType<typeof setTimeout>>();
  readonly #retiring = new Set<ChainBranch>();

  constructor(context: AudioContext, factory?: EffectChainNodeFactory) {
    this.#context = context;
    this.#factory = factory;
    this.input = context.createGain();
    this.output = context.createGain();
    this.#bypassDry = context.createGain();
    this.#bypassWet = context.createGain();
    this.input.connect(this.#bypassDry);
    this.#bypassDry.connect(this.output);
    this.#bypassWet.connect(this.output);
    this.#bypassDry.gain.value = 0;
    this.#bypassWet.gain.value = 1;
    this.#active = this.#createDryBranch();
    this.#active.exit.gain.value = 1;
  }

  async replace(effects: readonly RoutingEffectInstance[], bypassed: boolean): Promise<void> {
    const generation = ++this.#generation;
    const next = effects.length === 0 ? this.#createDryBranch() : await this.#createEffectBranch(effects);
    if (generation !== this.#generation) {
      disposeBranch(next);
      return;
    }

    const previous = this.#active;
    this.#active = next;
    const now = this.#context.currentTime;
    this.#setBypassAtTime(bypassed, now);
    ramp(previous.exit.gain, 0, now, CHAIN_SWITCH_SECONDS);
    ramp(next.exit.gain, 1, now, CHAIN_SWITCH_SECONDS);

    // Disconnect after the fade without keeping an unbounded graph tail.
    this.#retiring.add(previous);
    const timer = globalThis.setTimeout(() => {
      this.#cleanupTimers.delete(timer);
      this.#retiring.delete(previous);
      disposeBranch(previous);
    }, CHAIN_SWITCH_SECONDS * 1_000 + 1);
    this.#cleanupTimers.add(timer);
  }

  dispose(): void {
    this.#generation += 1;
    for (const timer of this.#cleanupTimers) clearTimeout(timer);
    this.#cleanupTimers.clear();
    for (const branch of this.#retiring) disposeBranch(branch);
    this.#retiring.clear();
    disposeBranch(this.#active);
    this.input.disconnect();
    this.output.disconnect();
    this.#bypassDry.disconnect();
    this.#bypassWet.disconnect();
  }

  scheduleBypass(atFrame: number, bypassed: boolean): void {
    this.#setBypassAtTime(bypassed, frameTime(this.#context, atFrame));
  }

  setBypassed(bypassed: boolean): void {
    const now = this.#context.currentTime;
    ramp(this.#bypassDry.gain, bypassed ? 1 : 0, now, CHAIN_SWITCH_SECONDS);
    ramp(this.#bypassWet.gain, bypassed ? 0 : 1, now, CHAIN_SWITCH_SECONDS);
    this.#bypassed = bypassed;
  }

  scheduleEffectBypass(atFrame: number, effectId: EffectInstanceId, bypassed: boolean): void {
    const control = this.#active.controls.get(effectId);
    if (control === undefined) return;
    const time = frameTime(this.#context, atFrame);
    const gains = wetDryGains(control.wetDry, control.wetDryLaw);
    const priorDry = control.bypassed ? 1 : gains.dry;
    const priorWet = control.bypassed ? 0 : gains.wet;
    control.bypassed = bypassed;
    scheduleRamp(control.dry.gain, priorDry, bypassed ? 1 : gains.dry, time, CHAIN_SWITCH_SECONDS);
    scheduleRamp(control.wet.gain, priorWet, bypassed ? 0 : gains.wet, time, CHAIN_SWITCH_SECONDS);
  }

  scheduleEffectWetDry(atFrame: number, effectId: EffectInstanceId, wetDry: number): void {
    const control = this.#active.controls.get(effectId);
    if (control === undefined) return;
    const value = clamp01(wetDry);
    const prior = wetDryGains(control.wetDry, control.wetDryLaw);
    control.wetDry = value;
    const time = frameTime(this.#context, atFrame);
    const gains = wetDryGains(value, control.wetDryLaw);
    scheduleRamp(control.dry.gain, control.bypassed ? 1 : prior.dry, control.bypassed ? 1 : gains.dry, time, CHAIN_SWITCH_SECONDS);
    scheduleRamp(control.wet.gain, control.bypassed ? 0 : prior.wet, control.bypassed ? 0 : gains.wet, time, CHAIN_SWITCH_SECONDS);
  }

  /** Applies a transient wet/dry value without changing the project projection. */
  previewEffectWetDry(effectId: EffectInstanceId, wetDry: number): void {
    this.setEffectWetDry(effectId, wetDry);
  }

  setEffectWetDry(effectId: EffectInstanceId, wetDry: number): boolean {
    const control = this.#active.controls.get(effectId);
    if (control === undefined) return false;
    const value = clamp01(wetDry);
    control.wetDry = value;
    const now = this.#context.currentTime;
    const gains = wetDryGains(value, control.wetDryLaw);
    ramp(control.dry.gain, control.bypassed ? 1 : gains.dry, now, CHAIN_SWITCH_SECONDS);
    ramp(control.wet.gain, control.bypassed ? 0 : gains.wet, now, CHAIN_SWITCH_SECONDS);
    return true;
  }

  setEffectBypassed(effectId: EffectInstanceId, bypassed: boolean): boolean {
    const control = this.#active.controls.get(effectId);
    if (control === undefined) return false;
    control.bypassed = bypassed;
    const gains = wetDryGains(control.wetDry, control.wetDryLaw);
    const now = this.#context.currentTime;
    ramp(control.dry.gain, bypassed ? 1 : gains.dry, now, CHAIN_SWITCH_SECONDS);
    ramp(control.wet.gain, bypassed ? 0 : gains.wet, now, CHAIN_SWITCH_SECONDS);
    return true;
  }

  /** Sends a transient parameter value to the worklet at the current audio frame. */
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
  ): boolean {
    const control = this.#active.controls.get(effectId);
    if (control === undefined) return false;
    const atFrame = Math.ceil(this.#context.currentTime * this.#context.sampleRate);
    control.node.scheduleParameter?.(atFrame, parameterId, value);
    return true;
  }

  /** Sends one runtime-owned value to each effect without changing project state. */
  setRuntimeParameter(parameterId: string, value: ParameterValue): void {
    const atFrame = Math.ceil(this.#context.currentTime * this.#context.sampleRate);
    for (const control of this.#active.controls.values()) {
      control.node.scheduleParameter?.(atFrame, parameterId, value);
    }
  }

  getEffectMeter(effectId: EffectInstanceId, meterId: string): number | undefined {
    const control = this.#active.controls.get(effectId);
    if (control === undefined) return undefined;
    return control.node.getMeter?.(meterId) ?? 0;
  }

  scheduleEffectParameter(
    atFrame: number,
    effectId: EffectInstanceId,
    parameterId: string,
    value: ParameterValue,
  ): void {
    this.#active.controls.get(effectId)?.node.scheduleParameter?.(atFrame, parameterId, value);
  }

  clearAutomation(fromFrame: number): void {
    const time = frameTime(this.#context, fromFrame);
    for (const parameter of [this.#bypassDry.gain, this.#bypassWet.gain]) {
      parameter.cancelScheduledValues(time);
    }
    for (const control of this.#active.controls.values()) {
      for (const parameter of [control.dry.gain, control.wet.gain]) parameter.cancelScheduledValues(time);
      control.node.clearScheduledParameters?.(fromFrame);
    }
  }

  #setBypassAtTime(bypassed: boolean, time: number): void {
    scheduleRamp(this.#bypassDry.gain, this.#bypassed ? 1 : 0, bypassed ? 1 : 0, time, CHAIN_SWITCH_SECONDS);
    scheduleRamp(this.#bypassWet.gain, this.#bypassed ? 0 : 1, bypassed ? 0 : 1, time, CHAIN_SWITCH_SECONDS);
    this.#bypassed = bypassed;
  }

  #createDryBranch(): ChainBranch {
    const entry = this.#context.createGain();
    const exit = this.#context.createGain();
    exit.gain.value = 0;
    this.input.connect(entry);
    entry.connect(exit);
    exit.connect(this.#bypassWet);
    return { entry, exit, nodes: [], ownedNodes: [], controls: new Map() };
  }

  async #createEffectBranch(effects: readonly RoutingEffectInstance[]): Promise<ChainBranch> {
    if (this.#factory === undefined) {
      throw new Error("The live effect chain has no AudioWorklet node factory.");
    }
    const entry = this.#context.createGain();
    const exit = this.#context.createGain();
    exit.gain.value = 0;
    const nodes: EffectAudioNodePort[] = [];
    const ownedNodes: AudioNode[] = [];
    const controls = new Map<EffectInstanceId, EffectControl>();
    try {
      this.input.connect(entry);
      let tail: AudioNode = entry;
      for (const effect of effects) {
        const node = await this.#factory(this.#context, effect);
        nodes.push(node);
        const dry = this.#context.createGain();
        const wet = this.#context.createGain();
        const mix = this.#context.createGain();
        const gains = wetDryGains(effect.wetDry, effect.wetDryLaw);
        dry.gain.value = effect.bypassed ? 1 : gains.dry;
        wet.gain.value = effect.bypassed ? 0 : gains.wet;
        tail.connect(node.input);
        tail.connect(dry);
        node.output.connect(wet);
        dry.connect(mix);
        wet.connect(mix);
        ownedNodes.push(dry, wet, mix);
        controls.set(effect.id, {
          node,
          dry,
          wet,
          wetDry: clamp01(effect.wetDry),
          bypassed: effect.bypassed,
          wetDryLaw: effect.wetDryLaw,
        });
        tail = mix;
      }
      tail.connect(exit);
      exit.connect(this.#bypassWet);
      return { entry, exit, nodes, ownedNodes, controls };
    } catch (error) {
      for (const node of nodes) node.dispose();
      for (const node of ownedNodes) node.disconnect();
      entry.disconnect();
      exit.disconnect();
      throw error;
    }
  }
}

function frameTime(context: BaseAudioContext, atFrame: number): number {
  return Math.max(context.currentTime, atFrame / context.sampleRate);
}

function scheduleRamp(
  parameter: AudioParam,
  currentValue: number,
  nextValue: number,
  time: number,
  seconds: number,
): void {
  parameter.setValueAtTime(currentValue, time);
  parameter.linearRampToValueAtTime(nextValue, time + seconds);
}

function disposeBranch(branch: ChainBranch): void {
  branch.entry.disconnect();
  branch.exit.disconnect();
  for (const node of branch.nodes) node.dispose();
  for (const node of branch.ownedNodes) node.disconnect();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function wetDryGains(
  wetDry: number,
  law: "linear" | "equal-power",
): { readonly dry: number; readonly wet: number } {
  const value = clamp01(wetDry);
  if (law === "linear") return { dry: 1 - value, wet: value };
  return {
    dry: Math.cos((value * Math.PI) / 2),
    wet: Math.sin((value * Math.PI) / 2),
  };
}

function ramp(parameter: AudioParam, value: number, now: number, seconds: number): void {
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(value, now + seconds);
}
