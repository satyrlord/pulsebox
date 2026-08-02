import type { PulseState } from "../model";
import type { ProjectRevision } from "../../contracts/ids";
import {
  documentToState,
  serializeProject,
  type ParseOptions,
  type ProjectDocument,
} from "./project-document";
import {
  parseStoredProject,
  type ProjectRepositoryPort,
  type StoredProject,
} from "./project-repository";

export interface AutosaveOptions {
  readonly repository: ProjectRepositoryPort;
  readonly parseOptions: ParseOptions;
  readonly now: () => string;
  /** Creation timestamp of the currently loaded project. */
  readonly createdAt: () => string;
  /** Last committed ProjectRevision. Autosave never advances it. */
  readonly projectRevision: () => ProjectRevision;
  /** Quiet period after the last edit before a snapshot is written. */
  readonly debounceMilliseconds?: number;
  readonly onError?: (error: unknown) => void;
}

export interface AutosaveController {
  /** Records an edit. The write happens once the edits stop. */
  readonly schedule: (state: Readonly<PulseState>) => void;
  /** Writes immediately, for page hide. */
  readonly flush: (state: Readonly<PulseState>) => Promise<void>;
  readonly dispose: () => void;
}

const DEFAULT_DEBOUNCE_MILLISECONDS = 750;
const MAXIMUM_AUTOSAVE_DELAY_MILLISECONDS = 5_000;

function toStored(
  state: Readonly<PulseState>,
  createdAt: string,
  now: string,
  projectRevision: ProjectRevision,
): StoredProject {
  return {
    id: state.project.id,
    name: state.project.name,
    modifiedAt: now,
    document: serializeProject(state, { createdAt, modifiedAt: now, projectRevision }),
  };
}

/**
 * Coalesces a burst of edits into one snapshot. Writes are serialized so a slow
 * disk cannot interleave two snapshots and leave the newer one overwritten.
 */
export function createAutosave(options: AutosaveOptions): AutosaveController {
  const debounce = options.debounceMilliseconds ?? DEFAULT_DEBOUNCE_MILLISECONDS;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingState: Readonly<PulseState> | undefined;
  let queue = Promise.resolve();
  let disposed = false;

  const write = (state: Readonly<PulseState>): Promise<void> => {
    queue = queue
      .then(() =>
        options.repository.saveAutosave(
          toStored(state, options.createdAt(), options.now(), options.projectRevision()),
        ),
      )
      .catch((error: unknown) => {
        options.onError?.(error);
      });
    return queue;
  };

  const clearPendingTimers = (): void => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    debounceTimer = undefined;
    deadlineTimer = undefined;
  };

  const writePending = (): void => {
    const state = pendingState;
    pendingState = undefined;
    clearPendingTimers();
    if (state !== undefined) void write(state);
  };

  return {
    schedule: (state) => {
      if (disposed) return;
      pendingState = state;
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(writePending, debounce);
      // The deadline belongs to the first edit in the unsaved series. Later
      // edits update the pending snapshot without moving this ceiling.
      deadlineTimer ??= setTimeout(writePending, MAXIMUM_AUTOSAVE_DELAY_MILLISECONDS);
    },
    flush: (state) => {
      pendingState = undefined;
      clearPendingTimers();
      return write(state);
    },
    dispose: () => {
      disposed = true;
      pendingState = undefined;
      clearPendingTimers();
    },
  };
}

export interface RestoredAutosave {
  readonly state: PulseState;
  /**
   * The parsed snapshot document, absent when no valid snapshot exists. The
   * caller reads the snapshot metadata from this one parse. A second
   * repository read could diverge from the record this restore applied.
   */
  readonly document?: ProjectDocument;
}

/**
 * Restores the last autosave, or returns the base state when there is none.
 * A snapshot that fails validation is discarded rather than partially applied,
 * and the failure reaches `onError` so the caller can report the discard.
 */
export async function restoreAutosave(
  base: Readonly<PulseState>,
  options: Pick<AutosaveOptions, "repository" | "parseOptions" | "onError">,
): Promise<RestoredAutosave> {
  try {
    const stored = await options.repository.loadAutosave();
    if (stored === undefined) return { state: base };
    const parsed = parseStoredProject(stored, options.parseOptions);
    if (!parsed.ok) {
      options.onError?.(parsed.issues);
      return { state: base };
    }
    return {
      state: documentToState(parsed.value.document, base),
      document: parsed.value.document,
    };
  } catch (error) {
    options.onError?.(error);
    return { state: base };
  }
}
