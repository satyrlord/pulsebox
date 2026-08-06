import { stubMixerNodes } from "./stub-audio-graph";
import { describe, expect, it, vi } from "vitest";

import type { ModuleInstanceId, StateRevision } from "../../../src/contracts/ids";
import { BASS_MONO_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import { DRUMLINE_SIX_MANIFEST } from "../../../src/engine/modules/drumline-six/manifest";
import type { ScheduledVoiceEvent } from "../../../src/engine/transport/scheduled-event";
import {
  TransportRuntime,
  type TransportModule,
} from "../../../src/engine/transport/transport-runtime";
import type { PatternStepView } from "../../../src/engine/transport/scheduled-event";
import type { VoiceAdapterPort } from "../../../src/engine/transport/voice-adapter";
import { TEST_UUID } from "../contracts/fixtures";

const REVISION = { epoch: TEST_UUID, counter: 0 } as StateRevision;
const DEFAULT_MIX = { level: 0.8, pan: 0, muted: false, solo: false } as const;

function moduleId(suffix: number): ModuleInstanceId {
  return `10000000-0000-4000-8000-00000000000${suffix.toString()}` as ModuleInstanceId;
}

function steps(note: number, active: (index: number) => boolean): PatternStepView[] {
  return Array.from({ length: 16 }, (_, index) => ({
    active: active(index),
    note,
    velocity: 0.8,
    accent: false,
    slide: false,
  }));
}

interface RecordingAdapter extends VoiceAdapterPort {
  readonly batches: (readonly ScheduledVoiceEvent[])[];
  readonly parameterWrites: Readonly<Record<string, unknown>>[];
}

function recordingAdapter(): RecordingAdapter {
  const batches: (readonly ScheduledVoiceEvent[])[] = [];
  const parameterWrites: Readonly<Record<string, unknown>>[] = [];
  return {
    batches,
    parameterWrites,
    prepare: vi.fn().mockResolvedValue(undefined),
    activate: vi.fn(),
    replaceState: vi.fn(),
    setProjectRevision: vi.fn(),
    setParameters: (parameters) => parameterWrites.push(parameters),
    previewParameters: (parameters) => parameterWrites.push(parameters),
    schedule: (events) => batches.push(events),
    clearScheduledEvents: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    dispose: vi.fn(),
  };
}

function stubContext(sampleRate = 48_000) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    currentTime: 0,
    destination: {},
    ...stubMixerNodes(),
    resume: vi.fn().mockResolvedValue(undefined),
    sampleRate,
  };
}

