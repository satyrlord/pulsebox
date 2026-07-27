import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_UUID } from "../contracts/fixtures";

interface TestProcessor {
  readonly port: FakeProcessorPort;
  process(
    inputs: readonly (readonly Float32Array[])[],
    outputs: readonly (readonly Float32Array[])[],
    parameters: Readonly<Record<string, Float32Array>>,
  ): boolean;
}

type ProcessorConstructor = new (options?: AudioWorkletNodeOptions) => TestProcessor;

class FakeProcessorPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly sent: unknown[] = [];
  readonly close = vi.fn();

  postMessage(value: unknown): void {
    this.sent.push(value);
  }

  receive(value: unknown): void {
    this.onmessage?.({ data: value } as MessageEvent<unknown>);
  }
}

class FakeAudioWorkletProcessor {
  readonly port = new FakeProcessorPort();
}

let Processor: ProcessorConstructor;

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
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Acid Bass worklet protocol", () => {
  it("completes hello and ready with full sequenced envelopes and acknowledgement", () => {
    const processor = new Processor();
    processor.port.receive(controllerEnvelope(0, "hello", {}, 7));

    expect(processor.port.sent).toEqual([
      expect.objectContaining({
        protocolVersion: 1,
        sessionId: "session-1",
        nodeId: "node-1",
        sequence: 0,
        kind: "ready",
        payload: { acceptedProtocolVersion: 1 },
      }),
      expect.objectContaining({
        sequence: 1,
        kind: "ack",
        payload: {
          highestContiguousSequence: 0,
          projectRevision: { epoch: TEST_UUID, counter: 7 },
          disposition: "applied",
        },
      }),
    ]);
  });

  it("repeats the last acknowledgement without applying a duplicate", () => {
    const processor = readyProcessor();
    const firstAcknowledgement = processor.port.sent[1];

    processor.port.receive(controllerEnvelope(0, "hello", {}, 7));

    expect(processor.port.sent[2]).toEqual(firstAcknowledgement);
  });

  it("acknowledges stale revisions without applying them", () => {
    const processor = readyProcessor();
    processor.port.receive(
      controllerEnvelope(
        1,
        "parameter-batch",
        { changes: [{ parameterId: "cutoff", value: 900 }] },
        6,
      ),
    );

    expect(processor.port.sent[2]).toMatchObject({
      sequence: 2,
      kind: "ack",
      payload: {
        highestContiguousSequence: 1,
        disposition: "stale",
      },
    });
  });

  it("faults and closes the session on a sequence gap", () => {
    const processor = readyProcessor();
    processor.port.receive(controllerEnvelope(2, "resume", {}, 7));

    expect(processor.port.sent[2]).toMatchObject({
      sequence: 2,
      kind: "fault",
      payload: {
        code: "controller-sequence-gap",
      },
    });
    const gapFault = processor.port.sent[2] as {
      readonly payload?: { readonly recoveryAction?: unknown };
    };
    expect(gapFault.payload?.recoveryAction).toEqual(
      expect.stringContaining("Replace"),
    );
    expect(processor.port.close).toHaveBeenCalledOnce();
  });

  it("faults malformed and pre-handshake messages with a recovery action", () => {
    const malformed = new Processor();
    malformed.port.receive({
      ...controllerEnvelope(0, "hello", {}, 0),
      protocolVersion: 2,
    });
    expect(malformed.port.sent[0]).toMatchObject({
      protocolVersion: 1,
      kind: "fault",
      payload: {
        code: "malformed-controller-message",
      },
    });
    const malformedFault = malformed.port.sent[0] as {
      readonly payload?: { readonly recoveryAction?: unknown };
    };
    expect(typeof malformedFault.payload?.recoveryAction).toBe("string");

    const beforeHello = new Processor();
    beforeHello.port.receive(controllerEnvelope(0, "resume", {}, 0));
    expect(beforeHello.port.sent[0]).toMatchObject({
      kind: "fault",
      payload: { code: "message-before-ready" },
    });
  });

  it("acknowledges disposal, closes its port, and terminates rendering", () => {
    const processor = readyProcessor();
    processor.port.receive(controllerEnvelope(1, "dispose", {}, 7));

    expect(processor.port.sent.slice(2)).toMatchObject([
      { sequence: 2, kind: "ack" },
      { sequence: 3, kind: "disposed" },
    ]);
    expect(processor.port.close).toHaveBeenCalledOnce();
    expect(
      processor.process([], [[new Float32Array(64), new Float32Array(64)]], {}),
    ).toBe(false);
  });
});

function readyProcessor(): TestProcessor {
  const processor = new Processor();
  processor.port.receive(controllerEnvelope(0, "hello", {}, 7));
  return processor;
}

function controllerEnvelope(
  sequence: number,
  kind: string,
  payload: Readonly<Record<string, unknown>>,
  revision: number,
) {
  return {
    protocolVersion: 1,
    sessionId: "session-1",
    nodeId: "node-1",
    sequence,
    kind,
    projectRevision: { epoch: TEST_UUID, counter: revision },
    payload,
  };
}
