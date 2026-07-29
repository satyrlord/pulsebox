import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createStateRevisionEpoch, type StateRevision } from "../../../src/contracts/ids";
import { deterministicIdFactory } from "../contracts/fixtures";

import type * as AdapterModule from "../../../src/engine/modules/bass-mono/adapter";

type AcidBassAdapter = InstanceType<typeof AdapterModule.AcidBassAdapter>;
let AcidBassAdapterClass: typeof AdapterModule.AcidBassAdapter;

/**
 * The adapter and the processor are the two halves of one protocol. Testing each
 * against a hand-written mock lets the halves drift apart, so this suite wires the
 * real controller to the real AudioWorkletProcessor through a transport that only
 * copies structured-cloneable messages.
 */

const EPOCH = createStateRevisionEpoch(deterministicIdFactory);
const REVISION: StateRevision = { epoch: EPOCH, counter: 7 };
const STALE_REVISION: StateRevision = { epoch: EPOCH, counter: 5 };
const NEXT_REVISION: StateRevision = { epoch: EPOCH, counter: 8 };

interface ProcessorLike {
  readonly port: {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage(value: unknown): void;
    close(): void;
  };
}

type ProcessorConstructor = new (options?: AudioWorkletNodeOptions) => ProcessorLike;

let Processor: ProcessorConstructor;

/** Mirrors the structured-clone boundary between the control and audio threads. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class ProcessorSidePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  toController: ((value: unknown) => void) | undefined;
  closed = false;

  postMessage(value: unknown): void {
    this.toController?.(clone(value));
  }

  close(): void {
    this.closed = true;
  }
}

class FakeAudioWorkletProcessor {
  readonly port = new ProcessorSidePort();
}

type EngineMessage = Record<string, unknown>;

interface PairedNode extends EventTarget {
  readonly port: {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage(value: unknown): void;
    close(): void;
  };
  readonly controllerReceived: EngineMessage[];
  readonly processorReceived: EngineMessage[];
}

/**
 * An AudioWorkletNode stand-in whose port is wired to a live AcidBassProcessor.
 * Messages cross in both directions exactly as the browser would deliver them.
 */
function createPairedNodeClass(instances: PairedNode[]): typeof EventTarget {
  return class extends EventTarget {
    readonly port: PairedNode["port"];
    readonly connect = vi.fn();
    readonly disconnect = vi.fn();
    readonly controllerReceived: EngineMessage[] = [];
    readonly processorReceived: EngineMessage[] = [];

    constructor() {
      super();
      const processor = new Processor();
      const processorPort = processor.port as unknown as ProcessorSidePort;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const node = this;

      processorPort.toController = (value: unknown) => {
        node.controllerReceived.push(value as EngineMessage);
        node.port.onmessage?.({ data: value } as MessageEvent<unknown>);
      };

      this.port = {
        onmessage: null,
        postMessage(value: unknown): void {
          const copied = clone(value) as EngineMessage;
          node.processorReceived.push(copied);
          processorPort.onmessage?.({ data: copied } as MessageEvent<unknown>);
        },
        close(): void {
          // The controller closing its end does not close the processor end.
        },
      };
      instances.push(this);
    }
  };
}

function kindsSentToProcessor(node: PairedNode): string[] {
  return node.processorReceived.map((message) => String(message.kind));
}

function acknowledgements(node: PairedNode): EngineMessage[] {
  return node.controllerReceived
    .filter((message) => message.kind === "ack")
    .map((message) => message.payload as EngineMessage);
}

function requiredNode(nodes: readonly PairedNode[], index: number): PairedNode {
  const node = nodes[index];
  if (node === undefined) throw new Error(`Paired node ${String(index)} was not created.`);
  return node;
}

async function pairedAdapter(): Promise<{
  readonly adapter: AcidBassAdapter;
  readonly nodes: PairedNode[];
}> {
  const nodes: PairedNode[] = [];
  vi.stubGlobal("AudioWorkletNode", createPairedNodeClass(nodes));
  const context = {
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
  } as unknown as AudioContext;
  const adapter = new AcidBassAdapterClass(context, { projectRevision: REVISION });
  await adapter.prepare();
  return { adapter, nodes };
}

