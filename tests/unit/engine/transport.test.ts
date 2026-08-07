import { describe, expect, it } from "vitest";

import {
  chainedStepResolver,
  loopingStepResolver,
  pendingReleaseEvent,
  schedulePatternWindow,
} from "../../../src/engine/transport/pattern-scheduler";
import { BassMonoDsp } from "../../../src/engine/modules/bass-mono/dsp-core";
import {
  SCHEDULED_EVENT_QUEUE_CAPACITY,
  type PatternEventView,
  type PatternPartView,
  type ScheduledVoiceEvent,
} from "../../../src/engine/transport/scheduled-event";
import { TransportClock } from "../../../src/engine/transport/transport-clock";

function event(
  step: number,
  overrides: Partial<PatternEventView["data"]> = {},
  eventOverrides: Partial<PatternEventView> = {},
): PatternEventView {
  return {
    id: `event-${step}-${eventOverrides.type ?? "note"}`,
    type: "note",
    positionTicks: step * 240,
    durationTicks: 240,
    data: { note: 36, velocity: 0.8, accent: false, slide: false, ...overrides },
    ...eventOverrides,
  };
}

function pattern(
  length: number,
  overrides: Partial<PatternEventView["data"]> = {},
): PatternPartView {
  return { length, events: Array.from({ length }, (_, step) => event(step, overrides)) };
}

function trigger(step: number, id: string, note: number): PatternEventView {
  return {
    id,
    type: "trigger",
    positionTicks: step * 240,
    data: { note, velocity: 0.8, accent: false, slide: false },
  };
}

function noteOnFrames(events: readonly ScheduledVoiceEvent[]): number[] {
  return events.filter((event) => event.type === "note-on").map((event) => event.atFrame);
}

function renderBassEvents(
  events: readonly ScheduledVoiceEvent[],
  frameCount: number,
  glide: number,
): Float32Array {
  const dsp = new BassMonoDsp(48_000);
  dsp.setParameters(
    {
      cutoff: 12_000,
      resonance: 0,
      envelopeAmount: 0,
      decay: 2,
      accentAmount: 0,
      waveform: "square",
      glide,
      volume: 0.8,
    },
    "immediate",
  );
  const output = new Float32Array(frameCount);
  let cursor = 0;
  for (const scheduled of events) {
    if (scheduled.atFrame > frameCount) break;
    dsp.process(output, undefined, cursor, scheduled.atFrame);
    cursor = scheduled.atFrame;
    if (scheduled.type === "note-on") {
      dsp.noteOn(
        scheduled.note ?? 0,
        scheduled.velocity ?? 1,
        scheduled.accent,
        scheduled.slide,
      );
    } else if (scheduled.type === "note-off") {
      dsp.noteOff();
    } else {
      dsp.reset();
    }
  }
  dsp.process(output, undefined, cursor, frameCount);
  return output;
}

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

  it("keeps a fractional 127 BPM grid within one millisecond across live rates", () => {
    const timesByRate = [44_100, 48_000].map((sampleRate) => {
      const stepFrames = (sampleRate * 60) / (127 * 4);
      return noteOnFrames(
        schedulePatternWindow({
          resolveStep: loopingStepResolver(pattern(16)),
          stepFrames,
          swing: 0.37,
          patternStartFrame: 0,
          windowStartFrame: 0,
          windowEndFrame: Math.ceil(stepFrames * 40),
        }),
      )
        .slice(0, 32)
        .map((frame) => frame / sampleRate);
    });

    const lowerRate = timesByRate[0] ?? [];
    const higherRate = timesByRate[1] ?? [];
    expect(lowerRate).toHaveLength(32);
    expect(higherRate).toHaveLength(32);
    for (let index = 0; index < lowerRate.length; index += 1) {
      expect(Math.abs((lowerRate[index] ?? 0) - (higherRate[index] ?? 0))).toBeLessThanOrEqual(
        0.001,
      );
    }
  });

  it("rejects a tempo outside the supported 40 to 240 BPM range", () => {
    const clock = new TransportClock(48_000, 120);
    expect(() => clock.setTempo(39.9, 0)).toThrow(RangeError);
    expect(() => clock.setTempo(240.1, 0)).toThrow(RangeError);
    expect(() => clock.setTempo(40, 0)).not.toThrow();
    expect(() => clock.setTempo(240, 0)).not.toThrow();
  });
});

