import { describe, expect, it } from "vitest";

import {
  externalAutomationParameterDescriptor,
  isExternalAutomationValueValid,
} from "../../../src/state/public";

describe("external automation target catalog", () => {
  it("owns the static parameter descriptors and value ranges", () => {
    const mixerLevel = externalAutomationParameterDescriptor("mixer", "level");
    const mixerPan = externalAutomationParameterDescriptor("mixer", "pan");
    const sendAmount = externalAutomationParameterDescriptor("send", "send-c-amount");
    const effectGain = externalAutomationParameterDescriptor("effect", "gain");

    expect(mixerLevel).toMatchObject({
      id: "level",
      name: "Level",
      minimum: 0,
      maximum: 1,
      step: 0.01,
    });
    expect(mixerPan).toMatchObject({ id: "pan", name: "Pan", minimum: -1, maximum: 1 });
    expect(sendAmount).toMatchObject({ id: "send-c-amount", name: "Amount", unit: "percent" });
    expect(effectGain).toMatchObject({
      id: "gain",
      name: "Gain",
      minimum: -24,
      maximum: 24,
      unit: "decibels",
    });
    expect(externalAutomationParameterDescriptor("master", "unknown")).toBeUndefined();
    expect(
      externalAutomationParameterDescriptor("master", "effects-bypassed"),
    ).toBeUndefined();

    expect(isExternalAutomationValueValid(mixerLevel, 0.5)).toBe(true);
    expect(isExternalAutomationValueValid(mixerLevel, 2)).toBe(false);
    expect(isExternalAutomationValueValid(mixerPan, -1.1)).toBe(false);
    expect(isExternalAutomationValueValid(effectGain, 12.5)).toBe(true);
    expect(isExternalAutomationValueValid(effectGain, 25)).toBe(false);
  });
});
