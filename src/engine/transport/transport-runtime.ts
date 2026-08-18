import type { EngineDelta } from "../../contracts/commands";
import type { EffectInstanceId, ModuleInstanceId, SendBusId, StateRevision } from "../../contracts/ids";
import type { ParameterValue, PluginId } from "../../contracts/parameters";
import {
  MixerRoutingGraph,
  type EffectChainNodeFactory,
  type MasterRoutingProjection,
  type RoutingEffectInstance,
  type SendRoutingProjection,
  type RoutingAutomationChange,
} from "../routing";
import {
  chainedStepResolver,
  loopingStepResolver,
  pendingReleaseEvent,
  schedulePatternAutomationWindow,
  schedulePatternWindow,
  withoutExcludedOccurrences,
  withoutExcludedParameterOccurrences,
  type PatternTiming,
  type PatternWindowRequest,
  type StepResolver,
} from "./pattern-scheduler";
import {
  compareScheduledVoiceEvents,
  SCHEDULED_EVENT_QUEUE_CAPACITY,
  SCHEDULED_PARAMETER_QUEUE_CAPACITY,
  type PatternPartView,
  type ScheduledParameterChange,
  type ScheduledVoiceEvent,
} from "./scheduled-event";
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
  readonly sends?: readonly {
    readonly busId: SendBusId;
    readonly amount: number;
    readonly mode: "pre" | "post";
  }[];
}

export interface TransportModule {
  readonly id: ModuleInstanceId;
  readonly pluginId: PluginId;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly effects?: readonly RoutingEffectInstance[];
  /** One event part per project Pattern slot. */
  readonly parts: readonly PatternPartView[];
  readonly mix: TransportModuleMix;
}

export interface TransportRoutingProjection {
  readonly sends: readonly SendRoutingProjection[];
  readonly master: MasterRoutingProjection;
  readonly automation?: TransportExternalAutomationProjection;
}

export interface TransportExternalAutomationTarget {
  readonly scope: RoutingAutomationChange["scope"];
  readonly targetId: ModuleInstanceId | SendBusId | EffectInstanceId | "master";
  readonly parameterId: string;
}

export interface TransportExternalAutomationProjection {
  /** One automation-only part per Pattern bank position. */
  readonly parts: readonly PatternPartView[];
  /** Scheduler parameter keys resolve to stable routing targets here. */
  readonly targets: Readonly<Record<string, TransportExternalAutomationTarget>>;
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
  | "module-swap"
  | "module-effects-set"
  | "parameter-set"
  | "pattern-events-set"
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

export type TransportRuntimeStatus =
  | {
      readonly moduleId: ModuleInstanceId;
      readonly state: "recovering" | "faulted";
      readonly fault: VoiceFault;
    }
  | { readonly moduleId: ModuleInstanceId; readonly state: "recovered" };

/**
 * Keep half a second of frame-stamped events at each processor. This verified
 * margin is longer than the allowed UI long task, so UI work does not own the
 * next musical deadline. The audio thread still applies each event at its frame.
 */
const SCHEDULER_LOOKAHEAD_SECONDS = 0.5;
const SCHEDULER_TICK_MILLISECONDS = 25;

/**
 * Notes are never scheduled closer than this to the playhead, which keeps a late
 * tick from stamping an event the processor has already passed.
 */
const SCHEDULER_LEAD_SECONDS = 0.02;
const TIMING_REBUILD_LEAD_SECONDS = 0.1;

/** A sixteenth at 960 ticks per quarter. */
const TICKS_PER_STEP = 240;

/** Matches the transport clock's tick resolution. */
const TICKS_PER_QUARTER = 960;

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
  /** Creates prepared AudioWorklet-backed nodes for generic effect chains. */
  readonly effectChainNodeFactory?: EffectChainNodeFactory;
  readonly onStatus?: (status: TransportRuntimeStatus) => void;
  /** Peak output level per module, at the worklet protocol's frame rate. */
  readonly onMeter?: (moduleId: ModuleInstanceId, level: number) => void;
  /** Reports every audio-runtime state change, for the header power control. */
  readonly onStateChange?: (state: AudioRuntimeState) => void;
}

interface AuditionSession {
  adapter?: VoiceAdapterPort;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

/**
 * The old-timing facts a bounded queue clear still needs, captured before the
 * change mutates that timing. The imminent events themselves stay in each
 * processor queue: the clear keeps everything before the rebuild frame.
 */
interface CapturedLeadWindow {
  /** Onsets that the bounded clear keeps before the rebuild frame. */
  readonly keptOccurrences: ReadonlyMap<ModuleInstanceId, ReadonlySet<string>>;
  /** Automation steps that the bounded clear keeps before the rebuild frame. */
  readonly keptParameterOccurrences: ReadonlyMap<ModuleInstanceId, ReadonlySet<string>>;
  /** Old-timing events cleared at the bound, keyed by stable occurrence ID. */
  readonly fallbackOccurrences: ReadonlyMap<
    ModuleInstanceId,
    ReadonlyMap<string, readonly ScheduledVoiceEvent[]>
  >;
  /** Old-timing automation cleared at the bound, keyed by stable occurrence ID. */
  readonly fallbackParameterOccurrences: ReadonlyMap<
    ModuleInstanceId,
    ReadonlyMap<string, readonly ScheduledParameterChange[]>
  >;
  readonly keptExternalAutomationOccurrences: ReadonlySet<string>;
  readonly fallbackExternalAutomationOccurrences: ReadonlyMap<
    string,
    readonly RoutingAutomationOccurrence[]
  >;
  /**
   * The one release per module that the bounded clear drops: the note-off owed
   * by the newest kept onset when that note-off lies at or past the rebuild
   * frame. Re-sent so the kept note still ends on its natural gate.
   */
  readonly releases: ReadonlyMap<ModuleInstanceId, ScheduledVoiceEvent>;
  /** True when a pending Pattern-launch boundary lay inside the window. */
  readonly launchBoundaryInside: boolean;
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
  readonly #effectChainNodeFactory: EffectChainNodeFactory | undefined;
  readonly #onStatus: (status: TransportRuntimeStatus) => void;
  readonly #onMeter: (moduleId: ModuleInstanceId, level: number) => void;
  readonly #onStateChange: (state: AudioRuntimeState) => void;
  readonly #modules = new Map<ModuleInstanceId, TransportModule>();
  readonly #adapters = new Map<ModuleInstanceId, VoiceAdapterPort>();
  readonly #queuedEvents = new Map<ModuleInstanceId, ScheduledVoiceEvent[]>();
  readonly #queuedParameters = new Map<ModuleInstanceId, ScheduledParameterChange[]>();
  #queuedExternalAutomation: RoutingAutomationOccurrence[] = [];
  readonly #auditions = new Map<ModuleInstanceId, AuditionSession>();
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
  #routing: MixerRoutingGraph | undefined;
  #metronomeOutput: GainNode | undefined;
  #metronomeEnabled = false;
  #masterLevel = 0.8;
  #context: AudioContext | undefined;
  #clock: TransportClock | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #projectRevision: StateRevision | undefined;
  #patternStartFrame = 0;
  #nextScheduleFrame = 0;
  #nextAutomationFrame = 0;
  #tempo = 120;
  #swing = 0;
  #patternTiming: readonly PatternTiming[] = [];
  #previewTempo: number | undefined;
  #previewSwing: number | undefined;
  #previewPatternTiming: readonly PatternTiming[] | undefined;
  #timingPreviewTimer: ReturnType<typeof setTimeout> | undefined;
  #arrangement: TransportArrangement = DEFAULT_ARRANGEMENT;
  #routingProjection: TransportRoutingProjection | undefined;
  #externalAutomationResolver:
    | { readonly parts: readonly PatternPartView[]; readonly arrangement: TransportArrangement; readonly resolve: StepResolver }
    | undefined;
  /** A Pattern launch waiting for its quantization boundary. */
  #pendingArrangement: TransportArrangement | undefined;
  #pendingArrangementFrame: number | undefined;
  #launchQuantizationSteps = DEFAULT_LAUNCH_QUANTIZATION_STEPS;
  /** The transport start marker, kept even before the clock exists. */
  #seekTicks: number | undefined;
  #state: AudioRuntimeState = "locked";