beforeAll(async () => {
  vi.stubGlobal("sampleRate", 48_000);
  vi.stubGlobal("currentFrame", 0);
  vi.stubGlobal("AudioWorkletProcessor", FakeAudioWorkletProcessor);
  vi.stubGlobal(
    "registerProcessor",
    vi.fn((_name: string, constructor: ProcessorConstructor) => {
      Processor = constructor;
    }),
  );
  await import("../../../src/engine/modules/bass-mono/bass-mono.worklet");
  ({ AcidBassAdapter: AcidBassAdapterClass } =
    await import("../../../src/engine/modules/bass-mono/adapter"));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("Acid Bass controller and processor pairing", () => {
  it("completes the handshake against the real processor", async () => {
    const { adapter, nodes } = await pairedAdapter();

    expect(adapter.state).toBe("ready");
    expect(adapter.fault).toBeUndefined();
    expect(nodes).toHaveLength(1);
    expect(requiredNode(nodes, 0).controllerReceived[0]).toMatchObject({ kind: "ready" });
  });

  it("keeps the session active while the real processor acknowledges each envelope", async () => {
    const { adapter, nodes } = await pairedAdapter();
    adapter.activate({} as AudioNode);

    adapter.setParameters({ cutoff: 900 }, REVISION);
    adapter.setParameters({ cutoff: 1_100 }, REVISION);
    adapter.setParameters({ resonance: 0.6 }, REVISION);

    expect(adapter.state).toBe("active");
    expect(adapter.fault).toBeUndefined();
    expect(adapter.pendingMessageCount).toBe(0);
    // One processor, so no silent teardown and rebuild occurred.
    expect(nodes).toHaveLength(1);
    expect(
      acknowledgements(requiredNode(nodes, 0)).every(
        (payload) => payload.disposition === "applied",
      ),
    ).toBe(true);
  });

  it("treats a stale-revision acknowledgement as normal rather than a fault", async () => {
    const { adapter, nodes } = await pairedAdapter();
    adapter.activate({} as AudioNode);

    // The processor holds REVISION; this envelope carries an older revision, which
    // the contract requires it to ignore and acknowledge as stale.
    adapter.setParameters({ cutoff: 250 }, STALE_REVISION);

    const stale = acknowledgements(requiredNode(nodes, 0)).filter(
      (payload) => payload.disposition === "stale",
    );
    expect(stale).toHaveLength(1);
    expect(adapter.state).toBe("active");
    expect(adapter.fault).toBeUndefined();
    expect(adapter.pendingMessageCount).toBe(0);
    // A fault would have torn down this node and opened a second session.
    expect(nodes).toHaveLength(1);
    expect(
      kindsSentToProcessor(requiredNode(nodes, 0)).filter((kind) => kind === "hello"),
    ).toHaveLength(1);
  });

  it("does not record an ignored stale envelope as acknowledged state", async () => {
    const { adapter, nodes } = await pairedAdapter();
    adapter.activate({} as AudioNode);

    adapter.setParameters({ cutoff: 1_500 }, REVISION);
    adapter.setParameters({ cutoff: 250 }, STALE_REVISION);
    requiredNode(nodes, 0).dispatchEvent(new Event("processorerror"));

    await vi.waitFor(() => {
      expect(nodes).toHaveLength(2);
      expect(adapter.state).toBe("active");
    });

    const restored = requiredNode(nodes, 1).processorReceived.filter(
      (message) => message.kind === "state-snapshot",
    );
    const firstSnapshot = restored[0]?.payload as
      { readonly parameters?: Record<string, unknown> } | undefined;
    // Recovery restores the applied value, never the value the processor ignored.
    expect(firstSnapshot?.parameters).toMatchObject({ cutoff: 1_500 });
    expect(firstSnapshot?.parameters?.cutoff).not.toBe(250);
  });

  it("applies a newer revision after a stale one without losing the session", async () => {
    const { adapter, nodes } = await pairedAdapter();
    adapter.activate({} as AudioNode);

    adapter.setParameters({ cutoff: 250 }, STALE_REVISION);
    adapter.setParameters({ cutoff: 1_800 }, NEXT_REVISION);

    const dispositions = acknowledgements(requiredNode(nodes, 0)).map(
      (payload) => payload.disposition,
    );
    expect(dispositions).toContain("stale");
    expect(dispositions.at(-1)).toBe("applied");
    expect(adapter.state).toBe("active");
    expect(adapter.fault).toBeUndefined();
    expect(nodes).toHaveLength(1);
  });

  it("schedules events and disposes cleanly through the real processor", async () => {
    vi.useFakeTimers();
    const { adapter, nodes } = await pairedAdapter();
    adapter.activate({} as AudioNode);

    adapter.schedule([
      { atFrame: 480, type: "note-on", note: 36, velocity: 0.8, accent: false, slide: false },
      { atFrame: 960, type: "note-off" },
    ]);
    expect(adapter.fault).toBeUndefined();
    expect(kindsSentToProcessor(requiredNode(nodes, 0))).toContain("event-batch");

    adapter.clearScheduledEvents();
    expect(kindsSentToProcessor(requiredNode(nodes, 0))).toContain("clear-scheduled-events");
    expect(kindsSentToProcessor(requiredNode(nodes, 0))).not.toContain("all-notes-off");

    adapter.dispose();
    expect(adapter.state).toBe("disposing");
    expect(kindsSentToProcessor(requiredNode(nodes, 0))).toContain("all-notes-off");
    expect(
      requiredNode(nodes, 0).controllerReceived.some((message) => message.kind === "disposed"),
    ).toBe(false);

    await vi.advanceTimersByTimeAsync(100);
    expect(
      requiredNode(nodes, 0).controllerReceived.some((message) => message.kind === "disposed"),
    ).toBe(true);
    expect(adapter.state).toBe("disposed");
    vi.useRealTimers();
  });
});
