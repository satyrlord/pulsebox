/**
 * The frame-stamped event vocabulary every voice adapter accepts. It is
 * deliberately instrument-agnostic: the scheduler produces these, the transport
 * hands them to adapters, and each adapter translates them for its own
 * processor. Nothing here knows which instrument is playing.
 */

export type ScheduledVoiceEventType = "note-on" | "note-off" | "reset";

export interface ScheduledVoiceEvent {
  /** Absolute audio frame, on the same timeline as `AudioContext.currentTime * sampleRate`. */
  readonly atFrame: number;
  readonly type: ScheduledVoiceEventType;
  /** Absolute Pattern step identity for note-on evidence across timing rebuilds. */
  readonly sourceStep?: number;
  readonly note?: number;
  readonly velocity?: number;
  readonly accent?: boolean;
  readonly slide?: boolean;
}

export interface PatternEventDataView {
  readonly note: number;
  readonly velocity: number;
  readonly accent: boolean;
  readonly slide: boolean;
}

/** One persisted Piano Roll event as the scheduler reads it. */
export interface PatternEventView {
  readonly id: string;
  readonly type: "note" | "trigger";
  readonly positionTicks: number;
  readonly durationTicks?: number;
  readonly data: PatternEventDataView;
}

/** One module part for a project Pattern slot. */
export interface PatternPartView {
  /** Nominal length in fixed sixteenth-note steps. */
  readonly length: number;
  readonly events: readonly PatternEventView[];
}

/**
 * Note-off, then reset, then note-on at an equal frame. A note-on that shares a
 * frame with the previous note's release must win, or the release silences the
 * new note.
 */
function scheduledEventPriority(event: ScheduledVoiceEvent): number {
  return event.type === "note-off" ? 0 : event.type === "reset" ? 1 : 2;
}

export function compareScheduledVoiceEvents(
  left: ScheduledVoiceEvent,
  right: ScheduledVoiceEvent,
): number {
  return (
    left.atFrame - right.atFrame || scheduledEventPriority(left) - scheduledEventPriority(right)
  );
}
