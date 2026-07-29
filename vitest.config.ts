import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        // Engine, state, contracts, and the architecture policy stay DOM-free,
        // so a DOM leak into those layers fails here rather than in a browser.
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          restoreMocks: true,
        },
      },
      {
        test: {
          name: "component",
          include: ["tests/component/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/component/setup.ts"],
          restoreMocks: true,
        },
      },
    ],
  },
});