  constructor(options: TransportRuntimeOptions) {
    this.#createContext =
      options.createContext ?? (() => new AudioContext({ latencyHint: "interactive" }));
    this.#adapterFactoryFor = options.adapterFactoryFor;
    this.#effectChainNodeFactory = options.effectChainNodeFactory;
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
   * Chooses the resolver for the current arrangement. Song mode keeps each
   * placement repeat count with its part; otherwise the active Pattern loops.
   *
   * Cached per module: this runs for every module on every scheduler tick.
   * Rebuilding the chain forty times a second is work the arrangement does not
   * need, so the cache is cleared whenever the inputs change.
   */
  #resolverFor(
    module: TransportModule,
    arrangement: TransportArrangement = this.#arrangement,
  ): StepResolver {
    const usesCurrentArrangement = arrangement === this.#arrangement;
    const cached = usesCurrentArrangement ? this.#resolvers.get(module.id) : undefined;
    if (cached?.parts === module.parts) return cached.resolve;

    const { activePatternIndex, songEnabled, songEntries } = arrangement;
    let resolve: StepResolver;
    if (!songEnabled || songEntries.length === 0) {
      const part = module.parts[activePatternIndex];
      resolve =
        part === undefined
          ? () => undefined
          : loopingStepResolver(part, activePatternIndex);
    } else {
      const chain: {
        readonly part: PatternPartView;
        readonly patternIndex: number;
        readonly repeats: number;
      }[] = [];
      for (const entry of songEntries) {
        const part = module.parts[entry.patternIndex];
        if (part === undefined) continue;
        chain.push({ part, patternIndex: entry.patternIndex, repeats: entry.repeats });
      }
      resolve = chainedStepResolver(chain);
    }
    if (usesCurrentArrangement) this.#resolvers.set(module.id, { parts: module.parts, resolve });
    return resolve;
  }

