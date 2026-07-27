import type { EngineDelta } from "../../../contracts/commands";
import type {
  ModuleInstanceId,
  StateRevision,
} from "../../../contracts/ids";
import { schedulePatternWindow } from "../../transport/step-scheduler";
import { TransportClock } from "../../transport/transport-clock";
import {
  AcidBassAdapter,
  type AcidBassAdapterOptions,
  type AcidBassAdapterStatus,
  type AcidBassFault,
  type ScheduledBassEvent,
} from "./adapter";
import type { BassParameters } from "./dsp-core";

export interface BassRuntimeModule {
  readonly id: ModuleInstanceId;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly steps: readonly PatternStep[];
}

export type BassEngineDelta = EngineDelta<
  | "project-replace"
  | "module-add"
  | "module-remove"
  | "module-move"
  | "parameter-set"
  | "step-set"
  | "transport",
  Readonly<Record<string, unknown>>
>;

type ParameterValue = number | boolean | string;

interface PatternStep {
  readonly active: boolean;
  readonly note: number;
  readonly velocity: number;
  readonly accent: boolean;
  readonly slide: boolean;
}

export type AudioRuntimeState = "locked" | "active" | "suspended" | "unavailable";

export type AcidBassRuntimeStatus =
  | {
      readonly moduleId: ModuleInstanceId;
      readonly state: "recovering" | "faulted";
      readonly fault: AcidBassFault;
    }
  | {
      readonly moduleId: ModuleInstanceId;
      readonly state: "recovered";
    };

const SCHEDULER_LEAD_SECONDS = 0.02;
const SCHEDULER_LOOKAHEAD_SECONDS = 0.12;

export interface AcidBassRuntimeAdapterPort {
  prepare(): Promise<void>;
  activate(destination: AudioNode): void;
  replaceState(
    parameters: Partial<BassParameters>,
    projectRevision: StateRevision,
  ): void;
  setProjectRevision(projectRevision: StateRevision): void;
  setParameters(
    parameters: Partial<BassParameters>,
    projectRevision: StateRevision,
  ): void;
  previewParameters(parameters: Partial<BassParameters>): void;
  schedule(events: readonly ScheduledBassEvent[]): void;
  clearScheduledEvents(): void;
  resume(): void;
  suspend(): void;
  dispose(): void;
}

export type AcidBassAdapterFactory = (
  context: AudioContext,
  options: AcidBassAdapterOptions,
) => AcidBassRuntimeAdapterPort;

export class AcidBassRuntime {
  readonly #createContext: () => AudioContext;
  readonly #onStatus: (status: AcidBassRuntimeStatus) => void;
  readonly #createAdapter: AcidBassAdapterFactory;
  readonly #modules = new Map<ModuleInstanceId, BassRuntimeModule>();
  readonly #adapters = new Map<ModuleInstanceId, AcidBassRuntimeAdapterPort>();
  #context: AudioContext | undefined;
  #clock: TransportClock | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #projectRevision: StateRevision | undefined;
  #patternStartFrame = 0;
  #nextScheduleFrame = 0;
  #state: AudioRuntimeState = "locked";

  constructor(
    createContext: () => AudioContext = () =>
      new AudioContext({ latencyHint: "interactive" }),
    onStatus: (status: AcidBassRuntimeStatus) => void = () => undefined,
    createAdapter: AcidBassAdapterFactory = (context, options) =>
      new AcidBassAdapter(context, options),
  ) {
    this.#createContext = createContext;
    this.#onStatus = onStatus;
    this.#createAdapter = createAdapter;
  }

  get state(): AudioRuntimeState {
    return this.#state;
  }

  get projectRevision(): StateRevision | undefined {
    return this.#projectRevision;
  }

  getPositionTicks(): number {
    const context = this.#context;
    if (context === undefined) return 0;
    return this.#clock?.getSnapshot(Math.floor(context.currentTime * context.sampleRate)).positionTicks ?? 0;
  }

