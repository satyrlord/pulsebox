import { describe, expect, it } from "vitest";

import { createGestureId, type IdFactory } from "../../../src/contracts/ids";
import type { ParameterId, PluginId } from "../../../src/contracts/parameters";
import { createDefaultState, DEFAULT_PATTERN_HUMANIZE } from "../../../src/state/default-state";
import {
  createParameterValidator,
  documentToState,
  parseProjectDocument,
  serializeProject,
  type ParseOptions,
} from "../../../src/state/persistence/project-document";
import { nextProjectRevision } from "../../../src/state/persistence/project-revision";
import { PulseStore, type PulseEngineDelta } from "../../../src/state/pulse-store";

const seed = {
  pluginId: "bass-mono" as PluginId,
  parameters: { cutoff: 720 },
  steps: Array.from({ length: 16 }, (_, index) => ({
    active: index % 2 === 0,
    note: 36,
    velocity: 0.8,
    accent: index % 4 === 0,
    slide: false,
  })),
};

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

function createStore(deltas: PulseEngineDelta[] = []): PulseStore {
  const ids = deterministicIds();
  return new PulseStore(
    createDefaultState(ids, seed),
    ids,
    seed,
    (delta) => {
      deltas.push(delta);
    },
    createParameterValidator((pluginId) => parseOptions.parameterDescriptorsByPluginId[pluginId]),
  );
}

const parseOptions: ParseOptions = {
  knownPluginIds: ["bass-mono"],
  parameterDescriptorsByPluginId: {
    "bass-mono": [
      { id: "cutoff" as ParameterId, valueType: "float", minimum: 0, maximum: 20_000 },
    ],
  },
};

describe("Pattern timing commands", () => {
  it("seeds every default Pattern with the default Humanize and a stable seed", () => {
    const state = createDefaultState(deterministicIds(), seed);
    for (const pattern of state.project.patterns) {
      expect(pattern.humanize).toBe(DEFAULT_PATTERN_HUMANIZE);
      expect(Number.isSafeInteger(pattern.seed)).toBe(true);
      expect(pattern.seed).toBeGreaterThanOrEqual(0);
      expect(pattern.seed).toBeLessThanOrEqual(0xffff_ffff);
    }
    const again = createDefaultState(deterministicIds(), seed);
    expect(again.project.patterns.map((pattern) => pattern.seed)).toEqual(
      state.project.patterns.map((pattern) => pattern.seed),
    );
  });

  it("sets Pattern Humanize through a validated undoable command", () => {
    const deltas: PulseEngineDelta[] = [];
    const store = createStore(deltas);

    const result = store.dispatch(
      store.createCommand("pattern-humanize-set", { patternIndex: 1, humanize: 0.4 }),
    );
    expect(result).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.patterns[1]?.humanize).toBe(0.4);
    expect(deltas.at(-1)).toMatchObject({
      kind: "pattern-timing-set",
      payload: { patternIndex: 1, humanize: 0.4 },
    });

    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.patterns[1]?.humanize).toBe(DEFAULT_PATTERN_HUMANIZE);
  });

  it("coalesces a Humanize slider gesture into one undo entry", () => {
    const store = createStore();
    const gestureId = createGestureId(deterministicIds());
    for (const humanize of [0.2, 0.3, 0.5]) {
      store.dispatch(
        store.createCommand("pattern-humanize-set", { patternIndex: 1, humanize }, { gestureId }),
      );
    }
    expect(store.getState().project.patterns[1]?.humanize).toBe(0.5);
    store.undo();
    expect(store.getState().project.patterns[1]?.humanize).toBe(DEFAULT_PATTERN_HUMANIZE);
    expect(store.getState().history.canUndo).toBe(false);
  });

  it("rejects an out-of-range Humanize or seed and an unknown Pattern", () => {
    const store = createStore();
    expect(
      store.dispatch(
        store.createCommand("pattern-humanize-set", { patternIndex: 1, humanize: 1.5 }),
      ).status,
    ).toBe("rejected");
    expect(
      store.dispatch(store.createCommand("pattern-humanize-set", { patternIndex: 9, humanize: 0.2 }))
        .status,
    ).toBe("rejected");
    expect(
      store.dispatch(store.createCommand("pattern-seed-set", { patternIndex: 1, seed: -1 })).status,
    ).toBe("rejected");
    expect(
      store.dispatch(
        store.createCommand("pattern-seed-set", { patternIndex: 1, seed: 0x1_0000_0000 }),
      ).status,
    ).toBe("rejected");
  });

  it("stores a new seed as a new deterministic variation", () => {
    const deltas: PulseEngineDelta[] = [];
    const store = createStore(deltas);
    const before = store.getState().project.patterns[1]?.seed;

    const result = store.dispatch(
      store.createCommand("pattern-seed-set", { patternIndex: 1, seed: 987_654 }),
    );
    expect(result).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.patterns[1]?.seed).toBe(987_654);
    expect(deltas.at(-1)).toMatchObject({
      kind: "pattern-timing-set",
      payload: { patternIndex: 1, seed: 987_654 },
    });

    store.undo();
    expect(store.getState().project.patterns[1]?.seed).toBe(before);
  });
});

