import { describe, expect, it, vi } from "vitest";

import type { IdFactory, StateRevision } from "../../../src/contracts";
import {
  activateTemplateProject,
  createDefaultState,
  createProjectFromTemplate,
  PulseStore,
} from "../../../src/state/public";
import { deterministicIdFactory } from "../contracts/fixtures";

function nextRevision(revision: StateRevision): StateRevision {
  return { epoch: revision.epoch, counter: revision.counter + 1 };
}

function uniqueIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

describe("starter-template transaction", () => {
  it("stops transport and replaces the project through the state store", () => {
    const ids = uniqueIds();
    const store = new PulseStore(
      createDefaultState(ids),
      ids,
      () => undefined,
      () => undefined,
      () => false,
    );
    store.dispatch(store.createCommand("transport-play", {}));
    const fresh = createDefaultState(ids);
    const stopAudio = vi.fn();

    expect(activateTemplateProject(store, fresh, stopAudio)).toBe(true);
    expect(stopAudio).toHaveBeenCalledOnce();
    expect(store.getState().transport.status).toBe("stopped");
    expect(store.getState().project.id).toBe(fresh.project.id);
  });

  it("does not replace an edit made during the outgoing save", async () => {
    const fresh = createDefaultState(deterministicIdFactory);
    const snapshotRevision = fresh.project.revision;
    let currentRevision = snapshotRevision;
    let finishSave: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<{ snapshotRevision: StateRevision; durable: boolean }>((resolve) => {
          finishSave = () => {
            resolve({ snapshotRevision, durable: true });
          };
        }),
    );
    const activateFresh = vi.fn(() => true);

    const pending = createProjectFromTemplate({
      storageAvailable: true,
      save,
      currentRevision: () => currentRevision,
      createFresh: () => fresh,
      activateFresh,
    });
    currentRevision = nextRevision(currentRevision);
    finishSave?.();

    await expect(pending).resolves.toEqual({ created: false, saved: false });
    expect(activateFresh).not.toHaveBeenCalled();
  });

  it("creates an unsaved project when browser storage is unavailable", async () => {
    const fresh = createDefaultState(deterministicIdFactory);
    const save = vi.fn();
    const activateFresh = vi.fn(() => true);

    await expect(
      createProjectFromTemplate({
        storageAvailable: false,
        save,
        currentRevision: () => fresh.project.revision,
        createFresh: () => fresh,
        activateFresh,
      }),
    ).resolves.toEqual({ created: true, saved: false });
    expect(save).not.toHaveBeenCalled();
    expect(activateFresh).toHaveBeenCalledWith(fresh);
  });

  it("stores the outgoing project and the fresh project in order", async () => {
    const fresh = createDefaultState(deterministicIdFactory);
    let currentRevision = fresh.project.revision;
    const save = vi.fn(() =>
      Promise.resolve({ snapshotRevision: currentRevision, durable: true }),
    );
    const activateFresh = vi.fn(() => {
      currentRevision = nextRevision(currentRevision);
      return true;
    });

    await expect(
      createProjectFromTemplate({
        storageAvailable: true,
        save,
        currentRevision: () => currentRevision,
        createFresh: () => fresh,
        activateFresh,
      }),
    ).resolves.toEqual({ created: true, saved: true });
    expect(save).toHaveBeenCalledTimes(2);
    expect(activateFresh).toHaveBeenCalledOnce();
  });

  it("keeps a fresh project dirty when it changes during its save", async () => {
    const fresh = createDefaultState(deterministicIdFactory);
    let currentRevision = fresh.project.revision;
    let saveCount = 0;
    const save = vi.fn(() => {
      saveCount += 1;
      const snapshotRevision = currentRevision;
      if (saveCount === 2) currentRevision = nextRevision(currentRevision);
      return Promise.resolve({ snapshotRevision, durable: true });
    });

    await expect(
      createProjectFromTemplate({
        storageAvailable: true,
        save,
        currentRevision: () => currentRevision,
        createFresh: () => fresh,
        activateFresh: () => true,
      }),
    ).resolves.toEqual({ created: true, saved: false });
  });
});
