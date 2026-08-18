import { stubMixerNodes } from "./stub-audio-graph";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IdFactory, StateRevision } from "../../../src/contracts/ids";
import type { EngineMessageEnvelope } from "../../../src/contracts/worklet-protocol";
import { BASS_MONO_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import { createBassVoiceAdapter } from "../../../src/engine/modules/bass-mono/adapter";
import {
  TransportRuntime,
  type TransportModule,
} from "../../../src/engine/transport/transport-runtime";
import type { VoiceAdapterStatus } from "../../../src/engine/transport/voice-adapter";
import type { WorkletVoiceAdapter } from "../../../src/engine/worklets/worklet-voice-adapter";
import { createDefaultState } from "../../../src/state/default-state";
import { createParameterValidator } from "../../../src/state/persistence/project-document";
import { PulseStore } from "../../../src/state/pulse-store";
import { TEST_UUID } from "../contracts/fixtures";

const seed = {
  pluginId: BASS_MONO_MANIFEST.pluginId,
  parameters: { cutoff: 720, waveform: "saw", volume: 0.62 },
  events: Array.from({ length: 16 }, (_, step) => ({
    type: "note" as const,
    positionTicks: step * 240,
    durationTicks: 240,
    data: { note: 36, velocity: 0.8, accent: false, slide: false },
  })),
};

class ProtocolPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly sent: EngineMessageEnvelope[] = [];
  readonly close = vi.fn();
  #processorSequence = 0;

  postMessage(value: unknown): void {
    const message = value as EngineMessageEnvelope;
    this.sent.push(message);
    if (message.kind === "hello") {
      this.#reply(message, "ready", { acceptedProtocolVersion: 1 });
    }
    this.#reply(message, "ack", {
      highestContiguousSequence: message.sequence,
      projectRevision: message.projectRevision,
      disposition: "applied",
    });
  }

  #reply(
    source: EngineMessageEnvelope,
    kind: "ready" | "ack",
    payload: Readonly<Record<string, unknown>>,
  ): void {
    this.onmessage?.({
      data: {
        protocolVersion: 1,
        sessionId: source.sessionId,
        nodeId: source.nodeId,
        sequence: this.#processorSequence,
        kind,
        projectRevision: source.projectRevision,
        payload,
      },
    } as MessageEvent<unknown>);
    this.#processorSequence += 1;
  }
}

class ProtocolNode extends EventTarget {
  static readonly instances: ProtocolNode[] = [];
  readonly port = new ProtocolPort();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();

  constructor() {
    super();
    ProtocolNode.instances.push(this);
  }
}

afterEach(() => {
  ProtocolNode.instances.length = 0;
  vi.unstubAllGlobals();
});

