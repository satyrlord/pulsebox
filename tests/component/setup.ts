import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const SUPPORTED_WIDTH = 1_440;
const SUPPORTED_HEIGHT = 900;

/**
 * jsdom has no ResizeObserver. The fader and the stretched level meter observe
 * their own size, so the shim keeps them mountable. It never fires: jsdom has
 * no layout, so there is no size to report.
 */
class ResizeObserverShim implements ResizeObserver {
  observe(): void {
    // jsdom computes no layout, so there is never a size change to deliver.
  }

  unobserve(): void {
    // Nothing is ever observed.
  }

  disconnect(): void {
    // Nothing is ever observed.
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverShim;
}

function setSupportedViewport(): void {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: SUPPORTED_WIDTH },
    innerHeight: { configurable: true, value: SUPPORTED_HEIGHT },
  });
}

setSupportedViewport();

afterEach(() => {
  cleanup();
  setSupportedViewport();
});
