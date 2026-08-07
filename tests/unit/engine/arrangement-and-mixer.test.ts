import { describe, expect, it, vi } from "vitest";

import type { ModuleInstanceId, StateRevision } from "../../../src/contracts/ids";
import { BASS_MONO_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import type {
  PatternPartView,
  ScheduledParameterChange,
  ScheduledVoiceEvent,
} from "../../../src/engine/transport/scheduled-event";
import {
  TransportRuntime,
  type TransportModule,
} from "../../../src/engine/transport/transport-runtime";
import type { VoiceAdapterPort } from "../../../src/engine/transport/voice-adapter";
import { TEST_UUID } from "../contracts/fixtures";
import { stubMixerNodes } from "./stub-audio-graph";

const REVISION = { epoch: TEST_UUID, counter: 0 } as StateRevision;
const MODULE = "10000000-0000-4000-8000-000000000001" as ModuleInstanceId;
const DEFAULT_MIX = { level: 0.8, pan: 0, muted: false, solo: false } as const;

/** A part whose only event is at step 0, carrying a distinguishing note. */
function marker(note: number): PatternPartView {
  return {
    length: 16,
    events: [
      {
        id: `marker-${note}`,
        type: "note",
        positionTicks: 0,
        durationTicks: 240,
        data: { note, velocity: 0.8, accent: false, slide: false },
      },
    ],
  };
}

function recordingAdapter() {
  const batches: (readonly ScheduledVoiceEvent[])[] = [];
  const parameterBatches: (readonly ScheduledParameterChange[])[] = [];
  // Held separately so assertions never read the method off the port, which
  // would be an unbound-method reference.
  const activate = vi.fn();
  const dispose = vi.fn();
  const clearScheduledEvents = vi.fn();
  const adapter: VoiceAdapterPort & {
    readonly batches: typeof batches;
    readonly parameterBatches: typeof parameterBatches;
    readonly activateCalls: typeof activate;
    readonly disposeCalls: typeof dispose;
    readonly clearCalls: typeof clearScheduledEvents;
  } = {
    batches,
    parameterBatches,
    activateCalls: activate,
    disposeCalls: dispose,
    clearCalls: clearScheduledEvents,
    prepare: vi.fn().mockResolvedValue(undefined),
    activate,
    replaceState: vi.fn(),
    setProjectRevision: vi.fn(),
    setParameters: vi.fn(),
    previewParameters: vi.fn(),
    scheduleParameters: (changes) => parameterBatches.push(changes),
    schedule: (events) => batches.push(events),
    clearScheduledEvents,
    resume: vi.fn(),
    suspend: vi.fn(),
    dispose,
  };
  return adapter;
}

function stubContext() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    currentTime: 0,
    destination: {},
    ...stubMixerNodes(),
    resume: vi.fn().mockResolvedValue(undefined),
    sampleRate: 48_000,
  };
}

function moduleWith(parts: readonly PatternPartView[]): TransportModule {
  return {
    id: MODULE,
    pluginId: BASS_MONO_MANIFEST.pluginId,
    parameters: {},
    parts,
    mix: DEFAULT_MIX,
  };
}

function notesFrom(adapter: { readonly batches: (readonly ScheduledVoiceEvent[])[] }): number[] {
  return adapter.batches
    .flat()
    .filter((event) => event.type === "note-on")
    .map((event) => event.note ?? -1);
}

async function runtimeWith(module: TransportModule, adapter: VoiceAdapterPort) {
  const context = stubContext();
  const runtime = new TransportRuntime({
    createContext: () => context as unknown as AudioContext,
    adapterFactoryFor: () => () => adapter,
  });
  await runtime.replaceFromCurrentState([module], REVISION);
  return { runtime, context };
}

