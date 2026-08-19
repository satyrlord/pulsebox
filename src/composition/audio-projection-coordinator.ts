import type { ModuleInstanceId } from "../contracts";
import type { PulseEngineDelta, PulseState } from "../state/public";
import {
  applyFullAudioProjection,
  type AudioProjectionPort,
  type AudioStateProjector,
} from "./audio-state-projection";

export type { AudioProjectionPort } from "./audio-state-projection";

interface ProjectionGeneration {
  readonly runtime: AudioProjectionPort;
  queue: Promise<void>;
}

export interface AudioProjectionCoordinatorOptions {
  readonly runtime: AudioProjectionPort;
  readonly getState: () => Readonly<PulseState>;
  readonly projector: AudioStateProjector;
  readonly toTransportDelta: (
    delta: PulseEngineDelta,
    state: Readonly<PulseState>,
  ) => PulseEngineDelta;
  readonly onProjectionFailure?: () => void;
}

/**
 * Serializes projections for one runtime generation. A replacement starts a
 * new queue. Work from an old queue keeps its old runtime and cannot enter the
 * replacement runtime.
 */
export class AudioProjectionCoordinator {
  readonly #getState: AudioProjectionCoordinatorOptions["getState"];
  readonly #projector: AudioStateProjector;
  readonly #toTransportDelta: AudioProjectionCoordinatorOptions["toTransportDelta"];
  readonly #onProjectionFailure: () => void;
  #generation: ProjectionGeneration;
  #suppressed = false;

  constructor(options: AudioProjectionCoordinatorOptions) {
    this.#getState = options.getState;
    this.#projector = options.projector;
    this.#toTransportDelta = options.toTransportDelta;
    this.#onProjectionFailure = options.onProjectionFailure ?? (() => undefined);
    this.#generation = { runtime: options.runtime, queue: Promise.resolve() };
  }

  replaceRuntime(
    runtime: AudioProjectionPort,
    onPreviousGenerationIdle: () => void = () => undefined,
  ): Promise<void> {
    const previousGeneration = this.#generation;
    // Quiesce the old clock now. Its projection queue can still drain, but it
    // must not schedule more audio after the replacement state becomes active.
    previousGeneration.runtime.stop();
    this.#generation = { runtime, queue: Promise.resolve() };
    return previousGeneration.queue.then(
      onPreviousGenerationIdle,
      onPreviousGenerationIdle,
    );
  }

  suppressWhile<Result>(operation: () => Result): Result {
    const wasSuppressed = this.#suppressed;
    this.#suppressed = true;
    try {
      return operation();
    } finally {
      this.#suppressed = wasSuppressed;
    }
  }

  queueFullProjection(state?: Readonly<PulseState>): void {
    const generation = this.#generation;
    this.#enqueue(generation, false, () =>
      applyFullAudioProjection(
        generation.runtime,
        this.#projector.project(state ?? this.#getState()),
      ),
    );
  }

  queueDelta(delta: PulseEngineDelta): void {
    if (this.#suppressed) return;
    const state = this.#getState();
    const transportDelta = this.#toTransportDelta(delta, state);
    const moduleId =
      typeof transportDelta.payload.moduleId === "string"
        ? (transportDelta.payload.moduleId as ModuleInstanceId)
        : undefined;
    const rackModule =
      moduleId === undefined ? undefined : state.project.modules[moduleId];
    const moduleProjection =
      rackModule === undefined ? undefined : this.#projector.module(state, rackModule);
    const fullProjection =
      transportDelta.kind === "project-replace"
        ? this.#projector.project(state)
        : undefined;
    const routing =
      transportDelta.kind === "project-replace" ||
      transportDelta.kind === "pattern-events-set" ||
      transportDelta.kind === "module-effects-set" ||
      transportDelta.kind === "mixer-set"
        ? this.#projector.routing(state)
        : undefined;
    const generation = this.#generation;

    this.#enqueue(generation, true, async () => {
      if (fullProjection !== undefined) {
        generation.runtime.setArrangement(fullProjection.arrangement);
        generation.runtime.setPatternTiming(fullProjection.patternTiming);
        generation.runtime.setSwing(fullProjection.swing);
        generation.runtime.setMasterLevel(fullProjection.masterLevel);
      }
      if (routing !== undefined) generation.runtime.setRoutingProjection(routing);
      await generation.runtime.project(
        transportDelta,
        moduleProjection,
        fullProjection?.modules,
      );
    });
  }

  whenIdle(): Promise<void> {
    return this.#generation.queue;
  }

  #enqueue(
    generation: ProjectionGeneration,
    recover: boolean,
    operation: () => Promise<void>,
  ): void {
    generation.queue = generation.queue
      .then(async () => {
        if (generation !== this.#generation) return;
        await operation();
      })
      .catch(async () => {
        if (generation !== this.#generation) return;
        if (!recover) {
          this.#onProjectionFailure();
          return;
        }
        try {
          await applyFullAudioProjection(
            generation.runtime,
            this.#projector.project(this.#getState()),
          );
        } catch {
          if (generation === this.#generation) this.#onProjectionFailure();
        }
      });
  }
}
