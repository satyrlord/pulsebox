import { describe, expect, it, vi } from "vitest";

import type { StateRevision } from "../../../src/contracts";
import {
  AudioProjectionCoordinator,
  type AudioProjectionPort,
} from "../../../src/composition/audio-projection-coordinator";
import type { AudioStateProjection } from "../../../src/composition/audio-state-projection";
import type { PulseEngineDelta, PulseState } from "../../../src/state/public";

function revision(counter: number): StateRevision {
  return {
    epoch: "00000000-0000-4000-8000-000000000001" as StateRevision["epoch"],
    counter,
  };
}

function state(counter: number): PulseState {
  return {
    project: {
      id: "00000000-0000-4000-8000-000000000002" as PulseState["project"]["id"],
      lineageId: "00000000-0000-4000-8000-000000000003" as PulseState["project"]["lineageId"],
      revision: revision(counter),
      name: "Test",
      tempo: 120,
      swing: 0,
      masterLevel: 0.8,
      rackSlots: [],
      modules: {},
      effects: {
        instances: {},
        moduleChains: {},
        sendChains: {},
        masterChain: [],
        sendEffectsBypassed: false,
        masterEffectsBypassed: false,
      },
      patterns: [],
      activePatternId: "00000000-0000-4000-8000-000000000004" as PulseState["project"]["activePatternId"],
      automationLanes: {},
      song: { enabled: false, placements: [] },
    },
    transport: { status: "stopped", recordArmed: false, positionTicks: 0, startMarkerTicks: 0 },
    ui: {
      selectedModuleId: undefined,
      pianoRollSelection: undefined,
      pianoRollParameter: "level",
      pianoRollAutomationTarget: undefined,
    },
    history: { canUndo: false, canRedo: false },
  };
}

function projection(source: Readonly<PulseState>): AudioStateProjection {
  return {
    revision: source.project.revision,
    arrangement: { activePatternIndex: 0, songEnabled: false, songEntries: [] },
    patternTiming: [],
    swing: source.project.swing,
    masterLevel: source.project.masterLevel,
    routing: { sends: [], master: { level: source.project.masterLevel, effects: [], effectsBypassed: false, limiterBypassed: false } },
    modules: [],
  };
}

const projector = {
  project: projection,
  module: () => {
    throw new Error("This test does not project a module.");
  },
  routing: (source: Readonly<PulseState>) => projection(source).routing,
  voiceCycleLengths: () => ({}),
};

class FakeRuntime implements AudioProjectionPort {
  readonly revisions: StateRevision[] = [];
  readonly deltas: PulseEngineDelta[] = [];
  readonly stop = vi.fn();
  projectGate: Promise<void> | undefined;

  setArrangement(value: Parameters<AudioProjectionPort["setArrangement"]>[0]): void {
    void value;
  }
  setPatternTiming(value: Parameters<AudioProjectionPort["setPatternTiming"]>[0]): void {
    void value;
  }
  setSwing(value: number): void {
    void value;
  }
  setMasterLevel(value: number): void {
    void value;
  }
  setRoutingProjection(
    value: Parameters<AudioProjectionPort["setRoutingProjection"]>[0],
  ): void {
    void value;
  }
  replaceFromCurrentState(
    _modules: Parameters<AudioProjectionPort["replaceFromCurrentState"]>[0],
    value: StateRevision,
  ): Promise<void> {
    this.revisions.push(value);
    return Promise.resolve();
  }
  async project(delta: PulseEngineDelta): Promise<void> {
    this.deltas.push(delta);
    await this.projectGate;
  }
}

describe("audio projection coordinator", () => {
  it("does not let queued work from an old generation reach a replacement runtime", async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let current = state(1);
    const oldRuntime = new FakeRuntime();
    oldRuntime.projectGate = gate;
    const nextRuntime = new FakeRuntime();
    let oldRuntimeDisposed = false;
    const coordinator = new AudioProjectionCoordinator({
      runtime: oldRuntime,
      getState: () => current,
      projector,
      toTransportDelta: (delta) => delta,
    });
    const first = { kind: "pattern-rename", payload: {}, targetIds: [], projectRevision: revision(1) } as PulseEngineDelta;
    const stale = { ...first, projectRevision: revision(2) };

    coordinator.queueDelta(first);
    coordinator.queueDelta(stale);
    await Promise.resolve();
    current = state(3);
    const previousGenerationIdle = coordinator.replaceRuntime(nextRuntime, () => {
      oldRuntimeDisposed = true;
    });
    expect(oldRuntime.stop).toHaveBeenCalledOnce();
    coordinator.queueFullProjection();
    await Promise.resolve();
    expect(oldRuntimeDisposed).toBe(false);
    release();
    await previousGenerationIdle;
    await coordinator.whenIdle();

    expect(oldRuntime.deltas).toEqual([first]);
    expect(nextRuntime.deltas).toEqual([]);
    expect(nextRuntime.revisions).toEqual([revision(3)]);
    expect(oldRuntimeDisposed).toBe(true);
  });

  it("uses the accepted store revision for a replacement runtime", async () => {
    let current = state(4);
    const coordinator = new AudioProjectionCoordinator({
      runtime: new FakeRuntime(),
      getState: () => current,
      projector,
      toTransportDelta: (delta) => delta,
    });
    const candidate = new FakeRuntime();

    const acceptedState = state(5);
    current = acceptedState;
    await coordinator.replaceRuntime(candidate);
    coordinator.queueFullProjection(acceptedState);
    current = state(6);
    await coordinator.whenIdle();

    expect(candidate.revisions).toEqual([revision(5)]);
  });
});
