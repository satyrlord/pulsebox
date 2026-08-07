import { stubAudioParam, stubMixerNodes } from "./stub-audio-graph";
import { describe, expect, it, vi } from "vitest";

import type { ModuleInstanceId, StateRevision } from "../../../src/contracts/ids";
import { BASS_MONO_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import {
  loopingStepResolver,
  schedulePatternWindow,
  type PatternWindowRequest,
} from "../../../src/engine/transport/pattern-scheduler";
import type {
  PatternPartView,
  ScheduledVoiceEvent,
} from "../../../src/engine/transport/scheduled-event";
import {
  TransportRuntime,
  type TransportModule,
} from "../../../src/engine/transport/transport-runtime";
import type { VoiceAdapterPort } from "../../../src/engine/transport/voice-adapter";
import { TEST_UUID } from "../contracts/fixtures";

const REVISION = { epoch: TEST_UUID, counter: 0 } as StateRevision;
const DEFAULT_MIX = { level: 0.8, pan: 0, muted: false, solo: false } as const;
const MODULE_ID = "10000000-0000-4000-8000-000000000001" as ModuleInstanceId;

function steps(note: number): PatternPartView {
  return {
    length: 16,
    events: Array.from({ length: 16 }, (_, step) => ({
      id: `event-${step}`,
      type: "note" as const,
      positionTicks: step * 240,
      durationTicks: 240,
      data: { note, velocity: 0.8, accent: false, slide: false },
    })),
  };
}

function noteOns(events: readonly ScheduledVoiceEvent[]): readonly ScheduledVoiceEvent[] {
  return events.filter((event) => event.type === "note-on");
}

describe("deterministic humanization", () => {
  const base: PatternWindowRequest = {
    resolveStep: loopingStepResolver(steps(36)),
    stepFrames: 6_000,
    swing: 0,
    patternTiming: [{ humanize: 1, seed: 12_345 }],
    voiceSalt: 7,
    windowStartFrame: 0,
    windowEndFrame: 96_000,
    patternStartFrame: 0,
  };

  it("replays the same variation for the same stored seed", () => {
    const first = schedulePatternWindow(base);
    const second = schedulePatternWindow(base);
    expect(second).toEqual(first);
  });

  it("moves timing and velocity away from the mechanical grid", () => {
    const humanized = noteOns(schedulePatternWindow(base));
    const mechanical = noteOns(
      schedulePatternWindow({ ...base, patternTiming: [{ humanize: 0, seed: 12_345 }] }),
    );

    expect(mechanical.map((event) => event.atFrame)).toEqual(
      Array.from({ length: 16 }, (_, index) => index * 6_000),
    );
    expect(mechanical.map((event) => event.sourceStep)).toEqual(
      Array.from({ length: 16 }, (_, index) => index),
    );
    expect(humanized.map((event) => event.atFrame)).not.toEqual(
      mechanical.map((event) => event.atFrame),
    );
    expect(humanized.some((event) => event.velocity !== 0.8)).toBe(true);
    for (const event of humanized) {
      expect(event.velocity).toBeGreaterThanOrEqual(0);
      expect(event.velocity).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Humanize is a fixed feel for a Pattern, not a generator. Keying its hash on
   * the absolute step instead of the position inside the Pattern gives the same
   * beat a new offset and velocity on every repeat, so the loop mutates
   * forever and never plays the same bar twice.
   */
  it("replays every bar of a loop identically", () => {
    const barFrames = base.stepFrames * 16;
    const bar = (index: number) =>
      noteOns(
        schedulePatternWindow({
          ...base,
          windowStartFrame: index * barFrames,
          windowEndFrame: (index + 1) * barFrames,
        }),
      ).map((event) => ({
        offsetInBar: event.atFrame - index * barFrames,
        velocity: event.velocity,
      }));

    expect(bar(1)).toEqual(bar(0));
    expect(bar(2)).toEqual(bar(0));
    expect(bar(37)).toEqual(bar(0));
    // The feel is still applied, not flattened back to the grid.
    expect(bar(0).map((event) => event.offsetInBar)).not.toEqual(
      Array.from({ length: 16 }, (_, index) => index * base.stepFrames),
    );
  });

  it("creates a new deterministic variation when the seed changes", () => {
    const first = noteOns(schedulePatternWindow(base));
    const second = noteOns(
      schedulePatternWindow({ ...base, patternTiming: [{ humanize: 1, seed: 54_321 }] }),
    );
    expect(second.map((event) => event.atFrame)).not.toEqual(first.map((event) => event.atFrame));
  });

  it("drifts each voice independently through its salt", () => {
    const first = noteOns(schedulePatternWindow(base));
    const second = noteOns(schedulePatternWindow({ ...base, voiceSalt: 8 }));
    expect(second.map((event) => event.atFrame)).not.toEqual(first.map((event) => event.atFrame));
  });

  it("keeps humanized onsets in step order and emits each exactly once", () => {
    const windowFrames = 4_800;
    const frames: number[] = [];
    for (let window = 0; window < 40; window += 1) {
      frames.push(
        ...noteOns(
          schedulePatternWindow({
            ...base,
            windowStartFrame: window * windowFrames,
            windowEndFrame: (window + 1) * windowFrames,
          }),
        ).map((event) => event.atFrame),
      );
    }
    expect(frames).toEqual([...frames].sort((left, right) => left - right));
    expect(frames).toEqual([...new Set(frames)]);
    expect(frames.length).toBeGreaterThanOrEqual(31);
  });

  it("never lets a humanized note ring past the next onset", () => {
    const events = schedulePatternWindow(base);
    const onsets = noteOns(events).map((event) => event.atFrame);
    for (const noteOff of events.filter((event) => event.type === "note-off")) {
      const nextOnset = onsets.find((frame) => frame > noteOff.atFrame);
      if (nextOnset !== undefined) expect(noteOff.atFrame).toBeLessThan(nextOnset);
    }
  });
});

describe("exact step grid and event cap", () => {
  it("keeps a distant onset within one frame of the exact grid product", () => {
    // 130 BPM at 48 kHz: one sixteenth is 48_000 * 15 / 130 frames, which is
    // not an integer. Rounding the step size once would drift by the step
    // index times the rounding error, about 100 ms after ten minutes.
    const exact = (48_000 * 15) / 130;
    const target = Math.round(10_000 * exact);
    const events = schedulePatternWindow({
      resolveStep: loopingStepResolver(steps(36)),
      stepFrames: exact,
      swing: 0,
      windowStartFrame: target - 100,
      windowEndFrame: target + 100,
      patternStartFrame: 0,
    });

    const onsets = noteOns(events).map((event) => event.atFrame);
    expect(onsets).toContain(target);
    for (const frame of onsets) {
      const step = Math.round(frame / exact);
      expect(Math.abs(frame - step * exact)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps a note pair whole under the event cap", () => {
    const events = schedulePatternWindow({
      resolveStep: loopingStepResolver(steps(36)),
      stepFrames: 6_000,
      swing: 0,
      windowStartFrame: 0,
      windowEndFrame: 24_000,
      patternStartFrame: 0,
      maximumEvents: 3,
    });

    // A second whole pair would exceed the cap of three. The window runs
    // short, but no batch exceeds the declared bound and no onset is emitted
    // without its release.
    expect(events).toHaveLength(2);
    expect(noteOns(events)).toHaveLength(1);
  });
});

interface RecordingAdapter extends VoiceAdapterPort {
  readonly batches: (readonly ScheduledVoiceEvent[])[];
}

function recordingAdapter(): RecordingAdapter {
  const batches: (readonly ScheduledVoiceEvent[])[] = [];
  return {
    batches,
    prepare: vi.fn().mockResolvedValue(undefined),
    activate: vi.fn(),
    replaceState: vi.fn(),
    setProjectRevision: vi.fn(),
    setParameters: vi.fn(),
    previewParameters: vi.fn(),
    schedule: (events) => batches.push(events),
    clearScheduledEvents: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    dispose: vi.fn(),
  };
}

interface StubAnalyser {
  fftSize: number;
  smoothingTimeConstant: number;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  getFloatTimeDomainData: (data: Float32Array) => void;
}

function stubContext() {
  const analysers: StubAnalyser[] = [];
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const nodes = stubMixerNodes();
  const context = {
    close: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    currentTime: 0,
    destination: { kind: "destination" },
    ...nodes,
    createAnalyser: vi.fn(() => {
      const analyser: StubAnalyser = {
        fftSize: 2048,
        smoothingTimeConstant: 0,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getFloatTimeDomainData: (data: Float32Array) => {
          data.fill(0);
        },
      };
      analysers.push(analyser);
      return analyser;
    }),
    createOscillator: vi.fn(() => {
      const oscillator = {
        frequency: stubAudioParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    resume: vi.fn().mockResolvedValue(undefined),
    sampleRate: 48_000,
  };
  return { context, analysers, oscillators };
}

function bassModule(parts: readonly PatternPartView[]): TransportModule {
  return {
    id: MODULE_ID,
    pluginId: BASS_MONO_MANIFEST.pluginId,
    parameters: {},
    parts,
    mix: DEFAULT_MIX,
  };
}

function runtimeWith(
  context: ReturnType<typeof stubContext>["context"],
  adapter: RecordingAdapter,
  onStateChange?: (state: string) => void,
): TransportRuntime {
  return new TransportRuntime({
    createContext: () => context as unknown as AudioContext,
    adapterFactoryFor: () => () => adapter,
    ...(onStateChange === undefined ? {} : { onStateChange }),
  });
}

describe("quantized Pattern launch", () => {
  it("applies a Pattern switch exactly at the one-bar boundary while playing", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    // 120 BPM at 48 kHz: one sixteenth is 6000 frames, one bar is 96_000.
    await runtime.replaceFromCurrentState([bassModule([steps(36), steps(48)])], REVISION);
    await runtime.play(120);

    // Play() anchored the grid at frame 960. Mid-bar, the switch waits for the
    // next bar boundary at frame 96_960 while time advances.
    for (let tick = 0; tick < 24; tick += 1) {
      context.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 1 },
    });
    for (let tick = 0; tick < 76; tick += 1) {
      context.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }

    const events = noteOns(adapter.batches.flat());
    const boundary = 960 + 96_000;
    expect(events.length).toBeGreaterThan(20);
    for (const event of events) {
      expect(event.note).toBe(event.atFrame < boundary ? 36 : 48);
    }
    expect(events.some((event) => event.atFrame >= boundary)).toBe(true);

    runtime.dispose();
    vi.useRealTimers();
  });

  it("replaces the queued horizon when a Pattern launch is close to its boundary", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const clearScheduledEvents = vi.spyOn(adapter, "clearScheduledEvents");
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36), steps(48)])], REVISION);
    await runtime.play(120);

    for (let tick = 0; tick < 72; tick += 1) {
      context.currentTime += 0.025;
      await vi.advanceTimersByTimeAsync(25);
    }
    const batchCount = adapter.batches.length;
    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 1 },
    });

    const boundary = 960 + 96_000;
    const replacementEvents = noteOns(adapter.batches.slice(batchCount).flat());
    expect(clearScheduledEvents).toHaveBeenCalledOnce();
    expect(replacementEvents.some((event) => event.atFrame >= boundary)).toBe(true);
    expect(
      replacementEvents
        .filter((event) => event.atFrame >= boundary)
        .every((event) => event.note === 48),
    ).toBe(true);

    runtime.dispose();
    vi.useRealTimers();
  });

  it("keeps the queued horizon when the launch boundary lies beyond it", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const clearScheduledEvents = vi.spyOn(adapter, "clearScheduledEvents");
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36), steps(48)])], REVISION);
    await runtime.play(120);
    for (let tick = 1; tick <= 2; tick += 1) {
      context.currentTime = (tick * 1_200) / 48_000;
      await vi.advanceTimersByTimeAsync(25);
    }

    // The queued horizon ends near frame 26_400 and the boundary is at frame
    // 96_960, so no queued event crosses it. Nothing may be cleared or cut.
    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 1 },
    });
    expect(clearScheduledEvents).not.toHaveBeenCalled();
    expect(
      adapter.batches.some((batch) => batch.length === 1 && batch[0]?.type === "note-off"),
    ).toBe(false);

    for (let tick = 3; tick <= 100; tick += 1) {
      context.currentTime = (tick * 1_200) / 48_000;
      await vi.advanceTimersByTimeAsync(25);
    }
    const boundary = 960 + 96_000;
    const events = noteOns(adapter.batches.flat());
    // Every imminent onset survives and the switch still lands on the boundary.
    expect(
      events.filter((event) => event.atFrame < boundary).map((event) => event.atFrame),
    ).toEqual(Array.from({ length: 16 }, (_, index) => 960 + index * 6_000));
    expect(events.filter((event) => event.atFrame < boundary).every((e) => e.note === 36)).toBe(
      true,
    );
    expect(events.some((event) => event.atFrame === boundary && event.note === 48)).toBe(true);

    runtime.dispose();
    vi.useRealTimers();
  });

  it("launches on an exact quantization boundary instead of a period later", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36), steps(48)])], REVISION);
    await runtime.play(120);
    // Advance until the release point lands exactly on the bar boundary at
    // frame 96_960 (grid anchor 960 plus one 96_000-frame bar).
    for (let tick = 1; tick <= 80; tick += 1) {
      context.currentTime = (tick * 1_200) / 48_000;
      await vi.advanceTimersByTimeAsync(25);
    }

    const batchCount = adapter.batches.length;
    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 1 },
    });
    for (let tick = 81; tick <= 100; tick += 1) {
      context.currentTime = (tick * 1_200) / 48_000;
      await vi.advanceTimersByTimeAsync(25);
    }

    // An exact-boundary request launches at that boundary, which is still a
    // future frame, not one quantization period later.
    const boundary = 960 + 96_000;
    const replacement = noteOns(adapter.batches.slice(batchCount).flat());
    expect(replacement.some((event) => event.atFrame === boundary && event.note === 48)).toBe(
      true,
    );
    expect(replacement.every((event) => event.atFrame >= boundary && event.note === 48)).toBe(
      true,
    );

    runtime.dispose();
    vi.useRealTimers();
  });

  it("keeps the audible queue in place and replaces only the launch tail", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const clearScheduledEvents = vi.spyOn(adapter, "clearScheduledEvents");
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState(
      [bassModule([steps(36), steps(48), steps(60)])],
      REVISION,
    );
    await runtime.play(120);
    for (let tick = 1; tick <= 75; tick += 1) {
      context.currentTime = (tick * 1_200) / 48_000;
      await vi.advanceTimersByTimeAsync(25);
    }

    // Launch Pattern B at frame 90_000. Its one-bar boundary is frame 96_960.
    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 1 },
    });
    // Before that boundary, launch Pattern C at frame 90_100. The clear is
    // bounded at the launch boundary: everything the listener is about to
    // hear, including the audible Pattern A onset at frame 90_960, stays in
    // the processor queue exactly as sent. Only Pattern B's tail from the
    // boundary is replaced by Pattern C.
    context.currentTime = 90_100 / 48_000;
    const batchCount = adapter.batches.length;
    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 2 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 2 },
    });

    const boundary = 960 + 96_000;
    expect(clearScheduledEvents).toHaveBeenLastCalledWith(boundary);
    const resent = noteOns(adapter.batches.slice(batchCount).flat());
    expect(resent.length).toBeGreaterThan(0);
    expect(resent.every((event) => event.atFrame >= boundary)).toBe(true);
    expect(resent.every((event) => event.note === 60)).toBe(true);

    runtime.dispose();
    vi.useRealTimers();
  });

  it("refills an added module across a pending Pattern boundary", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const initial = recordingAdapter();
    const added = recordingAdapter();
    const adapters = [initial, added];
    let nextAdapter = 0;
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => {
        const adapter = adapters[nextAdapter++];
        if (adapter === undefined) throw new Error("Missing adapter fixture.");
        return adapter;
      },
    });
    await runtime.replaceFromCurrentState([bassModule([steps(36), steps(48)])], REVISION);
    await runtime.play(120);

    for (let tick = 0; tick < 72; tick += 1) {
      context.currentTime += 0.025;
      await vi.advanceTimersByTimeAsync(25);
    }
    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 1 },
    });
    const addedModuleId = "10000000-0000-4000-8000-000000000002" as ModuleInstanceId;
    await runtime.project(
      {
        kind: "module-add",
        projectRevision: { epoch: TEST_UUID, counter: 2 } as StateRevision,
        targetIds: [addedModuleId],
        payload: { moduleId: addedModuleId, pluginId: BASS_MONO_MANIFEST.pluginId },
      },
      { ...bassModule([steps(36), steps(48)]), id: addedModuleId },
    );

    const boundary = 960 + 96_000;
    const addedEvents = noteOns(added.batches.flat());
    expect(addedEvents.some((event) => event.atFrame < boundary)).toBe(true);
    expect(addedEvents.some((event) => event.atFrame >= boundary)).toBe(true);
    expect(
      addedEvents.filter((event) => event.note !== (event.atFrame < boundary ? 36 : 48)),
    ).toEqual([]);

    runtime.dispose();
    vi.useRealTimers();
  });

  it("applies a Pattern switch immediately while stopped", async () => {
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36), steps(48)])], REVISION);
    await runtime.activate();

    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 1 },
    });
    await runtime.play(120);

    const events = noteOns(adapter.batches.flat());
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.note === 48)).toBe(true);

    runtime.dispose();
  });
});