describe("transport with several voices", () => {
  it("schedules each module independently from one clock", async () => {
    vi.useFakeTimers();
    const context = stubContext();
    const adapters = new Map<ModuleInstanceId, RecordingAdapter>([
      [moduleId(1), recordingAdapter()],
      [moduleId(2), recordingAdapter()],
      [moduleId(3), recordingAdapter()],
    ]);
    const created: ModuleInstanceId[] = [];

    const modules: TransportModule[] = [
      {
        id: moduleId(1),
        pluginId: BASS_MONO_MANIFEST.pluginId,
        parameters: { cutoff: 720 },
        // Every downbeat.
        parts: [steps(36, (index) => index % 4 === 0)],
        mix: DEFAULT_MIX,
      },
      {
        id: moduleId(2),
        pluginId: BASS_MONO_MANIFEST.pluginId,
        parameters: { cutoff: 1_400 },
        // Offbeats only, so the two basslines never collide.
        parts: [steps(48, (index) => index % 4 === 2)],
        mix: DEFAULT_MIX,
      },
      {
        id: moduleId(3),
        pluginId: DRUMLINE_SIX_MANIFEST.pluginId,
        parameters: { level: 0.8 },
        parts: [steps(36, () => true)],
        mix: DEFAULT_MIX,
      },
    ];

    let nextModule = 0;
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => {
        const id = modules[nextModule]?.id;
        nextModule += 1;
        if (id === undefined) throw new Error("Unexpected adapter request.");
        created.push(id);
        const adapter = adapters.get(id);
        if (adapter === undefined) throw new Error("Missing adapter fixture.");
        return adapter;
      },
    });

    await runtime.replaceFromCurrentState(modules, REVISION);
    await runtime.play(120);

    expect(created).toHaveLength(3);
    for (const adapter of adapters.values()) expect(adapter.batches.length).toBeGreaterThan(0);

    const firstBass = adapters.get(moduleId(1))?.batches.flat() ?? [];
    const secondBass = adapters.get(moduleId(2))?.batches.flat() ?? [];
    const drums = adapters.get(moduleId(3))?.batches.flat() ?? [];

    expect(
      firstBass.filter((event) => event.type === "note-on").map((event) => event.note),
    ).toEqual([36]);
    expect(
      secondBass.filter((event) => event.type === "note-on").map((event) => event.note),
    ).toEqual([48]);
    expect(drums.filter((event) => event.type === "note-on")).toHaveLength(4);

    runtime.dispose();
    vi.useRealTimers();
  });

  it("routes a parameter change to only the module that owns it", async () => {
    const context = stubContext();
    const bass = recordingAdapter();
    const drum = recordingAdapter();
    const byPlugin = new Map([
      [BASS_MONO_MANIFEST.pluginId, bass],
      [DRUMLINE_SIX_MANIFEST.pluginId, drum],
    ]);

    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: (pluginId) => () => {
        const adapter = byPlugin.get(pluginId);
        if (adapter === undefined) throw new Error("Missing adapter fixture.");
        return adapter;
      },
    });

    await runtime.replaceFromCurrentState(
      [
        {
          id: moduleId(1),
          pluginId: BASS_MONO_MANIFEST.pluginId,
          parameters: { cutoff: 720 },
          parts: [steps(36, () => false)],
          mix: DEFAULT_MIX,
        },
        {
          id: moduleId(2),
          pluginId: DRUMLINE_SIX_MANIFEST.pluginId,
          parameters: { level: 0.8 },
          parts: [steps(36, () => false)],
          mix: DEFAULT_MIX,
        },
      ],
      REVISION,
    );
    await runtime.activate();

    await runtime.project({
      kind: "parameter-set",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [],
      payload: { moduleId: moduleId(2), parameter: "kick-tune", value: 3 },
    });

    expect(drum.parameterWrites).toEqual([{ "kick-tune": 3 }]);
    expect(bass.parameterWrites).toEqual([]);

    runtime.dispose();
  });

  it("replaces one module's queued horizon after a live step edit", async () => {
    const context = stubContext();
    const adapter = recordingAdapter();
    const clearScheduledEvents = vi.spyOn(adapter, "clearScheduledEvents");
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => adapter,
    });
    await runtime.replaceFromCurrentState(
      [
        {
          id: moduleId(1),
          pluginId: BASS_MONO_MANIFEST.pluginId,
          parameters: {},
          parts: [steps(36, () => false)],
          mix: DEFAULT_MIX,
        },
      ],
      REVISION,
    );
    await runtime.play(120);
    await runtime.project({
      kind: "step-set",
      projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
      targetIds: [moduleId(1)],
      payload: { moduleId: moduleId(1), patternIndex: 0, step: 1, active: true },
    });

    expect(clearScheduledEvents).toHaveBeenCalledOnce();
    expect(
      adapter.batches
        .flat()
        .filter((event) => event.type === "note-on")
        .map((event) => event.atFrame),
    ).toContain(6_960);
    runtime.dispose();
  });

  it("swaps one module's adapter without touching unrelated voices", async () => {
    const context = stubContext();
    const bassDispose = vi.fn();
    const drumDispose = vi.fn();
    const replacementActivate = vi.fn();
    const replacementReplaceState = vi.fn();
    const bass = { ...recordingAdapter(), dispose: bassDispose };
    const drum = { ...recordingAdapter(), dispose: drumDispose };
    const replacement = {
      ...recordingAdapter(),
      activate: replacementActivate,
      replaceState: replacementReplaceState,
    };
    const created: string[] = [];
    const byPlugin = new Map([
      [BASS_MONO_MANIFEST.pluginId, [bass, replacement]],
      [DRUMLINE_SIX_MANIFEST.pluginId, [drum]],
    ]);

    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: (pluginId) => () => {
        const adapter = byPlugin.get(pluginId)?.shift();
        if (adapter === undefined) throw new Error("Missing adapter fixture.");
        created.push(pluginId);
        return adapter;
      },
    });

    await runtime.replaceFromCurrentState(
      [
        {
          id: moduleId(1),
          pluginId: DRUMLINE_SIX_MANIFEST.pluginId,
          parameters: { tone: 0.5 },
          parts: [steps(36, () => false)],
          mix: DEFAULT_MIX,
        },
        {
          id: moduleId(2),
          pluginId: BASS_MONO_MANIFEST.pluginId,
          parameters: { cutoff: 720 },
          parts: [steps(36, () => false)],
          mix: DEFAULT_MIX,
        },
      ],
      REVISION,
    );
    await runtime.activate();
    expect(created).toHaveLength(2);

    // The state layer swapped module 2 from Tin Soldier... to Silver Serpent. The
    // engine receives the swapped projection for that module only.
    await runtime.project(
      {
        kind: "module-swap",
        projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
        targetIds: [moduleId(2)],
        payload: { moduleId: moduleId(2), pluginId: BASS_MONO_MANIFEST.pluginId },
      },
      {
        id: moduleId(2),
        pluginId: BASS_MONO_MANIFEST.pluginId,
        parameters: { cutoff: 900 },
        parts: [steps(36, () => false)],
        mix: DEFAULT_MIX,
      },
    );

    // The swapped module's old adapter is released and a new one activated.
    expect(bassDispose).toHaveBeenCalledTimes(1);
    expect(replacementActivate).toHaveBeenCalledTimes(1);
    expect(replacementReplaceState).toHaveBeenCalledWith(
      { cutoff: 900 },
      expect.objectContaining({ counter: 1 }),
      undefined,
    );
    // The unrelated drum voice keeps playing on its original adapter.
    expect(drumDispose).not.toHaveBeenCalled();

    runtime.dispose();
  });

  it("keeps voices aligned and drops expired events after a scheduler stall", async () => {
    vi.useFakeTimers();
    const context = stubContext();
    const first = recordingAdapter();
    const second = recordingAdapter();
    const adapters = [first, second];
    let nextAdapter = 0;
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => {
        const adapter = adapters[nextAdapter];
        nextAdapter += 1;
        if (adapter === undefined) throw new Error("Missing adapter fixture.");
        return adapter;
      },
    });

    await runtime.replaceFromCurrentState(
      [
        {
          id: moduleId(1),
          pluginId: BASS_MONO_MANIFEST.pluginId,
          parameters: {},
          parts: [steps(36, () => true)],
          mix: DEFAULT_MIX,
        },
        {
          id: moduleId(2),
          pluginId: BASS_MONO_MANIFEST.pluginId,
          parameters: {},
          parts: [steps(36, () => true)],
          mix: DEFAULT_MIX,
        },
      ],
      REVISION,
    );
    await runtime.play(120);
    const firstBatchCount = first.batches.length;
    const secondBatchCount = second.batches.length;

    // The audio clock advances 400 ms while the 25 ms scheduler timer is blocked.
    context.currentTime = 0.4;
    await vi.advanceTimersByTimeAsync(25);
    context.currentTime = 0.425;
    await vi.advanceTimersByTimeAsync(25);

    const firstOnsets = first.batches
      .slice(firstBatchCount)
      .flat()
      .filter((event) => event.type === "note-on")
      .map((event) => event.atFrame);
    const secondOnsets = second.batches
      .slice(secondBatchCount)
      .flat()
      .filter((event) => event.type === "note-on")
      .map((event) => event.atFrame);
    const recoveryFrame = Math.floor(0.4 * context.sampleRate);
    runtime.dispose();
    vi.useRealTimers();

    expect(firstOnsets).toEqual(secondOnsets);
    expect(firstOnsets.length).toBeGreaterThan(0);
    expect(firstOnsets.every((frame) => frame >= recoveryFrame)).toBe(true);
  });

  it("keeps the future grid complete after a stall beyond recovery", async () => {
    vi.useFakeTimers();
    const context = stubContext();
    const adapter = recordingAdapter();
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => () => adapter,
    });

    await runtime.replaceFromCurrentState(
      [
        {
          id: moduleId(1),
          pluginId: BASS_MONO_MANIFEST.pluginId,
          parameters: {},
          parts: [steps(36, () => true)],
          mix: DEFAULT_MIX,
        },
      ],
      REVISION,
    );
    await runtime.play(120);
    const batchCount = adapter.batches.length;

    context.currentTime = 0.7;
    await vi.advanceTimersByTimeAsync(25);
    for (let tick = 0; tick < 20; tick += 1) {
      context.currentTime += 0.025;
      await vi.advanceTimersByTimeAsync(25);
    }

    const recoveryFrame = Math.floor(0.7 * context.sampleRate);
    const futureOnsets = adapter.batches
      .slice(batchCount)
      .flat()
      .filter((event) => event.type === "note-on" && event.atFrame >= recoveryFrame)
      .map((event) => event.atFrame);
    runtime.dispose();
    vi.useRealTimers();

    expect(futureOnsets.length).toBeGreaterThanOrEqual(4);
    expect(futureOnsets.slice(1).map((frame, index) => frame - (futureOnsets[index] ?? 0))).toEqual(
      Array.from({ length: futureOnsets.length - 1 }, () => 6_000),
    );
  });

  it("fills the remaining shared window when a module is added during playback", async () => {
    vi.useFakeTimers();
    const context = stubContext();
    const initial = recordingAdapter();
    const added = recordingAdapter();
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: (pluginId) => () =>
        pluginId === DRUMLINE_SIX_MANIFEST.pluginId ? initial : added,
    });

    await runtime.replaceFromCurrentState(
      [
        {
          id: moduleId(1),
          pluginId: DRUMLINE_SIX_MANIFEST.pluginId,
          parameters: {},
          parts: [steps(36, () => true)],
          mix: DEFAULT_MIX,
        },
      ],
      REVISION,
    );
    await runtime.play(120);
    context.currentTime = 0.05;
    await vi.advanceTimersByTimeAsync(25);
    const currentFrame = Math.floor(context.currentTime * context.sampleRate);
    const remainingSharedOnsets = initial.batches
      .flat()
      .filter((event) => event.type === "note-on" && event.atFrame >= currentFrame)
      .map((event) => event.atFrame);

    await runtime.project(
      {
        kind: "module-add",
        projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
        targetIds: [moduleId(2)],
        payload: { moduleId: moduleId(2), pluginId: BASS_MONO_MANIFEST.pluginId },
      },
      {
        id: moduleId(2),
        pluginId: BASS_MONO_MANIFEST.pluginId,
        parameters: {},
        parts: [steps(36, () => true)],
        mix: DEFAULT_MIX,
      },
    );

    const addedOnsets = added.batches
      .flat()
      .filter((event) => event.type === "note-on")
      .map((event) => event.atFrame);
    runtime.dispose();
    vi.useRealTimers();

    expect(addedOnsets).toEqual(remainingSharedOnsets);
  });

  it("fills the remaining shared window when a module is swapped during playback", async () => {
    vi.useFakeTimers();
    const context = stubContext();
    const initial = recordingAdapter();
    const replacement = recordingAdapter();
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: (pluginId) => () =>
        pluginId === BASS_MONO_MANIFEST.pluginId ? initial : replacement,
    });

    await runtime.replaceFromCurrentState(
      [
        {
          id: moduleId(1),
          pluginId: BASS_MONO_MANIFEST.pluginId,
          parameters: {},
          parts: [steps(36, () => true)],
          mix: DEFAULT_MIX,
        },
      ],
      REVISION,
    );
    await runtime.play(120);
    context.currentTime = 0.05;
    await vi.advanceTimersByTimeAsync(25);
    const currentFrame = Math.floor(context.currentTime * context.sampleRate);
    const remainingSharedOnsets = initial.batches
      .flat()
      .filter((event) => event.type === "note-on" && event.atFrame >= currentFrame)
      .map((event) => event.atFrame);

    await runtime.project(
      {
        kind: "module-swap",
        projectRevision: { epoch: TEST_UUID, counter: 1 } as StateRevision,
        targetIds: [moduleId(1)],
        payload: { moduleId: moduleId(1), pluginId: DRUMLINE_SIX_MANIFEST.pluginId },
      },
      {
        id: moduleId(1),
        pluginId: DRUMLINE_SIX_MANIFEST.pluginId,
        parameters: {},
        parts: [steps(36, () => true)],
        mix: DEFAULT_MIX,
      },
    );

    const replacementOnsets = replacement.batches
      .flat()
      .filter((event) => event.type === "note-on")
      .map((event) => event.atFrame);
    runtime.dispose();
    vi.useRealTimers();

    expect(replacementOnsets).toEqual(remainingSharedOnsets);
  });

  it.each([44_100, 48_000])(
    "keeps eight modules aligned through UI-length stalls at %i Hz",
    async (sampleRate) => {
      vi.useFakeTimers();
      const context = stubContext(sampleRate);
      const adapters = Array.from({ length: 8 }, () => recordingAdapter());
      let nextAdapter = 0;
      const runtime = new TransportRuntime({
        createContext: () => context as unknown as AudioContext,
        adapterFactoryFor: () => () => {
          const adapter = adapters[nextAdapter];
          nextAdapter += 1;
          if (adapter === undefined) throw new Error("Missing adapter fixture.");
          return adapter;
        },
      });
      await runtime.replaceFromCurrentState(
        adapters.map((_, index) => ({
          id: moduleId(index + 1),
          pluginId: BASS_MONO_MANIFEST.pluginId,
          parameters: {},
          parts: [steps(36, () => true)],
          mix: DEFAULT_MIX,
        })),
        REVISION,
      );
      await runtime.play(240);

      for (let pass = 0; pass < 8; pass += 1) {
        context.currentTime += 0.2;
        await vi.advanceTimersByTimeAsync(200);
      }

      const onsetFrames = adapters.map((adapter) =>
        adapter.batches
          .flat()
          .filter((event) => event.type === "note-on")
          .map((event) => event.atFrame),
      );
      runtime.dispose();
      vi.useRealTimers();

      expect(onsetFrames[0]?.length).toBeGreaterThan(20);
      for (const frames of onsetFrames.slice(1)) expect(frames).toEqual(onsetFrames[0]);
    },
  );

  it("leaves a module silent when no adapter is registered for its plugin", async () => {
    const context = stubContext();
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => undefined,
    });

    await runtime.replaceFromCurrentState(
      [
        {
          id: moduleId(1),
          pluginId: BASS_MONO_MANIFEST.pluginId,
          parameters: {},
          parts: [steps(36, () => true)],
          mix: DEFAULT_MIX,
        },
      ],
      REVISION,
    );

    await expect(runtime.play(120)).resolves.toBeUndefined();
    runtime.dispose();
  });
});
