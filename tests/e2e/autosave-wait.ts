import { expect, type Page } from "@playwright/test";

/** Reads the current autosave record. A fresh profile returns null. */
export async function readAutosaveRecord(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pulsebox-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("The project database could not open."));
    });
    const transaction = database.transaction("autosave", "readonly");
    const record = await new Promise<unknown>((resolve, reject) => {
      const request = transaction.objectStore("autosave").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("The autosave record could not load."));
    });
    database.close();
    return record;
  });
}

/** Polls IndexedDB until the autosave record contains the given serialized text. */
export async function waitForAutosaveValue(page: Page, value: string): Promise<void> {
  await expect
    .poll(async () => {
      const record = await readAutosaveRecord(page);
      return typeof record === "object" && record !== null && JSON.stringify(record).includes(value);
    })
    .toBe(true);
}

/** Polls IndexedDB until any autosave snapshot lands. */
export async function waitForAutosaveSnapshot(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const record = await readAutosaveRecord(page);
      return typeof record === "object" && record !== null;
    })
    .toBe(true);
}