describe("live re-anchor release", () => {
  it("coalesces pointer-rate timing previews into one shared re-anchor", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const clearScheduledEvents = vi.spyOn(adapter, "clearScheduledEvents");
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.play(120);

    for (let index = 1; index <= 100; index += 1) {
      runtime.previewTempo(120 + index / 10);
      runtime.previewSwing(index / 100);
      runtime.previewPatternHumanize(0, index / 100);
    }
    await vi.advanceTimersByTimeAsync(24);
    expect(clearScheduledEvents).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(clearScheduledEvents).toHaveBeenCalledOnce();

    runtime.dispose();
    vi.useRealTimers();
  });

  it("releases each voice when a live tempo change rebuilds the schedule", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.play(120);
    context.currentTime = 0.05;

    runtime.setTempo(150);

    // The cleared queue held the sounding note's release, so the re-anchor
    // must emit one explicit note-off or the note drones forever.
    const release = adapter.batches.find(
      (batch) => batch.length === 1 && batch[0]?.type === "note-off",
    );
    expect(release).toBeDefined();

    runtime.dispose();
    vi.useRealTimers();
  });

  it("ignores a second Play while already playing instead of doubling notes", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.play(120);
    const onsetsAfterFirst = noteOns(adapter.batches.flat()).map((event) => event.atFrame);

    await runtime.play(120);

    const onsetsAfterSecond = noteOns(adapter.batches.flat()).map((event) => event.atFrame);
    expect(onsetsAfterSecond).toEqual(onsetsAfterFirst);
    expect(onsetsAfterSecond).toEqual([...new Set(onsetsAfterSecond)]);

    runtime.dispose();
    vi.useRealTimers();
  });
});