describe("arrangement", () => {
  it("plays the selected Pattern when song mode is off", async () => {
    vi.useFakeTimers();
    const adapter = recordingAdapter();
    const { runtime } = await runtimeWith(moduleWith([marker(36), marker(48)]), adapter);

    runtime.setArrangement({ activePatternIndex: 1, songEnabled: false, songEntries: [] });
    await runtime.play(120);

    expect(notesFrom(adapter)).toEqual([48]);
    runtime.dispose();
    vi.useRealTimers();
  });

  it("plays the chain in order when song mode is on", async () => {
    vi.useFakeTimers();
    const adapter = recordingAdapter();
    const { runtime } = await runtimeWith(moduleWith([marker(36), marker(48)]), adapter);

    // Pattern 1 once then Pattern 0 once. Step 0 of the chain is Pattern 1.
    runtime.setArrangement({
      activePatternIndex: 0,
      songEnabled: true,
      songEntries: [
        { patternIndex: 1, repeats: 1 },
        { patternIndex: 0, repeats: 1 },
      ],
    });
    await runtime.play(120);

    expect(notesFrom(adapter)).toEqual([48]);
    runtime.dispose();
    vi.useRealTimers();
  });

  it("falls back to the selected Pattern when the chain is empty", async () => {
    vi.useFakeTimers();
    const adapter = recordingAdapter();
    const { runtime } = await runtimeWith(moduleWith([marker(36), marker(48)]), adapter);

    runtime.setArrangement({ activePatternIndex: 0, songEnabled: true, songEntries: [] });
    await runtime.play(120);

    expect(notesFrom(adapter)).toEqual([36]);
    runtime.dispose();
    vi.useRealTimers();
  });

  it("is silent for a Pattern index the module has no part for", async () => {
    vi.useFakeTimers();
    const adapter = recordingAdapter();
    const { runtime } = await runtimeWith(moduleWith([marker(36)]), adapter);

    runtime.setArrangement({ activePatternIndex: 3, songEnabled: false, songEntries: [] });
    await runtime.play(120);

    expect(notesFrom(adapter)).toEqual([]);
    runtime.dispose();
    vi.useRealTimers();
  });

  it("schedules Pattern module automation with absolute audio frames", async () => {
    vi.useFakeTimers();
    const adapter = recordingAdapter();
    const automated: PatternPartView = {
      ...marker(36),
      automationSteps: [{ parameterId: "cutoff", positionTicks: 240, value: 1_200 }],
    };
    const { runtime } = await runtimeWith(moduleWith([automated]), adapter);

    await runtime.play(120);

    expect(adapter.parameterBatches.flat()).toContainEqual({
      atFrame: 6_960,
      occurrenceId: "0:cutoff:1",
      parameterId: "cutoff",
      value: 1_200,
    });
    runtime.dispose();
    vi.useRealTimers();
  });

  it("keeps a Pattern launch quantized when song entries use a fresh equal array", async () => {
    vi.useFakeTimers();
    const adapter = recordingAdapter();
    const { runtime, context } = await runtimeWith(
      moduleWith([marker(36), marker(48)]),
      adapter,
    );
    runtime.setArrangement({ activePatternIndex: 0, songEnabled: false, songEntries: [] });
    await runtime.play(120);
    context.currentTime = 0.03;
    adapter.clearCalls.mockClear();

    runtime.setArrangement({ activePatternIndex: 1, songEnabled: false, songEntries: [] });

    expect(adapter.clearCalls).not.toHaveBeenCalled();
    runtime.dispose();
    vi.useRealTimers();
  });

  it("clears and rebuilds the queued horizon after a full live projection", async () => {
    vi.useFakeTimers();
    const adapter = recordingAdapter();
    const firstPart: PatternPartView = {
      ...marker(36),
      events: marker(36).events.map((event) => ({ ...event, positionTicks: 240 })),
    };
    const secondPart: PatternPartView = {
      ...marker(48),
      events: marker(48).events.map((event) => ({ ...event, positionTicks: 240 })),
    };
    const { runtime } = await runtimeWith(moduleWith([firstPart]), adapter);
    await runtime.play(120);

    await runtime.replaceFromCurrentState(
      [moduleWith([secondPart])],
      { epoch: TEST_UUID, counter: 1 } as StateRevision,
    );

    expect(adapter.clearCalls).toHaveBeenCalled();
    expect(notesFrom(adapter)).toContain(48);
    runtime.dispose();
    vi.useRealTimers();
  });
});

