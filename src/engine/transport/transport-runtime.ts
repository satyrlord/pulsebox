import type { EngineDelta } from "../../contracts/commands";
import type { ModuleInstanceId, StateRevision } from "../../contracts/ids";
import type { ParameterValue, PluginId } from "../../contracts/parameters";
import {
  chainedStepResolver,
  loopingStepResolver,
  schedulePatternWindow,
  type PatternTiming,
  type StepResolver,
} from "./pattern-scheduler";
import type { PatternStepView } from "./scheduled-event";
import { TransportClock } from "./transport-clock";
import type {
  VoiceAdapterFactory,
  VoiceAdapterPort,
  VoiceAdapterStatus,
  VoiceFault,
} from "./voice-adapter";

export interface TransportModuleMix {
  readonly level: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
}

export interface TransportModule {
  readonly id: ModuleInstanceId;
  readonly pluginId: PluginId;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  /** One step list per project Pattern slot. */
  readonly parts: readonly (readonly PatternStepView[])[];
  readonly mix: TransportModuleMix;
}

export interface TransportArrangement {
  readonly activePatternIndex: number;
  readonly songEnabled: boolean;
  readonly songEntries: readonly { readonly patternIndex: number; readonly repeats: number }[];
}

export type TransportEngineDelta = EngineDelta<
  | "project-replace"
  | "module-add"
  | "module-remove"
  | "module-move"
  | "parameter-set"
  | "step-set"
  | "transport"
  | "pattern-select"
  | "pattern-rename"
  | "pattern-timing-set"
  | "song-set"
  | "mixer-set",
  Readonly<Record<string, unknown>>
>;

const DEFAULT_ARRANGEMENT: TransportArrangement = {
  activePatternIndex: 0,
  songEnabled: false,
  songEntries: [],
};

export type AudioRuntimeState = "locked" | "active" | "suspended" | "unavailable";

/** Post-limiter master analysis for the header meters. Analysis only. */
export interface MasterMeterFrame {
  readonly left: number;
  readonly right: number;
  /** `M = (L + R) / 2` for displayed analysis. */
  readonly mid: number;
  /** `S = (L - R) / 2` for displayed analysis. */
  readonly side: number;
  /** True when the post-limiter peak reached the display threshold. */
  readonly peak: boolean;
}

const SILENT_MASTER_METER: MasterMeterFrame = Object.freeze({
  left: 0,
  right: 0,
  mid: 0,
  side: 0,
  peak: false,
});

/** Post-limiter level that lights the header peak indicator. */
const PEAK_DISPLAY_THRESHOLD = 0.98;

export type TransportRuntimeStatus =
  | {
      readonly moduleId: ModuleInstanceId;
      readonly state: "recovering" | "faulted";
      readonly fault: VoiceFault;
    }
  | { readonly moduleId: ModuleInstanceId; readonly state: "recovered" };

/**
 * The brief's window: schedule 100 ms ahead, wake every 25 ms. The tick only
 * decides *when to look*; every note is stamped with an absolute audio frame, so
 * timer jitter cannot move a note.
 */
const SCHEDULER_LOOKAHEAD_SECONDS = 0.1;
const SCHEDULER_TICK_MILLISECONDS = 25;

/**
 * Notes are never scheduled closer than this to the playhead, which keeps a late
 * tick from stamping an event the processor has already passed.
 */
const SCHEDULER_LEAD_SECONDS = 0.02;

/** A sixteenth at 960 ticks per quarter. */
const TICKS_PER_STEP = 240;

/** One 4/4 bar of sixteenths: the default Pattern-launch boundary. */
const DEFAULT_LAUNCH_QUANTIZATION_STEPS = 16;

/** Metronome click length and levels. The bar click is higher and louder. */
const CLICK_SECONDS = 0.03;
const CLICK_ATTACK_SECONDS = 0.002;
const CLICK_BEAT_HZ = 1319;
const CLICK_BAR_HZ = 1760;
const CLICK_BEAT_LEVEL = 0.3;
const CLICK_BAR_LEVEL = 0.45;
const STEPS_PER_BEAT = 4;
const BEATS_PER_BAR = 4;

export interface TransportRuntimeOptions {
  readonly createContext?: () => AudioContext;
  readonly adapterFactoryFor: (pluginId: PluginId) => VoiceAdapterFactory | undefined;
  readonly onStatus?: (status: TransportRuntimeStatus) => void;
  /** Peak output level per module, at the worklet protocol's frame rate. */
  readonly onMeter?: (moduleId: ModuleInstanceId, level: number) => void;
  /** Reports every audio-runtime state change, for the header power control. */
  readonly onStateChange?: (state: AudioRuntimeState) => void;
}

interface AuditionSession {
  adapter?: VoiceAdapterPort;
}

interface MetronomeVoice {
  readonly frame: number;
  readonly oscillator: OscillatorNode;
  readonly gain: GainNode;
}

/**
 * Owns the audio clock and every voice adapter. This is the only object that
 * knows a transport is running; instrument modules just receive frame-stamped
 * events. Adding an instrument means registering an adapter factory, not
 * touching this class.
 */
