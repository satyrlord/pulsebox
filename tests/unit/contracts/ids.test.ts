import { describe, expect, it } from "vitest";

import {
  RACK_SLOT_IDS,
  SEND_BUS_IDS,
  createCanonicalUuid,
  createProjectId,
  createStateRevisionEpoch,
  parseCanonicalUuid,
  parseContentId,
  parseRackSlotId,
  validateProjectRevision,
  validateStateRevision,
} from "../../../src/contracts/ids";
import { TEST_UUID, deterministicIdFactory } from "./fixtures";

describe("opaque identifiers", () => {
  it("exposes the exact fixed rack and send identities", () => {
    expect(RACK_SLOT_IDS).toEqual([
      "slot-01",
      "slot-02",
      "slot-03",
      "slot-04",
      "slot-05",
      "slot-06",
      "slot-07",
      "slot-08",
    ]);
    expect(SEND_BUS_IDS).toEqual(["send-a", "send-b", "send-c", "send-d"]);
    expect(Object.isFrozen(RACK_SLOT_IDS)).toBe(true);
  });

  it("accepts only lowercase canonical UUID version 4 values", () => {
    expect(parseCanonicalUuid(TEST_UUID).ok).toBe(true);
    expect(parseCanonicalUuid(TEST_UUID.toUpperCase()).ok).toBe(false);
    expect(parseCanonicalUuid("00000000-0000-1000-8000-000000000001").ok).toBe(
      false,
    );
  });

  it("uses an injected deterministic UUID factory", () => {
    expect(createCanonicalUuid(deterministicIdFactory)).toBe(TEST_UUID);
    expect(createProjectId(deterministicIdFactory)).toBe(TEST_UUID);
    expect(createStateRevisionEpoch(deterministicIdFactory)).toBe(TEST_UUID);
    expect(() =>
      createCanonicalUuid({ createUuid: () => "not-a-uuid" }),
    ).toThrow(/non-canonical/u);
  });

  it("validates rack, content, and project revision bounds", () => {
    expect(parseRackSlotId("slot-08").ok).toBe(true);
    expect(parseRackSlotId("slot-09").ok).toBe(false);
    expect(parseContentId(`sha256:${"a".repeat(64)}`).ok).toBe(true);
    expect(parseContentId(`sha256:${"A".repeat(64)}`).ok).toBe(false);
    expect(validateProjectRevision({ epoch: TEST_UUID, counter: 0 }).ok).toBe(
      true,
    );
    expect(
      validateProjectRevision({ epoch: TEST_UUID, counter: Number.MAX_SAFE_INTEGER })
        .ok,
    ).toBe(true);
    expect(validateProjectRevision({ epoch: TEST_UUID, counter: -1 }).ok).toBe(
      false,
    );
    expect(validateStateRevision({ epoch: TEST_UUID, counter: 7 }).ok).toBe(true);
    expect(validateStateRevision({ epoch: TEST_UUID, counter: -1 }).ok).toBe(false);
  });
});
