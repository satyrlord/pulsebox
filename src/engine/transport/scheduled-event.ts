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
  readonly note?: number;
  readonly velocity?: number;
  readonly accent?: boolean;
  readonly slide?: boolean;
}

/** One step as the scheduler reads it. Mirrors the state layer's `PatternStep`. */
export interface PatternStepView {
  readonly active: boolean;
  readonly note: number;
  readonly velocity: number;
  readonly accent: boolean;
  readonly slide: boolean;
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