describe("timing preview during playback", () => {
  interface QueueModelAdapter extends VoiceAdapterPort {
    readonly played: ScheduledVoiceEvent[];
    advanceTo(frame: number): void;
  }

  /**
   * Models the processor's event queue: scheduled events wait, a clear drops
   * only the queued future events - all of them, or only those at or past the
   * clear bound - and advancing the playhead applies what is due. `played` is
   * therefore what the listener hears.
   */
  function queueModelAdapter(): QueueModelAdapter {
    let queue: ScheduledVoiceEvent[] = [];
    const played: ScheduledVoiceEvent[] = [];
    return {
      played,
      advanceTo(frame: number) {
        queue.sort((left, right) => left.atFrame - right.atFrame);
        while (queue.length > 0 && (queue[0]?.atFrame ?? Number.POSITIVE_INFINITY) <= frame) {
          const due = queue.shift();
          if (due !== undefined) played.push(due);
        }
      },
      prepare: vi.fn().mockResolvedValue(undefined),
      activate: vi.fn(),
      replaceState: vi.fn(),
      setProjectRevision: vi.fn(),
      setParameters: vi.fn(),
      previewParameters: vi.fn(),
      schedule: (events) => {
        queue.push(...events);
      },
      clearScheduledEvents: (fromFrame?: number) => {
        queue = fromFrame === undefined ? [] : queue.filter((event) => event.atFrame < fromFrame);
      },
      resume: vi.fn(),
      suspend: vi.fn(),
      dispose: vi.fn(),
    };
  }

  it("loses no onset and never cuts the sounding voice during a swing drag", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = queueModelAdapter();
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => adapter,
    });
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.play(120);

    // Drag Swing at pointer cadence for one second: every 25 ms flush
    // re-anchors the schedule while notes play. Then release the pointer and
    // let the queued horizon play out.
    for (let tick = 1; tick <= 70; tick += 1) {
      if (tick <= 40) runtime.previewSwing(tick / 40);
      const frame = 960 + tick * 1_200;
      context.currentTime = frame / 48_000;
      adapter.advanceTo(frame);
      await vi.advanceTimersByTimeAsync(25);
    }
    runtime.dispose();
    vi.useRealTimers();

    const onsets = adapter.played.filter((event) => event.type === "note-on");
    // Every played step slot holds exactly one onset: the drag drops none and
    // doubles none. Even slots stay exactly on the mechanical grid, because
    // swing only moves odd steps.
    for (let step = 0; step <= 12; step += 1) {
      const grid = 960 + step * 6_000;
      const slot = onsets.filter((event) => event.atFrame >= grid && event.atFrame < grid + 6_000);
      expect(slot).toHaveLength(1);
      if (step % 2 === 0) expect(slot[0]?.atFrame).toBe(grid);
    }
    // No note-off lands inside a sounding even-step note before its gate
    // release, so the drag cannot chop the voice forty times a second.
    const gateFrames = Math.floor(6_000 * 0.82);
    const offFrames = adapter.played
      .filter((event) => event.type === "note-off")
      .map((event) => event.atFrame);
    for (let step = 0; step <= 12; step += 2) {
      const onset = 960 + step * 6_000;
      expect(offFrames.some((off) => off > onset && off < onset + gateFrames)).toBe(false);
    }
  });

  it("fires a step exactly once when a swing change moves its onset past the rebuild boundary", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = queueModelAdapter();
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => adapter,
    });
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.play(120);

    // Step 1 is queued at frame 6_960 with no swing. At frame 6_500 the lead
    // window is (6_501 .. 7_460) and holds that onset, so it survives the
    // rebuild at its old position. Heavy swing moves the rebuilt onset to
    // about frame 8_750, past the rebuild boundary, where an unfiltered
    // rebuild would fire the same step a second time as an audible flam.
    context.currentTime = 6_500 / 48_000;
    adapter.advanceTo(6_500);
    runtime.previewSwing(0.9);
    await vi.advanceTimersByTimeAsync(25);
    for (let tick = 1; tick <= 20; tick += 1) {
      const frame = 6_500 + tick * 1_200;
      context.currentTime = frame / 48_000;
      adapter.advanceTo(frame);
      await vi.advanceTimersByTimeAsync(25);
    }
    runtime.dispose();
    vi.useRealTimers();

    const onsets = adapter.played
      .filter((event) => event.type === "note-on")
      .map((event) => event.atFrame)
      .sort((left, right) => left - right);
    // Step 1 fires exactly once, at its preserved pre-change onset.
    expect(onsets.filter((frame) => frame >= 6_000 && frame < 12_500)).toEqual([6_960]);
    // No flam anywhere: onsets never land closer than half a step apart.
    for (let index = 1; index < onsets.length; index += 1) {
      expect((onsets[index] ?? 0) - (onsets[index - 1] ?? 0)).toBeGreaterThanOrEqual(3_000);
    }
  });

  it("sends no onset the clock already passed while the rebuild ran", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const sent: { readonly events: readonly ScheduledVoiceEvent[]; readonly atFrame: number }[] =
      [];
    // A real rebuild computes every module's window and then posts it, so the
    // clock moves between the captured frame and the send. The queue clear
    // models that cost as one render quantum. An onset the clock has already
    // passed was played from the queue this rebuild replaces, and the processor
    // rejects an expired onset instead of firing it late, so re-sending one
    // both breaks section 21.2 and loses the step.
    const adapter: VoiceAdapterPort = {
      ...recordingAdapter(),
      clearScheduledEvents: () => {
        context.currentTime += 128 / 48_000;
      },
      schedule: (events) => {
        sent.push({ events, atFrame: Math.floor(context.currentTime * 48_000) });
      },
    };
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => adapter,
    });
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.play(120);

    // 120 BPM at 48 kHz: one sixteenth is 6_000 frames and play() anchored the
    // grid at frame 960, so step 2 sounds at frame 12_960. Frame 12_900 puts
    // that onset 60 frames ahead of the change and inside its lead window,
    // which is less than the quantum the rebuild costs. Step 2 is even, so
    // Swing leaves its frame alone and the case cannot hide behind a shift.
    context.currentTime = 12_900 / 48_000;
    runtime.previewSwing(0.5);
    await vi.advanceTimersByTimeAsync(25);
    runtime.dispose();
    vi.useRealTimers();

    expect(sent.some((batch) => batch.events.some((event) => event.type === "note-on"))).toBe(
      true,
    );
    for (const batch of sent) {
      for (const event of batch.events) {
        if (event.type !== "note-on") continue;
        expect(event.atFrame).toBeGreaterThanOrEqual(batch.atFrame);
      }
    }
  });

  it("rescues a step pulled into the lead window by a swing change", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = queueModelAdapter();
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => adapter,
    });
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    runtime.setSwing(0.9);
    await runtime.play(120);

    // With heavy swing, step 1 is queued at frame 8_760, past the lead window
    // captured at frame 6_500 (6_501 .. 7_460). Removing swing pulls the
    // rebuilt onset back to the grid at frame 6_960, inside the lead window
    // and before the rebuild boundary, so only the catch-up window can still
    // play it. A Swing change never moves the grid anchor, so the onset lands
    // exactly on the mechanical grid.
    context.currentTime = 6_500 / 48_000;
    adapter.advanceTo(6_500);
    runtime.previewSwing(0);
    await vi.advanceTimersByTimeAsync(25);
    for (let tick = 1; tick <= 20; tick += 1) {
      const frame = 6_500 + tick * 1_200;
      context.currentTime = frame / 48_000;
      adapter.advanceTo(frame);
      await vi.advanceTimersByTimeAsync(25);
    }
    runtime.dispose();
    vi.useRealTimers();

    const onsets = adapter.played
      .filter((event) => event.type === "note-on")
      .map((event) => event.atFrame);
    // Step 1 is not dropped: it fires exactly once at its new onset.
    expect(onsets.filter((frame) => frame >= 6_000 && frame < 12_500)).toEqual([6_960]);
  });

  it("splits a timing-change capture at a pending launch boundary", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = queueModelAdapter();
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => adapter,
    });
    await runtime.replaceFromCurrentState([bassModule([steps(36), steps(48)])], REVISION);
    await runtime.play(120);
    for (let tick = 1; tick <= 40; tick += 1) {
      const frame = tick * 1_200;
      context.currentTime = frame / 48_000;
      adapter.advanceTo(frame);
      await vi.advanceTimersByTimeAsync(25);
    }
    // Launch Pattern B at frame 48_000. Its boundary at frame 96_960 lies
    // beyond the queued horizon, so the queue stays untouched.
    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 1 },
    });
    for (let tick = 41; tick <= 80; tick += 1) {
      const frame = tick * 1_200;
      context.currentTime = frame / 48_000;
      adapter.advanceTo(frame);
      await vi.advanceTimersByTimeAsync(25);
    }

    // At frame 96_200 the launch boundary sits inside the lead window
    // (96_201 .. 97_160). The capture must take the segment from the boundary
    // out of the pending Pattern, so B still starts exactly at frame 96_960.
    context.currentTime = 96_200 / 48_000;
    adapter.advanceTo(96_200);
    runtime.previewSwing(0.5);
    await vi.advanceTimersByTimeAsync(25);
    for (let tick = 81; tick <= 95; tick += 1) {
      const frame = tick * 1_200;
      context.currentTime = frame / 48_000;
      adapter.advanceTo(frame);
      await vi.advanceTimersByTimeAsync(25);
    }
    runtime.dispose();
    vi.useRealTimers();

    const onsets = adapter.played.filter((event) => event.type === "note-on");
    // Pattern A fills every slot before the boundary, Pattern B starts at the
    // boundary, and no slot doubles or goes silent across the change.
    for (let step = 0; step <= 18; step += 1) {
      const grid = 960 + step * 6_000;
      const slot = onsets.filter(
        (event) => event.atFrame >= grid - 100 && event.atFrame < grid + 5_900,
      );
      expect(slot).toHaveLength(1);
      expect(slot[0]?.note).toBe(grid < 96_960 ? 36 : 48);
    }
  });
});

