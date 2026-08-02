import type { StateRevision } from "../../contracts/ids";
import type { PulseState } from "../model";
import type { PulseStore } from "../pulse-store";

/** The detached state revision and durability of one completed project save. */
export interface ProjectSaveResult {
  readonly snapshotRevision: StateRevision;
  readonly durable: boolean;
}

/** Outcome of the section 9.2 save, replace, and save transaction. */
export interface TemplateCreateResult {
  readonly created: boolean;
  readonly saved: boolean;
}

export interface TemplateProjectOptions {
  readonly storageAvailable: boolean;
  readonly save: () => Promise<ProjectSaveResult>;
  readonly currentRevision: () => StateRevision;
  readonly createFresh: () => PulseState;
  /** Activates the detached template state without an asynchronous gap. */
  readonly activateFresh: (state: PulseState) => boolean;
}

function sameRevision(left: StateRevision, right: StateRevision): boolean {
  return left.epoch === right.epoch && left.counter === right.counter;
}

/** Replaces the active project through the state-owned mutation path. */
export function activateTemplateProject(
  store: PulseStore,
  fresh: PulseState,
  stopAudio: () => void,
): boolean {
  if (store.getState().transport.status !== "stopped") {
    stopAudio();
    store.dispatch(store.createCommand("transport-stop", {}));
  }
  const loaded = store.loadProject(fresh.project);
  return loaded.status === "accepted" && loaded.changed;
}

/**
 * Runs the starter-template transaction in the state layer. The first save
 * must still describe the active state before replacement. This check keeps an
 * edit made during that save in memory instead of replacing it with the fresh
 * template.
 */
export async function createProjectFromTemplate(
  options: TemplateProjectOptions,
): Promise<TemplateCreateResult> {
  if (options.storageAvailable) {
    try {
      const outgoing = await options.save();
      if (!outgoing.durable || !sameRevision(outgoing.snapshotRevision, options.currentRevision())) {
        return { created: false, saved: false };
      }
    } catch {
      return { created: false, saved: false };
    }
  }

  if (!options.activateFresh(options.createFresh())) {
    return { created: false, saved: false };
  }
  if (!options.storageAvailable) {
    return { created: true, saved: false };
  }

  try {
    const fresh = await options.save();
    return {
      created: true,
      saved: fresh.durable && sameRevision(fresh.snapshotRevision, options.currentRevision()),
    };
  } catch {
    return { created: true, saved: false };
  }
}
