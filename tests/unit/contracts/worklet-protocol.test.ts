import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ENGINE_PROTOCOL_LIMITS,
  compareScheduledEvents,
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
  it("accepts a versioned ready envelope", () => {
    const payload: ReadyPayload = { acceptedProtocolVersion: 1 };
    expect(
      validateEngineMessageEnvelope(envelope("ready", payload)).ok,
    ).toBe(true);
  });

  it("validates ordinary payload sizes without TextEncoder", () => {
    vi.stubGlobal("TextEncoder", undefined);
    expect(
      validateEngineMessageEnvelope(envelope("configure", { label: "Acid bass \u{1F3B5}" })).ok,
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
        () => ({}),
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
            () => ({}),
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
