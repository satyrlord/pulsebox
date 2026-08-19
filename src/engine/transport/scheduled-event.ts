import type { ParameterValue } from "../../contracts/parameters";

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
  /** Stable identity for one persisted or expanded onset occurrence. */
  readonly occurrenceId?: string;
  readonly note?: number;
  readonly velocity?: number;
  readonly accent?: boolean;
  readonly slide?: boolean;
}

/** One module parameter change stamped on the audio-frame timeline. */
export interface ScheduledParameterChange {
  readonly atFrame: number;
  readonly occurrenceId?: string;
  readonly parameterId: string;
  readonly value: ParameterValue;
}

export interface PatternEventDataView {
  readonly note: number;
  readonly velocity: number;
  readonly accent: boolean;
  readonly slide: boolean;
  /** Chance that this event plays. Older project data defaults to 1. */
  readonly probability?: number;
  /** Fine onset offset in Pattern ticks. Older project data defaults to 0. */
  readonly microTimingTicks?: number;
  /** Number of bounded grace hits before a trigger. */
  readonly flam?: number;
  /** Number of bounded retriggers after a trigger. */
  readonly roll?: number;
}

/** One persisted Piano Roll event as the scheduler reads it. */
export interface PatternEventView {
  readonly id: string;
  readonly type: "note" | "trigger";
  readonly positionTicks: number;
  readonly durationTicks?: number;
  readonly data: PatternEventDataView;
}

/** One step value from a module-owned Pattern automation lane. */
export interface PatternAutomationStepView {
  readonly parameterId: string;
  readonly positionTicks: number;
  readonly value: ParameterValue;
}

/** One module part for a project Pattern slot. */
export interface PatternPartView {
  /** Nominal length in fixed sixteenth-note steps. */
  readonly length: number;
  /** Pattern duration. The part cycle repeats through this many steps. */
  readonly durationSteps?: number;
  /** Optional per-trigger-note cycle lengths for drum parts. */
  readonly voiceCycleLengths?: Readonly<Record<string, number>>;
  /** Flattened module automation steps for this Pattern. */
  readonly automationSteps?: readonly PatternAutomationStepView[];
  readonly events: readonly PatternEventView[];
}

/**
 * Note-off, then reset, then note-on at an equal frame. A note-on that shares a
 * frame with the previous note's release must win, or the release silences the
 * new note.
 */
export function scheduledEventPriority(event: ScheduledVoiceEvent): number {
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

/** Maximum musical endpoints retained by one voice processor horizon. */
export const SCHEDULED_EVENT_QUEUE_CAPACITY = 2_048;
export const SCHEDULED_PARAMETER_QUEUE_CAPACITY = 2_048;
