import { describe, expect, it, vi } from "vitest";

import { createBrowserProjectRepository } from "../../../src/composition/project-repository";

describe("browser project repository selection", () => {
  it("uses the explicit non-durable fallback after an asynchronous open denial", async () => {
    const request: {
      error: DOMException;
      onblocked: ((event: Event) => unknown) | null;
      onerror: ((event: Event) => unknown) | null;
      onsuccess: ((event: Event) => unknown) | null;
      onupgradeneeded: ((event: Event) => unknown) | null;
    } = {
      error: new DOMException("Storage denied.", "SecurityError"),
      onblocked: null,
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
    };
    const factory = {
      open: vi.fn(() => {
        queueMicrotask(() => request.onerror?.(new Event("error")));
        return request as unknown as IDBOpenDBRequest;
      }),
    } as unknown as IDBFactory;

    const selected = await createBrowserProjectRepository(factory);

    expect(selected.durable).toBe(false);
    await expect(selected.repository.list()).resolves.toEqual([]);
  });
});
