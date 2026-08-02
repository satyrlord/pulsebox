import { describe, expect, it, vi } from "vitest";

import { createGestureId, type IdFactory } from "../../../src/contracts/ids";
import type { PluginId } from "../../../src/contracts/parameters";
import { createDefaultState } from "../../../src/state/default-state";
import { PulseStore } from "../../../src/state/pulse-store";

const seed = {
  pluginId: "bass-mono" as PluginId,
  parameters: { cutoff: 720, waveform: "saw", volume: 0.62 },
  steps: Array.from({ length: 16 }, (_, index) => ({
    active: index % 2 === 0,
    note: 36,
    velocity: 0.8,
    accent: index % 4 === 0,
    slide: false,
  })),
};

function createStore(ids: IdFactory, onDelta = () => undefined): PulseStore {
  return new PulseStore(createDefaultState(ids, seed), ids, seed, onDelta);
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Test fixture is missing a required value.");
  return value;
}

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

describe("PulseStore", () => {
  it("adds the selected registered plugin and duplicates its complete state", () => {
    const ids = deterministicIds();
    const drumSeed = {
      pluginId: "drum-analog-small" as PluginId,
      parameters: { tone: 0.45, drive: 0.2 },
      steps: seed.steps.map((step, index) => ({ ...step, note: 36 + (index % 6) })),
    };
    const seeds = new Map<PluginId, typeof seed | typeof drumSeed>([
      [seed.pluginId, seed],
      [drumSeed.pluginId, drumSeed],
    ]);
    const store = new PulseStore(createDefaultState(ids, seed), ids, (pluginId) =>
      seeds.get(pluginId),
    );
    const secondSlot = required(store.getState().project.rackSlots[1]);

    expect(
      store.dispatch(
        store.createCommand("rack-module-add", {
          slotId: secondSlot.id,
          pluginId: drumSeed.pluginId,
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    const drumId = required(store.getState().project.rackSlots[1]?.moduleId);
    const drum = required(store.getState().project.modules[drumId]);
    expect(drum).toMatchObject({ pluginId: drumSeed.pluginId, parameters: drumSeed.parameters });

    const thirdSlot = required(store.getState().project.rackSlots[2]);
    store.dispatch(
      store.createCommand("rack-module-duplicate", { moduleId: drumId, slotId: thirdSlot.id }),
    );
    const duplicateId = required(store.getState().project.rackSlots[2]?.moduleId);
    const duplicate = required(store.getState().project.modules[duplicateId]);
    expect(duplicateId).not.toBe(drumId);
    expect(duplicate.pluginId).toBe(drumSeed.pluginId);
    expect(duplicate.parameters).toEqual(drum.parameters);
    expect(duplicate.parts).toEqual(drum.parts);
  });

  it("exchanges validated in-memory projects and owns no serialization entry point", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const originalProject = store.saveProject();

    const reloaded = store.loadProject({
      ...originalProject,
      name: "Imported project",
      revision: { ...originalProject.revision, counter: originalProject.revision.counter + 1 },
    });
    expect(reloaded).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.name).toBe("Imported project");

    // Decision `D70`: serialization belongs to `src/state/persistence`, which
    // validates, migrates, and checks plugin compatibility before anything
    // reaches `loadProject`. The store owns no serialization entry point, so
    // untrusted bytes cannot arrive by bypassing that one validating path.
    expect("importProject" in store).toBe(false);
    expect("exportProject" in store).toBe(false);
  });

  it("applies one atomic parameter command and supports undo and redo", () => {
    const ids = deterministicIds();
    const deltas = vi.fn();
    const store = createStore(ids, deltas);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const original = required(
      required(store.getState().project.modules[moduleId]).parameters.cutoff,
    );
    const command = store.createCommand("rack-parameter-set", {
      moduleId,
      parameter: "cutoff",
      value: 1200,
    });
    expect(store.dispatch(command)).toMatchObject({ status: "accepted", changed: true });
    const afterEdit = store.getState().project.revision.counter;
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);
    expect(store.getState().history).toEqual({ canUndo: true, canRedo: false });
    expect(deltas).toHaveBeenCalledTimes(1);
    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.revision.counter).toBe(afterEdit + 1);
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(original);
    expect(store.getState().history).toEqual({ canUndo: false, canRedo: true });
    expect(store.redo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.revision.counter).toBe(afterEdit + 2);
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);
    expect(store.getState().history).toEqual({ canUndo: true, canRedo: false });
  });

  it("stores tempo in the project and makes tempo edits reversible", () => {
    const ids = deterministicIds();
    const deltas = vi.fn();
    const store = createStore(ids, deltas);

    expect(store.getState().project.tempo).toBe(128);
    expect(
      store.dispatch(store.createCommand("transport-tempo-set", { tempo: 146 })),
    ).toMatchObject({
      status: "accepted",
      changed: true,
    });
    expect(store.getState().project.tempo).toBe(146);
    expect(deltas).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "transport", payload: { tempo: 146 } }),
    );

    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.tempo).toBe(128);
    expect(store.redo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.tempo).toBe(146);
  });

  it("coalesces consecutive project edits with one gesture ID", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const original = required(store.getState().project.modules[moduleId]).parameters.cutoff;
    const gestureId = createGestureId(ids);

    store.dispatch(
      store.createCommand(
        "rack-parameter-set",
        { moduleId, parameter: "cutoff", value: 900 },
        { gestureId },
      ),
    );
    store.dispatch(
      store.createCommand(
        "rack-parameter-set",
        { moduleId, parameter: "cutoff", value: 1200 },
        { gestureId },
      ),
    );
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);

    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(original);
    expect(store.undo()).toMatchObject({ status: "accepted", changed: false });
    expect(store.redo()).toMatchObject({ status: "accepted", changed: true });
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);
  });

  it("drops a coalesced gesture that returns to its starting project value", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const original = required(
      required(store.getState().project.modules[moduleId]).parameters.cutoff,
    );
    const gestureId = createGestureId(ids);

    store.dispatch(
      store.createCommand(
        "rack-parameter-set",
        { moduleId, parameter: "cutoff", value: 900 },
        { gestureId },
      ),
    );
    store.dispatch(
      store.createCommand(
        "rack-parameter-set",
        { moduleId, parameter: "cutoff", value: original },
        { gestureId },
      ),
    );

    expect(store.getState().history).toEqual({ canUndo: false, canRedo: false });
    expect(store.undo()).toMatchObject({ status: "accepted", changed: false });
  });

  it("keeps one undo entry per gesture when two gestures interleave", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const originalCutoff = required(store.getState().project.modules[moduleId]).parameters.cutoff;
    const originalVolume = required(store.getState().project.modules[moduleId]).parameters.volume;
    const cutoffGesture = createGestureId(ids);
    const volumeGesture = createGestureId(ids);
    const set = (parameter: string, value: number, gestureId: typeof cutoffGesture) => {
      store.dispatch(
        store.createCommand("rack-parameter-set", { moduleId, parameter, value }, { gestureId }),
      );
    };

    // Section 7.4: a wheel burst on two targets interleaves two open gestures.
    set("cutoff", 900, cutoffGesture);
    set("volume", 0.5, volumeGesture);
    set("cutoff", 1200, cutoffGesture);
    set("volume", 0.4, volumeGesture);

    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);
    expect(required(store.getState().project.modules[moduleId]).parameters.volume).toBe(0.4);

    // One entry per gesture: two undos restore the pre-gesture values exactly.
    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(
      originalCutoff,
    );
    expect(required(store.getState().project.modules[moduleId]).parameters.volume).toBe(
      originalVolume,
    );
    expect(store.getState().history).toEqual({ canUndo: false, canRedo: true });
  });

  it("rejects an oversized history entry before mutating state or engine projection", () => {
    const ids = deterministicIds();
    const deltas = vi.fn();
    const oversizedSeed = {
      ...seed,
      parameters: { payload: "x".repeat(9 * 1024 * 1024) },
    };
    const store = new PulseStore(
      createDefaultState(ids, oversizedSeed),
      ids,
      oversizedSeed,
      deltas,
    );
    const moduleId = required(store.getState().ui.selectedModuleId);
    const snapshot = store.getState();

    expect(
      store.dispatch(store.createCommand("pattern-step-toggle", { moduleId, step: 0 })),
    ).toMatchObject({
      status: "rejected",
      error: { field: "history" },
    });
    expect(store.getState()).toBe(snapshot);
    expect(store.getState().history).toEqual({ canUndo: false, canRedo: false });
    expect(deltas).not.toHaveBeenCalled();
  });

  it("rejects stale and invalid commands without mutation", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const command = store.createCommand("rack-parameter-set", {
      moduleId,
      parameter: "cutoff",
      value: 1200,
    });
    expect(store.dispatch(command).status).toBe("accepted");
    const snapshot = store.getState();
    expect(store.dispatch(command)).toMatchObject({
      status: "rejected",
      error: { field: "expectedProjectRevision" },
    });
    expect(store.getState()).toBe(snapshot);
    const invalid = store.createCommand("transport-tempo-set", { tempo: 999 });
    expect(store.dispatch(invalid)).toMatchObject({
      status: "rejected",
      error: { field: "payload.tempo" },
    });
    expect(store.getState()).toBe(snapshot);
  });

  it("notifies selectors only when their selected value changes", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const listener = vi.fn();
    store.subscribe((state) => state.project.tempo, listener);
    const moduleId = required(store.getState().ui.selectedModuleId);
    store.dispatch(
      store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 900 }),
    );
    expect(listener).not.toHaveBeenCalled();
    store.dispatch(store.createCommand("transport-tempo-set", { tempo: 132 }));
    expect(listener).toHaveBeenCalledWith(132, 128);
  });

  it("preserves module identity while moving and restores removal through undo", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const target = required(store.getState().project.rackSlots[1]).id;
    store.dispatch(store.createCommand("rack-module-move", { moduleId, slotId: target }));
    expect(required(store.getState().project.rackSlots[1]).moduleId).toBe(moduleId);
    store.dispatch(store.createCommand("rack-module-remove", { moduleId }));
    expect(store.getState().project.modules[moduleId]).toBeUndefined();
    store.undo();
    expect(store.getState().project.modules[moduleId]?.id).toBe(moduleId);
  });

  it("rolls the in-memory state revision independently at the safe-integer limit", () => {
    const ids = deterministicIds();
    const initial = createDefaultState(ids, seed);
    const stateAtLimit = {
      ...initial,
      project: {
        ...initial.project,
        revision: { ...initial.project.revision, counter: Number.MAX_SAFE_INTEGER },
      },
    };
    const store = new PulseStore(stateAtLimit, ids, seed);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const previousEpoch = store.getState().project.revision.epoch;

    expect(
      store.dispatch(
        store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 900 }),
      ),
    ).toMatchObject({
      status: "accepted",
      changed: true,
    });
    expect(store.getState().project.revision.counter).toBe(0);
    expect(store.getState().project.revision.epoch).not.toBe(previousEpoch);
  });

  it("swaps the plugin while the module keeps identity, parts, and mixer state", () => {
    const ids = deterministicIds();
    const drumSeed = {
      pluginId: "drum-analog-small" as PluginId,
      parameters: { tone: 0.45, drive: 0.2 },
      steps: seed.steps,
    };
    const seeds = new Map<PluginId, typeof seed | typeof drumSeed>([
      [seed.pluginId, seed],
      [drumSeed.pluginId, drumSeed],
    ]);
    const deltas = vi.fn();
    const store = new PulseStore(
      createDefaultState(ids, seed),
      ids,
      (pluginId) => seeds.get(pluginId),
      deltas,
    );
    const moduleId = required(store.getState().ui.selectedModuleId);
    store.dispatch(store.createCommand("mixer-level-set", { moduleId, level: 0.8 }));
    const before = required(store.getState().project.modules[moduleId]);

    expect(
      store.dispatch(
        store.createCommand("rack-module-swap", { moduleId, pluginId: drumSeed.pluginId }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    const after = required(store.getState().project.modules[moduleId]);
    expect(after.id).toBe(moduleId);
    expect(after.pluginId).toBe(drumSeed.pluginId);
    expect(after.parameters).toEqual(drumSeed.parameters);
    expect(after.parts).toEqual(before.parts);
    expect(after.level).toBe(0.8);
    expect(deltas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "module-swap",
        payload: { moduleId, pluginId: drumSeed.pluginId },
      }),
    );

    store.undo();
    const undone = required(store.getState().project.modules[moduleId]);
    expect(undone.pluginId).toBe(seed.pluginId);
    expect(undone.parameters).toEqual(before.parameters);
  });

  it("rejects a swap to an unregistered plugin and skips a same-plugin swap", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);

    expect(
      store.dispatch(
        store.createCommand("rack-module-swap", {
          moduleId,
          pluginId: "unknown-plugin" as PluginId,
        }),
      ),
    ).toMatchObject({ status: "rejected", error: { field: "payload.pluginId" } });
    expect(
      store.dispatch(
        store.createCommand("rack-module-swap", { moduleId, pluginId: seed.pluginId }),
      ),
    ).toMatchObject({ status: "accepted", changed: false });
  });

  it("removes dangling UI references when Undo or Redo removes a module", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const targetSlot = required(store.getState().project.rackSlots[1]);

    store.dispatch(
      store.createCommand("rack-module-add", { slotId: targetSlot.id, pluginId: seed.pluginId }),
    );
    const addedModuleId = required(store.getState().project.rackSlots[1]?.moduleId);
    store.dispatch(store.createCommand("rack-module-select", { moduleId: addedModuleId }));

    store.undo();
    expect(store.getState().project.modules[addedModuleId]).toBeUndefined();
    expect(store.getState().ui.selectedModuleId).toBeUndefined();

    store.redo();
    store.dispatch(store.createCommand("rack-module-select", { moduleId: addedModuleId }));
    store.dispatch(store.createCommand("rack-module-remove", { moduleId: addedModuleId }));
    store.undo();
    store.dispatch(store.createCommand("rack-module-select", { moduleId: addedModuleId }));
    store.redo();
    expect(store.getState().project.modules[addedModuleId]).toBeUndefined();
    expect(store.getState().ui.selectedModuleId).toBeUndefined();
  });
});
