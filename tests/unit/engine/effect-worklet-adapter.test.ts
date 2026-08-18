import { afterEach, describe, expect, it, vi } from "vitest";

import type { PluginId } from "../../../src/contracts/parameters";
import { createEffectWorkletPort } from "../../../src/engine/effects/adapter";

function parameter(value = 0) {
  const result = {
    value,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((next: number) => { result.value = next; }),
    linearRampToValueAtTime: vi.fn((next: number) => { result.value = next; }),
  };
  return result;
}

function audioNode(extra: Readonly<Record<string, unknown>> = {}) {
  return { connect: vi.fn(), disconnect: vi.fn(), ...extra };
}

class FakePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly sent: unknown[] = [];
  readonly close = vi.fn();
  #processorSequence = 0;
  postMessage(value: unknown): void {
    this.sent.push(value);
    const message = value as {
      readonly sessionId: string;
      readonly nodeId: string;
      readonly sequence: number;
      readonly kind: string;
      readonly projectRevision: unknown;
    };
    queueMicrotask(() => {
      if (message.kind === "hello") this.#reply(message, "ready", { acceptedProtocolVersion: 1 });
      this.#reply(message, message.kind === "dispose" ? "disposed" : "ack", message.kind === "dispose" ? {} : {
        highestContiguousSequence: message.sequence,
        projectRevision: message.projectRevision,
        disposition: "applied",
      });
    });
  }
  #reply(source: { readonly sessionId: string; readonly nodeId: string; readonly projectRevision: unknown }, kind: string, payload: Readonly<Record<string, unknown>>): void {
    this.onmessage?.({ data: {
      protocolVersion: 1,
      sessionId: source.sessionId,
      nodeId: source.nodeId,
      sequence: this.#processorSequence,
      kind,
      projectRevision: source.projectRevision,
      payload,
    } } as MessageEvent<unknown>);
    this.#processorSequence += 1;
  }
}

class FakeWorkletNode {
  static readonly instances: FakeWorkletNode[] = [];
  readonly port = new FakePort();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly #listeners = new Map<string, () => void>();
  constructor(context: AudioContext, name: string, options: AudioWorkletNodeOptions) {
    void context;
    void name;
    void options;
    FakeWorkletNode.instances.push(this);
  }
  addEventListener(name: string, listener: () => void): void { this.#listeners.set(name, listener); }
  fail(): void { this.#listeners.get("processorerror")?.(); }
}

function context() {
  const gains: ReturnType<typeof parameter>[] = [];
  return {
    currentTime: 0,
    sampleRate: 48_000,
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    createGain: vi.fn(() => {
      const gain = parameter();
      gains.push(gain);
      return audioNode({ gain });
    }),
    gains,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorkletNode.instances.length = 0;
});

describe("effect worklet adapter", () => {
  it("keeps stable graph ports and recovers once from acknowledged state", async () => {
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
    const stub = context();
    const statuses: string[] = [];
    const port = await createEffectWorkletPort(stub as unknown as AudioContext, {
      pluginId: "distortion" as PluginId,
      state: { drive: 1, model: "drive", tone: 18_000 },
      onStatus: (status) => statuses.push(status.state),
    });
    const stableInput = port.input;
    const stableOutput = port.output;
    expect(port.scheduleParameter(0, "drive", 8)).toBe(true);
    await Promise.resolve();

    FakeWorkletNode.instances[0]?.fail();
    await Promise.resolve();
    await Promise.resolve();

    expect(FakeWorkletNode.instances).toHaveLength(2);
    expect(port.input).toBe(stableInput);
    expect(port.output).toBe(stableOutput);
    expect(statuses).toEqual(["degraded", "recovered"]);
    const recoveryHello = FakeWorkletNode.instances[1]?.port.sent[0] as {
      readonly payload?: { readonly state?: Readonly<Record<string, unknown>> };
    };
    expect(recoveryHello.payload?.state?.drive).toBe(8);
    expect(stub.gains.some((gain) => gain.linearRampToValueAtTime.mock.calls.some(([value]) => value === 0))).toBe(true);
    expect(stub.gains.some((gain) => gain.linearRampToValueAtTime.mock.calls.some(([value]) => value === 1))).toBe(true);
    port.dispose();
  });

  it("rejects an unknown effect before it allocates a worklet node", async () => {
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
    const stub = context();
    await expect(createEffectWorkletPort(stub as unknown as AudioContext, {
      pluginId: "not-registered" as PluginId,
      state: {},
    })).rejects.toThrow("effect registry");
    expect(FakeWorkletNode.instances).toHaveLength(0);
  });
});
