import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const SUPPORTED_WIDTH = 1_440;
const SUPPORTED_HEIGHT = 900;

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
