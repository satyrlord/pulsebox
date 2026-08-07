import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIVE_KEY_MAP,
  isRemappableLiveKeyCode,
  isTextEntryTarget,
  LIVE_KEY_MAP_SEMITONE_COUNT,
  remapLiveKey,
  semitoneOffsetForCode,
  semitoneOffsetForLiveKeyEvent,
  validateLiveKeyMap,
  type LiveKeyMap,
} from "../../../src/ui/react/hooks/live-key-map";

function keyboardEvent(code: string, target: EventTarget | null): Pick<KeyboardEvent, "code" | "target"> {
  return { code, target };
}

describe("live key map", () => {
  it("maps the standard physical two-octave layout", () => {
    expect(DEFAULT_LIVE_KEY_MAP).toHaveLength(LIVE_KEY_MAP_SEMITONE_COUNT);
    expect(validateLiveKeyMap(DEFAULT_LIVE_KEY_MAP)).toEqual({ valid: true, issues: [] });
    expect(semitoneOffsetForCode(DEFAULT_LIVE_KEY_MAP, "KeyZ")).toBe(0);
    expect(semitoneOffsetForCode(DEFAULT_LIVE_KEY_MAP, "Digit2")).toBe(13);
    expect(semitoneOffsetForCode(DEFAULT_LIVE_KEY_MAP, "KeyU")).toBe(23);
  });

  it("uses KeyboardEvent.code instead of the typed key value", () => {
    const event = { ...keyboardEvent("KeyZ", null), key: "w" };
    expect(semitoneOffsetForLiveKeyEvent(event)).toBe(0);
  });

  it("does not map events from text-entry targets", () => {
    const input = { tagName: "INPUT" } as unknown as EventTarget;
    const editable = { isContentEditable: true } as unknown as EventTarget;
    const textBoxChild = {
      tagName: "SPAN",
      closest: () => ({ tagName: "DIV" }),
    } as unknown as EventTarget;

    expect(isTextEntryTarget(input)).toBe(true);
    expect(isTextEntryTarget(editable)).toBe(true);
    expect(isTextEntryTarget(textBoxChild)).toBe(true);
    expect(semitoneOffsetForLiveKeyEvent(keyboardEvent("KeyZ", input))).toBeNull();
    expect(isTextEntryTarget({} as EventTarget)).toBe(false);
  });

  it("rejects incomplete and duplicate maps", () => {
    const duplicateCode: LiveKeyMap = DEFAULT_LIVE_KEY_MAP.map((binding, index) =>
      index === 1 ? { ...binding, code: "KeyZ" } : binding,
    );
    const duplicateOffset: LiveKeyMap = DEFAULT_LIVE_KEY_MAP.map((binding, index) =>
      index === 1 ? { ...binding, semitoneOffset: 0 } : binding,
    );

    expect(validateLiveKeyMap(DEFAULT_LIVE_KEY_MAP.slice(1))).toEqual({
      valid: false,
      issues: ["invalid-binding-count"],
    });
    expect(validateLiveKeyMap(duplicateCode)).toEqual({
      valid: false,
      issues: ["duplicate-code"],
    });
    expect(validateLiveKeyMap(duplicateOffset)).toEqual({
      valid: false,
      issues: ["duplicate-semitone-offset"],
    });
  });

  it("remaps one semitone only when its physical code is unused", () => {
    const remapped = remapLiveKey(DEFAULT_LIVE_KEY_MAP, 0, "KeyA");
    expect(remapped.valid).toBe(true);
    if (!remapped.valid) throw new Error("Expected a valid remap.");
    expect(semitoneOffsetForCode(remapped.map, "KeyA")).toBe(0);
    expect(semitoneOffsetForCode(remapped.map, "KeyZ")).toBeNull();
    expect(semitoneOffsetForCode(DEFAULT_LIVE_KEY_MAP, "KeyZ")).toBe(0);

    expect(remapLiveKey(DEFAULT_LIVE_KEY_MAP, 0, "KeyS")).toEqual({
      valid: false,
      issues: ["duplicate-code"],
    });
  });

  it("reserves navigation and activation keys", () => {
    expect(isRemappableLiveKeyCode("KeyA")).toBe(true);
    for (const code of ["Tab", "Escape", "Enter", "Space", "ShiftLeft", "ControlLeft"]) {
      expect(isRemappableLiveKeyCode(code)).toBe(false);
      expect(remapLiveKey(DEFAULT_LIVE_KEY_MAP, 0, code)).toEqual({
        valid: false,
        issues: ["invalid-code"],
      });
    }
  });
});
