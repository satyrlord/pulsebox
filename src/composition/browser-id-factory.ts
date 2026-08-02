/**
 * The browser IdFactory. The composition root is the only place that selects
 * browser implementations (ARCHITECTURE section 13), so the crypto-backed
 * factory lives here and every layer receives an injected `IdFactory`. The
 * contracts area stays data-only.
 */

import type { IdFactory } from "../contracts/ids";

export const browserIdFactory: IdFactory = Object.freeze({
  createUuid(): string {
    return globalThis.crypto.randomUUID();
  },
});
