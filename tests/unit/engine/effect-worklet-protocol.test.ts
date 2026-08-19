import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_UUID } from "../contracts/fixtures";
import { ENGINE_PROTOCOL_LIMITS } from "../../../src/contracts/worklet-protocol";

interface TestProcessor {
  readonly port: FakeProcessorPort;
  process(inputs: readonly (readonly Float32Array[])[], outputs: readonly (readonly Float32Array[])[]): boolean;
}

type ProcessorConstructor = new () => TestProcessor;

class FakeProcessorPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly sent: unknown[] = [];
  readonly close = vi.fn();
  postMessage(value: unknown): void { this.sent.push(value); }
  receive(value: unknown): void { this.onmessage?.({ data: value } as MessageEvent<unknown>); }
}

class FakeAudioWorkletProcessor { readonly port = new FakeProcessorPort(); }
let Processor: ProcessorConstructor;

beforeAll(async () => {
  vi.stubGlobal("sampleRate", 48_000);
  vi.stubGlobal("currentFrame", 0);
  vi.stubGlobal("AudioWorkletProcessor", FakeAudioWorkletProcessor);
  vi.stubGlobal("registerProcessor", vi.fn((_name: string, constructor: ProcessorConstructor) => { Processor = constructor; }));
  await import("../../../src/engine/effects/registry/effect.worklet");
});

afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("currentFrame", 0); });