export class TransportRuntime {
  readonly #createContext: () => AudioContext;
  readonly #adapterFactoryFor: (pluginId: PluginId) => VoiceAdapterFactory | undefined;
  readonly #onStatus: (status: TransportRuntimeStatus) => void;
  readonly #onMeter: (moduleId: ModuleInstanceId, level: number) => void;
  readonly #onStateChange: (state: AudioRuntimeState) => void;
  readonly #modules = new Map<ModuleInstanceId, TransportModule>();
  readonly #adapters = new Map<ModuleInstanceId, VoiceAdapterPort>();
  readonly #auditions = new Map<ModuleInstanceId, AuditionSession>();
  readonly #channels = new Map<ModuleInstanceId, MixerChannel>();
  /**
   * Step resolvers keyed by module, held against the `parts` array they were
   * built from. A parameter or mixer change reuses the same array and keeps the
   * cache; editing steps produces a new one and invalidates it automatically.
   */
  readonly #resolvers = new Map<
    ModuleInstanceId,
    { readonly parts: TransportModule["parts"]; readonly resolve: StepResolver }
  >();
  readonly #metronomeVoices = new Set<MetronomeVoice>();
  #master: GainNode | undefined;
  #limiter: DynamicsCompressorNode | undefined;
  #analyserLeft: AnalyserNode | undefined;
  #analyserRight: AnalyserNode | undefined;
  #analysisLeft: Float32Array<ArrayBuffer> | undefined;
  #analysisRight: Float32Array<ArrayBuffer> | undefined;
  #metronomeOutput: GainNode | undefined;
  #metronomeEnabled = false;
  #masterLevel = 0.8;
  #context: AudioContext | undefined;
  #clock: TransportClock | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #projectRevision: StateRevision | undefined;
  #patternStartFrame = 0;
  #nextScheduleFrame = 0;
  #swing = 0;
  #patternTiming: readonly PatternTiming[] = [];
  #arrangement: TransportArrangement = DEFAULT_ARRANGEMENT;
  /** A Pattern launch waiting for its quantization boundary. */
  #pendingArrangement: TransportArrangement | undefined;
  #launchQuantizationSteps = DEFAULT_LAUNCH_QUANTIZATION_STEPS;
  /** The transport start marker, kept even before the clock exists. */
  #seekTicks: number | undefined;
  #state: AudioRuntimeState = "locked";

  constructor(options: TransportRuntimeOptions) {
    this.#createContext =
      options.createContext ?? (() => new AudioContext({ latencyHint: "interactive" }));
    this.#adapterFactoryFor = options.adapterFactoryFor;
    this.#onStatus = options.onStatus ?? (() => undefined);
    this.#onMeter = options.onMeter ?? (() => undefined);
    this.#onStateChange = options.onStateChange ?? (() => undefined);
  }

  get state(): AudioRuntimeState {
    return this.#state;
  }

  get projectRevision(): StateRevision | undefined {
    return this.#projectRevision;
  }

  /**
   * Chooses the resolver for the current arrangement. Song mode expands each
   * chain entry by its repeat count; otherwise the active Pattern loops.
   *
   * Cached per module: this runs for every module on every scheduler tick, and
   * expanding a long chain by its repeat counts allocates in proportion to the
   * whole song. Rebuilding that forty times a second is work the arrangement
   * does not need, so the cache is cleared whenever the inputs change.
   */
  #resolverFor(module: TransportModule): StepResolver {
    const cached = this.#resolvers.get(module.id);
    if (cached?.parts === module.parts) return cached.resolve;

