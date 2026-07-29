import { describe, expect, it } from "vitest";

import { validatePluginManifest } from "../../../src/contracts/plugins";
import { createInstrumentManifest, parameterId } from "./fixtures";

describe("plugin manifest validation", () => {
  it("accepts a complete instrument manifest", () => {
    expect(validatePluginManifest(createInstrumentManifest()).ok).toBe(true);
  });

  it("accepts an explicit unavailable offline capability but requires live rendering", () => {
    const base = createInstrumentManifest();
    expect(
      validatePluginManifest({
        ...base,
        renderCapabilities: { live: true, offline: false },
      }).ok,
    ).toBe(true);
    expect(
      validatePluginManifest({
        ...base,
        renderCapabilities: { live: false, offline: true },
      }).ok,
    ).toBe(false);
  });

  it("rejects duplicate parameter, meter, and compact positions", () => {
    const base = createInstrumentManifest();
    const parameter = base.parameters[0];
    const meter = base.meters[0];
    if (parameter === undefined || meter === undefined) {
      throw new Error("Expected complete plugin test fixture.");
    }
    const manifest = {
      ...base,
      parameters: [parameter, parameter],
      meters: [meter, meter],
      ui: {
        ...base.ui,
        compactControls: [
          { position: 0, parameterId: parameterId("cutoff") },
          { position: 0, parameterId: parameterId("cutoff") },
        ],
      },
    };
    const result = validatePluginManifest(manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("duplicated"))).toBe(true);
      expect(result.issues.some((issue) => issue.message.includes("positions"))).toBe(true);
    }
  });

  it("requires a complete migration chain for accepted older state", () => {
    const base = createInstrumentManifest();
    const result = validatePluginManifest({
      ...base,
      stateSchemaVersion: 3,
      compatibility: {
        acceptedStateSchemaVersions: [1, 3],
        migrations: [
          {
            id: "state-one-to-two",
            fromStateSchemaVersion: 1,
            toStateSchemaVersion: 2,
            implementationVersion: "1.0.0",
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("state schema 2 to 3"))).toBe(
        true,
      );
    }
  });

  it("rejects non-canonical module accent colors", () => {
    const base = createInstrumentManifest();
    const result = validatePluginManifest({
      ...base,
      ui: {
        ...base.ui,
        moduleAccent: { ...base.ui.moduleAccent, accent: "#9be564" },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "ui.moduleAccent",
        message: "Module accent colors must use opaque uppercase six-digit sRGB hex.",
      });
    }
  });

  it("rejects semantic versions with build metadata", () => {
    expect(
      validatePluginManifest({
        ...createInstrumentManifest(),
        pluginVersion: "1.0.0+build",
      }).ok,
    ).toBe(false);
  });

  it("returns a report instead of throwing for malformed runtime data", () => {
    expect(validatePluginManifest(null).ok).toBe(false);
    expect(
      validatePluginManifest({
        ...createInstrumentManifest(),
        productName: 42,
      }).ok,
    ).toBe(false);
    expect(
      validatePluginManifest({
        ...createInstrumentManifest(),
        parameters: [{ id: "cutoff" }],
      }).ok,
    ).toBe(false);
  });

  it("rejects non-finite and cyclic default state data", () => {
    expect(
      validatePluginManifest({
        ...createInstrumentManifest(),
        defaultState: { cutoff: Number.NaN },
      }).ok,
    ).toBe(false);

    const defaultState: Record<string, unknown> = {};
    defaultState.self = defaultState;
    expect(validatePluginManifest({ ...createInstrumentManifest(), defaultState }).ok).toBe(false);
  });
});
