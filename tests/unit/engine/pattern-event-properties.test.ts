import { describe, expect, it } from "vitest";

import {
  loopingStepResolver,
  schedulePatternAutomationWindow,
  schedulePatternWindow,
  withoutExcludedOccurrences,
  type PatternWindowRequest,
} from "../../../src/engine/transport/pattern-scheduler";
import { SCHEDULED_EVENT_QUEUE_CAPACITY } from "../../../src/engine/transport/scheduled-event";
import type {
  PatternEventDataView,
  PatternEventView,
  PatternPartView,
  ScheduledVoiceEvent,
} from "../../../src/engine/transport/scheduled-event";

function trigger(
  step: number,
  id: string,
  overrides: Partial<PatternEventDataView> = {},
): PatternEventView {
  return {
    id,
    type: "trigger",
    positionTicks: step * 240,
    data: { note: 42, velocity: 0.8, accent: false, slide: false, ...overrides },
  };
}

function request(
  part: PatternPartView,
  overrides: Partial<Omit<PatternWindowRequest, "resolveStep">> = {},
): PatternWindowRequest {
  return {
    resolveStep: loopingStepResolver(part),
    stepFrames: 960,
    swing: 0,
    patternTiming: [{ humanize: 0, seed: 24_680 }],
    voiceSalt: 135,
    windowStartFrame: 0,
    windowEndFrame: 4_000,
    patternStartFrame: 0,
    ...overrides,
  };
}

function noteOns(events: readonly ScheduledVoiceEvent[]): readonly ScheduledVoiceEvent[] {
  return events.filter((event) => event.type === "note-on");
}

function noteOnFrames(events: readonly ScheduledVoiceEvent[]): readonly number[] {
  return noteOns(events).map((event) => event.atFrame);
}