describe("schedulePatternWindow", () => {
  const straight = {
    resolveStep: loopingStepResolver(pattern(16)),
    stepFrames: 100,
    swing: 0,
    patternStartFrame: 0,
  };

  it("sorts note-off before note-on at an equal frame and stays bounded", () => {
    const events = schedulePatternWindow({
      ...straight,
      windowStartFrame: 0,
      windowEndFrame: 20_000,
    });

    expect(events.length).toBeLessThanOrEqual(SCHEDULED_EVENT_QUEUE_CAPACITY);
    expect(
      events.every(
        (event, index) => index === 0 || event.atFrame >= (events[index - 1]?.atFrame ?? -1),
      ),
    ).toBe(true);
  });

  it("places straight sixteenths exactly on the grid", () => {
    const events = schedulePatternWindow({
      ...straight,
      windowStartFrame: 0,
      windowEndFrame: 400,
    });

    expect(noteOnFrames(events)).toEqual([0, 100, 200, 300]);
  });

  it("keeps the gate open into an adjacent Slide and releases the slid note", () => {
    const resolveStep = loopingStepResolver({
      length: 4,
      events: [event(0), event(1, { note: 43, slide: true }, { durationTicks: 480 })],
    });
    const events = schedulePatternWindow({
      resolveStep,
      stepFrames: 100,
      swing: 0,
      patternStartFrame: 0,
      windowStartFrame: 0,
      windowEndFrame: 200,
    });

    expect(events).toEqual([
      expect.objectContaining({ atFrame: 0, type: "note-on", note: 36, slide: false }),
      expect.objectContaining({ atFrame: 100, type: "note-on", note: 43, slide: true }),
      expect.objectContaining({ atFrame: 300, type: "note-off", note: 43 }),
    ]);
    expect(
      pendingReleaseEvent(
        { resolveStep, stepFrames: 100, swing: 0, patternStartFrame: 0 },
        50,
      ),
    ).toBeUndefined();
    expect(
      pendingReleaseEvent(
        { resolveStep, stepFrames: 100, swing: 0, patternStartFrame: 0 },
        150,
      ),
    ).toEqual({ atFrame: 300, type: "note-off", note: 43 });
  });

  it("feeds an adjacent Slide to bass DSP as a frequency ramp", () => {
    const events = schedulePatternWindow({
      resolveStep: loopingStepResolver({
        length: 16,
        events: [event(0, { note: 36 }), event(1, { note: 72, slide: true })],
      }),
      stepFrames: 4_800,
      swing: 0,
      patternStartFrame: 0,
      windowStartFrame: 0,
      windowEndFrame: 9_600,
    });
    const slid = renderBassEvents(events, 8_400, 1);
    const snapped = renderBassEvents(events, 8_400, 0);
    const difference = slid
      .subarray(4_800)
      .reduce((maximum, sample, index) =>
        Math.max(maximum, Math.abs(sample - (snapped[index + 4_800] ?? 0))), 0);

    expect(difference).toBeGreaterThan(0.01);
    expect(events.some((item) => item.type === "note-off" && item.atFrame < 4_800)).toBe(
      false,
    );
  });

  it("releases before a Slide that starts after a gap", () => {
    const events = schedulePatternWindow({
      resolveStep: loopingStepResolver({
        length: 4,
        events: [event(0), event(2, { note: 43, slide: true })],
      }),
      stepFrames: 100,
      swing: 0,
      patternStartFrame: 0,
      windowStartFrame: 0,
      windowEndFrame: 300,
    });

    expect(events).toEqual([
      expect.objectContaining({ atFrame: 0, type: "note-on", note: 36 }),
      expect.objectContaining({ atFrame: 100, type: "note-off", note: 36 }),
      expect.objectContaining({ atFrame: 200, type: "note-on", note: 43, slide: true }),
      expect.objectContaining({ atFrame: 300, type: "note-off", note: 43 }),
    ]);
  });

  it("retains the stored release for a held note during a bounded rebuild", () => {
    const resolveStep = loopingStepResolver({
      length: 16,
      events: [event(0, {}, { durationTicks: 960 })],
    });

    expect(
      pendingReleaseEvent(
        { resolveStep, stepFrames: 100, swing: 0, patternStartFrame: 0 },
        150,
      ),
    ).toEqual({ atFrame: 400, type: "note-off", note: 36 });
  });

  it("carries accent, slide, note, and velocity through to the event", () => {
    const events = schedulePatternWindow({
      resolveStep: loopingStepResolver({
        length: 2,
        events: [event(0, { note: 43, velocity: 0.9, accent: true, slide: true })],
      }),
      stepFrames: 100,
      swing: 0,
      patternStartFrame: 0,
      windowStartFrame: 0,
      windowEndFrame: 100,
    });

    expect(events[0]).toMatchObject({
      type: "note-on",
      note: 43,
      velocity: 0.9,
      accent: true,
      slide: true,
    });
  });

  it("emits all simultaneous drum triggers at one stored position", () => {
    const events = schedulePatternWindow({
      resolveStep: loopingStepResolver({
        length: 16,
        events: [
          trigger(0, "kick", 36),
          trigger(0, "hat", 42),
        ],
      }),
      stepFrames: 100,
      swing: 0,
      patternStartFrame: 0,
      windowStartFrame: 0,
      windowEndFrame: 100,
    });

    expect(events.filter((item) => item.type === "note-on")).toEqual([
      expect.objectContaining({ atFrame: 0, note: 36 }),
      expect.objectContaining({ atFrame: 0, note: 42 }),
    ]);
    expect(events.filter((item) => item.type === "note-off")).toHaveLength(2);
  });

  it("delays only offbeat steps when swing is applied", () => {
    const events = schedulePatternWindow({
      ...straight,
      swing: 1,
      windowStartFrame: 0,
      windowEndFrame: 400,
    });

    // Full swing is the 2:1 triplet feel: offbeats land a third of a step late.
    expect(noteOnFrames(events)).toEqual([0, 133, 200, 333]);
  });

  it("scales the swing delay linearly and leaves zero swing straight", () => {
    const at = (swing: number) =>
      noteOnFrames(
        schedulePatternWindow({ ...straight, swing, windowStartFrame: 0, windowEndFrame: 200 }),
      );

    expect(at(0)).toEqual([0, 100]);
    expect(at(0.5)).toEqual([0, 117]);
    expect(at(1)).toEqual([0, 133]);
  });

  it("never lets a swung note ring past the next trigger", () => {
    const events = schedulePatternWindow({
      ...straight,
      swing: 1,
      windowStartFrame: 0,
      windowEndFrame: 400,
    });

    for (const noteOff of events.filter((event) => event.type === "note-off")) {
      const nextOnset = noteOnFrames(events).find((frame) => frame > noteOff.atFrame);
      if (nextOnset !== undefined) expect(noteOff.atFrame).toBeLessThan(nextOnset);
    }
  });

  it("plays a chain of patterns in order and then repeats it", () => {
    const resolveStep = chainedStepResolver([
      { part: { length: 2, events: [event(0, { note: 1 }), event(1, { note: 2 })] }, patternIndex: 0 },
      { part: { length: 1, events: [event(0, { note: 3 })] }, patternIndex: 1 },
    ]);

    expect(
      [0, 1, 2, 3, 4, 5].map((index) => resolveStep(index)?.events[0]?.data.note),
    ).toEqual([1, 2, 3, 1, 2, 3]);
    expect([0, 1, 2].map((index) => resolveStep(index)?.patternIndex)).toEqual([0, 0, 1]);
  });

  it("keeps a long voice cycle in phase across one Song placement repeat", () => {
    const resolveStep = chainedStepResolver([
      {
        part: {
          length: 16,
          durationSteps: 16,
          voiceCycleLengths: { "1": 32 },
          events: [event(0, { note: 1 })],
        },
        patternIndex: 0,
        repeats: 2,
      },
    ]);

    expect([0, 16, 32].map((step) => resolveStep(step)?.events.length)).toEqual([1, 0, 1]);
  });

  it("treats an empty pattern and an empty chain as silence", () => {
    expect(loopingStepResolver({ length: 0, events: [] })(0)).toBeUndefined();
    expect(chainedStepResolver([])(0)).toBeUndefined();
    expect(
      chainedStepResolver([{ part: { length: 0, events: [] }, patternIndex: 0 }])(0),
    ).toBeUndefined();
  });

  it("keeps sparse events on their stored grid positions", () => {
    const events = schedulePatternWindow({
      resolveStep: loopingStepResolver({ length: 3, events: [event(0), event(2)] }),
      stepFrames: 100,
      swing: 0,
      patternStartFrame: 0,
      windowStartFrame: 0,
      windowEndFrame: 300,
    });

    expect(noteOnFrames(events)).toEqual([0, 200]);
  });

  it("emits each onset exactly once across contiguous windows", () => {
    const windowFrames = 4_800;
    const frames: number[] = [];
    for (let window = 0; window < 40; window += 1) {
      frames.push(
        ...noteOnFrames(
          schedulePatternWindow({
            ...straight,
            windowStartFrame: window * windowFrames,
            windowEndFrame: (window + 1) * windowFrames,
          }),
        ),
      );
    }

    expect(frames).toEqual([...new Set(frames)]);
    expect(frames).toEqual(Array.from({ length: frames.length }, (_, index) => index * 100));
  });
});

