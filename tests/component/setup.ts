import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

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

/**
 * jsdom implements no canvas rendering context. The stub lets the level meter
 * install its animation loop, theme observer, and visibility listener. It
 * carries only the members the meter draws with. Other calls fail instead of
 * passing as silent no-ops.
 */
function createContext2dStub(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const stub = {
    canvas,
    fillStyle: "#000000",
    shadowBlur: 0,
    shadowColor: "transparent",
    clearRect: () => undefined,
    fillRect: () => undefined,
    setTransform: () => undefined,
  };
  return stub as unknown as CanvasRenderingContext2D;
}

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  writable: true,
  value: function getContext(this: HTMLCanvasElement, contextId: string): unknown {
    return contextId === "2d" ? createContext2dStub(this) : null;
  },
});

/**
 * jsdom has no scrolling. The rack reveals the selected module through
 * `scrollIntoView`, so the shim keeps it mountable. It never moves anything:
 * jsdom computes no layout, so there is nothing to scroll.
 */
if (typeof Element.prototype.scrollIntoView === "undefined") {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
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
  // A failed fake-timer test must not leak a faked clock into later tests.
  vi.useRealTimers();
});