  setArrangement(arrangement: TransportArrangement): void {
    const current = this.#pendingArrangement ?? this.#arrangement;
    const sameEntries = sameSongEntries(arrangement.songEntries, current.songEntries);
    const changed =
      arrangement.activePatternIndex !== current.activePatternIndex ||
      arrangement.songEnabled !== current.songEnabled ||
      !sameEntries;
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
      sameEntries &&
      arrangement.activePatternIndex !== current.activePatternIndex;
    if (patternLaunchOnly) {
      const frame = this.#currentFrame(context);
      const releaseFrame = frame + this.#leadFrames(context);
      const stepFrames = this.#exactStepFrames(context, clock, frame);
      const boundary = this.#launchBoundaryFrame(stepFrames, releaseFrame);
      this.#pendingArrangement = arrangement;
      this.#pendingArrangementFrame = boundary;
      // When the boundary lies beyond every queued event, nothing queued
      // crosses it. The queue stays valid and the scheduler splits its next
      // windows at the boundary, so no voice is cut and no onset is dropped.
      if (boundary >= this.#nextScheduleFrame) return;
      // The queued horizon crosses the boundary. Everything before it is the
      // active Pattern, which sounds until the launch, so only the tail from
      // the boundary is dropped and refilled with the launched Pattern. The
      // metronome grid does not move, so the clicks stay untouched.
      for (const [moduleId, adapter] of this.#adapters) {
        const module = this.#modules.get(moduleId);
        if (module === undefined) continue;
        // Humanize can push the last kept onset's release across the on-grid
        // boundary. The bounded clear would drop it, so it is re-sent.
        const release = pendingReleaseEvent(
          this.#moduleWindowRequest(module, stepFrames, frame + 1, boundary),
          boundary,
        );
        this.#clearAdapterQueue(moduleId, adapter, boundary);
        if (release !== undefined) this.#scheduleAdapterEvents(moduleId, adapter, [release]);
        this.#scheduleModuleWindow(
          module,
          adapter,
          stepFrames,
          boundary,
          this.#nextScheduleFrame,
          arrangement,
        );
      }
      this.#clearExternalAutomation(boundary);
      this.#nextAutomationFrame = boundary;
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
    this.#pendingArrangementFrame = undefined;
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
    this.#previewPatternTiming = undefined;
    this.#applyTimingChange({ patternTiming: timing });
  }

  /** Coalesces pointer-rate Humanize previews into one transport update. */
  previewPatternHumanize(patternIndex: number, humanize: number): void {
    if (!Number.isInteger(patternIndex) || patternIndex < 0) return;
    const timing = [...(this.#previewPatternTiming ?? this.#patternTiming)];
    const current = timing[patternIndex] ?? { humanize: 0, seed: 0 };
    timing[patternIndex] = {
      ...current,
      humanize: Math.min(1, Math.max(0, Number.isFinite(humanize) ? humanize : 0)),
    };
    this.#previewPatternTiming = timing;
    this.#scheduleTimingPreview();
  }

  setMasterLevel(level: number): void {
    this.#masterLevel = clamp01(level);
    this.#routing?.setMasterLevel(this.#masterLevel);
  }

  /** Applies level, pan, mute, and the solo-implies-others-muted rule. */
  #applyMix(): void {
    const context = this.#context;
    if (context === undefined) return;
    for (const [id, module] of this.#modules) {
      this.#routing?.setChannelMix(
        id,
        module.mix.level,
        module.mix.pan,
        module.mix.muted,
      );
    }
    this.#routing?.applySoloMute(
      new Map([...this.#modules].map(([id, module]) => [id, module.mix])),
    );
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
    return this.#routing?.getMeter() ?? SILENT_MASTER_METER;
  }

  getMasterChainMeter(position: "pre" | "post"): MasterMeterFrame {
    return this.#routing?.getMasterChainMeter(position) ?? SILENT_MASTER_METER;
  }

  getEffectMeter(effectId: EffectInstanceId, meterId: string): number {
    return this.#routing?.getEffectMeter(effectId, meterId) ?? 0;
  }

  resetMasterPeak(): void {
    this.#routing?.resetPeak();
  }

  setRoutingProjection(projection: TransportRoutingProjection): void {
    const previous = this.#routingProjection;
    this.#routingProjection = projection;
    this.#externalAutomationResolver = undefined;
    const context = this.#context;
    const clock = this.#clock;
    if (previous === undefined || context === undefined || clock === undefined) return;
    const frame = this.#currentFrame(context);
    if (clock.getSnapshot(frame).status !== "playing") return;
    const boundary = frame + this.#leadFrames(context);
    this.#clearExternalAutomation(boundary);
    this.#nextAutomationFrame = boundary;
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
      this.#queuedEvents.clear();
      this.#queuedParameters.clear();
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
    const context = this.#context;
    const clock = this.#clock;
    const wasPlaying =
      context !== undefined &&
      clock?.getSnapshot(this.#currentFrame(context)).status === "playing";
    this.#projectRevision = projectRevision;
    const previousModules = new Map(this.#modules);
    this.#modules.clear();
    this.#resolvers.clear();
    for (const module of modules) this.#modules.set(module.id, module);
    for (const [moduleId, previous] of previousModules) {
      const replacement = this.#modules.get(moduleId);
      if (replacement === undefined) this.#disposeChannel(moduleId);
      if (replacement?.pluginId !== previous.pluginId) {
        this.#adapters.get(moduleId)?.dispose();
        this.#adapters.delete(moduleId);
        this.#queuedEvents.delete(moduleId);
        this.#queuedParameters.delete(moduleId);
      }
    }
    if (context !== undefined) {
      await this.#syncFullProjection();
      this.#applyMix();
      if (wasPlaying) {
        const frame = this.#currentFrame(context);
        this.#reanchor(context, clock, frame, clock.getSnapshot(frame).positionTicks);
      }
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
          await this.#applyChannelRouting(moduleProjection);
          this.#scheduleRecoveredModule(moduleProjection.id);
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
        this.#queuedEvents.delete(moduleId);
        this.#queuedParameters.delete(moduleId);
        this.#disposeChannel(moduleId);
        this.#applyMix();
        return;
      }
      case "module-swap": {
        if (moduleProjection === undefined) {
          throw new Error("Module swap requires its bounded module projection.");
        }
        const moduleId = moduleProjection.id;
        this.#setRevision(delta.projectRevision);
        // Only this module's voice restarts. Its mixer channel stays connected,
        // so unrelated audio and the module's own mix state are untouched.
        this.stopAudition(moduleId);
        this.#modules.set(moduleId, moduleProjection);
        this.#resolvers.delete(moduleId);
        this.#adapters.get(moduleId)?.dispose();
        this.#adapters.delete(moduleId);
        this.#queuedEvents.delete(moduleId);
        this.#queuedParameters.delete(moduleId);
        if (this.#context !== undefined) {
          const adapter = await this.#ensureAdapter(moduleProjection);
          adapter?.replaceState(moduleProjection.parameters, delta.projectRevision);
          await this.#applyChannelRouting(moduleProjection);
          this.#scheduleRecoveredModule(moduleProjection.id);
        }
        return;
      }
      case "module-effects-set": {
        this.#setRevision(delta.projectRevision);
        const audioScope = delta.payload.audioScope;
        if (audioScope === "none") return;
        if (audioScope === "module") {
          if (moduleProjection === undefined) {
            throw new Error("A module effect update requires its bounded module projection.");
          }
          this.#modules.set(moduleProjection.id, moduleProjection);
        }

        const effectId = readOptionalEffectId(delta.payload.effectId);
        if (
          effectId !== undefined &&
          typeof delta.payload.parameterId === "string" &&
          isParameterValue(delta.payload.value)
        ) {
          this.#routing?.setEffectParameter(
            effectId,
            delta.payload.parameterId,
            delta.payload.value,
          );
          return;
        }
        if (effectId !== undefined && typeof delta.payload.wetDry === "number") {
          this.#routing?.setEffectWetDry(effectId, delta.payload.wetDry);
          return;
        }
        if (effectId !== undefined && typeof delta.payload.bypassed === "boolean") {
          this.#routing?.setEffectBypassed(effectId, delta.payload.bypassed);
          return;
        }

        if (audioScope === "send") {
          const busId = readOptionalSendBusId(delta.payload.sendBusId);
          if (busId === undefined) {
            throw new Error("A send effect update requires its send bus ID.");
          }
          if (typeof delta.payload.returnLevel === "number") {
            this.#routing?.setSendReturnLevel(busId, delta.payload.returnLevel);
            return;
          }
          if (typeof delta.payload.bypassed === "boolean") {
            this.#routing?.setSendEffectsBypassed(busId, delta.payload.bypassed);
            return;
          }
          const send = this.#routingProjection?.sends.find(
            (candidate) => candidate.busId === busId,
          );
          if (send === undefined) {
            throw new Error("A send effect update requires its bounded routing projection.");
          }
          await this.#routing?.setSendEffects(busId, send.effects, send.effectsBypassed);
          return;
        }

        if (audioScope === "master") {
          if (typeof delta.payload.masterEffectsBypassed === "boolean") {
            this.#routing?.setMasterEffectsBypassed(delta.payload.masterEffectsBypassed);
            return;
          }
          const master = this.#routingProjection?.master;
          if (master === undefined) {
            throw new Error("A master effect update requires its bounded routing projection.");
          }
          await this.#routing?.setMasterEffects(master);
          return;
        }

        if (audioScope === "module" && moduleProjection !== undefined) {
          await this.#routing?.setChannelEffects(
            moduleProjection.id,
            moduleProjection.effects ?? [],
            false,
          );
          return;
        }
        throw new Error("The effect update has no bounded audio target.");
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
      case "pattern-events-set": {
        if (moduleProjection === undefined) {
          // External mixer and effect lanes do not own a module part. The
          // routing projection was replaced before this delta reached us.
          this.#setRevision(delta.projectRevision);
          return;
        }
        this.#setRevision(delta.projectRevision);
        this.#modules.set(moduleProjection.id, moduleProjection);
        this.#resolvers.delete(moduleProjection.id);
        this.#rescheduleModule(moduleProjection.id);
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
        // Stable-ID Playlist payloads are projected by the composition root.
        // Keep the current engine view when this legacy numeric payload is
        // absent, rather than replacing a valid chain with an empty one.
        if (!Array.isArray(entries)) return;
        const base = this.#pendingArrangement ?? this.#arrangement;
        this.setArrangement({
          ...base,
          songEnabled: delta.payload.enabled === true,
          songEntries: entries as TransportArrangement["songEntries"],
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
        this.#modules.set(
          moduleId,
          moduleProjection ?? { ...module, mix: readMix(module.mix, delta.payload) },
        );
        const updated = this.#modules.get(moduleId);
        if (updated !== undefined) this.#applyChannelMixer(updated);
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
    if (context === undefined || !Number.isFinite(value)) return;
    const module = this.#modules.get(moduleId);
    if (field === "pan") {
      this.#routing?.previewChannelMix(moduleId, field, value);
      return;
    }
    // A muted or solo-silenced channel stays silent while its fader moves.
    const anySolo = [...this.#modules.values()].some((one) => one.mix.solo);
    const audible = module === undefined || (!module.mix.muted && (!anySolo || module.mix.solo));
    this.#routing?.previewChannelMix(moduleId, field, audible ? clamp01(value) : 0);
  }

  /** Transient master move while the master fader is being dragged. */
  previewMasterLevel(level: number): void {
    const context = this.#context;
    if (context === undefined || !Number.isFinite(level)) return;
    this.#routing?.setMasterLevel(level);
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
    try {
      await adapter.prepare();
    } catch (error) {
      // stopAudition disposes the in-flight adapter, and that disposal rejects
      // the pending handshake. A cancelled audition is not a failure.
      if (this.#auditions.get(moduleId) !== session) return;
      throw error;
    }
    if (this.#auditions.get(moduleId) !== session) {
      adapter.dispose();
      return;
    }
    adapter.activate(this.#ensureRouting(context).ensureChannel(moduleId));
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

  /** Plays one transformed Pattern part through a transient module adapter. */
  async previewPatternPart(
    moduleId: ModuleInstanceId,
    part: PatternPartView,
    timing: {
      readonly tempo: number;
      readonly swing: number;
      readonly humanize: number;
      readonly seed: number;
    },
  ): Promise<void> {
    if (!Number.isFinite(timing.tempo) || timing.tempo < 40 || timing.tempo > 240) {
      throw new RangeError("Pattern preview tempo must be from 40 through 240 BPM.");
    }
    const initialModule = this.#modules.get(moduleId);
    if (initialModule === undefined) throw new Error("Cannot preview a missing module.");
    const factory = this.#adapterFactoryFor(initialModule.pluginId);
    if (factory === undefined) throw new Error("Cannot preview an unregistered plugin.");

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
    const adapter = factory(context, {
      projectRevision: revision,
      onStatus: (status) => {
        if (status.state !== "recovered") this.stopAudition(moduleId);
      },
      onMeter: (level) => this.#onMeter(moduleId, level),
    });
    session.adapter = adapter;
    try {
      await adapter.prepare();
    } catch (error) {
      if (this.#auditions.get(moduleId) !== session) return;
      throw error;
    }
    if (this.#auditions.get(moduleId) !== session) {
      adapter.dispose();
      return;
    }
    adapter.activate(this.#ensureRouting(context).ensureChannel(moduleId));
    adapter.replaceState(module.parameters, revision);

    const patternStartFrame = this.#currentFrame(context) + this.#leadFrames(context);
    const stepFrames =
      (TICKS_PER_STEP * 60 * context.sampleRate) / (timing.tempo * TICKS_PER_QUARTER);
    const durationSteps =
      Number.isSafeInteger(part.durationSteps) && (part.durationSteps ?? 0) > 0
        ? (part.durationSteps ?? part.length)
        : part.length;
    const windowEndFrame = patternStartFrame + Math.ceil(durationSteps * stepFrames);
    const request: PatternWindowRequest = {
      resolveStep: loopingStepResolver({ ...part, durationSteps }, 0),
      stepFrames,
      swing: timing.swing,
      patternTiming: [{ humanize: timing.humanize, seed: timing.seed }],
      voiceSalt: voiceSaltFor(moduleId),
      windowStartFrame: patternStartFrame,
      windowEndFrame,
      patternStartFrame,
    };
    const parameters = schedulePatternAutomationWindow(request);
    const events = schedulePatternWindow(request);
    adapter.scheduleParameters(parameters);
    adapter.schedule(events);
    const latestFrame = Math.max(
      windowEndFrame,
      ...parameters.map((change) => change.atFrame),
      ...events.map((event) => event.atFrame),
    );
    const cleanupMilliseconds =
      Math.max(0, ((latestFrame - this.#currentFrame(context)) / context.sampleRate) * 1_000) + 50;
    session.cleanupTimer = setTimeout(() => {
      if (this.#auditions.get(moduleId) === session) this.stopAudition(moduleId);
    }, cleanupMilliseconds);
  }

  stopAudition(moduleId: ModuleInstanceId): void {
    const session = this.#auditions.get(moduleId);
    if (session === undefined) return;
    if (session.cleanupTimer !== undefined) clearTimeout(session.cleanupTimer);
    session.adapter?.dispose();
    this.#auditions.delete(moduleId);
  }

  setTempo(tempo: number): void {
    if (!Number.isFinite(tempo) || tempo < 40 || tempo > 240) return;
    this.#previewTempo = undefined;
    this.#applyTimingChange({ tempo });
  }

  /** Coalesces pointer-rate tempo previews into one transport update. */
  previewTempo(tempo: number): void {
    if (!Number.isFinite(tempo) || tempo < 40 || tempo > 240) return;
    this.#previewTempo = tempo;
    this.#scheduleTimingPreview();
  }

  setSwing(swing: number): void {
    this.#previewSwing = undefined;
    this.#applyTimingChange({ swing });
  }

  /** Coalesces pointer-rate Swing previews into one transport update. */
  previewSwing(swing: number): void {
    this.#previewSwing = Math.min(1, Math.max(0, Number.isFinite(swing) ? swing : 0));
    this.#scheduleTimingPreview();
  }

  #applyTimingChange(change: {
    readonly tempo?: number;
    readonly swing?: number;
    readonly patternTiming?: readonly PatternTiming[];
  }): void {
    const context = this.#context;
    const clock = this.#clock;
    const nextSwing =
      change.swing === undefined
        ? this.#swing
        : Math.min(1, Math.max(0, Number.isFinite(change.swing) ? change.swing : 0));
    const nextPatternTiming = change.patternTiming ?? this.#patternTiming;
    const timingChanged = !samePatternTiming(nextPatternTiming, this.#patternTiming);
    const swingChanged = nextSwing !== this.#swing;

    if (context === undefined || clock === undefined) {
      if (change.tempo !== undefined) this.#tempo = change.tempo;
      this.#swing = nextSwing;
      this.#patternTiming = nextPatternTiming;
      return;
    }
    const frame = this.#currentFrame(context);
    const snapshot = clock.getSnapshot(frame);
    const tempoChanged = change.tempo !== undefined && change.tempo !== snapshot.tempo;
    if (!tempoChanged && !swingChanged && !timingChanged) {
      if (change.tempo !== undefined) this.#tempo = change.tempo;
      return;
    }
    // Capture the lead-window events before the change. The re-anchor below
    // clears each queue, and these events are still due under the timing the
    // listener hears now, so they must survive the rebuild.
    const preserved =
      snapshot.status === "playing"
        ? this.#captureLeadWindow(
            context,
            clock,
            frame,
            tempoChanged
              ? this.#leadFrames(context)
              : this.#timingRebuildLeadFrames(context),
          )
        : undefined;
    if (tempoChanged) {
      this.#tempo = change.tempo ?? snapshot.tempo;
      clock.setTempo(this.#tempo, frame);
      this.#routing?.setTransportTempo(this.#tempo);
    }
    this.#swing = nextSwing;
    this.#patternTiming = nextPatternTiming;
    if (preserved !== undefined) {
      // Only a tempo change stretches the grid around the playhead, so only
      // it re-pins the anchor. Re-deriving the anchor for a Swing or Humanize
      // change would move the whole grid by the clock's float rounding, and
      // that jitter would land audibly in the recomputed events.
      this.#reanchor(context, clock, frame, snapshot.positionTicks, preserved, tempoChanged);
    }
  }

  #scheduleTimingPreview(): void {
    if (this.#timingPreviewTimer !== undefined) return;
    this.#timingPreviewTimer = setTimeout(() => {
      this.#timingPreviewTimer = undefined;
      const tempo = this.#previewTempo;
      const swing = this.#previewSwing;
      const patternTiming = this.#previewPatternTiming;
      this.#previewTempo = undefined;
      this.#previewSwing = undefined;
      this.#previewPatternTiming = undefined;
      this.#applyTimingChange({
        ...(tempo === undefined ? {} : { tempo }),
        ...(swing === undefined ? {} : { swing }),
        ...(patternTiming === undefined ? {} : { patternTiming }),
      });
    }, SCHEDULER_TICK_MILLISECONDS);
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
    if (!Number.isFinite(tempo) || tempo < 40 || tempo > 240) {
      throw new RangeError("Tempo must be from 40 through 240 BPM.");
    }
    await this.activate();
    const context = this.#requiredContext();
    const clock = this.#clock;
    if (clock === undefined) throw new Error("Transport clock has not been created.");
    const frame = this.#currentFrame(context) + this.#leadFrames(context);
    const positionTicks = clock.getSnapshot(frame).positionTicks;
    this.#tempo = tempo;
    clock.setTempo(tempo, frame);
    this.#routing?.setTransportTempo(tempo);
    // A second Play while already playing must not rewind the schedule window:
    // that would re-emit onsets the adapters already hold and double the notes.
    if (!clock.play(frame)) return;
    for (const adapter of this.#adapters.values()) adapter.resume();
    this.#patternStartFrame = frame - clock.ticksToFrames(positionTicks);
    this.#nextScheduleFrame = frame;
    this.#nextAutomationFrame = frame;
    this.#startScheduler(frame);
  }

  pause(): number {
    const context = this.#context;
    if (context === undefined) return 0;
    const frame = this.#currentFrame(context);
    this.#clock?.pause(frame);
    this.#stopScheduler();
    this.#stopScheduledClicks(frame);
    this.#clearExternalAutomation(frame);
    this.#nextAutomationFrame = frame;
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
    this.#clearExternalAutomation(frame);
    this.#nextAutomationFrame = frame;
    this.#applyPendingArrangement();
    for (const adapter of this.#adapters.values()) adapter.suspend();
  }

  dispose(): void {
    this.#stopScheduler();
    if (this.#timingPreviewTimer !== undefined) clearTimeout(this.#timingPreviewTimer);
    this.#timingPreviewTimer = undefined;
    this.#stopScheduledClicks(0);
    this.#stopAllAuditions();
    for (const adapter of this.#adapters.values()) adapter.dispose();
    this.#adapters.clear();
    this.#queuedEvents.clear();
    this.#queuedParameters.clear();
    this.#routing?.dispose();
    this.#routing = undefined;
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

  #timingRebuildLeadFrames(context: AudioContext): number {
    return Math.max(1, Math.ceil(context.sampleRate * TIMING_REBUILD_LEAD_SECONDS));
  }

  #scheduleAdapterEvents(
    moduleId: ModuleInstanceId,
    adapter: VoiceAdapterPort,
    events: readonly ScheduledVoiceEvent[],
  ): void {
    adapter.schedule(events);
    if (events.length === 0) return;
    const queued = this.#queuedEvents.get(moduleId) ?? [];
    queued.push(...events);
    this.#queuedEvents.set(moduleId, queued);
  }

  #scheduleAdapterParameters(
    moduleId: ModuleInstanceId,
    adapter: VoiceAdapterPort,
    parameters: readonly ScheduledParameterChange[],
  ): void {
    adapter.scheduleParameters(parameters);
    if (parameters.length === 0) return;
    const queued = this.#queuedParameters.get(moduleId) ?? [];
    queued.push(...parameters);
    this.#queuedParameters.set(moduleId, queued);
  }

  #pruneQueueLedgers(frame: number, historyFrames: number): void {
    const oldestFrame = frame - historyFrames;
    for (const moduleId of this.#modules.keys()) {
      const events = this.#boundedLedgerEntries(
        this.#queuedEvents.get(moduleId) ?? [],
        oldestFrame,
        frame,
        SCHEDULED_EVENT_QUEUE_CAPACITY,
      );
      const parameters = this.#boundedLedgerEntries(
        this.#queuedParameters.get(moduleId) ?? [],
        oldestFrame,
        frame,
        SCHEDULED_PARAMETER_QUEUE_CAPACITY,
      );
      if (events.length === 0) this.#queuedEvents.delete(moduleId);
      else this.#queuedEvents.set(moduleId, events);
      if (parameters.length === 0) this.#queuedParameters.delete(moduleId);
      else this.#queuedParameters.set(moduleId, parameters);
    }
    this.#queuedExternalAutomation = this.#boundedLedgerEntries(
      this.#queuedExternalAutomation,
      frame - historyFrames,
      frame,
      SCHEDULED_PARAMETER_QUEUE_CAPACITY,
    );
  }

  #boundedLedgerEntries<T extends { readonly atFrame: number }>(
    entries: readonly T[],
    oldestFrame: number,
    frame: number,
    capacity: number,
  ): T[] {
    const recent = entries
      .filter((entry) => entry.atFrame > oldestFrame && entry.atFrame <= frame)
      .sort((left, right) => left.atFrame - right.atFrame)
      .slice(-capacity);
    const future = entries
      .filter((entry) => entry.atFrame > frame)
      .sort((left, right) => left.atFrame - right.atFrame)
      .slice(0, capacity);
    return [...recent, ...future];
  }

  #clearAdapterQueue(
    moduleId: ModuleInstanceId,
    adapter: VoiceAdapterPort,
    fromFrame?: number,
  ): void {
    adapter.clearScheduledEvents(fromFrame);
    if (fromFrame === undefined) {
      this.#queuedEvents.delete(moduleId);
      this.#queuedParameters.delete(moduleId);
      return;
    }
    this.#queuedEvents.set(
      moduleId,
      (this.#queuedEvents.get(moduleId) ?? []).filter((event) => event.atFrame < fromFrame),
    );
    this.#queuedParameters.set(
      moduleId,
      (this.#queuedParameters.get(moduleId) ?? []).filter(
        (parameter) => parameter.atFrame < fromFrame,
      ),
    );
  }

  /**
   * Re-pins the pattern grid to the musical position the clock reports now and
   * drops anything already queued past the playhead, so a tempo or swing change
   * takes effect without a doubled or dropped step.
   *
   * With a capture, the clear is bounded: every queued event before the rebuild
   * frame stays in the processor queue exactly as it was sent, so a preview
   * flush never drops an imminent step. The one release the bounded clear drops
   * is re-sent, so the kept note still ends on its natural gate. Without a
   * capture, the whole queue clears and each voice gets one explicit release at
   * the re-anchor point; a note-off with no sounding note is harmless.
   *
   * A preserved rebuild also plays each step exactly once across the change.
   * The kept events keep their old-timing frames. A catch-up window under the
   * new timing rescues a step the change pulled into the lead window, and the
   * per-module step filter keeps the rebuild from re-emitting a step the kept
   * queue already carries.
   */
  #reanchor(
    context: AudioContext,
    clock: TransportClock,
    frame: number,
    positionTicks: number,
    preserved?: CapturedLeadWindow,
    repinGrid = true,
  ): void {
    const releaseFrame =
      frame +
      (preserved !== undefined && !repinGrid
        ? this.#timingRebuildLeadFrames(context)
        : this.#leadFrames(context));
    if (preserved === undefined) {
      for (const [moduleId, adapter] of this.#adapters) {
        this.#clearAdapterQueue(moduleId, adapter);
        this.#scheduleAdapterEvents(moduleId, adapter, [
          { atFrame: releaseFrame, type: "note-off" },
        ]);
      }
      this.#stopScheduledClicks(frame);
    } else {
      // The kept lead window still sounds, so only the events and clicks at
      // or past the rebuild point are replaced.
      for (const [moduleId, adapter] of this.#adapters) {
        this.#clearAdapterQueue(moduleId, adapter, releaseFrame);
      }
      this.#stopScheduledClicks(releaseFrame);
    }
    this.#clearExternalAutomation(releaseFrame);
    // A Swing or Humanize change keeps the anchor: re-deriving it through the
    // clock's float path can move the whole grid by a frame per flush.
    if (repinGrid) this.#patternStartFrame = frame - clock.ticksToFrames(positionTicks);
    const stepFrames = this.#exactStepFrames(context, clock, frame);
    if (this.#pendingArrangement !== undefined) {
      if (preserved?.launchBoundaryInside === true) {
        // The kept queue already plays the launched Pattern from its
        // boundary, so this rebuild commits the launch.
        this.#applyArrangementNow(this.#pendingArrangement);
      } else {
        this.#pendingArrangementFrame = this.#launchBoundaryFrame(stepFrames, releaseFrame);
      }
    }
    if (preserved !== undefined) {
      this.#scheduleCatchUpWindows(context, preserved, stepFrames, frame, releaseFrame);
    }
    this.#nextScheduleFrame = releaseFrame;
    this.#nextAutomationFrame = releaseFrame;
    // The filter matters only inside this first rebuilt window: a shifted step
    // near the boundary cannot move past the current lookahead horizon, and
    // every later window holds only higher step indexes.
    this.#schedule(
      preserved?.keptOccurrences,
      preserved?.keptParameterOccurrences,
      undefined,
      preserved?.keptExternalAutomationOccurrences,
      preserved?.fallbackExternalAutomationOccurrences,
    );
  }

  /**
   * Sends each module the events the bounded clear cannot keep: the dropped
   * release of the newest kept onset, and a catch-up window under the new
   * timing that rescues a step whose onset the change pulled into the lead
   * window. The exclusive step filter keeps the catch-up from re-emitting a
   * step the kept queue already carries.
   */
  #scheduleCatchUpWindows(
    context: AudioContext,
    preserved: CapturedLeadWindow,
    stepFrames: number,
    frame: number,
    releaseFrame: number,
  ): void {
    const batches: {
      readonly moduleId: ModuleInstanceId;
      readonly adapter: VoiceAdapterPort;
      readonly events: readonly ScheduledVoiceEvent[];
      readonly parameters: readonly ScheduledParameterChange[];
    }[] = [];
    for (const [moduleId, adapter] of this.#adapters) {
      const module = this.#modules.get(moduleId);
      const events: ScheduledVoiceEvent[] = [];
      let parameters: readonly ScheduledParameterChange[] = [];
      const release = preserved.releases.get(moduleId);
      if (release !== undefined) events.push(release);
      if (module !== undefined) {
        const request = this.#moduleWindowRequest(
          module,
          stepFrames,
          frame + 1,
          releaseFrame,
          this.#arrangement,
        );
        events.push(
          ...withoutExcludedOccurrences(
            schedulePatternWindow(request),
            preserved.keptOccurrences.get(moduleId),
          ),
        );
        parameters = withoutExcludedParameterOccurrences(
          schedulePatternAutomationWindow(request),
          preserved.keptParameterOccurrences.get(moduleId),
        );
      }
      events.sort(compareScheduledVoiceEvents);
      batches.push({ moduleId, adapter, events, parameters });
    }
    // Use one cutoff for all modules. A loaded main thread can cross an onset
    // while it builds the batches. It must not send that onset to only the
    // adapters visited before the clock boundary.
    const sendFrame = this.#currentFrame(context);
    for (const { moduleId, adapter, events, parameters } of batches) {
      const expiredParameterOccurrenceIds = new Set(
        parameters.flatMap((change) =>
          change.atFrame < sendFrame && change.occurrenceId !== undefined
            ? [change.occurrenceId]
            : [],
        ),
      );
      const dueParameters = parameters.filter(
        (change) =>
          change.atFrame >= sendFrame &&
          (change.occurrenceId === undefined ||
            !expiredParameterOccurrenceIds.has(change.occurrenceId)),
      );
      const parameterFallbacks = preserved.fallbackParameterOccurrences.get(moduleId);
      for (const occurrenceId of expiredParameterOccurrenceIds) {
        const fallback = parameterFallbacks?.get(occurrenceId);
        if (fallback?.some((change) => change.atFrame >= sendFrame) === true) {
          dueParameters.push(...fallback);
        }
      }
      dueParameters.sort(
        (left, right) =>
          left.atFrame - right.atFrame || left.parameterId.localeCompare(right.parameterId),
      );
      if (dueParameters.length > 0) {
        this.#scheduleAdapterParameters(moduleId, adapter, dueParameters);
      }
      const expiredOccurrenceIds = new Set(
        events.flatMap((event) =>
          event.type === "note-on" &&
          event.atFrame < sendFrame &&
          event.occurrenceId !== undefined
            ? [event.occurrenceId]
            : [],
        ),
      );
      const due = [...withoutExpiredOnsets(events, sendFrame)].filter(
        (event) =>
          event.occurrenceId === undefined || !expiredOccurrenceIds.has(event.occurrenceId),
      );
      const fallbacks = preserved.fallbackOccurrences.get(moduleId);
      for (const occurrenceId of expiredOccurrenceIds) {
        const fallback = fallbacks?.get(occurrenceId);
        if (
          fallback?.some(
            (event) => event.type === "note-on" && event.atFrame >= sendFrame,
          ) === true
        ) {
          due.push(...fallback);
        }
      }
      due.sort(compareScheduledVoiceEvents);
      if (due.length > 0) this.#scheduleAdapterEvents(moduleId, adapter, due);
    }
    const externalProjection = this.#routingProjection?.automation;
    if (externalProjection !== undefined && this.#routing !== undefined) {
      const replacements = scheduleExternalAutomationWindow(externalProjection, {
        resolveStep: this.#externalResolverFor(externalProjection.parts, this.#arrangement),
        stepFrames,
        swing: this.#swing,
        patternTiming: this.#patternTiming,
        windowStartFrame: frame + 1,
        windowEndFrame: releaseFrame,
        patternStartFrame: this.#patternStartFrame,
        maximumEvents: SCHEDULED_PARAMETER_QUEUE_CAPACITY,
      }).filter(
        (change) =>
          change.occurrenceId === undefined ||
          !preserved.keptExternalAutomationOccurrences.has(change.occurrenceId),
      );
      const expiredIds = new Set(
        replacements.flatMap((change) =>
          change.atFrame < sendFrame && change.occurrenceId !== undefined
            ? [change.occurrenceId]
            : [],
        ),
      );
      const due = replacements.filter(
        (change) =>
          change.atFrame >= sendFrame &&
          (change.occurrenceId === undefined || !expiredIds.has(change.occurrenceId)),
      );
      for (const occurrenceId of expiredIds) {
        const fallback = preserved.fallbackExternalAutomationOccurrences.get(occurrenceId);
        if (fallback?.some((change) => change.atFrame >= sendFrame) === true) {
          due.push(...fallback);
        }
      }
      this.#scheduleExternalAutomationChanges(due);
    }
  }