describe("mixer graph", () => {
  it("routes a voice through its own channel rather than the destination", async () => {
    const adapter = recordingAdapter();
    const { runtime, context } = await runtimeWith(moduleWith([marker(36)]), adapter);
    await runtime.activate();

    expect(context.createGain).toHaveBeenCalled();
    expect(context.createStereoPanner).toHaveBeenCalled();
    // The voice never sees `context.destination`; it lands on its channel input.
    expect(adapter.activateCalls).not.toHaveBeenCalledWith(context.destination);
    expect(adapter.activateCalls).toHaveBeenCalledTimes(1);

    runtime.dispose();
  });

  it("ramps a level change instead of stepping it", async () => {
    const adapter = recordingAdapter();
    const module = moduleWith([marker(36)]);
    const { runtime, context } = await runtimeWith(module, adapter);
    await runtime.activate();

    const gain = context.createGain.mock.results[0]?.value as
      { readonly gain: { readonly linearRampToValueAtTime: ReturnType<typeof vi.fn> } } | undefined;
    gain?.gain.linearRampToValueAtTime.mockClear();

    await runtime.project({
      kind: "mixer-set",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { moduleId: MODULE, level: 0.25 },
    });

    expect(gain?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, expect.any(Number));
    runtime.dispose();
  });

  it("silences a muted channel and, under solo, every channel that is not soloed", async () => {
    const adapter = recordingAdapter();
    const { runtime, context } = await runtimeWith(moduleWith([marker(36)]), adapter);
    await runtime.activate();

    const gain = context.createGain.mock.results[0]?.value as
      { readonly gain: { readonly linearRampToValueAtTime: ReturnType<typeof vi.fn> } } | undefined;

    await runtime.project({
      kind: "mixer-set",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { moduleId: MODULE, muted: true },
    });
    expect(gain?.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number));

    await runtime.project({
      kind: "mixer-set",
      projectRevision: { epoch: TEST_UUID, counter: 2 } as StateRevision,
      targetIds: [],
      payload: { moduleId: MODULE, muted: false, solo: true },
    });
    expect(gain?.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.8, expect.any(Number));

    runtime.dispose();
  });
});

describe("audition", () => {
  it("uses a transient adapter and releases it without changing transport state", async () => {
    const context = stubContext();
    const adapters: ReturnType<typeof recordingAdapter>[] = [];
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => {
        const adapter = recordingAdapter();
        adapters.push(adapter);
        return adapter;
      },
    });
    const module = moduleWith([marker(36)]);
    await runtime.replaceFromCurrentState([module], REVISION);

    await runtime.startAudition(MODULE, 43);

    expect(adapters).toHaveLength(2);
    expect(adapters[1]?.batches.flat()).toContainEqual(
      expect.objectContaining({ type: "note-on", note: 43 }),
    );
    expect(runtime.getPositionTicks()).toBe(0);

    runtime.stopAudition(MODULE);
    expect(adapters[1]?.disposeCalls).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("releases a held audition when the project is replaced", async () => {
    const context = stubContext();
    const adapters: ReturnType<typeof recordingAdapter>[] = [];
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => {
        const adapter = recordingAdapter();
        adapters.push(adapter);
        return adapter;
      },
    });
    await runtime.replaceFromCurrentState([moduleWith([marker(36)])], REVISION);
    await runtime.startAudition(MODULE, 36);

    await runtime.replaceFromCurrentState([], {
      epoch: TEST_UUID,
      counter: 1,
    } as StateRevision);

    expect(adapters[1]?.disposeCalls).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("previews a complete transformed Pattern part and then cleans itself", async () => {
    vi.useFakeTimers();
    const context = stubContext();
    const adapters: ReturnType<typeof recordingAdapter>[] = [];
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => {
        const adapter = recordingAdapter();
        adapters.push(adapter);
        return adapter;
      },
    });
    await runtime.replaceFromCurrentState([moduleWith([marker(36)])], REVISION);
    const previewPart: PatternPartView = {
      length: 4,
      durationSteps: 4,
      events: marker(52).events,
      automationSteps: [{ parameterId: "cutoff", positionTicks: 240, value: 2_400 }],
    };

    await runtime.previewPatternPart(MODULE, previewPart, {
      tempo: 120,
      swing: 0,
      humanize: 0,
      seed: 7,
    });

    expect(adapters).toHaveLength(2);
    expect(notesFrom(adapters[1] ?? recordingAdapter())).toContain(52);
    expect(adapters[1]?.parameterBatches.flat()).toContainEqual(
      expect.objectContaining({ parameterId: "cutoff", value: 2_400 }),
    );
    await vi.advanceTimersByTimeAsync(499);
    expect(adapters[1]?.disposeCalls).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(adapters[1]?.disposeCalls).toHaveBeenCalledTimes(1);

    runtime.dispose();
    vi.useRealTimers();
  });
});