  async activate(): Promise<void> {
    if (this.#state === "unavailable") throw new Error("Audio is unavailable in this browser.");
    try {
      if (this.#context === undefined) {
        this.#context = this.#createContext();
        this.#clock = new TransportClock(this.#context.sampleRate);
        const resume = this.#context.resume();
        await Promise.all([resume, this.#syncFullProjection()]);
      } else {
        await this.#context.resume();
      }
      this.#state = "active";
    } catch (error) {
      for (const adapter of this.#adapters.values()) adapter.dispose();
      this.#adapters.clear();
      void this.#context?.close();
      this.#context = undefined;
      this.#clock = undefined;
      this.#state = "unavailable";
      throw error;
    }
  }

  async replaceFromCurrentState(
    modules: readonly BassRuntimeModule[],
    projectRevision: StateRevision,
  ): Promise<void> {
    this.#projectRevision = projectRevision;
    this.#modules.clear();
    for (const module of modules) this.#modules.set(module.id, module);
    if (this.#context !== undefined) await this.#syncFullProjection();
  }

  async project(
    delta: BassEngineDelta,
    moduleProjection?: BassRuntimeModule,
    fullProjection?: readonly BassRuntimeModule[],
  ): Promise<void> {
    const advancesProjectRevision =
      delta.kind !== "transport" || typeof delta.payload.tempo === "number";
    if (
      advancesProjectRevision &&
      this.#isStaleOrDuplicate(delta.projectRevision)
    ) {
      return;
    }
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
      case "module-add":
        if (moduleProjection === undefined) {
          throw new Error("Module addition requires its bounded module projection.");
        }
        this.#setRevision(delta.projectRevision);
        this.#modules.set(moduleProjection.id, moduleProjection);
        if (this.#context !== undefined) {
          const adapter = await this.#ensureAdapter(moduleProjection);
          adapter.replaceState(
            toBassParameters(moduleProjection.parameters),
            delta.projectRevision,
          );
        }
        return;
      case "module-remove": {
        const moduleId = readModuleId(delta.payload);
        this.#setRevision(delta.projectRevision);
        this.#modules.delete(moduleId);
        this.#adapters.get(moduleId)?.dispose();
        this.#adapters.delete(moduleId);
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
        this.#adapters
          .get(moduleId)
          ?.setParameters(
            toBassParameters({ [parameter]: value }),
            delta.projectRevision,
          );
        return;
      }
      case "step-set": {
        const { moduleId, step, active } = readStepDelta(delta.payload);
        this.#setRevision(delta.projectRevision);
        const module = this.#modules.get(moduleId);
        if (module?.steps[step] !== undefined) {
          this.#modules.set(moduleId, {
            ...module,
            steps: module.steps.map((value, index) =>
              index === step ? { ...value, active } : value,
            ),
          });
        }
        return;
      }
      case "module-move":
        this.#setRevision(delta.projectRevision);
        return;
      case "transport":
        if (typeof delta.payload.tempo === "number") {
          this.#setRevision(delta.projectRevision);
          this.setTempo(delta.payload.tempo);
        }
        return;
    }
  }

  previewParameter(
    moduleId: ModuleInstanceId,
    parameter: string,
    value: ParameterValue,
  ): void {
    const revision = this.#projectRevision;
    if (revision === undefined) return;
    this.#adapters
      .get(moduleId)
      ?.previewParameters(toBassParameters({ [parameter]: value }));
  }

  setTempo(tempo: number): void {
    const context = this.#context;
    const clock = this.#clock;
    if (context === undefined || clock === undefined) return;
    const frame = Math.floor(context.currentTime * context.sampleRate);
    const snapshot = clock.getSnapshot(frame);
    clock.setTempo(tempo, frame);
    if (snapshot.status === "playing") {
      for (const adapter of this.#adapters.values()) {
        adapter.clearScheduledEvents();
      }
      this.#patternStartFrame = frame - clock.ticksToFrames(snapshot.positionTicks);
      this.#nextScheduleFrame = frame + this.#schedulerLeadFrames(context);
      this.#schedule();
    }
  }

  async play(tempo: number): Promise<void> {
    await this.activate();
    const context = this.#requiredContext();
    const frame =
      Math.floor(context.currentTime * context.sampleRate) +
      this.#schedulerLeadFrames(context);
    const clock = this.#clock;
    if (clock === undefined) throw new Error("Transport clock has not been created.");
    const positionTicks = clock.getSnapshot(frame).positionTicks;
    clock.setTempo(tempo, frame);
    clock.play(frame);
    for (const adapter of this.#adapters.values()) adapter.resume();
    this.#patternStartFrame = frame - clock.ticksToFrames(positionTicks);
    this.#nextScheduleFrame = frame;
    this.#startScheduler();
  }

  pause(): number {
    const context = this.#context;
    if (context === undefined) return 0;
    const frame = Math.floor(context.currentTime * context.sampleRate);
    this.#clock?.pause(frame);
    this.#stopScheduler();
    for (const adapter of this.#adapters.values()) adapter.suspend();
    this.#state = "suspended";
    return this.#clock?.getSnapshot(frame).positionTicks ?? 0;
  }

  stop(): void {
    const context = this.#context;
    if (context === undefined) return;
    this.#clock?.stop(Math.floor(context.currentTime * context.sampleRate));
    this.#stopScheduler();
    for (const adapter of this.#adapters.values()) adapter.suspend();
  }

  dispose(): void {
    this.#stopScheduler();
    for (const adapter of this.#adapters.values()) adapter.dispose();
    this.#adapters.clear();
    void this.#context?.close();
    this.#context = undefined;
    this.#clock = undefined;
    this.#state = "locked";
  }

  #setRevision(projectRevision: StateRevision): void {
    this.#projectRevision = projectRevision;
    for (const adapter of this.#adapters.values()) {
      adapter.setProjectRevision(projectRevision);
    }
  }

  #isStaleOrDuplicate(projectRevision: StateRevision): boolean {
    const current = this.#projectRevision;
    return (
      projectRevision.epoch === current?.epoch &&
      projectRevision.counter <= current.counter
    );
  }

  async #syncFullProjection(): Promise<void> {
    const revision = this.#projectRevision;
    if (revision === undefined && this.#modules.size > 0) {
      throw new Error("Acid Bass modules require an authoritative project revision.");
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
      adapter.replaceState(toBassParameters(module.parameters), revision);
    }
  }

  async #ensureAdapter(
    module: BassRuntimeModule,
  ): Promise<AcidBassRuntimeAdapterPort> {
    const context = this.#requiredContext();
    const revision = this.#projectRevision;
    if (revision === undefined) {
      throw new Error("Acid Bass adapter requires an authoritative project revision.");
    }
    let adapter = this.#adapters.get(module.id);
    if (adapter === undefined) {
      adapter = this.#createAdapter(context, {
        projectRevision: revision,
        onStatus: (status) => this.#publishAdapterStatus(module.id, status),
      });
      await adapter.prepare();
      adapter.activate(context.destination);
      this.#adapters.set(module.id, adapter);
    }
    return adapter;
  }

