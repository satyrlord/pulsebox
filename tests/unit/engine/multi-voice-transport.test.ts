import { stubMixerNodes } from "./stub-audio-graph";
import { describe, expect, it, vi } from "vitest";

import type { ModuleInstanceId, StateRevision } from "../../../src/contracts/ids";
import { ACID_BASS_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
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
        pluginId: ACID_BASS_MANIFEST.pluginId,
        parameters: { cutoff: 720 },
        // Every downbeat.
        parts: [steps(36, (index) => index % 4 === 0)],
        mix: DEFAULT_MIX,
      },
      {
        id: moduleId(2),
        pluginId: ACID_BASS_MANIFEST.pluginId,
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
    // The second bass sits on a later step, so its first window is silent.
    expect(secondBass.filter((event) => event.type === "note-on")).toHaveLength(0);
    expect(drums.filter((event) => event.type === "note-on")).toHaveLength(1);

    runtime.dispose();
    vi.useRealTimers();
  });

  it("routes a parameter change to only the module that owns it", async () => {
    const context = stubContext();
    const bass = recordingAdapter();
    const drum = recordingAdapter();
    const byPlugin = new Map([
      [ACID_BASS_MANIFEST.pluginId, bass],
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
          pluginId: ACID_BASS_MANIFEST.pluginId,
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
          pluginId: ACID_BASS_MANIFEST.pluginId,
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