  /**
   * Frames per sixteenth, unrounded. Each onset rounds once from the exact
   * product, so the audible grid cannot drift by an accumulated per-step
   * rounding error. Uses the same tick contract as the transport clock.
   */
  #exactStepFrames(context: AudioContext, clock: TransportClock, frame: number): number {
    const tempo = clock.getSnapshot(frame).tempo;
    return (TICKS_PER_STEP * 60 * context.sampleRate) / (tempo * TICKS_PER_QUARTER);
  }

  /**
   * The next quantized launch boundary at or after `fromFrame`. The boundary
   * is inclusive: a request that lands exactly on a boundary launches there.
   * `fromFrame` is already lead time ahead of the playhead, so the result is
   * always a future frame.
   */
  #launchBoundaryFrame(stepFrames: number, fromFrame: number): number {
    const quantFrames = stepFrames * this.#launchQuantizationSteps;
    const sinceStart = Math.max(0, fromFrame - this.#patternStartFrame);
    return (
      this.#patternStartFrame + Math.round(Math.ceil(sinceStart / quantFrames) * quantFrames)
    );
  }

  /**
   * The old-timing facts a bounded queue clear still needs. The controller
   * ledger contains exactly what it sent to each processor. This avoids
   * inferring a kept occurrence that an earlier rebuild did not queue.
   */
  #captureLeadWindow(
    context: AudioContext,
    clock: TransportClock,
    frame: number,
    leadFrames: number,
  ): CapturedLeadWindow {
    const releaseFrame = frame + leadFrames;
    const stepFrames = this.#exactStepFrames(context, clock, frame);
    this.#pruneQueueLedgers(frame, 2 * stepFrames);
    const launchBoundaryInside =
      this.#pendingArrangement !== undefined &&
      this.#pendingArrangementFrame !== undefined &&
      this.#pendingArrangementFrame < releaseFrame;
    const keptOccurrences = new Map<ModuleInstanceId, ReadonlySet<string>>();
    const keptParameterOccurrences = new Map<ModuleInstanceId, ReadonlySet<string>>();
    const fallbackOccurrences = new Map<
      ModuleInstanceId,
      ReadonlyMap<string, readonly ScheduledVoiceEvent[]>
    >();
    const fallbackParameterOccurrences = new Map<
      ModuleInstanceId,
      ReadonlyMap<string, readonly ScheduledParameterChange[]>
    >();
    const releases = new Map<ModuleInstanceId, ScheduledVoiceEvent>();
    for (const module of this.#modules.values()) {
      if (!this.#adapters.has(module.id)) continue;
      const queuedEvents = this.#queuedEvents.get(module.id) ?? [];
      const queuedParameters = this.#queuedParameters.get(module.id) ?? [];
      const request = this.#moduleWindowRequest(
        module,
        stepFrames,
        frame - 2 * stepFrames,
        releaseFrame,
        this.#arrangement,
      );
      keptOccurrences.set(
        module.id,
        new Set(
          queuedEvents.flatMap((event) =>
            event.type === "note-on" &&
            event.atFrame < releaseFrame &&
            event.occurrenceId !== undefined
              ? [event.occurrenceId]
              : [],
          ),
        ),
      );
      const fallbackIds = new Set(
        queuedEvents.flatMap((event) =>
          event.type === "note-on" &&
          event.atFrame >= releaseFrame &&
          event.occurrenceId !== undefined
            ? [event.occurrenceId]
            : [],
        ),
      );
      const byOccurrence = new Map<string, ScheduledVoiceEvent[]>();
      for (const event of queuedEvents) {
        const occurrenceId = event.occurrenceId;
        if (occurrenceId === undefined || !fallbackIds.has(occurrenceId)) continue;
        const events = byOccurrence.get(occurrenceId);
        if (events === undefined) byOccurrence.set(occurrenceId, [event]);
        else events.push(event);
      }
      fallbackOccurrences.set(module.id, byOccurrence);
      const fallbackParameterIds = new Set(
        queuedParameters
          .filter((change) => change.atFrame >= releaseFrame)
          .map((change) => change.occurrenceId)
          .filter((id): id is string => id !== undefined),
      );
      const parametersByOccurrence = new Map<string, ScheduledParameterChange[]>();
      for (const change of queuedParameters) {
        const occurrenceId = change.occurrenceId;
        if (occurrenceId === undefined || !fallbackParameterIds.has(occurrenceId)) continue;
        const changes = parametersByOccurrence.get(occurrenceId);
        if (changes === undefined) parametersByOccurrence.set(occurrenceId, [change]);
        else changes.push(change);
      }
      fallbackParameterOccurrences.set(module.id, parametersByOccurrence);
      keptParameterOccurrences.set(
        module.id,
        new Set(
          queuedParameters
            .filter((change) => change.atFrame < releaseFrame)
            .map((change) => change.occurrenceId)
            .filter((id): id is string => id !== undefined),
        ),
      );
      // The one note-off the bounded clear drops: the release owed by the
      // newest kept onset when it lands at or past the rebuild frame. The
      // sounding note predates any pending launch, so its release always
      // derives from the active arrangement.
      const release = pendingReleaseEvent(request, releaseFrame);
      if (release !== undefined) releases.set(module.id, release);
    }
    const keptExternalAutomationOccurrences = new Set(
      this.#queuedExternalAutomation
        .filter((change) => change.atFrame < releaseFrame)
        .map((change) => change.occurrenceId)
        .filter((id): id is string => id !== undefined),
    );
    const fallbackExternalAutomationOccurrences = new Map<
      string,
      RoutingAutomationOccurrence[]
    >();
    for (const change of this.#queuedExternalAutomation) {
      if (change.atFrame < releaseFrame || change.occurrenceId === undefined) continue;
      const existing = fallbackExternalAutomationOccurrences.get(change.occurrenceId);
      if (existing === undefined) {
        fallbackExternalAutomationOccurrences.set(change.occurrenceId, [change]);
      } else {
        existing.push(change);
      }
    }
    return {
      keptOccurrences,
      keptParameterOccurrences,
      fallbackOccurrences,
      fallbackParameterOccurrences,
      keptExternalAutomationOccurrences,
      fallbackExternalAutomationOccurrences,
      releases,
      launchBoundaryInside,
    };
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
        this.#queuedEvents.delete(id);
        this.#queuedParameters.delete(id);
      }
    }
    if (revision === undefined) return;
    for (const module of this.#modules.values()) {
      const adapter = await this.#ensureAdapter(module);
      adapter?.replaceState(module.parameters, revision);
      await this.#applyChannelRouting(module);
    }
    const routing = this.#routing;
    if (routing !== undefined && this.#routingProjection !== undefined) {
      await Promise.all(
        this.#routingProjection.sends.map((send) => routing.setSend(send)),
      );
      await routing.setMaster(this.#routingProjection.master);
    }
    this.#applyMix();
  }

  #clearExternalAutomation(fromFrame?: number): void {
    const routing = this.#routing;
    if (routing === undefined) return;
    if (fromFrame === undefined) {
      const frame = this.#context === undefined ? 0 : this.#currentFrame(this.#context);
      routing.clearAutomation(frame);
      this.#queuedExternalAutomation = [];
      return;
    }
    routing.clearAutomation(fromFrame);
    this.#queuedExternalAutomation = this.#queuedExternalAutomation.filter(
      (change) => change.atFrame < fromFrame,
    );
  }

  /** Transient channel-send amount while its control is moving. */
  previewChannelSendAmount(moduleId: ModuleInstanceId, busId: SendBusId, amount: number): void {
    if (this.#context === undefined || !Number.isFinite(amount)) return;
    this.#routing?.previewChannelSendAmount(moduleId, busId, amount);
  }

  /** Transient send-return level while its Mix control is moving. */
  previewSendReturnLevel(busId: SendBusId, returnLevel: number): void {
    if (this.#context === undefined || !Number.isFinite(returnLevel)) return;
    this.#routing?.previewSendReturnLevel(busId, returnLevel);
  }

  /** Transient effect wet/dry value while its control is moving. */
  previewEffectWetDry(effectId: EffectInstanceId, wetDry: number): void {
    if (this.#context === undefined || !Number.isFinite(wetDry)) return;
    this.#routing?.previewEffectWetDry(effectId, wetDry);
  }

  /** Transient numeric effect parameter while its control is moving. */
  previewEffectParameter(
    effectId: EffectInstanceId,
    parameterId: string,
    value: ParameterValue,
  ): void {
    if (this.#context === undefined) return;
    this.#routing?.previewEffectParameter(effectId, parameterId, value);
  }

  async #applyChannelRouting(module: TransportModule): Promise<void> {
    await this.#routing?.setChannel(module.id, {
      level: module.mix.level,
      pan: module.mix.pan,
      muted: module.mix.muted,
      solo: module.mix.solo,
      sends: module.mix.sends ?? [],
      effects: module.effects ?? [],
      effectsBypassed: false,
    });
  }

  #applyChannelMixer(module: TransportModule): void {
    const routing = this.#routing;
    if (routing === undefined) return;
    routing.setChannelMix(module.id, module.mix.level, module.mix.pan, module.mix.muted);
    for (const send of module.mix.sends ?? []) {
      routing.setChannelSend(module.id, send.busId, send.amount, send.mode);
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
    adapter.activate(this.#ensureRouting(context, module.id).ensureChannel(module.id));
    this.#adapters.set(module.id, adapter);
    this.#applyMix();
    return adapter;
  }

  #ensureRouting(context: AudioContext, initialModuleId?: ModuleInstanceId): MixerRoutingGraph {
    let routing = this.#routing;
    if (routing === undefined) {
      routing = new MixerRoutingGraph(context, this.#effectChainNodeFactory, initialModuleId);
      routing.setMasterLevel(this.#masterLevel);
      routing.setTransportTempo(this.#tempo);
      this.#routing = routing;
      // The metronome bypasses the master fader but keeps limiter protection.
      const metronomeOutput = context.createGain();
      metronomeOutput.gain.value = 1;
      routing.connectMetronome(metronomeOutput);
      this.#metronomeOutput = metronomeOutput;
    }
    return routing;
  }

  #disposeChannel(moduleId: ModuleInstanceId): void {
    this.#routing?.removeChannel(moduleId);
  }

  /**
   * The first scheduling pass owns the Play anchor. A later `currentFrame`
   * read would move its lead boundary forward and exclude step zero before it
   * can reach every processor. Later passes always use the current lead.
   */
  #startScheduler(initialWindowStart?: number): void {
    this.#stopScheduler();
    this.#schedule(undefined, undefined, initialWindowStart);
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

  #schedule(
    excludedOccurrences?: ReadonlyMap<ModuleInstanceId, ReadonlySet<string>>,
    excludedParameterOccurrences?: ReadonlyMap<ModuleInstanceId, ReadonlySet<string>>,
    initialWindowStart?: number,
    excludedExternalAutomationOccurrences?: ReadonlySet<string>,
    externalAutomationFallbacks?: ReadonlyMap<string, readonly RoutingAutomationOccurrence[]>,
  ): void {
    const context = this.#context;
    const clock = this.#clock;
    if (context === undefined || clock === undefined) return;
    const currentFrame = this.#currentFrame(context);
    const stepFrames = this.#exactStepFrames(context, clock, currentFrame);
    this.#pruneQueueLedgers(currentFrame, 2 * stepFrames);
    // A late pass starts at one shared future boundary. It never replays an
    // expired sequence at the first sample of the next render block. All module
    // adapters receive the same boundary, so recovery cannot split the rack.
    const windowStart = initialWindowStart ?? Math.max(
      this.#nextScheduleFrame,
      currentFrame + this.#leadFrames(context),
    );
    const windowEnd =
      currentFrame + Math.ceil(context.sampleRate * SCHEDULER_LOOKAHEAD_SECONDS);
    if (windowStart >= windowEnd) return;

    const pending = this.#pendingArrangement;
    if (pending === undefined) {
      this.#scheduleWindow(
        stepFrames,
        windowStart,
        windowEnd,
        this.#arrangement,
        excludedOccurrences,
        excludedParameterOccurrences,
      );
    } else {
      // A queued Pattern launch applies exactly at its quantization boundary:
      // the old arrangement fills the window up to the boundary, the new one
      // fills the rest. The grid anchor never moves, so the launched Pattern
      // starts at the boundary step.
      const boundary = this.#pendingArrangementFrame ?? windowEnd;
      if (currentFrame >= boundary) {
        this.#applyArrangementNow(pending);
        this.#scheduleWindow(stepFrames, windowStart, windowEnd, this.#arrangement, excludedOccurrences, excludedParameterOccurrences);
      } else if (boundary >= windowEnd) {
        this.#scheduleWindow(stepFrames, windowStart, windowEnd, this.#arrangement, excludedOccurrences, excludedParameterOccurrences);
      } else {
        if (boundary > windowStart) {
          this.#scheduleWindow(stepFrames, windowStart, boundary, this.#arrangement, excludedOccurrences, excludedParameterOccurrences);
        }
        this.#scheduleWindow(
          stepFrames,
          Math.max(windowStart, boundary),
          windowEnd,
          pending,
          excludedOccurrences,
          excludedParameterOccurrences,
        );
      }
    }
    this.#scheduleMetronome(context, stepFrames, windowStart, windowEnd);
    this.#scheduleExternalAutomation(
      stepFrames,
      currentFrame,
      windowEnd,
      excludedExternalAutomationOccurrences,
      externalAutomationFallbacks,
    );
    this.#nextScheduleFrame = windowEnd;
  }

  #scheduleExternalAutomation(
    stepFrames: number,
    currentFrame: number,
    windowEnd: number,
    excludedOccurrences?: ReadonlySet<string>,
    fallbackOccurrences?: ReadonlyMap<string, readonly RoutingAutomationOccurrence[]>,
  ): void {
    const projection = this.#routingProjection?.automation;
    const routing = this.#routing;
    if (projection === undefined || routing === undefined) return;
    const windowStart = this.#nextAutomationFrame;
    if (windowStart >= windowEnd) return;
    const pending = this.#pendingArrangement;
    const boundary = this.#pendingArrangementFrame;
    if (pending !== undefined && boundary !== undefined && boundary > windowStart && boundary < windowEnd) {
      this.#scheduleExternalAutomationRange(projection, stepFrames, windowStart, boundary, this.#arrangement, currentFrame, excludedOccurrences, fallbackOccurrences);
      this.#scheduleExternalAutomationRange(projection, stepFrames, boundary, windowEnd, pending, currentFrame, excludedOccurrences, fallbackOccurrences);
    } else {
      const arrangement = pending !== undefined && boundary !== undefined && boundary <= windowStart
        ? pending
        : this.#arrangement;
      this.#scheduleExternalAutomationRange(projection, stepFrames, windowStart, windowEnd, arrangement, currentFrame, excludedOccurrences, fallbackOccurrences);
    }
    this.#nextAutomationFrame = windowEnd;
  }

  #scheduleExternalAutomationRange(
    projection: TransportExternalAutomationProjection,
    stepFrames: number,
    windowStartFrame: number,
    windowEndFrame: number,
    arrangement: TransportArrangement,
    currentFrame: number,
    excludedOccurrences?: ReadonlySet<string>,
    fallbackOccurrences?: ReadonlyMap<string, readonly RoutingAutomationOccurrence[]>,
  ): void {
    const replacements = scheduleExternalAutomationWindow(projection, {
      resolveStep: this.#externalResolverFor(projection.parts, arrangement),
      stepFrames,
      swing: this.#swing,
      patternTiming: this.#patternTiming,
      windowStartFrame,
      windowEndFrame,
      patternStartFrame: this.#patternStartFrame,
      maximumEvents: SCHEDULED_PARAMETER_QUEUE_CAPACITY,
    }).filter(
      (change) =>
        change.occurrenceId === undefined || !excludedOccurrences?.has(change.occurrenceId),
    );
    const expiredIds = new Set(
      replacements.flatMap((change) =>
        change.atFrame < currentFrame && change.occurrenceId !== undefined
          ? [change.occurrenceId]
          : [],
      ),
    );
    const changes = replacements.filter(
      (change) =>
        change.atFrame >= currentFrame &&
        (change.occurrenceId === undefined || !expiredIds.has(change.occurrenceId)),
    );
    for (const occurrenceId of expiredIds) {
      const fallback = fallbackOccurrences?.get(occurrenceId);
      if (fallback?.some((change) => change.atFrame >= currentFrame) === true) {
        changes.push(...fallback);
      }
    }
    this.#scheduleExternalAutomationChanges(changes);
  }

  #scheduleExternalAutomationChanges(
    changes: readonly RoutingAutomationOccurrence[],
  ): void {
    if (changes.length === 0) return;
    this.#routing?.scheduleAutomation(changes);
    this.#queuedExternalAutomation.push(...changes);
    this.#queuedExternalAutomation = this.#boundedLedgerEntries(
      this.#queuedExternalAutomation,
      Number.NEGATIVE_INFINITY,
      this.#context === undefined ? 0 : this.#currentFrame(this.#context),
      SCHEDULED_PARAMETER_QUEUE_CAPACITY,
    );
  }

  #externalResolverFor(
    parts: readonly PatternPartView[],
    arrangement: TransportArrangement,
  ): StepResolver {
    const cached = this.#externalAutomationResolver;
    if (cached?.parts === parts && cached.arrangement === arrangement) return cached.resolve;
    const { activePatternIndex, songEnabled, songEntries } = arrangement;
    let resolve: StepResolver;
    if (!songEnabled || songEntries.length === 0) {
      const part = parts[activePatternIndex];
      resolve = part === undefined ? () => undefined : loopingStepResolver(part, activePatternIndex);
    } else {
      const chain = songEntries.flatMap((entry) => {
        const part = parts[entry.patternIndex];
        return part === undefined ? [] : [{ part, patternIndex: entry.patternIndex, repeats: entry.repeats }];
      });
      resolve = chainedStepResolver(chain);
    }
    this.#externalAutomationResolver = { parts, arrangement, resolve };
    return resolve;
  }

  #scheduleWindow(
    stepFrames: number,
    windowStart: number,
    windowEnd: number,
    arrangement: TransportArrangement = this.#arrangement,
    excludedOccurrences?: ReadonlyMap<ModuleInstanceId, ReadonlySet<string>>,
    excludedParameterOccurrences?: ReadonlyMap<ModuleInstanceId, ReadonlySet<string>>,
  ): void {
    for (const module of this.#modules.values()) {
      const adapter = this.#adapters.get(module.id);
      if (adapter === undefined) continue;
      this.#scheduleModuleWindow(
        module,
        adapter,
        stepFrames,
        windowStart,
        windowEnd,
        arrangement,
        excludedOccurrences?.get(module.id),
        excludedParameterOccurrences?.get(module.id),
      );
    }
  }

  #moduleWindowRequest(
    module: TransportModule,
    stepFrames: number,
    windowStart: number,
    windowEnd: number,
    arrangement: TransportArrangement = this.#arrangement,
  ): PatternWindowRequest {
    return {
      resolveStep: this.#resolverFor(module, arrangement),
      stepFrames,
      swing: this.#swing,
      patternTiming: this.#patternTiming,
      voiceSalt: voiceSaltFor(module.id),
      windowStartFrame: windowStart,
      windowEndFrame: windowEnd,
      patternStartFrame: this.#patternStartFrame,
      // An explicit bound makes the scheduler truncate a dense window at the
      // queue capacity instead of throwing inside a playback tick. A throw here
      // would wedge a playing transport: the tick dies before the window
      // advances, so earlier modules re-send and later modules go silent.
      maximumEvents: SCHEDULED_EVENT_QUEUE_CAPACITY,
    };
  }

  #scheduleModuleWindow(
    module: TransportModule,
    adapter: VoiceAdapterPort,
    stepFrames: number,
    windowStart: number,
    windowEnd: number,
    arrangement: TransportArrangement = this.#arrangement,
    excludedOccurrences?: ReadonlySet<string>,
    excludedParameterOccurrences?: ReadonlySet<string>,
  ): void {
    const request = this.#moduleWindowRequest(
      module,
      stepFrames,
      windowStart,
      windowEnd,
      arrangement,
    );
    this.#scheduleAdapterParameters(
      module.id,
      adapter,
      withoutExcludedParameterOccurrences(
        schedulePatternAutomationWindow(request),
        excludedParameterOccurrences,
      ),
    );
    this.#scheduleAdapterEvents(
      module.id,
      adapter,
      withoutExcludedOccurrences(schedulePatternWindow(request), excludedOccurrences),
    );
  }

  /** Schedules the metronome clicks whose beats land inside the window. */
  #scheduleMetronome(
    context: AudioContext,
    stepFrames: number,
    windowStart: number,
    windowEnd: number,
  ): void {
    if (!this.#metronomeEnabled) return;
    // An empty rack builds no mixer channel, so the master chain the click
    // needs may not exist yet.
    if (this.#metronomeOutput === undefined) this.#ensureRouting(context);
    const output = this.#metronomeOutput;
    if (output === undefined) return;
    // Each click rounds once from the exact step size, so the clicks stay on
    // the same drift-free grid as the scheduled onsets.
    const beatFrames = stepFrames * STEPS_PER_BEAT;
    const firstBeat = Math.max(
      0,
      Math.ceil((windowStart - this.#patternStartFrame) / beatFrames) - 1,
    );
    for (let beat = firstBeat; ; beat += 1) {
      const frame = this.#patternStartFrame + Math.round(beat * beatFrames);
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
      this.#queuedEvents.delete(moduleId);
      this.#queuedParameters.delete(moduleId);
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
    // The refill ends where the shared window already ended. Running past
    // `#nextScheduleFrame` would overlap the next tick's window and double the
    // recovered voice's steps.
    const windowStart = currentFrame + this.#leadFrames(context);
    const windowEnd = Math.min(
      this.#nextScheduleFrame,
      currentFrame + Math.ceil(context.sampleRate * SCHEDULER_LOOKAHEAD_SECONDS),
    );
    if (windowStart >= windowEnd) return;
    const stepFrames = this.#exactStepFrames(context, clock, currentFrame);
    const pending = this.#pendingArrangement;
    const boundary = this.#pendingArrangementFrame;
    if (pending === undefined || boundary === undefined || boundary >= windowEnd) {
      this.#scheduleModuleWindow(module, adapter, stepFrames, windowStart, windowEnd);
      return;
    }
    if (boundary > windowStart) {
      this.#scheduleModuleWindow(module, adapter, stepFrames, windowStart, boundary);
    }
    this.#scheduleModuleWindow(
      module,
      adapter,
      stepFrames,
      Math.max(windowStart, boundary),
      windowEnd,
      pending,
    );
  }

  /** Replaces one module's queued window after an edit to that module. */
  #rescheduleModule(moduleId: ModuleInstanceId): void {
    const context = this.#context;
    const clock = this.#clock;
    const adapter = this.#adapters.get(moduleId);
    const module = this.#modules.get(moduleId);
    if (
      context === undefined ||
      clock === undefined ||
      adapter === undefined ||
      module === undefined
    ) {
      return;
    }
    const frame = this.#currentFrame(context);
    if (clock.getSnapshot(frame).status !== "playing") return;
    const releaseFrame = frame + this.#leadFrames(context);
    const stepFrames = this.#exactStepFrames(context, clock, frame);
    // The module's steps already carry the edit, so the lead window recomputed
    // here is the correct imminent schedule. A bare clear plus note-off would
    // drop the imminent onsets and cut the sounding tail.
    const request = this.#moduleWindowRequest(module, stepFrames, frame + 1, releaseFrame);
    const events = [...schedulePatternWindow(request)];
    const parameters = schedulePatternAutomationWindow(request);
    const release = pendingReleaseEvent(request, frame);
    if (release !== undefined) events.push(release);
    events.sort(compareScheduledVoiceEvents);
    this.#clearAdapterQueue(moduleId, adapter);
    const parameterFrame = this.#currentFrame(context);
    this.#scheduleAdapterParameters(
      moduleId,
      adapter,
      parameters.filter((change) => change.atFrame >= parameterFrame),
    );
    const due = withoutExpiredOnsets(events, this.#currentFrame(context));
    if (due.length > 0) this.#scheduleAdapterEvents(moduleId, adapter, due);
    this.#scheduleRecoveredModule(moduleId);
  }

  #requiredContext(): AudioContext {
    if (this.#context === undefined) throw new Error("Audio context has not been created.");
    return this.#context;
  }
}

export interface RoutingAutomationOccurrence extends RoutingAutomationChange {
  readonly occurrenceId?: string;
}

/** Resolves external Pattern lanes into absolute-frame routing changes. */
export function scheduleExternalAutomationWindow(
  projection: TransportExternalAutomationProjection,
  request: PatternWindowRequest,
): readonly RoutingAutomationOccurrence[] {
  return schedulePatternAutomationWindow(request).flatMap(
    (change): readonly RoutingAutomationChange[] => {
      const target = projection.targets[change.parameterId];
      return target === undefined
        ? []
        : [{
            atFrame: change.atFrame,
            ...(change.occurrenceId === undefined
              ? {}
              : { occurrenceId: change.occurrenceId }),
            scope: target.scope,
            targetId: target.targetId,
            parameterId: target.parameterId,
            value: change.value,
          }];
    },
  );
}

function readModuleId(payload: Readonly<Record<string, unknown>>): ModuleInstanceId {
  if (typeof payload.moduleId !== "string") {
    throw new TypeError("Engine module delta requires a stable module ID.");
  }
  return payload.moduleId as ModuleInstanceId;
}

function readOptionalEffectId(value: unknown): EffectInstanceId | undefined {
  return typeof value === "string" ? (value as EffectInstanceId) : undefined;
}

function readOptionalSendBusId(value: unknown): SendBusId | undefined {
  return typeof value === "string" ? (value as SendBusId) : undefined;
}

function isParameterValue(value: unknown): value is ParameterValue {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Drops the onsets the audio clock already passed, per section 21.2: the
 * scheduler never sends an expired note-on.
 *
 * A rebuild captures its lead window at the frame the change began at and posts
 * it after every module's window is computed, so the clock has moved on by the
 * time the batch leaves. The queue this batch replaces still held those onsets
 * while the clock passed them, so the processor already sounded them. It also
 * rejects an expired onset rather than firing it late, so a resend is a lost
 * step, not a second hit. Releases and resets stay: they only make the graph
 * safer, and one extra release with no sounding note is harmless.
 */
function withoutExpiredOnsets(
  events: readonly ScheduledVoiceEvent[],
  fromFrame: number,
): readonly ScheduledVoiceEvent[] {
  const due = (event: ScheduledVoiceEvent) =>
    event.type !== "note-on" || event.atFrame >= fromFrame;
  return events.every(due) ? events : events.filter(due);
}

function samePatternTiming(
  left: readonly PatternTiming[],
  right: readonly PatternTiming[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (
      leftValue?.humanize !== rightValue?.humanize ||
      leftValue?.seed !== rightValue?.seed
    ) {
      return false;
    }
  }
  return true;
}

function sameSongEntries(
  left: TransportArrangement["songEntries"],
  right: TransportArrangement["songEntries"],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const rightEntry = right.at(index);
    return (
      entry.patternIndex === rightEntry?.patternIndex &&
      entry.repeats === rightEntry.repeats
    );
  });
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
