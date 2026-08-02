import { createIndexedDbProjectRepository } from "../persistence/public";
import { createMemoryProjectRepository, type ProjectRepositoryPort } from "../state/public";

export interface BrowserProjectRepository {
  readonly repository: ProjectRepositoryPort;
  readonly durable: boolean;
}

/** Selects durable browser storage, with an explicit non-durable fallback. */
export async function createBrowserProjectRepository(
  factory: IDBFactory,
): Promise<BrowserProjectRepository> {
  try {
    return {
      repository: await createIndexedDbProjectRepository(factory),
      durable: true,
    };
  } catch {
    return {
      repository: createMemoryProjectRepository(),
      durable: false,
    };
  }
}
