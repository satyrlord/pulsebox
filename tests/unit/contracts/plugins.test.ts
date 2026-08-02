import { describe, expect, it } from "vitest";

import type { ParameterDescriptor } from "../../../src/contracts/parameters";
import { validatePluginManifest } from "../../../src/contracts/plugins";
import { createInstrumentManifest, parameterId } from "./fixtures";

/** A boolean gate parameter in the shape the shipped lo-fi stage uses. */
function createBooleanParameter(defaultValue = true): ParameterDescriptor {
  return {
    id: parameterId("lofi-enabled"),
    name: "Lo-fi stage",
    valueType: "boolean",
    defaultValue,
    unit: "none",
    displayPrecision: 0,
    resetValue: defaultValue,
    smoothing: { curve: "none", durationMilliseconds: 0 },
    workletRate: "message",
    automation: "step",
    modulation: "none",
  };
}

function manifestWithGate(): ReturnType<typeof createInstrumentManifest> {
  const base = createInstrumentManifest();
  return {
    ...base,
    parameters: [...base.parameters, createBooleanParameter()],
    defaultState: { ...base.defaultState, "lofi-enabled": true },
    ui: {
      ...base.ui,
      parameterGates: [
        {
          parameterId: parameterId("cutoff"),
          gateParameterId: parameterId("lofi-enabled"),
          gateValue: true,
        },
      ],
    },
  };
}

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

  it("rejects a module icon with markup and an unanchored viewBox", () => {
    const base = createInstrumentManifest();
    const result = validatePluginManifest({
      ...base,
      ui: {
        ...base.ui,
        icon: { viewBox: "2 2 24 24", path: '<script>alert("x")</script>' },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path === "ui.icon.viewBox")).toBe(true);
      expect(result.issues.some((issue) => issue.path === "ui.icon.path")).toBe(true);
    }
  });

  it("rejects a module icon path beyond the size bound", () => {
    const base = createInstrumentManifest();
    const result = validatePluginManifest({
      ...base,
      ui: {
        ...base.ui,
        icon: { viewBox: "0 0 24 24", path: `M0 0${"L1 1".repeat(600)}Z` },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path === "ui.icon.path")).toBe(true);
    }
  });

  it("accepts a manifest without an icon", () => {
    const base = createInstrumentManifest();
    const result = validatePluginManifest({ ...base, ui: { ...base.ui, icon: undefined } });
    expect(result.ok).toBe(true);
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

  it("accepts a parameter gate on a declared boolean parameter", () => {
    expect(validatePluginManifest(manifestWithGate()).ok).toBe(true);
  });

  it("rejects a parameter gate that references an undeclared parameter", () => {
    const base = manifestWithGate();
    const result = validatePluginManifest({
      ...base,
      ui: {
        ...base.ui,
        parameterGates: [
          {
            parameterId: parameterId("missing"),
            gateParameterId: parameterId("lofi-enabled"),
            gateValue: true,
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("Gated control"))).toBe(true);
    }
  });

  it("rejects a parameter gate that references an undeclared gate parameter", () => {
    const base = manifestWithGate();
    const result = validatePluginManifest({
      ...base,
      ui: {
        ...base.ui,
        parameterGates: [
          {
            parameterId: parameterId("cutoff"),
            gateParameterId: parameterId("missing"),
            gateValue: true,
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("gate parameter"))).toBe(true);
    }
  });

  it("rejects a parameter gate whose gate parameter is not boolean", () => {
    const base = createInstrumentManifest();
    const result = validatePluginManifest({
      ...base,
      ui: {
        ...base.ui,
        parameterGates: [
          {
            parameterId: parameterId("cutoff"),
            gateParameterId: parameterId("cutoff"),
            gateValue: true,
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("boolean parameter"))).toBe(
        true,
      );
    }
  });

  it("rejects a parameter gate with a non-boolean gate value", () => {
    const base = manifestWithGate();
    expect(
      validatePluginManifest({
        ...base,
        ui: {
          ...base.ui,
          parameterGates: [
            {
              parameterId: parameterId("cutoff"),
              gateParameterId: parameterId("lofi-enabled"),
              gateValue: 1,
            },
          ],
        },
      }).ok,
    ).toBe(false);
  });
});
