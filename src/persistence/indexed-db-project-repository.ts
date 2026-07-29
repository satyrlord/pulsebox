import {
  AUTOSAVE_STORE,
  DATABASE_NAME,
  DATABASE_VERSION,
  PROJECT_STORE,
  type ProjectRepositoryPort,
  type StoredProject,
  commitStoredProject,
  projectRevisionFromMetadata,
} from "../state/public";

/**
 * The browser-backed project repository. This is the only file that names
 * IndexedDB; the state layer sees the port and nothing else.
 */

const AUTOSAVE_KEY = "current";

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => {
      resolve(value.result);
    };
    value.onerror = () => {
      reject(value.error ?? new Error("The project database rejected a request."));
    };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("The project transaction aborted."));
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("The project transaction failed."));
    };
  });
}

export function openProjectDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DATABASE_NAME, DATABASE_VERSION);
    open.onupgradeneeded = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(AUTOSAVE_STORE)) {
        database.createObjectStore(AUTOSAVE_STORE);
      }
    };
    open.onsuccess = () => {
      resolve(open.result);
    };
    open.onerror = () => {
      reject(open.error ?? new Error("The project database could not be opened."));
    };
    open.onblocked = () => {
      reject(new Error("Another tab is holding the project database open."));
    };
  });
}

export function createIndexedDbProjectRepository(factory: IDBFactory): ProjectRepositoryPort {
  let connection: Promise<IDBDatabase> | undefined;
  const database = () => (connection ??= openProjectDatabase(factory));

  const write = async (store: string, value: StoredProject, key?: string): Promise<void> => {
    const db = await database();
    const transaction = db.transaction(store, "readwrite");
    // The put and the transaction are awaited together, so a rejected write can
    // never look like a successful save.
    const put = request(transaction.objectStore(store).put(value, key));
    await Promise.all([put, transactionDone(transaction)]);
  };

  const read = async (store: string, key: string): Promise<StoredProject | undefined> => {
    const db = await database();
    const transaction = db.transaction(store, "readonly");
    const result = await request<StoredProject | undefined>(
      transaction.objectStore(store).get(key) as IDBRequest<StoredProject | undefined>,
    );
    await transactionDone(transaction);
    return result;
  };

  return {
    save: async (project, idFactory) => {
      const db = await database();
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(PROJECT_STORE);
      const current = await request<StoredProject | undefined>(
        store.get(project.id) as IDBRequest<StoredProject | undefined>,
      );
      const committed = commitStoredProject(project, current, idFactory);
      await request(store.put(committed));
      await done;
      return committed;
    },
    createIfAbsent: async (project, idFactory) => {
      const db = await database();
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(PROJECT_STORE);
      const current = await request<StoredProject | undefined>(
        store.get(project.id) as IDBRequest<StoredProject | undefined>,
      );
      if (current !== undefined) {
        await done;
        return undefined;
      }
      const committed = commitStoredProject(project, undefined, idFactory);
      await request(store.add(committed));
      await done;
      return committed;
    },
    load: (id) => read(PROJECT_STORE, id),
    list: async () => {
      const db = await database();
      const transaction = db.transaction(PROJECT_STORE, "readonly");
      const result = await request<StoredProject[]>(
        transaction.objectStore(PROJECT_STORE).getAll() as IDBRequest<StoredProject[]>,
      );
      await transactionDone(transaction);
      return result;
    },
    remove: async (id) => {
      const db = await database();
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      await Promise.all([
        request(transaction.objectStore(PROJECT_STORE).delete(id)),
        transactionDone(transaction),
      ]);
    },
    removeIfRevision: async (id, expected) => {
      const db = await database();
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(PROJECT_STORE);
      const current = await request<StoredProject | undefined>(
        store.get(id) as IDBRequest<StoredProject | undefined>,
      );
      if (current === undefined) {
        await done;
        return false;
      }
      const revision = projectRevisionFromMetadata(current.document.project);
      if (revision.epoch !== expected.epoch || revision.counter !== expected.counter) {
        await done;
        return false;
      }
      await request(store.delete(id));
      await done;
      return true;
    },
    saveAutosave: (project) => write(AUTOSAVE_STORE, project, AUTOSAVE_KEY),
    loadAutosave: () => read(AUTOSAVE_STORE, AUTOSAVE_KEY),
    clearAutosave: async () => {
      const db = await database();
      const transaction = db.transaction(AUTOSAVE_STORE, "readwrite");
      await Promise.all([
        request(transaction.objectStore(AUTOSAVE_STORE).delete(AUTOSAVE_KEY)),
        transactionDone(transaction),
      ]);
    },
  };
}
