import { stubMixerNodes } from "./stub-audio-graph";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validatePluginManifest } from "../../../src/contracts/plugins";
import type { ModuleInstanceId, StateRevision } from "../../../src/contracts/ids";
import { ENGINE_PROTOCOL_LIMITS } from "../../../src/contracts/worklet-protocol";
import { AcidBassAdapter } from "../../../src/engine/modules/bass-mono/adapter";
import {
  ACID_BASS_DEFAULT_PARAMETERS,
  ACID_BASS_MANIFEST,
} from "../../../src/engine/modules/bass-mono/manifest";
import type { ScheduledVoiceEvent } from "../../../src/engine/transport/scheduled-event";
import {
  TransportRuntime,
  type TransportRuntimeStatus,
} from "../../../src/engine/transport/transport-runtime";
import type {
  VoiceAdapterPort,
  VoiceAdapterStatus,
} from "../../../src/engine/transport/voice-adapter";
import {
  WorkletVoiceAdapter,
  type WorkletVoiceDescriptor,
} from "../../../src/engine/worklets/worklet-voice-adapter";
import { TEST_UUID } from "../contracts/fixtures";

const PROJECT_REVISION = {
  epoch: TEST_UUID,
  counter: 0,
} as StateRevision;
const NEXT_PROJECT_REVISION = {
  epoch: TEST_UUID,
  counter: 1,
} as StateRevision;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Acid Bass plugin", () => {
  it("publishes a valid manifest whose defaults match every parameter", () => {
    const defaults: Readonly<Record<string, unknown>> = ACID_BASS_DEFAULT_PARAMETERS;
    expect(validatePluginManifest(ACID_BASS_MANIFEST)).toMatchObject({ ok: true });
    expect(Object.keys(ACID_BASS_DEFAULT_PARAMETERS).sort()).toEqual(
      ACID_BASS_MANIFEST.parameters.map((parameter) => parameter.id).sort(),
    );
    for (const parameter of ACID_BASS_MANIFEST.parameters) {
      expect(defaults[parameter.id]).toBe(parameter.defaultValue);
    }
    expect(ACID_BASS_MANIFEST.renderCapabilities).toEqual({
      live: true,
      offline: false,
    });
  });

  it("keeps operational accent tokens distinct from the rack control surface", () => {
    const surface = "#242A30";
    for (const color of [
      ACID_BASS_MANIFEST.ui.moduleAccent.accent,
      ACID_BASS_MANIFEST.ui.moduleAccent.led,
      ACID_BASS_MANIFEST.ui.moduleAccent.controlRing,
    ]) {
      expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("returns an active adapter after a suspend and resume cycle", async () => {
    class FakePort {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      readonly close = vi.fn();
      readonly postMessage = vi.fn((value: unknown) => {
        const message = value as {
          readonly kind: string;
          readonly sessionId: string;
          readonly nodeId: string;
          readonly projectRevision: { readonly epoch: string; readonly counter: number };
        };
        if (message.kind !== "hello") return;
        this.onmessage?.({
          data: {
            protocolVersion: 1,
            sessionId: message.sessionId,
            nodeId: message.nodeId,
            sequence: 0,
            kind: "ready",
            projectRevision: message.projectRevision,
            payload: { acceptedProtocolVersion: 1 },
          },
        } as MessageEvent<unknown>);
        this.onmessage?.({
          data: {
            protocolVersion: 1,
            sessionId: message.sessionId,
            nodeId: message.nodeId,
            sequence: 1,
            kind: "ack",
            projectRevision: message.projectRevision,
            payload: {
              highestContiguousSequence: 0,
              projectRevision: message.projectRevision,
              disposition: "applied",
            },
          },
        } as MessageEvent<unknown>);
      });
    }
    class FakeNode extends EventTarget {
      readonly port = new FakePort();
      readonly connect = vi.fn();
      readonly disconnect = vi.fn();
    }
    vi.stubGlobal("AudioWorkletNode", FakeNode);
    const context = {
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    } as unknown as AudioContext;
    const adapter = new AcidBassAdapter(context, {
      projectRevision: PROJECT_REVISION,
    });

    await adapter.prepare();
    adapter.activate({} as AudioNode);
    expect(adapter.state).toBe("active");
    for (let index = 0; index < 300; index += 1) {
      adapter.setParameters({ cutoff: 200 + index }, PROJECT_REVISION);
    }
    expect(adapter.pendingMessageCount).toBeLessThanOrEqual(
      ENGINE_PROTOCOL_LIMITS.backpressureEnvelopeCount,
    );
    adapter.suspend();
    expect(adapter.state).toBe("suspended");
    adapter.resume();
    expect(adapter.state).toBe("active");
  });

  it("exposes the complete worklet voice port on the shared adapter", async () => {
    const sentKinds: string[] = [];
    class FakePort {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

      postMessage(value: unknown): void {
        const message = value as {
          readonly kind: string;
          readonly sessionId: string;
          readonly nodeId: string;
          readonly sequence: number;
          readonly projectRevision: StateRevision;
        };
        sentKinds.push(message.kind);
        if (message.kind !== "hello") return;
        this.onmessage?.({
          data: {
            protocolVersion: 1,
            sessionId: message.sessionId,
            nodeId: message.nodeId,
            sequence: 0,
            kind: "ready",
            projectRevision: message.projectRevision,
            payload: { acceptedProtocolVersion: 1 },
          },
        } as MessageEvent<unknown>);
        this.onmessage?.({
          data: {
            protocolVersion: 1,
            sessionId: message.sessionId,
            nodeId: message.nodeId,
            sequence: 1,
            kind: "ack",
            projectRevision: message.projectRevision,
            payload: {
              highestContiguousSequence: message.sequence,
              projectRevision: message.projectRevision,
              disposition: "applied",
            },
          },
        } as MessageEvent<unknown>);
      }
    }
    class FakeNode extends EventTarget {
      readonly port = new FakePort();
      readonly connect = vi.fn();
      readonly disconnect = vi.fn();
    }
    vi.stubGlobal("AudioWorkletNode", FakeNode);
    const context = {
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    } as unknown as AudioContext;
    const descriptor: WorkletVoiceDescriptor = {
      processorName: "test-voice",
      moduleUrl: "test-voice.js",
      displayName: "Test Voice",
      mapParameters: (parameters) => parameters,
    };
    const adapter = new WorkletVoiceAdapter(descriptor, context, {
      projectRevision: PROJECT_REVISION,
    });

    await adapter.prepare();
    adapter.activate({} as AudioNode);
    adapter.setProjectRevision(NEXT_PROJECT_REVISION);
    adapter.previewParameters({ cutoff: 400 });
    adapter.replaceState({ cutoff: 800 }, NEXT_PROJECT_REVISION);
    adapter.schedule([
      { atFrame: 48, type: "note-on", note: 36, velocity: 0.8, accent: false, slide: false },
    ]);
    adapter.clearScheduledEvents();

    expect(sentKinds).toEqual(
      expect.arrayContaining([
        "parameter-batch",
        "state-snapshot",
        "event-batch",
        "clear-scheduled-events",
      ]),
    );
  });

  it("replaces one faulted processor without replaying unacknowledged parameters", async () => {
    const nodes: RecoveryNode[] = [];
    class RecoveryPort {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      readonly sent: unknown[] = [];
      readonly close = vi.fn();

      postMessage(value: unknown): void {
        this.sent.push(value);
        const message = value as {
          readonly kind: string;
          readonly sessionId: string;
          readonly nodeId: string;
          readonly projectRevision: { readonly epoch: string; readonly counter: number };
        };
        if (message.kind !== "hello") return;
        this.onmessage?.({
          data: {
            protocolVersion: 1,
            sessionId: message.sessionId,
            nodeId: message.nodeId,
            sequence: 0,
            kind: "ready",
            projectRevision: message.projectRevision,
            payload: { acceptedProtocolVersion: 1 },
          },
        } as MessageEvent<unknown>);
        this.onmessage?.({
          data: {
            protocolVersion: 1,
            sessionId: message.sessionId,
            nodeId: message.nodeId,
            sequence: 1,
            kind: "ack",
            projectRevision: message.projectRevision,
            payload: {
              highestContiguousSequence: 0,
              projectRevision: message.projectRevision,
              disposition: "applied",
            },
          },
        } as MessageEvent<unknown>);
      }
    }
    class RecoveryNode extends EventTarget {
      readonly port = new RecoveryPort();
      readonly connect = vi.fn();
      readonly disconnect = vi.fn();

      constructor() {
        super();
        nodes.push(this);
      }
    }
    vi.stubGlobal("AudioWorkletNode", RecoveryNode);
    const context = {
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    } as unknown as AudioContext;
    const destination = {} as AudioNode;
    const adapter = new AcidBassAdapter(context, {
      projectRevision: PROJECT_REVISION,
    });
    await adapter.prepare();
    adapter.activate(destination);
    adapter.setParameters({ cutoff: 1_200, resonance: 0.5 }, NEXT_PROJECT_REVISION);

    nodes[0]?.dispatchEvent(new Event("processorerror"));
    await vi.waitFor(() => {
      expect(adapter.state).toBe("active");
      expect(nodes).toHaveLength(2);
    });

    expect(nodes[1]?.connect).toHaveBeenCalledWith(destination);
    const recoverySnapshots = nodes[1]?.port.sent.filter(
      (value) => (value as { readonly kind?: unknown }).kind === "state-snapshot",
    ) as
      | {
          readonly projectRevision?: StateRevision;
          readonly payload?: { readonly parameters?: unknown };
        }[]
      | undefined;
    const recoveryHello = nodes[1]?.port.sent[0] as
      { readonly projectRevision?: StateRevision } | undefined;
    expect(recoveryHello?.projectRevision).toEqual(PROJECT_REVISION);
    expect(recoverySnapshots).toHaveLength(2);
    expect(recoverySnapshots?.[0]?.projectRevision).toEqual(PROJECT_REVISION);
    expect(recoverySnapshots?.[0]?.payload?.parameters).toEqual({});
    expect(recoverySnapshots?.[1]?.projectRevision).toEqual(NEXT_PROJECT_REVISION);
    expect(recoverySnapshots?.[1]?.payload?.parameters).toEqual({
      cutoff: 1_200,
      resonance: 0.5,
    });
  });

  it("reports a terminal fault when automatic processor recovery cannot handshake", async () => {
    vi.useFakeTimers();
    const statuses: VoiceAdapterStatus[] = [];
    const nodes: RecoveryNode[] = [];
    let nodeCount = 0;

    class RecoveryPort {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      readonly close = vi.fn();
      readonly #respondToHello: boolean;

      constructor(respondToHello: boolean) {
        this.#respondToHello = respondToHello;
      }

      postMessage(value: unknown): void {
        const message = value as {
          readonly kind: string;
          readonly sessionId: string;
          readonly nodeId: string;
          readonly projectRevision: StateRevision;
        };
        if (message.kind !== "hello" || !this.#respondToHello) return;
        this.onmessage?.({
          data: {
            protocolVersion: 1,
            sessionId: message.sessionId,
            nodeId: message.nodeId,
            sequence: 0,
            kind: "ready",
            projectRevision: message.projectRevision,
            payload: { acceptedProtocolVersion: 1 },
          },
        } as MessageEvent<unknown>);
        this.onmessage?.({
          data: {
            protocolVersion: 1,
            sessionId: message.sessionId,
            nodeId: message.nodeId,
            sequence: 1,
            kind: "ack",
            projectRevision: message.projectRevision,
            payload: {
              highestContiguousSequence: 0,
              projectRevision: message.projectRevision,
              disposition: "applied",
            },
          },
        } as MessageEvent<unknown>);
      }
    }

    class RecoveryNode extends EventTarget {
      readonly port: RecoveryPort;
      readonly connect = vi.fn();
      readonly disconnect = vi.fn();

      constructor() {
        super();
        this.port = new RecoveryPort(nodeCount === 0);
        nodeCount += 1;
        nodes.push(this);
      }
    }

    vi.stubGlobal("AudioWorkletNode", RecoveryNode);
    const context = {
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    } as unknown as AudioContext;
    const adapter = new AcidBassAdapter(context, {
      projectRevision: PROJECT_REVISION,
      handshakeTimeoutMilliseconds: 10,
      onStatus: (status) => statuses.push(status),
    });
    await adapter.prepare();
    adapter.activate({} as AudioNode);

    const firstNode = nodes[0];
    if (firstNode === undefined) throw new Error("The first processor node was not created.");
    firstNode.dispatchEvent(new Event("processorerror"));
    expect(statuses[0]).toMatchObject({
      state: "recovering",
      fault: { code: "processor-error" },
    });

    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    expect(adapter.state).toBe("faulted");
    expect(statuses.at(-1)).toMatchObject({
      state: "faulted",
      fault: { code: "handshake-timeout" },
    });
  });

  it("clears old events and schedules the exact new-tempo frame grid", async () => {
    vi.useFakeTimers();
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      destination: {},
      ...stubMixerNodes(),
      resume: vi.fn().mockResolvedValue(undefined),
      sampleRate: 48_000,
    };
    const scheduleBatches: (readonly ScheduledVoiceEvent[])[] = [];
    const clearScheduledEvents = vi.fn();
    const disposeAdapter = vi.fn();
    const statuses: TransportRuntimeStatus[] = [];
    let publishAdapterStatus: ((status: VoiceAdapterStatus) => void) | undefined;
    const adapter: VoiceAdapterPort = {
      prepare: vi.fn().mockResolvedValue(undefined),
      activate: vi.fn(),
      replaceState: vi.fn(),
      setProjectRevision: vi.fn(),
      setParameters: vi.fn(),
      previewParameters: vi.fn(),
      schedule: (events) => scheduleBatches.push(events),
      clearScheduledEvents,
      resume: vi.fn(),
      suspend: vi.fn(),
      dispose: disposeAdapter,
    };
    const moduleId = "10000000-0000-4000-8000-000000000001" as ModuleInstanceId;
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      onStatus: (status) => statuses.push(status),
      adapterFactoryFor: () => (_audioContext, options) => {
        publishAdapterStatus = options.onStatus;
        return adapter;
      },
    });
    await runtime.replaceFromCurrentState(
      [
        {
          id: moduleId,
          pluginId: ACID_BASS_MANIFEST.pluginId,
          parameters: ACID_BASS_DEFAULT_PARAMETERS,
          parts: [
            Array.from({ length: 16 }, () => ({
              active: true,
              note: 36,
              velocity: 0.8,
              accent: false,
              slide: false,
            })),
          ],
          mix: { level: 0.8, pan: 0, muted: false, solo: false },
        },
      ],
      PROJECT_REVISION,
    );

    await runtime.play(120);
    expect(scheduleBatches[0]?.[0]?.atFrame).toBe(960);

    context.currentTime = 0.5;
    scheduleBatches.length = 0;
    publishAdapterStatus?.({ state: "recovered" });
    expect(scheduleBatches[0]?.[0]?.atFrame).toBe(24_960);

    await runtime.project({
      kind: "transport",
      projectRevision: NEXT_PROJECT_REVISION,
      targetIds: [],
      payload: { tempo: 240 },
    });

    expect(clearScheduledEvents).toHaveBeenCalledOnce();
    expect(scheduleBatches.at(-1)?.[0]?.atFrame).toBe(27_475);
    expect(runtime.projectRevision).toEqual(NEXT_PROJECT_REVISION);

    publishAdapterStatus?.({
      state: "faulted",
      fault: {
        code: "handshake-timeout",
        message: "Recovery did not complete.",
        recoveryAction: "Keep this module silent.",
      },
    });
    expect(statuses.at(-1)).toMatchObject({
      moduleId,
      state: "faulted",
      fault: { code: "handshake-timeout" },
    });

    // The fault belongs to one voice. Its adapter is released so it stops
    // receiving control data, but the runtime stays usable: the recovery text
    // promises a silent instrument, not a silent application.
    expect(disposeAdapter).toHaveBeenCalled();
    expect(runtime.state).not.toBe("unavailable");
    await expect(runtime.play(120)).resolves.toBeUndefined();
    runtime.dispose();
  });

  it("preserves transport position across tempo changes and pause cycles", async () => {
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      destination: {},
      ...stubMixerNodes(),
      resume: vi.fn().mockResolvedValue(undefined),
      sampleRate: 48_000,
    };
    const runtime = new TransportRuntime({
      createContext: () => context as unknown as AudioContext,
      adapterFactoryFor: () => undefined,
    });
    await runtime.play(120);
    context.currentTime = 0.5;
    runtime.setTempo(240);
    context.currentTime = 0.75;
    const firstPause = runtime.pause();
    expect(firstPause).toBeGreaterThan(1_800);

    context.currentTime = 1;
    await runtime.play(240);
    context.currentTime = 1.25;
    const secondPause = runtime.pause();
    expect(secondPause).toBeGreaterThan(firstPause + 850);
    runtime.dispose();
  });
});

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
