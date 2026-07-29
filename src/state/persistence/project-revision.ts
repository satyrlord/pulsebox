import {
  createRevisionEpoch,
  validateProjectRevision,
  type IdFactory,
  type ProjectRevision,
  type RevisionEpoch,
} from "../../contracts/ids";

const MAXIMUM_PROJECT_REVISION_COUNTER = Number.MAX_SAFE_INTEGER;

/**
 * Returns the token for the next committed head. Runtime StateRevision values
 * never enter this calculation.
 */
export function nextProjectRevision(
  current: ProjectRevision | undefined,
  idFactory: IdFactory,
): ProjectRevision {
  if (current === undefined || current.counter === MAXIMUM_PROJECT_REVISION_COUNTER) {
    return Object.freeze({ epoch: createRevisionEpoch(idFactory), counter: 0 });
  }
  return Object.freeze({ epoch: current.epoch, counter: current.counter + 1 });
}

export function projectRevisionFromMetadata(metadata: {
  readonly revisionEpoch: string;
  readonly revision: number;
}): ProjectRevision {
  const result = validateProjectRevision({
    epoch: metadata.revisionEpoch as RevisionEpoch,
    counter: metadata.revision,
  });
  if (!result.ok) {
    throw new TypeError(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" "));
  }
  return Object.freeze(result.value);
}
