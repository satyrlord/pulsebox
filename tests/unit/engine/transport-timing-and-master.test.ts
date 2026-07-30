import { stubAudioParam, stubMixerNodes } from "./stub-audio-graph";
import { describe, expect, it, vi } from "vitest";

import type { ModuleInstanceId, StateRevision } from "../../../src/contracts/ids";
import { ACID_BASS_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import {
  loopingStepResolver,
  schedulePatternWindow,
  type PatternWindowRequest,
} from "../../../src/engine/transport/pattern-scheduler";
import type {
  PatternStepView,
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

function steps(note: number): PatternStepView[] {
  return Array.from({ length: 16 }, () => ({
    active: true,
    note,
    velocity: 0.8,
    accent: false,
    slide: false,
  }));
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
    expect(humanized.map((event) => event.atFrame)).not.toEqual(
      mechanical.map((event) => event.atFrame),
    );
    expect(humanized.some((event) => event.velocity !== 0.8)).toBe(true);
    for (const event of humanized) {
      expect(event.velocity).toBeGreaterThanOrEqual(0);
      expect(event.velocity).toBeLessThanOrEqual(1);
    }
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

function bassModule(parts: readonly (readonly PatternStepView[])[]): TransportModule {
  return {
    id: MODULE_ID,
    pluginId: ACID_BASS_MANIFEST.pluginId,
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

    await runtime.project({
      kind: "pattern-select",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { patternIndex: 1 },
    });

    // Play() anchored the grid at frame 960. The switch waits for the next bar
    // boundary at frame 96_960 while time advances.
    for (let tick = 0; tick < 100; tick += 1) {
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
