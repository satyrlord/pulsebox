/**
 * State-owned edit policy the UI shares: the bound for continuous timing
 * controls and the section 14 swap-compatibility count. The store validates
 * these same bounds on dispatch, so the UI imports this module instead of
 * restating the numbers.
 */

import type { PatternPartState } from "./model";

/** Swing and Pattern Humanize live on the closed unit interval. */
export function clampUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** True when a voice-cycle key is a canonical note number from 0 through 127. */
export function isNumericNoteKey(value: string): boolean {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return false;
  const note = Number(value);
  return Number.isSafeInteger(note) && note >= 0 && note <= 127;
}

/**
 * Section 14: a module swap keeps sequence data and reports the events the
 * swap target cannot map. Undefined playable notes means every note maps, as
 * on a pitched instrument.
 */
export function countUnmappedEvents(
  parts: Iterable<PatternPartState>,
  playableNotes: ReadonlySet<number> | undefined,
): number {
  if (playableNotes === undefined) return 0;
  return [...parts].reduce(
    (total, part) =>
      total + part.events.filter((event) => !playableNotes.has(event.data.note)).length,
    0,
  );
}