describe("Pattern event properties", () => {
  it("keeps the pre-property trigger schedule when all fields are absent", () => {
    const events = schedulePatternWindow(
      request({ length: 4, events: [trigger(1, "legacy-trigger")] }, { windowEndFrame: 2_000 }),
    );

    expect(events).toEqual([
      {
        atFrame: 960,
        type: "note-on",
        sourceStep: 1,
        occurrenceId: "legacy-trigger:1:main",
        note: 42,
        velocity: 0.8,
        accent: false,
        slide: false,
      },
      { atFrame: 1_747, type: "note-off", occurrenceId: "legacy-trigger:1:main", note: 42 },
    ]);
  });

  it("uses a stable seeded probability decision for each event", () => {
    const part: PatternPartView = {
      length: 16,
      events: Array.from({ length: 16 }, (_, step) =>
        trigger(step, `chance-${step}`, { probability: 0.5 }),
      ),
    };
    const base = request(part, { windowEndFrame: 15_360 });

    const first = schedulePatternWindow(base);
    const second = schedulePatternWindow(base);
    const differentSeed = schedulePatternWindow({
      ...base,
      patternTiming: [{ humanize: 0, seed: 24_681 }],
    });
    const differentModule = schedulePatternWindow({ ...base, voiceSalt: 136 });

    expect(first).toEqual(second);
    expect(noteOns(first)).not.toHaveLength(0);
    expect(noteOns(first).length).toBeLessThan(16);
    expect(noteOnFrames(differentSeed)).not.toEqual(noteOnFrames(first));
    expect(noteOnFrames(differentModule)).not.toEqual(noteOnFrames(first));
  });

  it("skips a zero-probability event and retains a certain event", () => {
    const none = schedulePatternWindow(
      request({ length: 4, events: [trigger(1, "never", { probability: 0 })] }),
    );
    const certain = schedulePatternWindow(
      request({ length: 4, events: [trigger(1, "always", { probability: 1 })] }),
    );

    expect(none).toEqual([]);
    expect(noteOns(certain)).toHaveLength(1);
  });

  it("clamps micro-timing to one quarter step on either side of the grid", () => {
    const events = schedulePatternWindow(
      request({
        length: 4,
        events: [
          trigger(1, "early", { note: 41, microTimingTicks: -100 }),
          trigger(1, "late", { note: 42, microTimingTicks: 100 }),
        ],
      }),
    );

    expect(noteOnFrames(events)).toEqual([720, 1_200]);
  });

  it("expands flam and roll hits in bounded spacing without late releases", () => {
    const events = schedulePatternWindow(
      request(
        { length: 4, events: [trigger(1, "flam-roll", { flam: 2, roll: 3 })] },
        { windowEndFrame: 2_000 },
      ),
    );

    expect(noteOnFrames(events)).toEqual([880, 920, 960, 1_200, 1_440, 1_680]);
    expect(
      events.filter((event) => event.type === "note-off").map((event) => event.atFrame),
    ).toEqual([919, 959, 1_199, 1_439, 1_679, 2_467]);
  });

  it("caps a flam release against its main hit across adjacent windows", () => {
    const part = { length: 4, events: [trigger(1, "split-flam", { flam: 2, roll: 3 })] };
    const beforeMain = schedulePatternWindow(
      request(part, { windowStartFrame: 800, windowEndFrame: 950 }),
    );
    const mainOnly = schedulePatternWindow(
      request(part, { windowStartFrame: 950, windowEndFrame: 1_000 }),
    );

    expect(noteOnFrames(beforeMain)).toEqual([880, 920]);
    expect(
      beforeMain.filter((event) => event.type === "note-off").map((event) => event.atFrame),
    ).toEqual([919, 959]);
    expect(noteOnFrames(mainOnly)).toEqual([960]);
    expect(
      mainOnly.filter((event) => event.type === "note-off").map((event) => event.atFrame),
    ).toEqual([1_199]);
  });

  it("caps expanded hits and never schedules a generated onset outside its window", () => {
    const part = {
      length: 4,
      events: [trigger(1, "bounded", { flam: 99, roll: 99, microTimingTicks: 999 })],
    };
    const base = request(part, { windowEndFrame: 2_200 });
    const events = schedulePatternWindow(base);
    const tooSmall = schedulePatternWindow({ ...base, maximumEvents: 21 });
    const afterSourceStep = schedulePatternWindow({ ...base, minimumStepExclusive: 1 });

    expect(noteOns(events)).toHaveLength(11);
    expect(events).toHaveLength(22);
    expect(noteOnFrames(events).every((frame) => frame >= 0 && frame < 2_200)).toBe(true);
    expect(tooSmall).toEqual([]);
    expect(afterSourceStep).toEqual([]);
  });

  it("truncates a dense window at an explicit capacity bound instead of throwing", () => {
    // The transport runtime always passes the queue capacity, so a dense
    // playback window must degrade to a bounded truncation rather than throw
    // inside a scheduler tick.
    const events = Array.from({ length: 64 }, (_, step) =>
      trigger(step, `dense-${String(step)}`, { flam: 3, roll: 7 }),
    );
    const dense = request(
      { length: 64, durationSteps: 64, events },
      { windowEndFrame: 64 * 960, maximumEvents: SCHEDULED_EVENT_QUEUE_CAPACITY },
    );

    const scheduled = schedulePatternWindow(dense);

    expect(scheduled.length).toBeLessThanOrEqual(SCHEDULED_EVENT_QUEUE_CAPACITY);
    expect(scheduled.length).toBeGreaterThan(0);
    expect(() => schedulePatternWindow(dense)).not.toThrow();
  });

  it("uses the named Pattern duration while the shorter module part repeats", () => {
    const events = schedulePatternWindow(
      request(
        { length: 4, durationSteps: 8, events: [trigger(0, "duration")] },
        { windowEndFrame: 8 * 960 },
      ),
    );

    expect(noteOnFrames(events)).toEqual([0, 4 * 960]);
  });

  it("keeps a voice cycle longer than the module part on its own phase", () => {
    const events = schedulePatternWindow(
      request(
        {
          length: 16,
          durationSteps: 16,
          voiceCycleLengths: { "42": 32 },
          events: [trigger(0, "long-cycle")],
        },
        { windowEndFrame: 48 * 960 },
      ),
    );

    expect(noteOnFrames(events)).toEqual([0, 32 * 960]);
  });

  it("releases a note when its adjacent Slide event does not pass probability", () => {
    const events = schedulePatternWindow(
      request(
        {
          length: 4,
          events: [
            {
              id: "held",
              type: "note",
              positionTicks: 0,
              durationTicks: 240,
              data: { note: 48, velocity: 0.8, accent: false, slide: false },
            },
            {
              id: "skipped-slide",
              type: "note",
              positionTicks: 240,
              durationTicks: 240,
              data: {
                note: 50,
                velocity: 0.8,
                accent: false,
                slide: true,
                probability: 0,
              },
            },
          ],
        },
        { windowEndFrame: 2_000 },
      ),
    );

    expect(events.filter((event) => event.type === "note-off")).toEqual([
      { atFrame: 960, type: "note-off", occurrenceId: "held:0:main", note: 48 },
    ]);
  });

  it("schedules the maximum live Flam and Roll density without loss", () => {
    const part: PatternPartView = {
      length: 8,
      events: Array.from({ length: 8 }, (_, step) =>
        Array.from({ length: 8 }, (_, voice) =>
          trigger(step, `dense-${step}-${voice}`, {
            note: 36 + voice,
            flam: 3,
            roll: 7,
          }),
        ),
      ).flat(),
    };
    const events = schedulePatternWindow(
      request(part, { stepFrames: 1_500, windowEndFrame: 8 * 1_500 }),
    );

    expect(noteOns(events)).toHaveLength(8 * 8 * 11);
    expect(events).toHaveLength(8 * 8 * 11 * 2);
  });

  it("filters retained micro-timed occurrences without dropping a moved neighbor", () => {
    const part = {
      length: 4,
      events: [
        trigger(1, "early", { microTimingTicks: -60 }),
        trigger(1, "late", { note: 43, microTimingTicks: 60 }),
      ],
    };
    const oldWindow = schedulePatternWindow(
      request(part, { windowStartFrame: 600, windowEndFrame: 1_000 }),
    );
    const kept = new Set(
      noteOns(oldWindow)
        .map((event) => event.occurrenceId)
        .filter((id): id is string => id !== undefined),
    );
    kept.delete("late:1:main");
    const rebuilt = withoutExcludedOccurrences(
      schedulePatternWindow(request(part, { windowStartFrame: 600, windowEndFrame: 1_300 })),
      kept,
    );

    expect(noteOns(rebuilt).map((event) => event.occurrenceId)).toEqual(["late:1:main"]);
  });

  it("frame-stamps module automation on the same timed Pattern grid", () => {
    const changes = schedulePatternAutomationWindow(
      request({
        length: 4,
        events: [],
        automationSteps: [
          { parameterId: "cutoff", positionTicks: 240, value: 1_200 },
        ],
      }),
    );

    expect(changes).toEqual([
      {
        atFrame: 960,
        occurrenceId: "0:cutoff:1",
        parameterId: "cutoff",
        value: 1_200,
      },
    ]);
  });
});