  #startScheduler(): void {
    this.#stopScheduler();
    this.#schedule();
    this.#timer = setInterval(() => this.#schedule(), 40);
  }

  #stopScheduler(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  #schedule(): void {
    const context = this.#context;
    const clock = this.#clock;
    if (context === undefined || clock === undefined) return;
    const currentFrame = Math.floor(context.currentTime * context.sampleRate);
    const windowStart = Math.max(
      this.#nextScheduleFrame,
      currentFrame + this.#schedulerLeadFrames(context),
    );
    const windowEnd =
      currentFrame +
      Math.ceil(context.sampleRate * SCHEDULER_LOOKAHEAD_SECONDS);
    if (windowStart >= windowEnd) return;
    const stepFrames = Math.max(1, Math.round(clock.ticksToFrames(240)));
    for (const module of this.#modules.values()) {
      this.#adapters.get(module.id)?.schedule(
        schedulePatternWindow(module.steps, stepFrames, windowStart, windowEnd, this.#patternStartFrame),
      );
    }
    this.#nextScheduleFrame = windowEnd;
  }

  #schedulerLeadFrames(context: AudioContext): number {
    return Math.max(1, Math.ceil(context.sampleRate * SCHEDULER_LEAD_SECONDS));
  }

  #publishAdapterStatus(
    moduleId: ModuleInstanceId,
    status: AcidBassAdapterStatus,
  ): void {
    if (status.state === "faulted") {
      this.stop();
      this.#state = "unavailable";
    } else if (status.state === "recovered") {
      this.#scheduleRecoveredModule(moduleId);
    }
    this.#onStatus(
      status.state === "recovered"
        ? { moduleId, state: "recovered" }
        : { moduleId, state: status.state, fault: status.fault },
    );
  }

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
    ) return;
    const currentFrame = Math.floor(context.currentTime * context.sampleRate);
    if (clock.getSnapshot(currentFrame).status !== "playing") return;
    const windowStart = currentFrame + this.#schedulerLeadFrames(context);
    const windowEnd = currentFrame +
      Math.ceil(context.sampleRate * SCHEDULER_LOOKAHEAD_SECONDS);
    const stepFrames = Math.max(1, Math.round(clock.ticksToFrames(240)));
    adapter.schedule(
      schedulePatternWindow(
        module.steps,
        stepFrames,
        windowStart,
        windowEnd,
        this.#patternStartFrame,
      ),
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
  return { moduleId, step: payload.step, active: payload.active };
}

function toBassParameters(values: Readonly<Record<string, ParameterValue>>): Partial<BassParameters> {
  const result: Partial<Record<keyof BassParameters, BassParameters[keyof BassParameters]>> = {};
  const mapping: Readonly<Record<string, keyof BassParameters>> = {
    tune: "tune",
    cutoff: "cutoff",
    resonance: "resonance",
    "envelope-amount": "envelopeAmount",
    decay: "decay",
    "accent-amount": "accentAmount",
    waveform: "waveform",
    glide: "glide",
    volume: "volume",
  };
  for (const [source, target] of Object.entries(mapping)) {
    const value = values[source];
    if (value !== undefined) (result as Record<string, ParameterValue>)[target] = value;
  }
  return result as Partial<BassParameters>;
}