describe("store to Silver Serpent worklet projection", () => {
  it("uses each accepted store revision and restores one current bounded snapshot", async () => {
    vi.stubGlobal("AudioWorkletNode", ProtocolNode);
    const ids = deterministicIds();
    const initialState = createDefaultState(ids, seed);
    const initialModules = toRuntimeModules(initialState);
    const context = {
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      close: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      destination: {},
      ...stubMixerNodes(),
      resume: vi.fn().mockResolvedValue(undefined),
      sampleRate: 48_000,
    } as unknown as AudioContext;
    const runtime = new TransportRuntime({
      createContext: () => context,
      adapterFactoryFor: () => createBassVoiceAdapter,
    });
    await runtime.replaceFromCurrentState(initialModules, initialState.project.revision);
    await runtime.activate();

    const projections: Promise<void>[] = [];
    const store = new PulseStore(
      initialState,
      ids,
      seed,
      (delta) => projections.push(runtime.project(delta)),
      createParameterValidator((pluginId) =>
        pluginId === BASS_MONO_MANIFEST.pluginId ? BASS_MONO_MANIFEST.parameters : undefined,
      ),
    );
    const moduleId = store.getState().ui.selectedModuleId;
    if (moduleId === undefined) throw new Error("Expected a selected module.");
    const result = store.dispatch(
      store.createCommand("rack-parameter-set", {
        moduleId,
        parameter: "cutoff",
        value: 1_200,
      }),
    );
    await Promise.all(projections);
    if (result.status !== "accepted") throw new Error("Expected an accepted edit.");

    const firstNode = ProtocolNode.instances[0];
    expect(firstNode?.port.sent.at(-1)).toMatchObject({
      kind: "parameter-batch",
      projectRevision: result.projectRevision,
      payload: {
        changes: [{ parameterId: "cutoff", value: 1_200 }],
      },
    });

    firstNode?.dispatchEvent(new Event("processorerror"));
    await vi.waitFor(() => {
      expect(ProtocolNode.instances).toHaveLength(2);
      expect(ProtocolNode.instances[1]?.port.sent).toHaveLength(3);
    });
    const recoveryMessages = ProtocolNode.instances[1]?.port.sent;
    expect(recoveryMessages?.map((message) => message.kind)).toEqual([
      "hello",
      "state-snapshot",
      "resume",
    ]);
    const recoverySnapshot = recoveryMessages?.find((message) => message.kind === "state-snapshot");
    expect(recoverySnapshot).toMatchObject({
      kind: "state-snapshot",
      projectRevision: result.projectRevision,
    });
    expect(recoverySnapshot?.payload.parameters).toMatchObject({ cutoff: 1_200 });
    expect(runtime.projectRevision).toEqual(store.getState().project.revision);
  });
});