describe("exact tempo grid at runtime", () => {
  it("schedules the audible grid from the exact tempo-derived step size", async () => {
    vi.useFakeTimers();
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    // 130 BPM at 48 kHz is a fractional step size of 48_000 * 15 / 130 frames.
    await runtime.play(130);
    for (let tick = 1; tick <= 8; tick += 1) {
      context.currentTime = (tick * 1_200) / 48_000;
      await vi.advanceTimersByTimeAsync(25);
    }
    runtime.dispose();
    vi.useRealTimers();

    const exact = (48_000 * 15) / 130;
    const onsets = noteOns(adapter.batches.flat()).map((event) => event.atFrame);
    expect(onsets.length).toBeGreaterThan(4);
    expect(onsets).toEqual(onsets.map((_, index) => 960 + Math.round(index * exact)));
  });
});

describe("transport seek and start marker", () => {
  it("keeps a marker set before activation and returns to it after Stop", async () => {
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);

    runtime.seek(960);
    expect(runtime.getPositionTicks()).toBe(960);

    await runtime.play(120);
    context.currentTime = 1;
    expect(runtime.getPositionTicks()).toBeGreaterThan(960);
    runtime.stop();
    expect(runtime.getPositionTicks()).toBe(960);

    runtime.dispose();
  });

  it("ignores a seek while the transport is playing", async () => {
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.play(120);

    runtime.seek(1_920);
    context.currentTime = 0.5;
    runtime.stop();
    // The playing seek did not move the clock, but the marker request itself is
    // remembered for the next explicit stop state only if applied. Stop returns
    // to the last applied marker, which is still zero.
    expect(runtime.getPositionTicks()).toBe(0);

    runtime.dispose();
  });
});