describe("long-run timing stability", () => {
  /**
   * Ten minutes of contiguous 100 ms windows at 48 kHz. Every onset must land on
   * the exact analytic grid frame, because a scheduler that accumulated its
   * position instead of deriving it would drift here.
   */
  it("holds the exact grid over ten minutes with no accumulated drift", () => {
    const sampleRate = 48_000;
    const clock = new TransportClock(sampleRate, 128);
    const stepFrames = Math.round(clock.ticksToFrames(240));
    const windowFrames = Math.round(sampleRate * 0.1);
    const totalFrames = sampleRate * 600;

    let expectedStep = 0;
    for (let start = 0; start < totalFrames; start += windowFrames) {
      const events = schedulePatternWindow({
        resolveStep: loopingStepResolver(pattern(16)),
        stepFrames,
        swing: 0,
        patternStartFrame: 0,
        windowStartFrame: start,
        windowEndFrame: start + windowFrames,
      });

      for (const frame of noteOnFrames(events)) {
        expect(frame).toBe(expectedStep * stepFrames);
        expectedStep += 1;
      }
    }

    // Ten minutes at 128 BPM is 1280 quarters, so 5120 sixteenths. The final
    // partial window may legitimately hold the last one back.
    expect(expectedStep).toBeGreaterThanOrEqual(5_119);
    expect(expectedStep).toBeLessThanOrEqual(5_120);
  });

  it("keeps the clock position exact across ten minutes of playback", () => {
    const sampleRate = 44_100;
    const clock = new TransportClock(sampleRate, 174);
    clock.play(0);

    const tenMinutes = sampleRate * 600;
    const expectedTicks = Math.round((tenMinutes * 174 * 960) / (60 * sampleRate));
    expect(clock.getSnapshot(tenMinutes).positionTicks).toBe(expectedTicks);
  });
});
