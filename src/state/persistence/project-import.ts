import type { IdFactory } from "../../contracts/ids";
import type { PulseState } from "../model";
import { documentToState, type ParseOptions } from "./project-document";
import { parsePortableProject } from "./portable-project";
import type { ProjectRepositoryPort, StoredProject } from "./project-repository";
import { projectRevisionFromMetadata } from "./project-revision";

export interface PreparedProjectImport {
  /** Synchronously swaps the already prepared candidate into the active runtime. */
  readonly activate: () => void;
  /** Releases all detached engine resources without touching the active runtime. */
  readonly dispose: () => void;
}

export interface PortableProjectImportOptions {
  readonly repository: ProjectRepositoryPort;
  readonly parseOptions: ParseOptions;
  readonly idFactory: IdFactory;
  readonly currentState: () => Readonly<PulseState>;
  /** Prepares plugins and their graph against a detached project copy. */
  readonly prepareCandidate: (candidate: PulseState) => Promise<PreparedProjectImport>;
}

export type PortableProjectImportResult =
  | { readonly ok: true; readonly committed: StoredProject }
  | { readonly ok: false; readonly reason: string };

/**
 * Validates, prepares, and commits an import before the active project changes.
 * The collision check means a failed post-commit activation can safely remove
 * the newly created head without overwriting existing user data.
 */
export async function commitPortableProjectImport(
  bytes: Uint8Array,
  options: PortableProjectImportOptions,
): Promise<PortableProjectImportResult> {
  const parsed = parsePortableProject(bytes, options.parseOptions);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.issues[0]?.message ?? "That file is not a Pulsebox project.",
    };
  }

  if ((await options.repository.load(parsed.value.project.id)) !== undefined) {
    return {
      ok: false,
      reason: "A stored project already uses this ID. Open the stored project instead.",
    };
  }

  const candidate = documentToState(parsed.value, options.currentState());
  let prepared: PreparedProjectImport;
  try {
    prepared = await options.prepareCandidate(candidate);
  } catch {
    return { ok: false, reason: "The imported project audio could not be prepared." };
  }

  let committed: StoredProject;
  try {
    const created = await options.repository.createIfAbsent(
      {
        id: parsed.value.project.id,
        name: parsed.value.project.name,
        modifiedAt: parsed.value.project.modifiedAt,
        document: parsed.value,
      },
      options.idFactory,
    );
    if (created === undefined) {
      prepared.dispose();
      return {
        ok: false,
        reason: "A stored project already uses this ID. Open the stored project instead.",
      };
    }
    committed = created;
  } catch {
    prepared.dispose();
    return { ok: false, reason: "The imported project could not be saved." };
  }

  try {
    prepared.activate();
  } catch {
    prepared.dispose();
    try {
      await options.repository.removeIfRevision(
        committed.id,
        projectRevisionFromMetadata(committed.document.project),
      );
    } catch {
      return {
        ok: false,
        reason: "The imported project could not be activated or removed from storage.",
      };
    }
    return { ok: false, reason: "The imported project could not be activated." };
  }

  return { ok: true, committed };
}