    const { activePatternIndex, songEnabled, songEntries } = this.#arrangement;
    let resolve: StepResolver;
    if (!songEnabled || songEntries.length === 0) {
      resolve = loopingStepResolver(module.parts[activePatternIndex] ?? [], activePatternIndex);
    } else {
      const chain: { readonly steps: readonly PatternStepView[]; readonly patternIndex: number }[] =
        [];
      for (const entry of songEntries) {
        const part = module.parts[entry.patternIndex];
        if (part === undefined) continue;
        for (let repeat = 0; repeat < entry.repeats; repeat += 1) {
          chain.push({ steps: part, patternIndex: entry.patternIndex });
        }
      }
      resolve = chainedStepResolver(chain);
    }
    this.#resolvers.set(module.id, { parts: module.parts, resolve });
    return resolve;
  }

  setArrangement(arrangement: TransportArrangement): void {
    const current = this.#pendingArrangement ?? this.#arrangement;
    const changed =
      arrangement.activePatternIndex !== current.activePatternIndex ||
      arrangement.songEnabled !== current.songEnabled ||
      arrangement.songEntries !== current.songEntries;
    if (!changed) {
      // Same content: keep the newest object so later identity checks hold.
      if (this.#pendingArrangement !== undefined) this.#pendingArrangement = arrangement;
      else this.#arrangement = arrangement;
      return;
    }

    const context = this.#context;
    const clock = this.#clock;
    const playing =
      context !== undefined &&
      clock?.getSnapshot(this.#currentFrame(context)).status === "playing";

    // While a Pattern loops, a Pattern launch waits for its quantization
    // boundary. Every other arrangement change applies from the next scheduled
    // note, so a mode switch never stops playback.
    const patternLaunchOnly =
      playing &&
      !arrangement.songEnabled &&
      !current.songEnabled &&
      arrangement.songEntries === current.songEntries &&
      arrangement.activePatternIndex !== current.activePatternIndex;
    if (patternLaunchOnly) {
      this.#pendingArrangement = arrangement;
      return;
    }

    this.#applyArrangementNow(arrangement);
    if (playing) {
      const frame = this.#currentFrame(context);
      this.#reanchor(context, clock, frame, clock.getSnapshot(frame).positionTicks);
    }
  }

  #applyArrangementNow(arrangement: TransportArrangement): void {
    this.#pendingArrangement = undefined;
    this.#arrangement = arrangement;
    // Every cached resolver was built for the previous arrangement.
    this.#resolvers.clear();
  }

  /** The quantized Pattern-launch boundary, in sixteenth steps. */
  setLaunchQuantization(steps: number): void {
    if (!Number.isSafeInteger(steps) || steps < 1) return;
    this.#launchQuantizationSteps = steps;
  }

  /** Pattern-owned Humanize and seed, by bank index. */
  setPatternTiming(timing: readonly PatternTiming[]): void {
    this.#patternTiming = timing;
    const context = this.#context;
    const clock = this.#clock;
    if (context === undefined || clock === undefined) return;
    const frame = this.#currentFrame(context);
    const snapshot = clock.getSnapshot(frame);
    if (snapshot.status === "playing")
      this.#reanchor(context, clock, frame, snapshot.positionTicks);
  }

  setMasterLevel(level: number): void {
    this.#masterLevel = clamp01(level);
    const master = this.#master;
    if (master === undefined || this.#context === undefined) return;
    setSmoothed(master.gain, this.#masterLevel, this.#context.currentTime);
  }

  /** Applies level, pan, mute, and the solo-implies-others-muted rule. */
  #applyMix(): void {
    const context = this.#context;
    if (context === undefined) return;
    const anySolo = [...this.#modules.values()].some((module) => module.mix.solo);
    for (const [id, module] of this.#modules) {
      const channel = this.#channels.get(id);
      if (channel === undefined) continue;
      const audible = !module.mix.muted && (!anySolo || module.mix.solo);
      setSmoothed(channel.gain.gain, audible ? clamp01(module.mix.level) : 0, context.currentTime);
      setSmoothed(
        channel.panner.pan,
        Math.min(1, Math.max(-1, module.mix.pan)),
        context.currentTime,
      );
    }
  }

  /** The UI reads its playhead from here. The audio clock is always the source. */
  getPositionTicks(): number {
    const context = this.#context;
    if (context === undefined) return this.#seekTicks ?? 0;
    return this.#clock?.getSnapshot(this.#currentFrame(context)).positionTicks ?? 0;
  }

  /**
   * Post-limiter master analysis. `L/R` and `M/S` are both derived from one
   * non-audible analysis branch, so switching the display mode never touches
   * the audible path.
   */
  getMasterMeter(): MasterMeterFrame {
    const left = this.#analyserLeft;
    const right = this.#analyserRight;
    const leftData = this.#analysisLeft;
    const rightData = this.#analysisRight;
    if (
      left === undefined ||
      right === undefined ||
      leftData === undefined ||
      rightData === undefined
    ) {
      return SILENT_MASTER_METER;
    }
    left.getFloatTimeDomainData(leftData);
    right.getFloatTimeDomainData(rightData);
    let leftPeak = 0;
    let rightPeak = 0;
    let midPeak = 0;
    let sidePeak = 0;
    for (let index = 0; index < leftData.length; index += 1) {
      const sampleLeft = leftData[index] ?? 0;
      const sampleRight = rightData[index] ?? 0;
      const absLeft = Math.abs(sampleLeft);
      const absRight = Math.abs(sampleRight);
      if (absLeft > leftPeak) leftPeak = absLeft;
      if (absRight > rightPeak) rightPeak = absRight;
      const mid = Math.abs((sampleLeft + sampleRight) / 2);
      const side = Math.abs((sampleLeft - sampleRight) / 2);
      if (mid > midPeak) midPeak = mid;
      if (side > sidePeak) sidePeak = side;
    }
    return {
      left: leftPeak,
      right: rightPeak,
      mid: midPeak,
      side: sidePeak,
      peak: Math.max(leftPeak, rightPeak) >= PEAK_DISPLAY_THRESHOLD,
    };
  }

  async activate(): Promise<void> {
    if (this.#state === "unavailable") throw new Error("Audio is unavailable in this browser.");
    try {
      if (this.#context === undefined) {
        this.#context = this.#createContext();
        audioContextEvents(this.#context).addEventListener?.(
          "statechange",
          this.#handleContextStateChange,
        );
        this.#clock = new TransportClock(this.#context.sampleRate);
        if (this.#seekTicks !== undefined) {
          this.#clock.seekWhileStopped(this.#seekTicks, this.#currentFrame(this.#context));
        }
        await Promise.all([this.#context.resume(), this.#syncFullProjection()]);
      } else {
        await this.#context.resume();
      }
      this.#setState("active");
    } catch (error) {
      for (const adapter of this.#adapters.values()) adapter.dispose();
      this.#adapters.clear();
      this.#stopAllAuditions();
      if (this.#context !== undefined) {
        audioContextEvents(this.#context).removeEventListener?.(
          "statechange",
          this.#handleContextStateChange,
        );
      }
      void this.#context?.close();
      this.#context = undefined;
      this.#clock = undefined;
      this.#setState("unavailable");
      throw error;
    }
  }

  /**
   * The header power control. Powering off halts the transport and suspends the
   * context; editing stays available. Powering back on is `activate()`, which
   * requires a direct user gesture.
   */
  async powerOff(): Promise<void> {
    this.stop();
    this.#stopAllAuditions();
    const context = this.#context;
    if (context === undefined) return;
    await context.suspend();
    this.#setState("suspended");
  }

  async replaceFromCurrentState(
    modules: readonly TransportModule[],
    projectRevision: StateRevision,
  ): Promise<void> {
    this.#stopAllAuditions();
    this.#projectRevision = projectRevision;
    this.#modules.clear();
    this.#resolvers.clear();
    for (const module of modules) this.#modules.set(module.id, module);
    if (this.#context !== undefined) {
      await this.#syncFullProjection();
      this.#applyMix();
    }
  }

  async project(
    delta: TransportEngineDelta,
    moduleProjection?: TransportModule,
    fullProjection?: readonly TransportModule[],
  ): Promise<void> {
    const advancesProjectRevision =
      delta.kind !== "transport" || typeof delta.payload.tempo === "number";
    if (advancesProjectRevision && this.#isStaleOrDuplicate(delta.projectRevision)) return;
    if (
      this.#projectRevision !== undefined &&
      delta.projectRevision.epoch !== this.#projectRevision.epoch &&
      delta.kind !== "project-replace"
    ) {
      throw new Error("Engine delta changed revision epoch without a full projection.");
    }

    switch (delta.kind) {
      case "project-replace":
        if (fullProjection === undefined) {
          throw new Error("Project replacement requires one bounded full projection.");
        }
        await this.replaceFromCurrentState(fullProjection, delta.projectRevision);
        return;
      case "module-add": {
        if (moduleProjection === undefined) {
          throw new Error("Module addition requires its bounded module projection.");
        }
        this.#setRevision(delta.projectRevision);
        this.#modules.set(moduleProjection.id, moduleProjection);
        if (this.#context !== undefined) {
          const adapter = await this.#ensureAdapter(moduleProjection);
          adapter?.replaceState(moduleProjection.parameters, delta.projectRevision);
        }
        return;
      }
      case "module-remove": {
        const moduleId = readModuleId(delta.payload);
        this.#setRevision(delta.projectRevision);
        this.stopAudition(moduleId);
        this.#modules.delete(moduleId);
        this.#resolvers.delete(moduleId);
        this.#adapters.get(moduleId)?.dispose();
        this.#adapters.delete(moduleId);
        this.#disposeChannel(moduleId);
        this.#applyMix();
        return;
      }
      case "parameter-set": {
        const { moduleId, parameter, value } = readParameterDelta(delta.payload);
        this.#setRevision(delta.projectRevision);
        const module = this.#modules.get(moduleId);
        if (module !== undefined) {
          this.#modules.set(moduleId, {
            ...module,
            parameters: { ...module.parameters, [parameter]: value },
          });
        }
        this.#adapters.get(moduleId)?.setParameters({ [parameter]: value }, delta.projectRevision);
        return;
      }
      case "step-set": {
        const { moduleId, patternIndex, step, active } = readStepDelta(delta.payload);
        this.#setRevision(delta.projectRevision);
        const module = this.#modules.get(moduleId);
        const part = module?.parts[patternIndex];
        if (module !== undefined && part?.[step] !== undefined) {
          this.#modules.set(moduleId, {
            ...module,
            parts: module.parts.map((steps, index) =>
              index === patternIndex
                ? steps.map((value, at) => (at === step ? { ...value, active } : value))
                : steps,
            ),
          });
        }
        return;
      }
      case "module-move":
      case "pattern-rename":
        this.#setRevision(delta.projectRevision);
        return;
      case "pattern-select": {
        this.#setRevision(delta.projectRevision);
        const patternIndex = delta.payload.patternIndex;
        if (typeof patternIndex !== "number" || !Number.isInteger(patternIndex)) return;
        const base = this.#pendingArrangement ?? this.#arrangement;
        this.setArrangement({ ...base, activePatternIndex: patternIndex });
        return;
      }
      case "pattern-timing-set": {
        this.#setRevision(delta.projectRevision);
        const patternIndex = delta.payload.patternIndex;
        if (typeof patternIndex !== "number" || !Number.isInteger(patternIndex)) return;
        const next = [...this.#patternTiming];
        const current = next[patternIndex] ?? { humanize: 0, seed: 0 };
        next[patternIndex] = {
          humanize:
            typeof delta.payload.humanize === "number"
              ? delta.payload.humanize
              : current.humanize,
          seed: typeof delta.payload.seed === "number" ? delta.payload.seed : current.seed,
        };
        this.setPatternTiming(next);
        return;
      }
      case "song-set": {
        this.#setRevision(delta.projectRevision);
        const entries = delta.payload.entries;
        const base = this.#pendingArrangement ?? this.#arrangement;
        this.setArrangement({
          ...base,
          songEnabled: delta.payload.enabled === true,
          songEntries: Array.isArray(entries)
            ? (entries as TransportArrangement["songEntries"])
            : [],
        });
        return;
      }
      case "mixer-set": {
        this.#setRevision(delta.projectRevision);
        if (typeof delta.payload.masterLevel === "number") {
          this.setMasterLevel(delta.payload.masterLevel);
          return;
        }
        const moduleId = readModuleId(delta.payload);
        const module = this.#modules.get(moduleId);
        if (module === undefined) return;
        this.#modules.set(moduleId, { ...module, mix: readMix(module.mix, delta.payload) });
        this.#applyMix();
        return;
      }
      case "transport":
        if (typeof delta.payload.tempo === "number") {
          this.#setRevision(delta.projectRevision);
          this.setTempo(delta.payload.tempo);
        }
        if (typeof delta.payload.swing === "number") this.setSwing(delta.payload.swing);
        // A pause also carries positionTicks, so the start marker key is the
        // seek discriminator.
        if (typeof delta.payload.startMarkerTicks === "number") {
          this.seek(delta.payload.startMarkerTicks);
        }
        return;
    }
  }

  previewParameter(moduleId: ModuleInstanceId, parameter: string, value: ParameterValue): void {
    if (this.#projectRevision === undefined) return;
    this.#adapters.get(moduleId)?.previewParameters({ [parameter]: value });
  }

  /**
   * Transient channel move while a fader is being dragged. It ramps the live
   * mixer node so the gesture is audible, but never touches `#modules`: the
   * committed value still arrives as a `mixer-set` delta at the end of the
   * gesture, and `#applyMix` re-derives every channel from that stored state.
   */
  previewChannelMix(moduleId: ModuleInstanceId, field: "level" | "pan", value: number): void {
    const context = this.#context;
    const channel = this.#channels.get(moduleId);
    if (context === undefined || channel === undefined || !Number.isFinite(value)) return;
    const module = this.#modules.get(moduleId);
    if (field === "pan") {
      setSmoothed(channel.panner.pan, Math.min(1, Math.max(-1, value)), context.currentTime);
      return;
    }
    // A muted or solo-silenced channel stays silent while its fader moves.
    const anySolo = [...this.#modules.values()].some((one) => one.mix.solo);
    const audible = module === undefined || (!module.mix.muted && (!anySolo || module.mix.solo));
    setSmoothed(channel.gain.gain, audible ? clamp01(value) : 0, context.currentTime);
  }

  /** Transient master move while the master fader is being dragged. */
  previewMasterLevel(level: number): void {
    const context = this.#context;
    const master = this.#master;
    if (context === undefined || master === undefined || !Number.isFinite(level)) return;
    setSmoothed(master.gain, clamp01(level), context.currentTime);
  }

  /**
   * Starts a transient voice routed through the module's mixer channel. A
   * dedicated adapter keeps transport notes from stealing the held audition.
   */
  async startAudition(moduleId: ModuleInstanceId, note: number): Promise<void> {
    if (!Number.isFinite(note)) throw new TypeError("Audition note must be finite.");
    const initialModule = this.#modules.get(moduleId);
    if (initialModule === undefined) throw new Error("Cannot audition a missing module.");
    if (this.#adapterFactoryFor(initialModule.pluginId) === undefined) {
      throw new Error("Cannot audition an unregistered plugin.");
    }

    this.stopAudition(moduleId);
    const session: AuditionSession = {};
    this.#auditions.set(moduleId, session);
    await this.activate();
    if (this.#auditions.get(moduleId) !== session) return;

    const context = this.#requiredContext();
    const module = this.#modules.get(moduleId);
    const revision = this.#projectRevision;
    if (module === undefined || revision === undefined) {
      this.stopAudition(moduleId);
      return;
    }
    const factory = this.#adapterFactoryFor(module.pluginId);
    if (factory === undefined) {
      this.stopAudition(moduleId);
      throw new Error("Cannot audition an unregistered plugin.");
    }

    const adapter = factory(context, {
      projectRevision: revision,
      onStatus: (status) => {
        if (status.state !== "recovered") this.stopAudition(moduleId);
        this.#publishAdapterStatus(moduleId, status);
      },
    });
    session.adapter = adapter;
    await adapter.prepare();
    if (this.#auditions.get(moduleId) !== session) {
      adapter.dispose();
      return;
    }
    adapter.activate(this.#ensureChannel(context, moduleId).input);
    adapter.replaceState(module.parameters, revision);
    adapter.schedule([
      {
        atFrame: this.#currentFrame(context) + this.#leadFrames(context),
        type: "note-on",
        note: Math.round(note),
        velocity: 0.8,
        accent: false,
      },
    ]);
  }

  stopAudition(moduleId: ModuleInstanceId): void {
    const session = this.#auditions.get(moduleId);
    if (session === undefined) return;
    session.adapter?.dispose();
    this.#auditions.delete(moduleId);
  }

  setTempo(tempo: number): void {
    const context = this.#context;
    const clock = this.#clock;
    if (context === undefined || clock === undefined) return;
    const frame = this.#currentFrame(context);
    const snapshot = clock.getSnapshot(frame);
    clock.setTempo(tempo, frame);
    if (snapshot.status === "playing")
      this.#reanchor(context, clock, frame, snapshot.positionTicks);
  }

  setSwing(swing: number): void {
    const next = Math.min(1, Math.max(0, Number.isFinite(swing) ? swing : 0));
    if (next === this.#swing) return;
    this.#swing = next;
    const context = this.#context;
    const clock = this.#clock;
    if (context === undefined || clock === undefined) return;
    const frame = this.#currentFrame(context);
    const snapshot = clock.getSnapshot(frame);
    if (snapshot.status === "playing")
      this.#reanchor(context, clock, frame, snapshot.positionTicks);
  }

  setMetronomeEnabled(enabled: boolean): void {
    if (enabled === this.#metronomeEnabled) return;
    this.#metronomeEnabled = enabled;
    if (!enabled) this.#stopScheduledClicks(0);
  }

  /**
   * Positions the playhead and the transport start marker while the transport
   * is not playing. The marker survives even before the first activation: the
   * clock applies it as soon as it exists.
   */
  seek(positionTicks: number): void {
    if (!Number.isSafeInteger(positionTicks) || positionTicks < 0) return;
    const context = this.#context;
    const clock = this.#clock;
    if (context !== undefined && clock !== undefined) {
      const frame = this.#currentFrame(context);
      // A playing seek changes nothing, so the runtime copy must not diverge
      // from the clock's marker either.
      if (clock.getSnapshot(frame).status === "playing") return;
      this.#seekTicks = positionTicks;
      clock.seekWhileStopped(positionTicks, frame);
      return;
    }
    this.#seekTicks = positionTicks;
  }

  async play(tempo: number): Promise<void> {
    await this.activate();
    const context = this.#requiredContext();
    const clock = this.#clock;
    if (clock === undefined) throw new Error("Transport clock has not been created.");
    const frame = this.#currentFrame(context) + this.#leadFrames(context);
    const positionTicks = clock.getSnapshot(frame).positionTicks;
    clock.setTempo(tempo, frame);
    // A second Play while already playing must not rewind the schedule window:
    // that would re-emit onsets the adapters already hold and double the notes.
    if (!clock.play(frame)) return;
    for (const adapter of this.#adapters.values()) adapter.resume();
    this.#patternStartFrame = frame - clock.ticksToFrames(positionTicks);
    this.#nextScheduleFrame = frame;
    this.#startScheduler();
  }

  pause(): number {
    const context = this.#context;
    if (context === undefined) return 0;
    const frame = this.#currentFrame(context);
    this.#clock?.pause(frame);
    this.#stopScheduler();
    this.#stopScheduledClicks(frame);
    this.#applyPendingArrangement();
    for (const adapter of this.#adapters.values()) adapter.suspend();
    return this.#clock?.getSnapshot(frame).positionTicks ?? 0;
  }

  stop(): void {
    const context = this.#context;
    if (context === undefined) return;
    const frame = this.#currentFrame(context);
    this.#clock?.stop(frame);
    this.#stopScheduler();
    this.#stopScheduledClicks(frame);
    this.#applyPendingArrangement();
    for (const adapter of this.#adapters.values()) adapter.suspend();
  }

  dispose(): void {
    this.#stopScheduler();
    this.#stopScheduledClicks(0);
    this.#stopAllAuditions();
    for (const adapter of this.#adapters.values()) adapter.dispose();
    this.#adapters.clear();
    for (const moduleId of [...this.#channels.keys()]) this.#disposeChannel(moduleId);
    this.#master?.disconnect();
    this.#master = undefined;
    this.#limiter?.disconnect();
    this.#limiter = undefined;
    this.#analyserLeft = undefined;
    this.#analyserRight = undefined;
    this.#analysisLeft = undefined;
    this.#analysisRight = undefined;
    this.#metronomeOutput?.disconnect();
    this.#metronomeOutput = undefined;
    if (this.#context !== undefined) {
      audioContextEvents(this.#context).removeEventListener?.(
        "statechange",
        this.#handleContextStateChange,
      );
    }
    void this.#context?.close();
    this.#context = undefined;
    this.#clock = undefined;
    this.#setState("locked");
  }

  readonly #handleContextStateChange = (): void => {
    const state = this.#context?.state as string | undefined;
    if (state === "closed" || state === "interrupted" || state === "suspended") {
      this.#stopAllAuditions();
    }
    // The context is the authority for suspension: a browser-side suspension or
    // interruption shows as suspended even when Pulsebox did not request it. A
    // browser-side resume restores active, but only from suspended: during the
    // first activation the projection is still building, and `activate()` owns
    // that report, so "active" never appears before the voices exist.
    if ((state === "suspended" || state === "interrupted") && this.#state === "active") {
      this.#setState("suspended");
    }
    if (state === "running" && this.#state === "suspended") this.#setState("active");
  };

  #setState(state: AudioRuntimeState): void {
    if (state === this.#state) return;
    this.#state = state;
    this.#onStateChange(state);
  }

  #applyPendingArrangement(): void {
    const pending = this.#pendingArrangement;
    if (pending !== undefined) this.#applyArrangementNow(pending);
  }

  #stopAllAuditions(): void {
    for (const moduleId of [...this.#auditions.keys()]) this.stopAudition(moduleId);
  }

  #currentFrame(context: AudioContext): number {
    return Math.floor(context.currentTime * context.sampleRate);
  }

  #leadFrames(context: AudioContext): number {
    return Math.max(1, Math.ceil(context.sampleRate * SCHEDULER_LEAD_SECONDS));
  }

  /**
   * Re-pins the pattern grid to the musical position the clock reports now and
   * drops anything already queued past the playhead, so a tempo or swing change
   * takes effect without a doubled or dropped step.
   *
   * Clearing the queue also discards the note-off that belonged to a note whose
   * onset already played, and the rebuilt window never re-emits it. Each voice
   * therefore gets one explicit release at the re-anchor point; a note-off with
   * no sounding note is harmless.
   */
  #reanchor(
    context: AudioContext,
    clock: TransportClock,
    frame: number,
    positionTicks: number,
  ): void {
    const releaseFrame = frame + this.#leadFrames(context);
    for (const adapter of this.#adapters.values()) {
      adapter.clearScheduledEvents();
      adapter.schedule([{ atFrame: releaseFrame, type: "note-off" }]);
    }
    this.#stopScheduledClicks(frame);
    this.#patternStartFrame = frame - clock.ticksToFrames(positionTicks);
    this.#nextScheduleFrame = releaseFrame;
    this.#schedule();
  }

  #setRevision(projectRevision: StateRevision): void {
    this.#projectRevision = projectRevision;
    for (const adapter of this.#adapters.values()) adapter.setProjectRevision(projectRevision);
  }

  #isStaleOrDuplicate(projectRevision: StateRevision): boolean {
    const current = this.#projectRevision;
    return projectRevision.epoch === current?.epoch && projectRevision.counter <= current.counter;
  }

  async #syncFullProjection(): Promise<void> {
    const revision = this.#projectRevision;
    if (revision === undefined && this.#modules.size > 0) {
      throw new Error("Transport modules require an authoritative project revision.");
    }
    for (const [id, adapter] of this.#adapters) {
      if (!this.#modules.has(id)) {
        adapter.dispose();
        this.#adapters.delete(id);
      }
    }
    if (revision === undefined) return;
    for (const module of this.#modules.values()) {
      const adapter = await this.#ensureAdapter(module);
      adapter?.replaceState(module.parameters, revision);
    }
  }

  async #ensureAdapter(module: TransportModule): Promise<VoiceAdapterPort | undefined> {
    const context = this.#requiredContext();
    const revision = this.#projectRevision;
    if (revision === undefined) {
      throw new Error("A voice adapter requires an authoritative project revision.");
    }
    const existing = this.#adapters.get(module.id);
    if (existing !== undefined) return existing;

    const factory = this.#adapterFactoryFor(module.pluginId);
    if (factory === undefined) return undefined;
    const adapter = factory(context, {
      projectRevision: revision,
      onStatus: (status) => {
        this.#publishAdapterStatus(module.id, status);
      },
      onMeter: (level) => {
        this.#onMeter(module.id, level);
      },
    });
    await adapter.prepare();
    // Every voice lands on its own mixer channel, never on the destination, so a
    // level or pan change is an AudioParam ramp and never rebuilds a voice.
    adapter.activate(this.#ensureChannel(context, module.id).input);
    this.#adapters.set(module.id, adapter);
    this.#applyMix();
    return adapter;
  }

  /**
   * Builds the master chain once: master gain, then the always-on protective
   * limiter, then the physical destination. The header meters observe the
   * post-limiter signal through a non-audible splitter and two analysers.
   */
  #ensureMaster(context: AudioContext): GainNode {
    let master = this.#master;
    if (master === undefined) {
      master = context.createGain();
      master.gain.value = this.#masterLevel;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.05;
      master.connect(limiter);
      limiter.connect(context.destination);

      const splitter = context.createChannelSplitter(2);
      limiter.connect(splitter);
      const analyserLeft = context.createAnalyser();
      const analyserRight = context.createAnalyser();
      for (const analyser of [analyserLeft, analyserRight]) {
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
      }
      splitter.connect(analyserLeft, 0);
      splitter.connect(analyserRight, 1);

      // The metronome bypasses the master fader but keeps limiter protection,
      // so pulling the mix down never silences the click the user asked for.
      const metronomeOutput = context.createGain();
      metronomeOutput.gain.value = 1;
      metronomeOutput.connect(limiter);

      this.#master = master;
      this.#limiter = limiter;
      this.#analyserLeft = analyserLeft;
      this.#analyserRight = analyserRight;
      this.#analysisLeft = new Float32Array(analyserLeft.fftSize);
      this.#analysisRight = new Float32Array(analyserRight.fftSize);
      this.#metronomeOutput = metronomeOutput;
    }
    return master;
  }

  #ensureChannel(context: AudioContext, moduleId: ModuleInstanceId): MixerChannel {
    let channel = this.#channels.get(moduleId);
    if (channel === undefined) {
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      gain.connect(panner);
      panner.connect(this.#ensureMaster(context));
      channel = { gain, panner, input: gain };
      this.#channels.set(moduleId, channel);
    }
    return channel;
  }

  #disposeChannel(moduleId: ModuleInstanceId): void {
    const channel = this.#channels.get(moduleId);
    if (channel === undefined) return;
    channel.gain.disconnect();
    channel.panner.disconnect();
    this.#channels.delete(moduleId);
  }

  #startScheduler(): void {
    this.#stopScheduler();
    this.#schedule();
    // The timer only decides when to look ahead. Every note carries an absolute
    // frame, so a late or coalesced tick shifts no note.
    this.#timer = setInterval(() => {
      this.#schedule();
    }, SCHEDULER_TICK_MILLISECONDS);
  }

  #stopScheduler(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  #schedule(): void {
    const context = this.#context;
    const clock = this.#clock;
    if (context === undefined || clock === undefined) return;
    const currentFrame = this.#currentFrame(context);
    const windowStart = Math.max(this.#nextScheduleFrame, currentFrame + this.#leadFrames(context));
    const windowEnd = currentFrame + Math.ceil(context.sampleRate * SCHEDULER_LOOKAHEAD_SECONDS);
    if (windowStart >= windowEnd) return;

    const pending = this.#pendingArrangement;
    if (pending === undefined) {
      this.#scheduleWindow(clock, windowStart, windowEnd);
    } else {
      // A queued Pattern launch applies exactly at its quantization boundary:
      // the old arrangement fills the window up to the boundary, the new one
      // fills the rest. The grid anchor never moves, so the launched Pattern
      // starts at the boundary step.
      const stepFrames = Math.max(1, Math.round(clock.ticksToFrames(TICKS_PER_STEP)));
      const quantFrames = stepFrames * this.#launchQuantizationSteps;
      const sinceStart = windowStart - this.#patternStartFrame;
      const boundary =
        this.#patternStartFrame + Math.ceil(sinceStart / quantFrames) * quantFrames;
      if (boundary >= windowEnd) {
        this.#scheduleWindow(clock, windowStart, windowEnd);
      } else {
        if (boundary > windowStart) this.#scheduleWindow(clock, windowStart, boundary);
        this.#applyArrangementNow(pending);
        this.#scheduleWindow(clock, boundary, windowEnd);
      }
    }
    this.#scheduleMetronome(context, clock, windowStart, windowEnd);
    this.#nextScheduleFrame = windowEnd;
  }

  #scheduleWindow(clock: TransportClock, windowStart: number, windowEnd: number): void {
    const stepFrames = Math.max(1, Math.round(clock.ticksToFrames(TICKS_PER_STEP)));
    for (const module of this.#modules.values()) {
      const adapter = this.#adapters.get(module.id);
      if (adapter === undefined) continue;
      adapter.schedule(
        schedulePatternWindow({
          resolveStep: this.#resolverFor(module),
          stepFrames,
          swing: this.#swing,
          patternTiming: this.#patternTiming,
          voiceSalt: voiceSaltFor(module.id),
          windowStartFrame: windowStart,
          windowEndFrame: windowEnd,
          patternStartFrame: this.#patternStartFrame,
        }),
      );
    }
  }

  /** Schedules the metronome clicks whose beats land inside the window. */
  #scheduleMetronome(
    context: AudioContext,
    clock: TransportClock,
    windowStart: number,
    windowEnd: number,
  ): void {
    if (!this.#metronomeEnabled) return;
    // An empty rack builds no mixer channel, so the master chain the click
    // needs may not exist yet.
    if (this.#metronomeOutput === undefined) this.#ensureMaster(context);
    const output = this.#metronomeOutput;
    if (output === undefined) return;
    const stepFrames = Math.max(1, Math.round(clock.ticksToFrames(TICKS_PER_STEP)));
    const beatFrames = stepFrames * STEPS_PER_BEAT;
    const firstBeat = Math.max(0, Math.ceil((windowStart - this.#patternStartFrame) / beatFrames));
    for (let beat = firstBeat; ; beat += 1) {
      const frame = this.#patternStartFrame + beat * beatFrames;
      if (frame >= windowEnd) break;
      if (frame < windowStart) continue;
      this.#scheduleClick(context, output, frame, beat % BEATS_PER_BAR === 0);
    }
  }

  #scheduleClick(
    context: AudioContext,
    output: GainNode,
    frame: number,
    barStart: boolean,
  ): void {
    const time = frame / context.sampleRate;
    const oscillator = context.createOscillator();
    oscillator.frequency.value = barStart ? CLICK_BAR_HZ : CLICK_BEAT_HZ;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(
      barStart ? CLICK_BAR_LEVEL : CLICK_BEAT_LEVEL,
      time + CLICK_ATTACK_SECONDS,
    );
    gain.gain.linearRampToValueAtTime(0, time + CLICK_SECONDS);
    oscillator.connect(gain);
    gain.connect(output);
    const voice: MetronomeVoice = { frame, oscillator, gain };
    this.#metronomeVoices.add(voice);
    oscillator.onended = () => {
      gain.disconnect();
      this.#metronomeVoices.delete(voice);
    };
    oscillator.start(time);
    oscillator.stop(time + CLICK_SECONDS + 0.005);
  }

  /** Silences clicks scheduled at or past `fromFrame`, for stop and reanchor. */
  #stopScheduledClicks(fromFrame: number): void {
    for (const voice of [...this.#metronomeVoices]) {
      if (voice.frame < fromFrame) continue;
      try {
        voice.oscillator.onended = null;
        voice.oscillator.stop();
      } catch {
        // A voice that already ended cannot be stopped again.
      }
      voice.gain.disconnect();
      this.#metronomeVoices.delete(voice);
    }
  }

  /**
   * A voice fault is scoped to its own module. The faulted adapter is released
   * so it stops consuming control data, and every other voice keeps playing.
   * Only a failure to create or resume the audio context makes the whole runtime
   * unavailable, which is what `activate` already reports.
   */
  #publishAdapterStatus(moduleId: ModuleInstanceId, status: VoiceAdapterStatus): void {
    if (status.state === "faulted") {
      this.stopAudition(moduleId);
      this.#adapters.get(moduleId)?.dispose();
      this.#adapters.delete(moduleId);
    } else if (status.state === "recovered") {
      this.#scheduleRecoveredModule(moduleId);
    }
    this.#onStatus(
      status.state === "recovered"
        ? { moduleId, state: "recovered" }
        : { moduleId, state: status.state, fault: status.fault },
    );
  }

  /** Refills the current window for one voice that just came back from a fault. */
  #scheduleRecoveredModule(moduleId: ModuleInstanceId): void {
    const context = this.#context;
    const clock = this.#clock;
    const module = this.#modules.get(moduleId);
    const adapter = this.#adapters.get(moduleId);
    if (
      context === undefined ||
      clock === undefined ||
      module === undefined ||
      adapter === undefined
    ) {
      return;
    }
    const currentFrame = this.#currentFrame(context);
    if (clock.getSnapshot(currentFrame).status !== "playing") return;
    const stepFrames = Math.max(1, Math.round(clock.ticksToFrames(TICKS_PER_STEP)));
    // The refill ends where the shared window already ended. Running past
    // `#nextScheduleFrame` would overlap the next tick's window and double the
    // recovered voice's steps.
    const windowStart = currentFrame + this.#leadFrames(context);
    const windowEnd = Math.min(
      this.#nextScheduleFrame,
      currentFrame + Math.ceil(context.sampleRate * SCHEDULER_LOOKAHEAD_SECONDS),
    );
    if (windowStart >= windowEnd) return;
    adapter.schedule(
      schedulePatternWindow({
        resolveStep: this.#resolverFor(module),
        stepFrames,
        swing: this.#swing,
        patternTiming: this.#patternTiming,
        voiceSalt: voiceSaltFor(module.id),
        windowStartFrame: windowStart,
        windowEndFrame: windowEnd,
        patternStartFrame: this.#patternStartFrame,
      }),
    );
  }

  #requiredContext(): AudioContext {
    if (this.#context === undefined) throw new Error("Audio context has not been created.");
    return this.#context;
  }
}

function readModuleId(payload: Readonly<Record<string, unknown>>): ModuleInstanceId {
  if (typeof payload.moduleId !== "string") {
    throw new TypeError("Engine module delta requires a stable module ID.");
  }
  return payload.moduleId as ModuleInstanceId;
}

function readParameterDelta(payload: Readonly<Record<string, unknown>>): {
  readonly moduleId: ModuleInstanceId;
  readonly parameter: string;
  readonly value: ParameterValue;
} {
  const moduleId = readModuleId(payload);
  if (
    typeof payload.parameter !== "string" ||
    (typeof payload.value !== "string" &&
      typeof payload.value !== "boolean" &&
      (typeof payload.value !== "number" || !Number.isFinite(payload.value)))
  ) {
    throw new TypeError("Engine parameter delta is malformed.");
  }
  return { moduleId, parameter: payload.parameter, value: payload.value };
}

function readStepDelta(payload: Readonly<Record<string, unknown>>): {
  readonly moduleId: ModuleInstanceId;
  readonly patternIndex: number;
  readonly step: number;
  readonly active: boolean;
} {
  const moduleId = readModuleId(payload);
  if (
    !Number.isSafeInteger(payload.step) ||
    typeof payload.step !== "number" ||
    payload.step < 0 ||
    typeof payload.active !== "boolean"
  ) {
    throw new TypeError("Engine step delta is malformed.");
  }
  const patternIndex =
    typeof payload.patternIndex === "number" && Number.isSafeInteger(payload.patternIndex)
      ? payload.patternIndex
      : 0;
  return { moduleId, patternIndex, step: payload.step, active: payload.active };
}

interface MixerChannel {
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
  readonly input: AudioNode;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Deterministic 32-bit salt from a stable module ID string. */
function voiceSaltFor(moduleId: string): number {
  let hash = 0;
  for (let index = 0; index < moduleId.length; index += 1) {
    hash = (Math.imul(hash, 31) + moduleId.charCodeAt(index)) | 0;
  }
  return hash | 0;
}

function audioContextEvents(context: AudioContext): Partial<EventTarget> {
  return context;
}

/**
 * Mixer moves ramp rather than step, so a fader drag cannot produce a click.
 */
const MIX_RAMP_SECONDS = 0.015;

function setSmoothed(param: AudioParam, value: number, now: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + MIX_RAMP_SECONDS);
}

function readMix(
  current: TransportModuleMix,
  payload: Readonly<Record<string, unknown>>,
): TransportModuleMix {
  return {
    level: typeof payload.level === "number" ? payload.level : current.level,
    pan: typeof payload.pan === "number" ? payload.pan : current.pan,
    muted: typeof payload.muted === "boolean" ? payload.muted : current.muted,
    solo: typeof payload.solo === "boolean" ? payload.solo : current.solo,
  };
}
