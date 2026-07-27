import { describe, expect, it } from "vitest";

import { schedulePatternWindow } from "../../../src/engine/transport/step-scheduler";
import { TransportClock } from "../../../src/engine/transport/transport-clock";

describe("TransportClock", () => {
  it("pauses in place and Stop returns to the explicit marker once", () => {
    const clock = new TransportClock(48_000, 120);
    clock.seekWhileStopped(960, 0);
    expect(clock.play(0)).toBe(true);
    expect(clock.pause(24_000)).toBe(true);
    expect(clock.getSnapshot(24_000).positionTicks).toBe(1920);
    expect(clock.stop(24_000)).toBe(true);
    expect(clock.getSnapshot(24_000).positionTicks).toBe(960);
    expect(clock.stop(24_000)).toBe(false);
  });

  it("preserves musical position across a tempo change", () => {
    const clock = new TransportClock(48_000, 120);
    clock.play(0);
    clock.setTempo(60, 24_000);
    expect(clock.getSnapshot(24_000).positionTicks).toBe(960);
    expect(clock.getSnapshot(72_000).positionTicks).toBe(1920);
  });

  it("converts musical ticks at 44.1 and 48 kHz", () => {
    expect(new TransportClock(44_100, 120).ticksToFrames(960)).toBe(22_050);
    expect(new TransportClock(48_000, 120).ticksToFrames(960)).toBe(24_000);
  });
});

describe("schedulePatternWindow", () => {
  it("sorts note-off before note-on at an equal frame and stays bounded", () => {
    const steps = Array.from({ length: 16 }, () => ({
      active: true,
      note: 36,
      velocity: 0.8,
      accent: false,
      slide: false,
    }));
    const events = schedulePatternWindow(steps, 100, 0, 20_000, 0);
    expect(events.length).toBeLessThanOrEqual(256);
    expect(events.every((event, index) => index === 0 || event.atFrame >= (events[index - 1]?.atFrame ?? -1))).toBe(true);
  });
});
