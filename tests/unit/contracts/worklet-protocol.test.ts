import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ENGINE_PROTOCOL_LIMITS,
  compareScheduledEvents,
  isRealtimeSafeControllerEnvelope,
  validateEngineMessageEnvelope,
  type EventBatchPayload,
  type ParameterBatchPayload,
  type ReadyPayload,
  type SampleAttachPayload,
  type ScheduledEventPayload,
} from "../../../src/contracts/worklet-protocol";
import { TEST_UUID } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function envelope(kind: string, payload: object) {
  return {
    protocolVersion: 1,
    sessionId: "session-1",
    nodeId: "node-1",
    sequence: 0,
    kind,
    payload,
  };
}

describe("worklet protocol envelope validation", () => {
  it("checks processor-bound control data without the diagnostic validator", () => {
    const message = {
      ...envelope("parameter-batch", {
        changes: [{ parameterId: "cutoff", value: 900 }],
      }),
      projectRevision: { epoch: TEST_UUID, counter: 1 },
    };
    expect(isRealtimeSafeControllerEnvelope(message)).toBe(true);
    expect(
      isRealtimeSafeControllerEnvelope({
        ...message,
        payload: { changes: [{ parameterId: "cutoff", value: Number.NaN }] },
      }),
    ).toBe(false);
  });

  it("enforces parameter ID and string-value bounds on both validation paths", () => {
    const valid = envelope("parameter-batch", {
      changes: [{
        parameterId: "p".repeat(ENGINE_PROTOCOL_LIMITS.maximumParameterIdLength),
        value: "v".repeat(ENGINE_PROTOCOL_LIMITS.maximumParameterValueStringLength),
      }],
    });
    expect(validateEngineMessageEnvelope(valid).ok).toBe(true);
    expect(isRealtimeSafeControllerEnvelope(valid)).toBe(true);

    const emptyId = envelope("parameter-batch", { changes: [{ parameterId: "", value: 1 }] });
    const longId = envelope("parameter-batch", {
      changes: [{ parameterId: "p".repeat(ENGINE_PROTOCOL_LIMITS.maximumParameterIdLength + 1), value: 1 }],
    });
    const longValue = envelope("parameter-batch", {
      changes: [{
        parameterId: "cutoff",
        value: "v".repeat(ENGINE_PROTOCOL_LIMITS.maximumParameterValueStringLength + 1),
      }],
    });
    for (const invalid of [emptyId, longId, longValue]) {
      expect(validateEngineMessageEnvelope(invalid).ok).toBe(false);
      expect(isRealtimeSafeControllerEnvelope(invalid)).toBe(false);
    }
  });

  it("accepts an absent project revision and checks its shape only when present", () => {
    // The envelope contract makes projectRevision optional. Kinds that need
    // it, such as hello, enforce presence at the receiver instead.
    expect(isRealtimeSafeControllerEnvelope(envelope("configure", {}))).toBe(true);
    expect(
      isRealtimeSafeControllerEnvelope({
        ...envelope("configure", {}),
        projectRevision: { epoch: "not-a-uuid", counter: 1 },
      }),
    ).toBe(false);
    expect(
      isRealtimeSafeControllerEnvelope({
        ...envelope("configure", {}),
        projectRevision: { epoch: TEST_UUID, counter: -1 },
      }),
    ).toBe(false);
  });

  it("checks requestId and audioFrame shapes on the processor path", () => {
    const base = {
      ...envelope("configure", {}),
      projectRevision: { epoch: TEST_UUID, counter: 1 },
    };
    expect(isRealtimeSafeControllerEnvelope({ ...base, requestId: "request-1" })).toBe(true);
    expect(isRealtimeSafeControllerEnvelope({ ...base, requestId: "" })).toBe(false);
    expect(isRealtimeSafeControllerEnvelope({ ...base, requestId: 7 })).toBe(false);
    expect(isRealtimeSafeControllerEnvelope({ ...base, audioFrame: 128 })).toBe(true);
    expect(isRealtimeSafeControllerEnvelope({ ...base, audioFrame: -1 })).toBe(false);
    expect(isRealtimeSafeControllerEnvelope({ ...base, audioFrame: 0.5 })).toBe(false);
  });

  it("validates the bounded clear frame on both validation paths", () => {
    // Without a bound the whole queue clears; with one, only the tail drops.
    expect(isRealtimeSafeControllerEnvelope(envelope("clear-scheduled-events", {}))).toBe(true);
    expect(
      isRealtimeSafeControllerEnvelope(envelope("clear-scheduled-events", { fromFrame: 48_000 })),
    ).toBe(true);
    expect(
      isRealtimeSafeControllerEnvelope(envelope("clear-scheduled-events", { fromFrame: -1 })),
    ).toBe(false);
    expect(
      isRealtimeSafeControllerEnvelope(envelope("clear-scheduled-events", { fromFrame: 0.5 })),
    ).toBe(false);
    expect(
      validateEngineMessageEnvelope(envelope("clear-scheduled-events", { fromFrame: 48_000 })).ok,
    ).toBe(true);
    expect(
      validateEngineMessageEnvelope(envelope("clear-scheduled-events", { fromFrame: -1 })).ok,
    ).toBe(false);
    expect(
      validateEngineMessageEnvelope(envelope("clear-scheduled-events", { fromFrame: "48000" }))
        .ok,
    ).toBe(false);
  });

  it("rejects unsafe ordinary payloads on the processor path", () => {
    const base = {
      ...envelope("configure", {}),
      projectRevision: { epoch: TEST_UUID, counter: 1 },
    };
    expect(
      isRealtimeSafeControllerEnvelope({
        ...base,
        payload: { text: "x".repeat(ENGINE_PROTOCOL_LIMITS.maximumOrdinaryPayloadBytes) },
      }),
    ).toBe(false);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isRealtimeSafeControllerEnvelope({ ...base, payload: cyclic })).toBe(false);
    let deeplyNested: Record<string, unknown> = {};
    const deepRoot = deeplyNested;
    for (let depth = 0; depth <= ENGINE_PROTOCOL_LIMITS.maximumOrdinaryPayloadDepth; depth += 1) {
      const child: Record<string, unknown> = {};
      deeplyNested.child = child;
      deeplyNested = child;
    }
    expect(isRealtimeSafeControllerEnvelope({ ...base, payload: deepRoot })).toBe(false);
    expect(
      isRealtimeSafeControllerEnvelope({
        ...base,
        payload: { nested: { value: Number.POSITIVE_INFINITY } },
      }),
    ).toBe(false);
  });

  it("accepts a versioned ready envelope", () => {
    const payload: ReadyPayload = { acceptedProtocolVersion: 1 };
    expect(
      validateEngineMessageEnvelope(envelope("ready", payload)).ok,
    ).toBe(true);
  });

  it("validates ordinary payload sizes without TextEncoder", () => {
    vi.stubGlobal("TextEncoder", undefined);
    expect(
      validateEngineMessageEnvelope(envelope("configure", { label: "Silver serpent \u{1F3B5}" })).ok,
    ).toBe(true);
  });

  it("rejects mismatched versions, unknown kinds, and unsafe counters", () => {
    expect(
      validateEngineMessageEnvelope({
        ...envelope("ready", {}),
        protocolVersion: 2,
      }).ok,
    ).toBe(false);
    expect(validateEngineMessageEnvelope(envelope("custom", {})).ok).toBe(false);
    expect(validateEngineMessageEnvelope({ ...envelope("ready", {}), sequence: -1 }).ok).toBe(
      false,
    );
  });

  it("enforces parameter and event batch bounds", () => {
    const payload: ParameterBatchPayload = {
      changes: Array.from(
        { length: ENGINE_PROTOCOL_LIMITS.maximumParameterChangesPerBatch },
        () => ({ parameterId: "cutoff", value: 900 }),
      ),
    };
    expect(
      validateEngineMessageEnvelope(envelope("parameter-batch", payload)).ok,
    ).toBe(true);
    expect(
      validateEngineMessageEnvelope(
        envelope("parameter-batch", {
          changes: Array.from(
            {
              length: ENGINE_PROTOCOL_LIMITS.maximumParameterChangesPerBatch + 1,
            },
            () => ({ parameterId: "cutoff", value: 900 }),
          ),
        }),
      ).ok,
    ).toBe(false);
  });

  it("requires complete acknowledgement revision data", () => {
    const valid = envelope("ack", {
      highestContiguousSequence: 3,
      projectRevision: { epoch: TEST_UUID, counter: 7 },
      disposition: "applied",
    });
    expect(validateEngineMessageEnvelope(valid).ok).toBe(true);
    expect(
      validateEngineMessageEnvelope({
        ...valid,
        payload: { ...valid.payload, highestContiguousSequence: -1 },
      }).ok,
    ).toBe(false);
  });

  it("rejects oversized and non-finite ordinary payloads", () => {
    expect(
      validateEngineMessageEnvelope(envelope("configure", { text: "x".repeat(64 * 1024) })).ok,
    ).toBe(false);
    expect(
      validateEngineMessageEnvelope(envelope("configure", { value: Number.POSITIVE_INFINITY })).ok,
    ).toBe(false);
  });

  it("enforces transferred sample chunk bounds", () => {
    const payload: SampleAttachPayload = {
      chunk: new ArrayBuffer(ENGINE_PROTOCOL_LIMITS.maximumSampleChunkBytes),
      chunkIndex: 0,
      chunkCount: 100,
    };
    expect(
      validateEngineMessageEnvelope(envelope("sample-attach", payload)).ok,
    ).toBe(true);
    expect(
      validateEngineMessageEnvelope(
        envelope("sample-attach", {
          chunk: new ArrayBuffer(ENGINE_PROTOCOL_LIMITS.maximumSampleChunkBytes + 1),
          chunkIndex: 0,
          chunkCount: 1,
        }),
      ).ok,
    ).toBe(false);
  });

  it("orders scheduled events by frame, priority, then stable ID", () => {
    const events: ScheduledEventPayload[] = [
      { eventId: "b", audioFrame: 20, priority: 0, data: {} },
      { eventId: "c", audioFrame: 10, priority: 1, data: {} },
      { eventId: "a", audioFrame: 10, priority: 1, data: {} },
      { eventId: "d", audioFrame: 10, priority: 0, data: {} },
    ];
    expect(events.sort(compareScheduledEvents).map((event) => event.eventId)).toEqual([
      "d",
      "a",
      "c",
      "b",
    ]);
  });

  it("rejects an event batch that is not already deterministically sorted", () => {
    const payload: EventBatchPayload = {
      events: [
        { eventId: "later", audioFrame: 20, priority: 0, data: {} },
        { eventId: "earlier", audioFrame: 10, priority: 0, data: {} },
      ],
    };
    expect(
      validateEngineMessageEnvelope(envelope("event-batch", payload)).ok,
    ).toBe(false);
  });
});
