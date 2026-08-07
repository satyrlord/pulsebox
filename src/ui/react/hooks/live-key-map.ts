/** The number of semitones in the visible two-octave computer-keyboard map. */
export const LIVE_KEY_MAP_SEMITONE_COUNT = 24;

/** A physical key location from KeyboardEvent.code. */
export type PhysicalKeyCode = string;

/** A physical computer key mapped to one semitone in the visible key map. */
export interface LiveKeyBinding {
  readonly code: PhysicalKeyCode;
  readonly semitoneOffset: number;
}

/** A complete, one-to-one mapping for the visible two-octave keybed. */
export type LiveKeyMap = readonly LiveKeyBinding[];

export type LiveKeyMapIssue =
  | "invalid-binding-count"
  | "invalid-code"
  | "duplicate-code"
  | "invalid-semitone-offset"
  | "duplicate-semitone-offset";

export type LiveKeyMapValidation =
  | { readonly valid: true; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly LiveKeyMapIssue[] };

export type LiveKeyMapRemapResult =
  | { readonly valid: true; readonly map: LiveKeyMap }
  | { readonly valid: false; readonly issues: readonly LiveKeyMapIssue[] };

/**
 * The standard two-row musical-keyboard layout. The lower row maps C3 through
 * B3. The upper row maps C4 through B4.
 */
export const DEFAULT_LIVE_KEY_MAP: LiveKeyMap = [
  { code: "KeyZ", semitoneOffset: 0 },
  { code: "KeyS", semitoneOffset: 1 },
  { code: "KeyX", semitoneOffset: 2 },
  { code: "KeyD", semitoneOffset: 3 },
  { code: "KeyC", semitoneOffset: 4 },
  { code: "KeyV", semitoneOffset: 5 },
  { code: "KeyG", semitoneOffset: 6 },
  { code: "KeyB", semitoneOffset: 7 },
  { code: "KeyH", semitoneOffset: 8 },
  { code: "KeyN", semitoneOffset: 9 },
  { code: "KeyJ", semitoneOffset: 10 },
  { code: "KeyM", semitoneOffset: 11 },
  { code: "KeyQ", semitoneOffset: 12 },
  { code: "Digit2", semitoneOffset: 13 },
  { code: "KeyW", semitoneOffset: 14 },
  { code: "Digit3", semitoneOffset: 15 },
  { code: "KeyE", semitoneOffset: 16 },
  { code: "KeyR", semitoneOffset: 17 },
  { code: "Digit5", semitoneOffset: 18 },
  { code: "KeyT", semitoneOffset: 19 },
  { code: "Digit6", semitoneOffset: 20 },
  { code: "KeyY", semitoneOffset: 21 },
  { code: "Digit7", semitoneOffset: 22 },
  { code: "KeyU", semitoneOffset: 23 },
];

const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const TEXT_ENTRY_SELECTOR = "input, textarea, select, [contenteditable='true'], [role='textbox']";
const RESERVED_LIVE_KEY_CODES = new Set([
  "AltLeft",
  "AltRight",
  "CapsLock",
  "ContextMenu",
  "ControlLeft",
  "ControlRight",
  "Enter",
  "Escape",
  "MetaLeft",
  "MetaRight",
  "NumpadEnter",
  "ShiftLeft",
  "ShiftRight",
  "Space",
  "Tab",
]);

interface TextEntryCandidate {
  readonly tagName?: unknown;
  readonly isContentEditable?: unknown;
  readonly closest?: (selectors: string) => Element | null;
}

function isPhysicalKeyCode(code: string): boolean {
  return CODE_PATTERN.test(code) && code !== "Unidentified" && !RESERVED_LIVE_KEY_CODES.has(code);
}

/** Returns true when a physical key can become a live musical binding. */
export function isRemappableLiveKeyCode(code: string): boolean {
  return isPhysicalKeyCode(code);
}

/** Checks that a saved key map covers each visible semitone once. */
export function validateLiveKeyMap(map: LiveKeyMap): LiveKeyMapValidation {
  const issues = new Set<LiveKeyMapIssue>();
  const codes = new Set<PhysicalKeyCode>();
  const semitoneOffsets = new Set<number>();

  if (map.length !== LIVE_KEY_MAP_SEMITONE_COUNT) issues.add("invalid-binding-count");

  for (const binding of map) {
    if (!isPhysicalKeyCode(binding.code)) issues.add("invalid-code");
    else if (codes.has(binding.code)) issues.add("duplicate-code");
    else codes.add(binding.code);

    if (
      !Number.isInteger(binding.semitoneOffset) ||
      binding.semitoneOffset < 0 ||
      binding.semitoneOffset >= LIVE_KEY_MAP_SEMITONE_COUNT
    ) {
      issues.add("invalid-semitone-offset");
    } else if (semitoneOffsets.has(binding.semitoneOffset)) {
      issues.add("duplicate-semitone-offset");
    } else {
      semitoneOffsets.add(binding.semitoneOffset);
    }
  }

  if (issues.size === 0) return { valid: true, issues: [] };
  return { valid: false, issues: [...issues] };
}

/** Returns the semitone offset for a physical KeyboardEvent.code value. */
export function semitoneOffsetForCode(map: LiveKeyMap, code: PhysicalKeyCode): number | null {
  return map.find((binding) => binding.code === code)?.semitoneOffset ?? null;
}

/** Returns true when an event target accepts normal typed text or form input. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") return false;

  const candidate = target as TextEntryCandidate;
  if (candidate.isContentEditable === true) return true;
  if (typeof candidate.tagName === "string") {
    const tagName = candidate.tagName.toUpperCase();
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return true;
  }

  return (
    typeof candidate.closest === "function" && candidate.closest(TEXT_ENTRY_SELECTOR) !== null
  );
}

/**
 * Maps a keyboard event to a semitone. It deliberately ignores text-entry
 * targets so those controls retain their normal typed-character behavior.
 */
export function semitoneOffsetForLiveKeyEvent(
  event: Pick<KeyboardEvent, "code" | "target">,
  map: LiveKeyMap = DEFAULT_LIVE_KEY_MAP,
): number | null {
  if (isTextEntryTarget(event.target)) return null;
  return semitoneOffsetForCode(map, event.code);
}

/**
 * Returns a replacement map when the code is unused. It does not mutate the
 * supplied map or swap an existing binding.
 */
export function remapLiveKey(
  map: LiveKeyMap,
  semitoneOffset: number,
  code: PhysicalKeyCode,
): LiveKeyMapRemapResult {
  const validation = validateLiveKeyMap(map);
  if (!validation.valid) return validation;
  if (!Number.isInteger(semitoneOffset) || semitoneOffset < 0 || semitoneOffset >= LIVE_KEY_MAP_SEMITONE_COUNT) {
    return { valid: false, issues: ["invalid-semitone-offset"] };
  }
  if (!isPhysicalKeyCode(code)) return { valid: false, issues: ["invalid-code"] };

  const currentBinding = map.find((binding) => binding.semitoneOffset === semitoneOffset);
  if (currentBinding === undefined) {
    return { valid: false, issues: ["invalid-semitone-offset"] };
  }
  if (code !== currentBinding.code && map.some((binding) => binding.code === code)) {
    return { valid: false, issues: ["duplicate-code"] };
  }

  return {
    valid: true,
    map: map.map((binding) =>
      binding.semitoneOffset === semitoneOffset ? { ...binding, code } : binding,
    ),
  };
}