describe("effect worklet protocol", () => {
  it("completes hello with ready and an acknowledgement envelope", () => {
    const processor = readyProcessor();
    expect(processor.port.sent).toMatchObject([
      { protocolVersion: 1, sequence: 0, kind: "ready", payload: { acceptedProtocolVersion: 1 } },
      { protocolVersion: 1, sequence: 1, kind: "ack", payload: { highestContiguousSequence: 0, disposition: "applied" } },
    ]);
  });

  it("repeats the last acknowledgement for a duplicate message", () => {
    const processor = readyProcessor();
    const acknowledgement = processor.port.sent[1];
    processor.port.receive(envelope(0, "hello", configuration()));
    expect(processor.port.sent[2]).toEqual(acknowledgement);
  });

  it("applies a parameter batch at its exact absolute frame", () => {
    const processor = readyProcessor();
    const baseline = readyProcessor();
    processor.port.receive(envelope(1, "parameter-batch", {
      changes: [{ audioFrame: 2, parameterId: "drive", value: 12 }],
    }));
    const input = new Float32Array([0.4, 0.4, 0.4, 0.4]);
    const output = new Float32Array(4);
    const baselineOutput = new Float32Array(4);
    processor.process([[input]], [[output]]);
    baseline.process([[input]], [[baselineOutput]]);
    expect([...output.slice(0, 3)]).toEqual([...baselineOutput.slice(0, 3)]);
    expect(output[3]).not.toBeCloseTo(baselineOutput[3] ?? 0, 7);
  });

  it("faults malformed messages and sequence gaps", () => {
    const malformed = new Processor();
    malformed.port.receive({ ...envelope(0, "hello", configuration()), protocolVersion: 2 });
    expect(malformed.port.sent[0]).toMatchObject({ kind: "fault", payload: { code: "malformed-controller-message" } });
    expect(malformed.port.close).toHaveBeenCalledOnce();

    const gap: TestProcessor = readyProcessor();
    gap.port.receive(envelope(2, "reset", {}));
    expect(gap.port.sent[2]).toMatchObject({ kind: "fault", payload: { code: "controller-sequence-gap" } });
  });

  it("acknowledges stale revisions and rejects oversized batches", () => {
    const stale = new Processor();
    stale.port.receive(envelope(0, "hello", configuration(), 7));
    stale.port.receive(envelope(1, "parameter-batch", {
      changes: [{ audioFrame: 0, parameterId: "drive", value: 12 }],
    }, 6));
    expect(stale.port.sent[2]).toMatchObject({
      kind: "ack",
      payload: { highestContiguousSequence: 1, disposition: "stale" },
    });

    const oversized = readyProcessor();
    oversized.port.receive(envelope(1, "parameter-batch", { changes: changes(0, 129) }));
    expect(oversized.port.sent[2]).toMatchObject({
      kind: "fault",
      payload: { code: "malformed-controller-message" },
    });
  });

  it("rejects protocol-limit violations in effect state and scheduled changes", () => {
    const atLimit = new Processor();
    atLimit.port.receive(envelope(0, "hello", {
      ...configuration(),
      state: {
        ...configuration().state,
        ["p".repeat(ENGINE_PROTOCOL_LIMITS.maximumParameterIdLength)]: "v".repeat(
          ENGINE_PROTOCOL_LIMITS.maximumParameterValueStringLength,
        ),
      },
    }));
    expect(atLimit.port.sent[0]).toMatchObject({ kind: "ready" });

    const invalidState = new Processor();
    invalidState.port.receive(envelope(0, "hello", {
      ...configuration(),
      state: {
        ...configuration().state,
        ["p".repeat(ENGINE_PROTOCOL_LIMITS.maximumParameterIdLength + 1)]: 1,
      },
    }));
    expect(invalidState.port.sent[0]).toMatchObject({
      kind: "fault",
      payload: { code: "unknown-effect-plugin" },
    });

    const invalidValueState = new Processor();
    invalidValueState.port.receive(envelope(0, "hello", {
      ...configuration(),
      state: {
        ...configuration().state,
        model: "v".repeat(ENGINE_PROTOCOL_LIMITS.maximumParameterValueStringLength + 1),
      },
    }));
    expect(invalidValueState.port.sent[0]).toMatchObject({
      kind: "fault",
      payload: { code: "unknown-effect-plugin" },
    });

    const longId = readyProcessor();
    longId.port.receive(envelope(1, "parameter-batch", {
      changes: [{
        audioFrame: 0,
        parameterId: "p".repeat(ENGINE_PROTOCOL_LIMITS.maximumParameterIdLength + 1),
        value: 1,
      }],
    }));
    expect(longId.port.sent[2]).toMatchObject({
      kind: "fault",
      payload: { code: "malformed-controller-message" },
    });

    const longValue = readyProcessor();
    longValue.port.receive(envelope(1, "parameter-batch", {
      changes: [{
        audioFrame: 0,
        parameterId: "model",
        value: "v".repeat(ENGINE_PROTOCOL_LIMITS.maximumParameterValueStringLength + 1),
      }],
    }));
    expect(longValue.port.sent[2]).toMatchObject({
      kind: "fault",
      payload: { code: "malformed-controller-message" },
    });
  });

  it("turns parameter queue rejection into a recoverable fault", () => {
    const processor = readyProcessor();
    processor.port.receive(envelope(1, "parameter-batch", { changes: changes(0, 128) }));
    processor.port.receive(envelope(2, "parameter-batch", { changes: changes(128, 128) }));
    const fault = processor.port.sent.at(-1) as {
      readonly payload?: { readonly recoveryAction?: unknown };
    };
    expect(fault).toMatchObject({
      kind: "fault",
      payload: {
        code: "effect-parameter-queue-overflow",
      },
    });
    expect(fault.payload?.recoveryAction).toEqual(expect.stringContaining("Replace"));
  });

  it("rejects unknown effects and acknowledges disposal", () => {
    const unknown = new Processor();
    unknown.port.receive(envelope(0, "hello", { pluginId: "unknown", state: {} }));
    expect(unknown.port.sent[0]).toMatchObject({ kind: "fault", payload: { code: "unknown-effect-plugin" } });

    const processor = readyProcessor();
    processor.port.receive(envelope(1, "dispose", {}));
    expect(processor.port.sent.slice(2)).toMatchObject([{ kind: "ack" }, { kind: "disposed" }]);
    expect(processor.port.close).toHaveBeenCalledOnce();
    expect(processor.process([], [[new Float32Array(4), new Float32Array(4)]])).toBe(false);
  });
});

function readyProcessor(): TestProcessor {
  const processor = new Processor();
  processor.port.receive(envelope(0, "hello", configuration()));
  return processor;
}

function configuration() {
  return { pluginId: "distortion", state: { drive: 1, model: "drive", tone: 18_000 } };
}

function changes(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    audioFrame: start + index + 1_000,
    parameterId: `p-${(start + index).toString()}`,
    value: index,
  }));
}

function envelope(
  sequence: number,
  kind: string,
  payload: Readonly<Record<string, unknown>>,
  revision = sequence,
) {
  return {
    protocolVersion: 1,
    sessionId: "effect-session",
    nodeId: "effect-node",
    sequence,
    kind,
    projectRevision: { epoch: TEST_UUID, counter: revision },
    payload,
  };
}