describe("transport seek command", () => {
  it("positions the playhead and start marker while stopped, without undo", () => {
    const deltas: PulseEngineDelta[] = [];
    const store = createStore(deltas);

    const result = store.dispatch(
      store.createCommand("transport-seek", { positionTicks: 1_920 }),
    );
    expect(result).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().transport.positionTicks).toBe(1_920);
    expect(store.getState().transport.startMarkerTicks).toBe(1_920);
    expect(store.getState().history.canUndo).toBe(false);
    expect(deltas.at(-1)).toMatchObject({
      kind: "transport",
      payload: { positionTicks: 1_920, startMarkerTicks: 1_920 },
    });
  });

  it("returns to the marker on Stop and rejects a seek while playing", () => {
    const store = createStore();
    store.dispatch(store.createCommand("transport-seek", { positionTicks: 960 }));
    store.dispatch(store.createCommand("transport-play", {}));
    expect(
      store.dispatch(store.createCommand("transport-seek", { positionTicks: 0 })).status,
    ).toBe("rejected");
    store.dispatch(store.createCommand("transport-pause", { positionTicks: 2_400 }));
    store.dispatch(store.createCommand("transport-stop", {}));
    expect(store.getState().transport.positionTicks).toBe(960);
  });

  it("rejects a fractional or negative position", () => {
    const store = createStore();
    expect(
      store.dispatch(store.createCommand("transport-seek", { positionTicks: -1 })).status,
    ).toBe("rejected");
    expect(
      store.dispatch(store.createCommand("transport-seek", { positionTicks: 1.5 })).status,
    ).toBe("rejected");
  });
});

describe("Pattern timing serialization", () => {
  it("round-trips Humanize and seed through the document", () => {
    const ids = deterministicIds();
    const store = createStore();
    store.dispatch(
      store.createCommand("pattern-humanize-set", { patternIndex: 1, humanize: 0.33 }),
    );
    store.dispatch(store.createCommand("pattern-seed-set", { patternIndex: 1, seed: 42 }));

    const document = serializeProject(store.getState(), {
      createdAt: "2026-07-30T00:00:00.000Z",
      modifiedAt: "2026-07-31T00:00:00.000Z",
      projectRevision: nextProjectRevision(undefined, ids),
    });
    const parsed = parseProjectDocument(JSON.parse(JSON.stringify(document)), parseOptions);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const restored = documentToState(parsed.value, createDefaultState(deterministicIds(), seed));
    expect(restored.project.patterns[1]?.humanize).toBe(0.33);
    expect(restored.project.patterns[1]?.seed).toBe(42);
  });

  it("snaps a committed Swing to the whole-percent grid the document stores", () => {
    const ids = deterministicIds();
    const store = createStore();
    store.dispatch(store.createCommand("transport-swing-set", { swing: 0.505 }));
    const committed = store.getState().project.swing;
    // The store accepts only values that survive the percent serialization.
    expect(committed).toBe(0.51);

    const document = serializeProject(store.getState(), {
      createdAt: "2026-07-30T00:00:00.000Z",
      modifiedAt: "2026-07-31T00:00:00.000Z",
      projectRevision: nextProjectRevision(undefined, ids),
    });
    const parsed = parseProjectDocument(JSON.parse(JSON.stringify(document)), parseOptions);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = documentToState(parsed.value, createDefaultState(deterministicIds(), seed));
    expect(restored.project.swing).toBe(committed);
  });

  it("keeps an old document without timing fields mechanical and deterministic", () => {
    const ids = deterministicIds();
    const document = serializeProject(createStore().getState(), {
      createdAt: "2026-07-30T00:00:00.000Z",
      modifiedAt: "2026-07-31T00:00:00.000Z",
      projectRevision: nextProjectRevision(undefined, ids),
    });
    const legacy = {
      ...document,
      patterns: document.patterns.map((record) => {
        const rest: Record<string, unknown> = { ...record };
        delete rest.humanize;
        delete rest.seed;
        return rest;
      }),
    };

    const parsed = parseProjectDocument(JSON.parse(JSON.stringify(legacy)), parseOptions);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = documentToState(parsed.value, createDefaultState(deterministicIds(), seed));
    for (const pattern of restored.project.patterns) {
      expect(pattern.humanize).toBe(0);
      expect(Number.isSafeInteger(pattern.seed)).toBe(true);
    }
    const again = documentToState(parsed.value, createDefaultState(deterministicIds(), seed));
    expect(again.project.patterns.map((pattern) => pattern.seed)).toEqual(
      restored.project.patterns.map((pattern) => pattern.seed),
    );
  });

  it("rejects an out-of-range serialized Humanize or seed", () => {
    const ids = deterministicIds();
    const document = serializeProject(createStore().getState(), {
      createdAt: "2026-07-30T00:00:00.000Z",
      modifiedAt: "2026-07-31T00:00:00.000Z",
      projectRevision: nextProjectRevision(undefined, ids),
    });
    const hostile = {
      ...document,
      patterns: document.patterns.map((record, index) =>
        index === 0 ? { ...record, humanize: 101, seed: -3 } : record,
      ),
    };
    const parsed = parseProjectDocument(JSON.parse(JSON.stringify(hostile)), parseOptions);
    expect(parsed.ok).toBe(false);
  });
});
