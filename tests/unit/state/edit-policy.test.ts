import { describe, expect, it } from "vitest";

import { clampUnitInterval, countUnmappedEvents } from "../../../src/state/edit-policy";

function event(id: string, note: number) {
  return {
    id: id as never,
    type: "trigger" as const,
    positionTicks: 0,
    data: { note, velocity: 0.8, accent: false, slide: false },
  };
}

describe("clampUnitInterval", () => {
  it("clamps to the closed unit interval", () => {
    expect(clampUnitInterval(-0.5)).toBe(0);
    expect(clampUnitInterval(0)).toBe(0);
    expect(clampUnitInterval(0.4)).toBe(0.4);
    expect(clampUnitInterval(1)).toBe(1);
    expect(clampUnitInterval(1.5)).toBe(1);
  });
});

describe("countUnmappedEvents", () => {
  const parts = [
    { length: 16, events: [event("a", 36), event("b", 72)] },
    { length: 16, events: [event("c", 40), event("d", 72)] },
  ];

  it("counts events the target cannot map", () => {
    expect(countUnmappedEvents(parts, new Set([36, 40]))).toBe(2);
  });

  it("counts nothing when every note maps", () => {
    expect(countUnmappedEvents(parts, new Set([36, 40, 72]))).toBe(0);
  });

  it("treats an undefined set as a pitched target where every note maps", () => {
    expect(countUnmappedEvents(parts, undefined)).toBe(0);
  });
});