describe("metronome", () => {
  it("schedules clicks on the beat grid only while enabled", async () => {
    vi.useFakeTimers();
    const { context, oscillators } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);

    runtime.setMetronomeEnabled(true);
    await runtime.play(120);
    for (let tick = 0; tick < 20; tick += 1) {
      context.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
    const scheduled = oscillators.length;
    expect(scheduled).toBeGreaterThan(0);
    const firstStart = oscillators[0]?.start.mock.calls[0]?.[0] as number;
    // The first beat click lands on the transport anchor frame 960.
    expect(firstStart).toBeCloseTo(960 / 48_000, 6);

    runtime.setMetronomeEnabled(false);
    for (let tick = 0; tick < 20; tick += 1) {
      context.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
    expect(oscillators.length).toBe(scheduled);

    runtime.dispose();
    vi.useRealTimers();
  });

  it("keeps clicks on the exact tempo grid at a fractional step size", async () => {
    vi.useFakeTimers();
    const { context, oscillators } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);

    runtime.setMetronomeEnabled(true);
    await runtime.play(130);
    for (let tick = 1; tick <= 8; tick += 1) {
      context.currentTime = (tick * 1_200) / 48_000;
      vi.advanceTimersByTime(25);
    }
    // The second beat rounds once from the exact beat size, so the click and
    // the scheduled onsets share one drift-free grid.
    const exactBeat = 4 * ((48_000 * 15) / 130);
    const secondStart = oscillators[1]?.start.mock.calls[0]?.[0] as number;
    expect(secondStart).toBeCloseTo((960 + Math.round(exactBeat)) / 48_000, 6);

    runtime.dispose();
    vi.useRealTimers();
  });

  it("schedules no clicks while disabled", async () => {
    vi.useFakeTimers();
    const { context, oscillators } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.play(120);
    for (let tick = 0; tick < 20; tick += 1) {
      context.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
    expect(oscillators.length).toBe(0);
    runtime.dispose();
    vi.useRealTimers();
  });
});

describe("master chain and analysis", () => {
  it("builds master gain into an enabled limiter before the destination", async () => {
    const { context } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.activate();

    expect(context.createDynamicsCompressor).toHaveBeenCalledTimes(1);
    const limiter = context.createDynamicsCompressor.mock.results[0]?.value as {
      threshold: { value: number };
      ratio: { value: number };
      connect: ReturnType<typeof vi.fn>;
    };
    expect(limiter.threshold.value).toBeLessThanOrEqual(-1);
    expect(limiter.ratio.value).toBeGreaterThanOrEqual(20);
    expect(limiter.connect).toHaveBeenCalledWith(context.destination);

    runtime.dispose();
  });

  it("derives L/R and M/S analysis from the post-limiter branch", async () => {
    const { context, analysers } = stubContext();
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter);
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);
    await runtime.activate();

    expect(analysers).toHaveLength(2);
    const left = analysers[0];
    const right = analysers[1];
    if (left === undefined || right === undefined) throw new Error("Expected two analysers.");
    left.getFloatTimeDomainData = (data) => {
      data.fill(0);
      data[0] = 0.5;
    };
    right.getFloatTimeDomainData = (data) => {
      data.fill(0);
      data[0] = -0.25;
    };

    const frame = runtime.getMasterMeter();
    expect(frame.left).toBeCloseTo(0.5, 6);
    expect(frame.right).toBeCloseTo(0.25, 6);
    expect(frame.mid).toBeCloseTo(0.125, 6);
    expect(frame.side).toBeCloseTo(0.375, 6);
    expect(frame.peak).toBe(false);

    left.getFloatTimeDomainData = (data) => {
      data.fill(0);
      data[0] = 0.999;
    };
    expect(runtime.getMasterMeter().peak).toBe(true);

    runtime.dispose();
  });

  it("reports silence before the analysis branch exists", () => {
    const { context } = stubContext();
    const runtime = runtimeWith(context, recordingAdapter());
    expect(runtime.getMasterMeter()).toEqual({
      left: 0,
      right: 0,
      mid: 0,
      side: 0,
      peak: false,
    });
    runtime.dispose();
  });
});

describe("audio-runtime power states", () => {
  it("reports locked, active, and suspended transitions", async () => {
    const { context } = stubContext();
    const states: string[] = [];
    const adapter = recordingAdapter();
    const runtime = runtimeWith(context, adapter, (state) => states.push(state));
    await runtime.replaceFromCurrentState([bassModule([steps(36)])], REVISION);

    expect(runtime.state).toBe("locked");
    await runtime.activate();
    expect(runtime.state).toBe("active");

    await runtime.powerOff();
    expect(context.suspend).toHaveBeenCalled();
    expect(runtime.state).toBe("suspended");

    await runtime.activate();
    expect(runtime.state).toBe("active");
    expect(states).toEqual(["active", "suspended", "active"]);

    runtime.dispose();
    expect(runtime.state).toBe("locked");
  });
});