describe("worklet voice adapter bounds and disposal", () => {
  const REVISION = { epoch: TEST_UUID, counter: 0 } as StateRevision;

  function adapterContext(): AudioContext {
    return {
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      currentTime: 0,
      sampleRate: 48_000,
    } as unknown as AudioContext;
  }

  it("splits a complete event horizon into bounded protocol batches", async () => {
    vi.stubGlobal("AudioWorkletNode", ProtocolNode);
    const statuses: VoiceAdapterStatus[] = [];
    const adapter = createBassVoiceAdapter(adapterContext(), {
      projectRevision: REVISION,
      onStatus: (status) => statuses.push(status),
    });
    await adapter.prepare();
    adapter.activate({} as unknown as AudioNode);

    adapter.schedule(
      Array.from({ length: 257 }, (_, index) => ({
        atFrame: 1_000 + index,
        type: "note-on" as const,
        note: 36,
        velocity: 0.8,
        accent: false,
        slide: false,
      })),
    );

    const eventBatches = ProtocolNode.instances.at(-1)?.port.sent.filter(
      (message) => message.kind === "event-batch",
    );
    expect(statuses).toEqual([]);
    expect(eventBatches).toHaveLength(2);
    expect(eventBatches?.map((message) => (message.payload.events as unknown[]).length)).toEqual([
      256,
      1,
    ]);
  });

  it("keeps occurrence identity and deterministic event identity in the payload", async () => {
    vi.stubGlobal("AudioWorkletNode", ProtocolNode);
    const adapter = createBassVoiceAdapter(adapterContext(), {
      projectRevision: REVISION,
    });
    await adapter.prepare();
    adapter.activate({} as unknown as AudioNode);

    adapter.schedule([
      {
        atFrame: 1_000,
        type: "note-on",
        occurrenceId: "event-1:4:main",
        note: 36,
        velocity: 0.8,
      },
    ]);

    const batch = ProtocolNode.instances.at(-1)?.port.sent.find(
      (message) => message.kind === "event-batch",
    );
    const events = batch?.payload.events as readonly unknown[] | undefined;
    expect(events?.[0]).toMatchObject({
      eventId: "event-1:4:main:note-on",
      priority: 2,
      data: { occurrenceId: "event-1:4:main" },
    });
  });

  it("splits scheduled automation into bounded protocol batches", async () => {
    vi.stubGlobal("AudioWorkletNode", ProtocolNode);
    const statuses: VoiceAdapterStatus[] = [];
    const adapter = createBassVoiceAdapter(adapterContext(), {
      projectRevision: REVISION,
      onStatus: (status) => statuses.push(status),
    });
    await adapter.prepare();
    adapter.activate({} as unknown as AudioNode);

    adapter.scheduleParameters(
      Array.from({ length: 129 }, (_, index) => ({
        atFrame: 1_000 + index,
        parameterId: "cutoff",
        value: 1_000 + index,
      })),
    );

    const parameterBatches = ProtocolNode.instances.at(-1)?.port.sent.filter(
      (message) => message.kind === "parameter-batch",
    );
    expect(statuses).toEqual([]);
    expect(parameterBatches).toHaveLength(2);
    expect(
      parameterBatches?.map((message) => (message.payload.changes as unknown[]).length),
    ).toEqual([128, 1]);
  });

  it("faults instead of silently dropping a batch with an invalid event frame", async () => {
    vi.stubGlobal("AudioWorkletNode", ProtocolNode);
    const statuses: VoiceAdapterStatus[] = [];
    const adapter = createBassVoiceAdapter(adapterContext(), {
      projectRevision: REVISION,
      onStatus: (status) => statuses.push(status),
    });
    await adapter.prepare();
    adapter.activate({} as unknown as AudioNode);

    adapter.schedule([
      { atFrame: 1_000, type: "note-on", note: 36, velocity: 0.8, accent: false, slide: false },
      { atFrame: Number.NaN, type: "note-off" },
    ]);

    expect(statuses[0]).toMatchObject({
      state: "recovering",
      fault: { code: "event-batch-invalid-frame" },
    });
  });

  it("rejects a pending prepare when the adapter is disposed mid-handshake", async () => {
    class SilentNode extends EventTarget {
      readonly port = {
        onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
        postMessage: vi.fn(),
        close: vi.fn(),
      };

      readonly connect = vi.fn();
      readonly disconnect = vi.fn();
    }
    vi.stubGlobal("AudioWorkletNode", SilentNode);
    const adapter = createBassVoiceAdapter(adapterContext(), {
      projectRevision: REVISION,
    }) as WorkletVoiceAdapter;

    const pending = adapter.prepare();
    const expectation = expect(pending).rejects.toThrow("disposed");
    // The hello envelope is in flight and the silent processor never answers.
    await vi.waitFor(() => {
      expect(adapter.pendingMessageCount).toBe(1);
    });
    adapter.dispose();
    await expectation;
    expect(adapter.state).toBe("disposing");
  });

  it("rejects prepare when disposal occurs during addModule", async () => {
    vi.stubGlobal("AudioWorkletNode", ProtocolNode);
    let finishModule: (() => void) | undefined;
    const addModule = vi.fn(
      () => new Promise<void>((resolve) => { finishModule = resolve; }),
    );
    const adapter = createBassVoiceAdapter(
      {
        audioWorklet: { addModule },
        currentTime: 0,
        sampleRate: 48_000,
      } as unknown as AudioContext,
      { projectRevision: REVISION },
    ) as WorkletVoiceAdapter;

    const pending = adapter.prepare();
    await vi.waitFor(() => expect(addModule).toHaveBeenCalledTimes(1));
    adapter.dispose();
    finishModule?.();

    await expect(pending).rejects.toThrow("disposed during preparation");
    expect(ProtocolNode.instances).toHaveLength(0);
    expect(adapter.state).toBe("disposed");
  });
});

function toRuntimeModules(state: ReturnType<typeof createDefaultState>): TransportModule[] {
  return Object.values(state.project.modules).map((module) => ({
    id: module.id,
    pluginId: module.pluginId,
    parameters: module.parameters,
    parts: state.project.patterns.map(
      (pattern) =>
        pattern.parts[module.id] ?? {
          moduleId: module.id,
          length: 16,
          voiceCycleLengths: {},
          events: [],
          automationLaneIds: [],
        },
    ),
    mix: { level: module.level, pan: module.pan, muted: module.muted, solo: module.solo },
  }));
}

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}
