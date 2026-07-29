import type { IdFactory, ProjectRevision } from "../../contracts/ids";
import { isPlainRecord } from "../../contracts/validation";
import {
  parseProjectDocument,
  type DocumentResult,
  type ParseOptions,
  type ProjectDocument,
} from "./project-document";
import { nextProjectRevision, projectRevisionFromMetadata } from "./project-revision";

/**
 * The repository port and its in-memory implementation. The browser-backed
 * adapter lives in `src/persistence/` because the state layer must hold no
 * browser object. Per `docs/PROJECT-FORMAT.md` section 7.1 the browser-resident
 * database is named here so both sides agree on it.
 */

export const DATABASE_NAME = "pulsebox-v1";
export const DATABASE_VERSION = 1;
export const PROJECT_STORE = "projects";
export const AUTOSAVE_STORE = "autosave";

export interface StoredProject {
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly document: ProjectDocument;
}

export interface ProjectRepositoryPort {
  /** Atomically derives and writes the next committed ProjectRevision. */
  save(project: StoredProject, idFactory: IdFactory): Promise<StoredProject>;
  /** Atomically creates a head only when its project ID is still unused. */
  createIfAbsent(project: StoredProject, idFactory: IdFactory): Promise<StoredProject | undefined>;
  load(id: string): Promise<StoredProject | undefined>;
  list(): Promise<readonly StoredProject[]>;
  remove(id: string): Promise<void>;
  /** Removes a head only when it still has the exact expected revision token. */
  removeIfRevision(id: string, expected: ProjectRevision): Promise<boolean>;
  /** Latest crash-recovery snapshot. One record, overwritten in place. */
  saveAutosave(project: StoredProject): Promise<void>;
  loadAutosave(): Promise<StoredProject | undefined>;
  clearAutosave(): Promise<void>;
}

/** Validates an untrusted IndexedDB record before it can reach active state. */
export function parseStoredProject(
  value: unknown,
  options: ParseOptions,
): DocumentResult<StoredProject> {
  if (!isPlainRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Stored project must be an object." }] };
  }
  const parsed = parseProjectDocument(value.document, options);
  if (!parsed.ok) return parsed;
  const issues = [];
  if (value.id !== parsed.value.project.id) {
    issues.push({ path: "id", message: "Stored record ID does not match project metadata." });
  }
  if (value.name !== parsed.value.project.name) {
    issues.push({ path: "name", message: "Stored record name does not match project metadata." });
  }
  if (value.modifiedAt !== parsed.value.project.modifiedAt) {
    issues.push({
      path: "modifiedAt",
      message: "Stored record timestamp does not match project metadata.",
    });
  }
  return issues.length === 0
    ? {
        ok: true,
        value: Object.freeze({
          id: parsed.value.project.id,
          name: parsed.value.project.name,
          modifiedAt: parsed.value.project.modifiedAt,
          document: parsed.value,
        }),
      }
    : { ok: false, issues };
}

/** In-memory repository for tests and for a browser that denies storage. */
export function createMemoryProjectRepository(): ProjectRepositoryPort {
  const projects = new Map<string, StoredProject>();
  let autosave: StoredProject | undefined;

  return {
    save: (project, idFactory) => {
      const committed = commitStoredProject(project, projects.get(project.id), idFactory);
      projects.set(project.id, committed);
      return Promise.resolve(committed);
    },
    createIfAbsent: (project, idFactory) => {
      if (projects.has(project.id)) return Promise.resolve(undefined);
      const committed = commitStoredProject(project, undefined, idFactory);
      projects.set(project.id, committed);
      return Promise.resolve(committed);
    },
    load: (id) => Promise.resolve(projects.get(id)),
    list: () => Promise.resolve([...projects.values()]),
    remove: (id) => {
      projects.delete(id);
      return Promise.resolve();
    },
    removeIfRevision: (id, expected) => {
      const current = projects.get(id);
      if (current === undefined || !hasProjectRevision(current, expected)) {
        return Promise.resolve(false);
      }
      projects.delete(id);
      return Promise.resolve(true);
    },
    saveAutosave: (project) => {
      autosave = project;
      return Promise.resolve();
    },
    loadAutosave: () => Promise.resolve(autosave),
    clearAutosave: () => {
      autosave = undefined;
      return Promise.resolve();
    },
  };
}

function hasProjectRevision(project: StoredProject, expected: ProjectRevision): boolean {
  const current = projectRevisionFromMetadata(project.document.project);
  return current.epoch === expected.epoch && current.counter === expected.counter;
}

/** Builds the detached record that a repository writes in its save transaction. */
export function commitStoredProject(
  candidate: StoredProject,
  current: StoredProject | undefined,
  idFactory: IdFactory,
): StoredProject {
  const currentRevision =
    current === undefined ? undefined : projectRevisionFromMetadata(current.document.project);
  const next = nextProjectRevision(currentRevision, idFactory);
  const document = Object.freeze({
    ...candidate.document,
    project: Object.freeze({
      ...candidate.document.project,
      revisionEpoch: next.epoch,
      revision: next.counter,
    }),
  });
  return Object.freeze({ ...candidate, document });
}
