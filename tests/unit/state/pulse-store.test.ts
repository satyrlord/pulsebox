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
  it("supports project load, save, export, and import lifecycle operations", () => {
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

    const exported = store.exportProject();
    expect(JSON.parse(exported)).toMatchObject({ name: "Imported project" });

    const importedSnapshot = JSON.parse(exported) as { name: string };
    importedSnapshot.name = "Imported from export";
    const imported = store.importProject(JSON.stringify(importedSnapshot));
    expect(imported).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.name).toBe("Imported from export");
  });

  it("applies one atomic parameter command and supports undo and redo", () => {
    const ids = deterministicIds();
    const deltas = vi.fn();
    const store = createStore(ids, deltas);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const original = required(
      required(store.getState().project.modules[moduleId]).parameters.cutoff,
    );
    const command = store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 1200 });
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

    expect(store.getState().project.tempo).toBe(130);
    expect(store.dispatch(store.createCommand("transport-tempo-set", { tempo: 146 }))).toMatchObject({
      status: "accepted",
      changed: true,
    });
    expect(store.getState().project.tempo).toBe(146);
    expect(deltas).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "transport", payload: { tempo: 146 } }));

    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.tempo).toBe(130);
    expect(store.redo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.tempo).toBe(146);
  });

  it("coalesces consecutive project edits with one gesture ID", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const original = required(store.getState().project.modules[moduleId]).parameters.cutoff;
    const gestureId = createGestureId(ids);

    store.dispatch(store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 900 }, { gestureId }));
    store.dispatch(store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 1200 }, { gestureId }));
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

    store.dispatch(store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 900 }, { gestureId }));
    store.dispatch(store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: original }, { gestureId }));

    expect(store.getState().history).toEqual({ canUndo: false, canRedo: false });
    expect(store.undo()).toMatchObject({ status: "accepted", changed: false });
  });

  it("rejects an oversized history entry before mutating state or engine projection", () => {
    const ids = deterministicIds();
    const deltas = vi.fn();
    const oversizedSeed = {
      ...seed,
      parameters: { payload: "x".repeat(9 * 1024 * 1024) },
    };
    const store = new PulseStore(createDefaultState(ids, oversizedSeed), ids, oversizedSeed, deltas);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const snapshot = store.getState();

    expect(store.dispatch(store.createCommand("pattern-step-toggle", { moduleId, step: 0 }))).toMatchObject({
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
    const command = store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 1200 });
    expect(store.dispatch(command).status).toBe("accepted");
    const snapshot = store.getState();
    expect(store.dispatch(command)).toMatchObject({ status: "rejected", error: { field: "expectedProjectRevision" } });
    expect(store.getState()).toBe(snapshot);
    const invalid = store.createCommand("transport-tempo-set", { tempo: 999 });
    expect(store.dispatch(invalid)).toMatchObject({ status: "rejected", error: { field: "payload.tempo" } });
    expect(store.getState()).toBe(snapshot);
  });

  it("notifies selectors only when their selected value changes", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const listener = vi.fn();
    store.subscribe((state) => state.project.tempo, listener);
    const moduleId = required(store.getState().ui.selectedModuleId);
    store.dispatch(store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 900 }));
    expect(listener).not.toHaveBeenCalled();
    store.dispatch(store.createCommand("transport-tempo-set", { tempo: 132 }));
    expect(listener).toHaveBeenCalledWith(132, 130);
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

    expect(store.dispatch(store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 900 }))).toMatchObject({
      status: "accepted",
      changed: true,
    });
    expect(store.getState().project.revision.counter).toBe(0);
    expect(store.getState().project.revision.epoch).not.toBe(previousEpoch);
  });

  it("keeps collapse preference outside project revision and history", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const revision = store.getState().project.revision;
    expect(store.dispatch(store.createCommand("rack-module-collapse-toggle", { moduleId }))).toMatchObject({ status: "accepted" });
    expect(store.getState().project.revision).toBe(revision);
    expect(store.getState().ui.collapsedModuleIds.has(moduleId)).toBe(true);
    expect(store.undo()).toMatchObject({ status: "accepted", changed: false });
  });

  it("removes collapse preference and restores an undone module expanded", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);

    store.dispatch(
      store.createCommand("rack-module-collapse-toggle", { moduleId }),
    );
    expect(store.getState().ui.collapsedModuleIds.has(moduleId)).toBe(true);

    store.dispatch(store.createCommand("rack-module-remove", { moduleId }));
    expect(store.getState().ui.collapsedModuleIds.has(moduleId)).toBe(false);

    store.undo();
    expect(store.getState().project.modules[moduleId]?.id).toBe(moduleId);
    expect(store.getState().ui.collapsedModuleIds.has(moduleId)).toBe(false);
  });

  it("removes dangling UI references when Undo or Redo removes a module", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const targetSlot = required(store.getState().project.rackSlots[1]);

    store.dispatch(store.createCommand("rack-module-add", { slotId: targetSlot.id }));
    const addedModuleId = required(store.getState().project.rackSlots[1]?.moduleId);
    store.dispatch(store.createCommand("rack-module-select", { moduleId: addedModuleId }));
    store.dispatch(store.createCommand("rack-module-collapse-toggle", { moduleId: addedModuleId }));

    store.undo();
    expect(store.getState().project.modules[addedModuleId]).toBeUndefined();
    expect(store.getState().ui.selectedModuleId).toBeUndefined();
    expect(store.getState().ui.collapsedModuleIds.has(addedModuleId)).toBe(false);

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
