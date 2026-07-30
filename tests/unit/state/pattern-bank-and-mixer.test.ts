import { describe, expect, it } from "vitest";

import type { IdFactory, ModuleInstanceId } from "../../../src/contracts/ids";
import { ACID_BASS_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import { createDefaultState, PATTERN_SLOT_COUNT } from "../../../src/state/default-state";
import { PulseStore } from "../../../src/state/pulse-store";

const SEED = {
  pluginId: ACID_BASS_MANIFEST.pluginId,
  parameters: { cutoff: 720, waveform: "saw", volume: 0.62 },
  steps: Array.from({ length: 16 }, (_, index) => ({
    active: index % 4 === 0,
    note: 36,
    velocity: 0.8,
    accent: false,
    slide: false,
  })),
};

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

function harness() {
  const ids = deterministicIds();
  const store = new PulseStore(createDefaultState(ids, SEED), ids, SEED);
  const moduleId = store.getState().ui.selectedModuleId;
  if (moduleId === undefined) throw new Error("Expected a seeded module.");
  return { store, moduleId };
}

describe("pattern bank", () => {
  it("seeds a full bank with the seed in Verse and silence elsewhere", () => {
    const { store, moduleId } = harness();
    const module = store.getState().project.modules[moduleId];

    expect(store.getState().project.patterns).toHaveLength(PATTERN_SLOT_COUNT);
    expect(module?.parts).toHaveLength(PATTERN_SLOT_COUNT);
    expect(module?.parts[0]?.every((step) => !step.active)).toBe(true);
    expect(module?.parts[1]?.some((step) => step.active)).toBe(true);
  });

  it("edits only the selected Pattern", () => {
    const { store, moduleId } = harness();
    store.dispatch(store.createCommand("pattern-select", { patternIndex: 1 }));
    store.dispatch(store.createCommand("pattern-step-toggle", { moduleId, step: 3 }));

    const module = store.getState().project.modules[moduleId];
    expect(module?.parts[1]?.[3]?.active).toBe(true);
    expect(module?.parts[0]?.[3]?.active).toBe(false);
  });

  it("rejects a Pattern index outside the bank", () => {
    const { store } = harness();
    const result = store.dispatch(
      store.createCommand("pattern-select", { patternIndex: PATTERN_SLOT_COUNT }),
    );
    expect(result.status).toBe("rejected");
  });

  it("copies one Pattern over another across every module", () => {
    const { store, moduleId } = harness();
    store.dispatch(store.createCommand("pattern-copy", { fromPatternIndex: 0, toPatternIndex: 2 }));

    const module = store.getState().project.modules[moduleId];
    expect(module?.parts[2]).toEqual(module?.parts[0]);
  });

  it("clears a Pattern without touching the others", () => {
    const { store, moduleId } = harness();
    store.dispatch(store.createCommand("pattern-copy", { fromPatternIndex: 1, toPatternIndex: 0 }));
    store.dispatch(store.createCommand("pattern-clear", { patternIndex: 0 }));

    const module = store.getState().project.modules[moduleId];
    expect(module?.parts[0]?.every((step) => !step.active)).toBe(true);
    expect(module?.parts[1]?.some((step) => step.active)).toBe(true);
  });

  it("renames a Pattern and rejects an empty name", () => {
    const { store } = harness();
    store.dispatch(store.createCommand("pattern-rename", { patternIndex: 0, name: "  Intro  " }));
    expect(store.getState().project.patterns[0]?.name).toBe("Intro");

    expect(
      store.dispatch(store.createCommand("pattern-rename", { patternIndex: 0, name: "   " }))
        .status,
    ).toBe("rejected");
  });
});

describe("song chain", () => {
  it("appends, repeats, and removes entries", () => {
    const { store } = harness();
    store.dispatch(store.createCommand("song-entry-add", { patternIndex: 0 }));
    store.dispatch(store.createCommand("song-entry-add", { patternIndex: 1 }));
    store.dispatch(store.createCommand("song-entry-repeats-set", { entryIndex: 1, repeats: 4 }));

    expect(store.getState().project.song.entries).toEqual([
      { patternIndex: 0, repeats: 1 },
      { patternIndex: 1, repeats: 4 },
    ]);

    store.dispatch(store.createCommand("song-entry-remove", { entryIndex: 0 }));
    expect(store.getState().project.song.entries).toEqual([{ patternIndex: 1, repeats: 4 }]);
  });

  it("rejects a repeat count outside its range", () => {
    const { store } = harness();
    store.dispatch(store.createCommand("song-entry-add", { patternIndex: 0 }));
    expect(
      store.dispatch(store.createCommand("song-entry-repeats-set", { entryIndex: 0, repeats: 0 }))
        .status,
    ).toBe("rejected");
  });

  it("toggles song mode without disturbing the chain", () => {
    const { store } = harness();
    store.dispatch(store.createCommand("song-entry-add", { patternIndex: 0 }));
    store.dispatch(store.createCommand("song-mode-toggle", {}));

    expect(store.getState().project.song.enabled).toBe(true);
    expect(store.getState().project.song.entries).toHaveLength(1);
  });
});

describe("mixer commands", () => {
  it("sets level and pan within range and rejects outside it", () => {
    const { store, moduleId } = harness();
    store.dispatch(store.createCommand("mixer-level-set", { moduleId, level: 0.25 }));
    store.dispatch(store.createCommand("mixer-pan-set", { moduleId, pan: -0.5 }));

    expect(store.getState().project.modules[moduleId]?.level).toBe(0.25);
    expect(store.getState().project.modules[moduleId]?.pan).toBe(-0.5);

    expect(
      store.dispatch(store.createCommand("mixer-level-set", { moduleId, level: 1.5 })).status,
    ).toBe("rejected");
    expect(store.dispatch(store.createCommand("mixer-pan-set", { moduleId, pan: -2 })).status).toBe(
      "rejected",
    );
  });

  it("toggles mute and solo independently", () => {
    const { store, moduleId } = harness();
    store.dispatch(store.createCommand("mixer-mute-toggle", { moduleId }));
    expect(store.getState().project.modules[moduleId]?.muted).toBe(true);
    expect(store.getState().project.modules[moduleId]?.solo).toBe(false);

    store.dispatch(store.createCommand("mixer-solo-toggle", { moduleId }));
    expect(store.getState().project.modules[moduleId]?.solo).toBe(true);
  });

  it("rejects a mixer command for an unknown module", () => {
    const { store } = harness();
    const result = store.dispatch(
      store.createCommand("mixer-mute-toggle", {
        moduleId: "00000000-0000-4000-8000-999999999999" as ModuleInstanceId,
      }),
    );
    expect(result.status).toBe("rejected");
  });

  it("keeps master level in range and undoable", () => {
    const { store } = harness();
    store.dispatch(store.createCommand("mixer-master-level-set", { level: 0.4 }));
    expect(store.getState().project.masterLevel).toBe(0.4);
    expect(store.getState().history.canUndo).toBe(true);

    store.undo();
    expect(store.getState().project.masterLevel).toBe(0.5);
  });
});
