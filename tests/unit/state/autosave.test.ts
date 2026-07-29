import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { browserIdFactory, type ProjectRevision } from "../../../src/contracts";
import { ACID_BASS_MANIFEST } from "../../../src/engine/public";
import {
  createAutosave,
  createDefaultState,
  createMemoryProjectRepository,
  type ModuleSeed,
  type ProjectRepositoryPort,
  type PulseState,
  type StoredProject,
} from "../../../src/state/public";

const SEED: ModuleSeed = {
  pluginId: ACID_BASS_MANIFEST.pluginId,
  parameters: { cutoff: 720, resonance: 0.38, waveform: "saw" },
  steps: Array.from({ length: 16 }, () => ({
    active: false,
    note: 36,
    velocity: 0.8,
    accent: false,
    slide: false,
  })),
};

const PROJECT_REVISION = {
  epoch: "0b32ad32-3584-4a91-a012-5eaa968af162",
  counter: 0,
} as ProjectRevision;

const PARSE_OPTIONS = {
  knownPluginIds: [ACID_BASS_MANIFEST.pluginId as string],
  parameterDescriptorsByPluginId: {
    [ACID_BASS_MANIFEST.pluginId]: ACID_BASS_MANIFEST.parameters,
  },
};

function stateNamed(name: string): PulseState {
  const state = createDefaultState(browserIdFactory, SEED);
  return Object.freeze({
    ...state,
    project: Object.freeze({ ...state.project, name }),
  });
}

function createController(repository: ProjectRepositoryPort) {
  return createAutosave({
    repository,
    parseOptions: PARSE_OPTIONS,
    createdAt: () => "2026-07-29T00:00:00.000Z",
    now: () => "2026-07-29T00:00:01.000Z",
    projectRevision: () => PROJECT_REVISION,
  });
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => {
      resolvePromise?.();
    },
  };
}

function repositoryWithSave(saveAutosave: (project: StoredProject) => Promise<void>) {
  return {
    save: (project: StoredProject) => Promise.resolve(project),
    createIfAbsent: (project: StoredProject) => Promise.resolve(project),
    load: () => Promise.resolve(undefined),
    list: () => Promise.resolve([]),
    remove: () => Promise.resolve(),
    removeIfRevision: () => Promise.resolve(false),
    saveAutosave,
    loadAutosave: () => Promise.resolve(undefined),
    clearAutosave: () => Promise.resolve(),
  } satisfies ProjectRepositoryPort;
}

describe("autosave timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses a 750 millisecond trailing debounce and writes the latest state", async () => {
    const repository = createMemoryProjectRepository();
    const saveAutosave = vi.spyOn(repository, "saveAutosave");
    const autosave = createController(repository);

    autosave.schedule(stateNamed("First edit"));
    await vi.advanceTimersByTimeAsync(500);
    autosave.schedule(stateNamed("Latest edit"));
    await vi.advanceTimersByTimeAsync(749);
    expect(saveAutosave).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(saveAutosave).toHaveBeenCalledTimes(1);
    expect(saveAutosave.mock.calls[0]?.[0].name).toBe("Latest edit");

    await vi.advanceTimersByTimeAsync(5_000);
    expect(saveAutosave).toHaveBeenCalledTimes(1);
    autosave.dispose();
  });

  it("writes no later than five seconds after the first edit in a continuous series", async () => {
    const repository = createMemoryProjectRepository();
    const saveAutosave = vi.spyOn(repository, "saveAutosave");
    const autosave = createController(repository);

    for (let edit = 0; edit < 10; edit += 1) {
      autosave.schedule(stateNamed(`Edit ${String(edit)}`));
      await vi.advanceTimersByTimeAsync(500);
    }

    expect(saveAutosave).toHaveBeenCalledTimes(1);
    expect(saveAutosave.mock.calls[0]?.[0].name).toBe("Edit 9");

    autosave.schedule(stateNamed("Next series"));
    await vi.advanceTimersByTimeAsync(750);
    expect(saveAutosave).toHaveBeenCalledTimes(2);
    expect(saveAutosave.mock.calls[1]?.[0].name).toBe("Next series");
    autosave.dispose();
  });

  it("flushes the supplied state once and cancels both pending timers", async () => {
    const repository = createMemoryProjectRepository();
    const saveAutosave = vi.spyOn(repository, "saveAutosave");
    const autosave = createController(repository);

    autosave.schedule(stateNamed("Pending edit"));
    await vi.advanceTimersByTimeAsync(500);
    const flushed = autosave.flush(stateNamed("Page hide snapshot"));
    autosave.dispose();
    await flushed;

    expect(saveAutosave).toHaveBeenCalledTimes(1);
    expect(saveAutosave.mock.calls[0]?.[0].name).toBe("Page hide snapshot");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(saveAutosave).toHaveBeenCalledTimes(1);
  });

  it("serializes writes when a later autosave becomes ready during an active write", async () => {
    const first = deferred();
    const second = deferred();
    const writes: StoredProject[] = [];
    const saveAutosave = vi.fn((project: StoredProject) => {
      writes.push(project);
      return writes.length === 1 ? first.promise : second.promise;
    });
    const autosave = createController(repositoryWithSave(saveAutosave));

    autosave.schedule(stateNamed("First write"));
    await vi.advanceTimersByTimeAsync(750);
    autosave.schedule(stateNamed("Second write"));
    await vi.advanceTimersByTimeAsync(750);
    expect(saveAutosave).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(saveAutosave).toHaveBeenCalledTimes(2);
    expect(writes.map((project) => project.name)).toEqual(["First write", "Second write"]);

    second.resolve();
    await vi.advanceTimersByTimeAsync(0);
    autosave.dispose();
  });

  it("discards pending work when disposed and ignores later schedules", async () => {
    const repository = createMemoryProjectRepository();
    const saveAutosave = vi.spyOn(repository, "saveAutosave");
    const autosave = createController(repository);

    autosave.schedule(stateNamed("Pending edit"));
    autosave.dispose();
    autosave.schedule(stateNamed("Ignored edit"));
    await vi.advanceTimersByTimeAsync(5_000);

    expect(saveAutosave).not.toHaveBeenCalled();
  });
});
