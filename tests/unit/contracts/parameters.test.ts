import { describe, expect, it } from "vitest";

import {
  parseParameterId,
  parsePluginId,
  validateParameterDescriptor,
  type ParameterDescriptor,
} from "../../../src/contracts/parameters";
import { createFloatParameter, parameterId } from "./fixtures";

describe("parameter contracts", () => {
  it("enforces stable plugin and parameter IDs", () => {
    expect(parsePluginId("bass-mono").ok).toBe(true);
    expect(parsePluginId("BassMono").ok).toBe(false);
    expect(parseParameterId(`a${"b".repeat(63)}`).ok).toBe(true);
    expect(parseParameterId(`a${"b".repeat(64)}`).ok).toBe(false);
  });

  it("accepts a complete finite numeric descriptor", () => {
    expect(validateParameterDescriptor(createFloatParameter()).ok).toBe(true);
  });

  it("rejects defaults outside their range", () => {
    const descriptor: ParameterDescriptor = {
      ...createFloatParameter(),
      defaultValue: 30_000,
    };
    const result = validateParameterDescriptor(descriptor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toContain("parameter.defaultValue");
    }
  });

  it("rejects exponential smoothing that crosses or targets zero", () => {
    const descriptor: ParameterDescriptor = {
      ...createFloatParameter(),
      id: parameterId("bipolar"),
      minimum: -1,
      maximum: 1,
      defaultValue: 0,
      resetValue: 0,
    };
    const result = validateParameterDescriptor(descriptor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("Exponential"))).toBe(true);
    }
  });

  it("validates enum defaults and resets", () => {
    const descriptor: ParameterDescriptor = {
      id: parameterId("waveform"),
      name: "Waveform",
      valueType: "enum",
      defaultValue: "saw",
      enumValues: ["saw", "square"],
      unit: "none",
      displayPrecision: 0,
      resetValue: "saw",
      smoothing: { curve: "none", durationMilliseconds: 0 },
      workletRate: "message",
      automation: "step",
      modulation: "none",
    };
    expect(validateParameterDescriptor(descriptor).ok).toBe(true);
    expect(validateParameterDescriptor({ ...descriptor, defaultValue: "triangle" }).ok).toBe(false);
  });
});
