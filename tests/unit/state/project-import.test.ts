import { describe, expect, it, vi } from "vitest";

import type { ProjectRevision } from "../../../src/contracts";
import { browserIdFactory } from "../../../src/composition/browser-id-factory";
import { BASS_MONO_DEFAULT_PARAMETERS, BASS_MONO_MANIFEST } from "../../../src/engine/public";
import {
  commitPortableProjectImport,
  createDefaultState,
  createMemoryProjectRepository,
  createSilentSteps,
  serializePortableProject,
  serializeProject,
  type ModuleSeed,
  type ProjectRepositoryPort,
  type StoredProject,
} from "../../../src/state/public";

const SEED: ModuleSeed = {
  pluginId: BASS_MONO_MANIFEST.pluginId,
  parameters: BASS_MONO_DEFAULT_PARAMETERS,
  steps: createSilentSteps(),
};

const PARSE_OPTIONS = {
  knownPluginIds: [BASS_MONO_MANIFEST.pluginId as string],
  parameterDescriptorsByPluginId: {
    [BASS_MONO_MANIFEST.pluginId]: BASS_MONO_MANIFEST.parameters,
  },
};

function fixture() {
  const state = createDefaultState(browserIdFactory, SEED);
  const timestamp = "2026-07-29T00:00:00.000Z";
  const revision = {
    epoch: browserIdFactory.createUuid(),
    counter: 3,
  } as ProjectRevision;
  const document = serializeProject(state, {
    createdAt: timestamp,
    modifiedAt: timestamp,
    projectRevision: revision,
  });
  return { state, document, bytes: serializePortableProject(document) };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      resolvePromise?.(value);
    },
  };
}

describe("portable project import transaction", () => {
  it("does not save or activate when detached engine preparation fails", async () => {
    const { state, bytes } = fixture();
    const repository = createMemoryProjectRepository();
    const activate = vi.fn();

    const result = await commitPortableProjectImport(bytes, {
      repository,
      parseOptions: PARSE_OPTIONS,
      idFactory: browserIdFactory,
      currentState: () => state,
      prepareCandidate: () => Promise.reject(new Error("worklet failed")),
    });

    expect(result).toEqual({
      ok: false,
      reason: "The imported project audio could not be prepared.",
    });
    expect(await repository.list()).toEqual([]);
    expect(activate).not.toHaveBeenCalled();
  });

  it("commits the project before activating the prepared candidate", async () => {
    const { state, bytes } = fixture();
    const memory = createMemoryProjectRepository();
    const order: string[] = [];
    let saved = false;
    const repository: ProjectRepositoryPort = {
      ...memory,
      createIfAbsent: async (project, idFactory) => {
        order.push("save");
        const committed = await memory.createIfAbsent(project, idFactory);
        saved = true;
        return committed;
      },
    };

    const result = await commitPortableProjectImport(bytes, {
      repository,
      parseOptions: PARSE_OPTIONS,
      idFactory: browserIdFactory,
      currentState: () => state,
      prepareCandidate: () => {
        order.push("prepare");
        return Promise.resolve({
          activate: () => {
            expect(saved).toBe(true);
            order.push("activate");
          },
          dispose: vi.fn(),
        });
      },
    });

    expect(result.ok).toBe(true);
    expect(order).toEqual(["prepare", "save", "activate"]);
    expect(await repository.list()).toHaveLength(1);
  });

  it("disposes prepared audio and leaves no head when the save fails", async () => {
    const { state, bytes } = fixture();
    const memory = createMemoryProjectRepository();
    const dispose = vi.fn();
    const activate = vi.fn();
    const repository: ProjectRepositoryPort = {
      ...memory,
      createIfAbsent: () => Promise.reject(new Error("quota")),
    };

    const result = await commitPortableProjectImport(bytes, {
      repository,
      parseOptions: PARSE_OPTIONS,
      idFactory: browserIdFactory,
      currentState: () => state,
      prepareCandidate: () => Promise.resolve({ activate, dispose }),
    });

    expect(result.ok).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
    expect(await repository.list()).toEqual([]);
  });

  it("removes the newly committed head when activation rejects", async () => {
    const { state, bytes } = fixture();
    const repository = createMemoryProjectRepository();
    const dispose = vi.fn();

    const result = await commitPortableProjectImport(bytes, {
      repository,
      parseOptions: PARSE_OPTIONS,
      idFactory: browserIdFactory,
      currentState: () => state,
      prepareCandidate: () =>
        Promise.resolve({
          activate: () => {
            throw new Error("swap failed");
          },
          dispose,
        }),
    });

    expect(result).toEqual({
      ok: false,
      reason: "The imported project could not be activated.",
    });
    expect(dispose).toHaveBeenCalledOnce();
    expect(await repository.list()).toEqual([]);
  });

  it("preserves a same-ID head created while detached audio is preparing", async () => {
    const { state, document, bytes } = fixture();
    const repository = createMemoryProjectRepository();
    const preparationStarted = deferred<boolean>();
    const preparation = deferred<{ readonly activate: () => void; readonly dispose: () => void }>();
    const dispose = vi.fn();
    const activate = vi.fn();

    const importing = commitPortableProjectImport(bytes, {
      repository,
      parseOptions: PARSE_OPTIONS,
      idFactory: browserIdFactory,
      currentState: () => state,
      prepareCandidate: () => {
        preparationStarted.resolve(true);
        return preparation.promise;
      },
    });
    await preparationStarted.promise;

    const concurrent = await repository.save(
      {
        id: document.project.id,
        name: document.project.name,
        modifiedAt: document.project.modifiedAt,
        document,
      },
      browserIdFactory,
    );
    preparation.resolve({ activate, dispose });
    const result = await importing;

    expect(result).toEqual({
      ok: false,
      reason: "A stored project already uses this ID. Open the stored project instead.",
    });
    expect(dispose).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
    expect(await repository.load(document.project.id)).toEqual(concurrent);
  });

  it("does not roll back a newer head after activation fails", async () => {
    const { state, document, bytes } = fixture();
    const repository = createMemoryProjectRepository();
    const dispose = vi.fn();
    const stored: StoredProject = {
      id: document.project.id,
      name: document.project.name,
      modifiedAt: document.project.modifiedAt,
      document,
    };

    const result = await commitPortableProjectImport(bytes, {
      repository,
      parseOptions: PARSE_OPTIONS,
      idFactory: browserIdFactory,
      currentState: () => state,
      prepareCandidate: () =>
        Promise.resolve({
          activate: () => {
            void repository.save(stored, browserIdFactory);
            throw new Error("swap failed");
          },
          dispose,
        }),
    });

    expect(result.ok).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    const preserved = await repository.load(document.project.id);
    expect(preserved?.document.project.revision).toBe(1);
  });
});
