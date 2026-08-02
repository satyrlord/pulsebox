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
  vi.stubGlobal("currentFrame", 0);
});

describe("Silver Serpent worklet protocol", () => {
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

  it("reports a zero meter level when it is suspended", () => {
    const processor = readyProcessor();
    processor.port.receive(controllerEnvelope(1, "suspend", {}, 7));

    // `process` returns early while suspended, so this is the last chance to
    // report a level. Without it the controller keeps the final peak and every
    // meter stays lit after the transport stops.
    const meterFrames = processor.port.sent.filter(
      (value) => (value as { readonly kind?: unknown }).kind === "meter-frame",
    );
    expect(meterFrames).toHaveLength(1);
    expect(meterFrames[0]).toMatchObject({ kind: "meter-frame", payload: { level: 0 } });
  });

  it("drops an expired onset and renders the next future onset at its frame", () => {
    const processor = readyProcessor();
    processor.port.receive(controllerEnvelope(1, "resume", {}, 7));
    processor.port.receive(
      controllerEnvelope(
        2,
        "event-batch",
        {
          events: [
            {
              eventId: "expired",
              audioFrame: 900,
              priority: 2,
              data: { type: "note-on", note: 36, velocity: 0.8, accent: false, slide: false },
            },
            {
              eventId: "future",
              audioFrame: 1_010,
              priority: 2,
              data: { type: "note-on", note: 48, velocity: 0.8, accent: false, slide: false },
            },
          ],
        },
        7,
      ),
    );
    vi.stubGlobal("currentFrame", 1_000);
    const left = new Float32Array(64);
    const right = new Float32Array(64);

    expect(processor.process([], [[left, right]], {})).toBe(true);
    expect(left.slice(0, 10).every((sample) => Math.abs(sample) === 0)).toBe(true);
    expect(left.slice(11).some((sample) => Math.abs(sample) > 0)).toBe(true);
  });

  it("keeps events before the bounded clear frame and drops the tail", () => {
    const processor = readyProcessor();
    processor.port.receive(controllerEnvelope(1, "resume", {}, 7));
    processor.port.receive(
      controllerEnvelope(
        2,
        "event-batch",
        {
          events: [
            {
              eventId: "kept",
              audioFrame: 40,
              priority: 2,
              data: { type: "note-on", note: 36, velocity: 0.8, accent: false, slide: false },
            },
            {
              eventId: "dropped",
              audioFrame: 200,
              priority: 2,
              data: { type: "note-on", note: 48, velocity: 0.8, accent: false, slide: false },
            },
          ],
        },
        7,
      ),
    );
    // The bounded clear keeps the imminent onset at frame 40 and drops only
    // the tail at or past frame 100.
    processor.port.receive(controllerEnvelope(3, "clear-scheduled-events", { fromFrame: 100 }, 7));

    const first = new Float32Array(128);
    expect(processor.process([], [[first]], {})).toBe(true);
    expect(first.slice(0, 40).every((sample) => sample === 0)).toBe(true);
    expect(first.slice(41).some((sample) => Math.abs(sample) > 0)).toBe(true);

    // The dropped onset at frame 200 never sounds: the voice keeps rendering
    // the kept note's tail with no new attack transient at that frame.
    vi.stubGlobal("currentFrame", 128);
    const second = new Float32Array(128);
    processor.process([], [[second]], {});
    const attackPeak = Math.max(...first.slice(41, 100).map(Math.abs));
    const atDropped = Math.max(...second.slice(72, 100).map(Math.abs));
    expect(atDropped).toBeLessThan(attackPeak);
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
    expect(gapFault.payload?.recoveryAction).toEqual(expect.stringContaining("Replace"));
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
    expect(processor.process([], [[new Float32Array(64), new Float32Array(64)]], {})).toBe(false);
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
