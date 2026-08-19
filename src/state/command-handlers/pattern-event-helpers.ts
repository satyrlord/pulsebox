import { createNoteEventId, isCanonicalUuid, type AutomationLaneId, type IdFactory, type ModuleInstanceId, type NoteEventId, type PatternId } from "../../contracts/ids";
import type { PatternEventEdit } from "../commands";
import { isNumericNoteKey } from "../edit-policy";
import {
  DEFAULT_PATTERN_EVENT_PROPERTIES,
  PATTERN_TICKS_PER_STEP,
  type AutomationLaneState,
  type AutomationTargetId,
  type PatternEvent,
  type PatternEventData,
  type PatternPartState,
  type VoiceCycleLengthKey,
} from "../model";

interface PatternEditIssue {
  readonly field: string;
  readonly message: string;
  readonly recoveryAction: string;
}

type PatternEditResult =
  | { readonly events: readonly PatternEvent[]; readonly selectedEventIds: readonly NoteEventId[] }
  | { readonly issue: PatternEditIssue };

function normalizePatternEventData(
  data: Readonly<{
    note: number;
    velocity: number;
    accent: boolean;
    slide: boolean;
    probability?: number;
    microTimingTicks?: number;
    flam?: number;
    roll?: number;
  }>,
): PatternEventData {
  return {
    ...data,
    ...DEFAULT_PATTERN_EVENT_PROPERTIES,
    probability: data.probability ?? DEFAULT_PATTERN_EVENT_PROPERTIES.probability,
    microTimingTicks: data.microTimingTicks ?? DEFAULT_PATTERN_EVENT_PROPERTIES.microTimingTicks,
    flam: data.flam ?? DEFAULT_PATTERN_EVENT_PROPERTIES.flam,
    roll: data.roll ?? DEFAULT_PATTERN_EVENT_PROPERTIES.roll,
  };
}

export function cloneEvent(event: PatternEvent, idFactory: IdFactory): PatternEvent {
  return {
    ...event,
    id: createNoteEventId(idFactory),
    data: { ...event.data },
  };
}

export function clonePart(
  part: PatternPartState,
  moduleId: ModuleInstanceId,
  idFactory: IdFactory,
  laneIdMap: ReadonlyMap<AutomationLaneId, AutomationLaneId> = new Map(),
): PatternPartState {
  return {
    moduleId,
    length: part.length,
    voiceCycleLengths: { ...part.voiceCycleLengths },
    events: part.events.map((event) => cloneEvent(event, idFactory)),
    automationLaneIds: part.automationLaneIds.flatMap((laneId) => {
      const clonedId = laneIdMap.get(laneId);
      return clonedId === undefined ? [] : [clonedId];
    }),
  };
}

export function cloneAutomationLane(
  lane: AutomationLaneState,
  id: AutomationLaneId,
  patternId: PatternId,
  targetId: AutomationTargetId,
): AutomationLaneState {
  return {
    ...lane,
    id,
    patternId,
    targetId,
    steps: lane.steps.map((step) => ({ ...step })),
  };
}

export function isVoiceCycleLengthKey(value: string): value is VoiceCycleLengthKey {
  return isNumericNoteKey(value) || /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

export function insertAfter<Item>(
  items: readonly Item[],
  item: Item,
  afterId: string | undefined,
  idOf: (value: Item) => string,
): readonly Item[] {
  if (afterId === undefined) return [item, ...items];
  const index = items.findIndex((candidate) => idOf(candidate) === afterId);
  return index === -1 ? items : [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}

function patternEditIssue(field: string, message: string, recoveryAction: string): PatternEditResult {
  return { issue: { field, message, recoveryAction } };
}

export function selectEvents(
  part: PatternPartState,
  eventIds: readonly NoteEventId[],
  field: string,
): { readonly events: readonly PatternEvent[] } | { readonly issue: PatternEditIssue } {
  if (!Array.isArray(eventIds)) {
    return {
      issue: {
        field,
        message: "The event selection is not a list.",
        recoveryAction: "Select events from the current Pattern part.",
      },
    };
  }
  const selectedIds = eventIds.filter(
    (eventId: unknown): eventId is NoteEventId => isCanonicalUuid(eventId),
  );
  if (selectedIds.length !== eventIds.length || new Set(selectedIds).size !== selectedIds.length) {
    return {
      issue: {
        field,
        message: "The event selection contains an invalid or duplicate ID.",
        recoveryAction: "Select each current event once.",
      },
    };
  }
  const byId = new Map<NoteEventId, PatternEvent>(
    part.events.map((event): readonly [NoteEventId, PatternEvent] => [event.id, event]),
  );
  const events: PatternEvent[] = [];
  for (const eventId of selectedIds) {
    const event = byId.get(eventId);
    if (event === undefined) {
      return {
        issue: {
          field,
          message: "The event selection contains an event that does not exist.",
          recoveryAction: "Select events from the current Pattern part.",
        },
      };
    }
    events.push(event);
  }
  return { events };
}

export function requireEditedEvents(
  part: PatternPartState,
  eventIds: readonly NoteEventId[],
  field: string,
): { readonly events: readonly PatternEvent[] } | { readonly issue: PatternEditIssue } {
  if (eventIds.length === 0) {
    return {
      issue: {
        field,
        message: "The edit needs at least one event.",
        recoveryAction: "Select one or more events.",
      },
    };
  }
  return selectEvents(part, eventIds, field);
}

export function applyPatternEventEdit(
  part: PatternPartState,
  edit: PatternEventEdit,
  idFactory: IdFactory,
): PatternEditResult {
  let events: readonly PatternEvent[];
  let selectedEventIds: readonly NoteEventId[];

  switch (edit.type) {
    case "create": {
      const event: PatternEvent = {
        ...edit.event,
        id: createNoteEventId(idFactory),
        data: normalizePatternEventData(edit.event.data),
      };
      events = [...part.events, event];
      selectedEventIds = [event.id];
      break;
    }
    case "delete": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      const deleted = new Set(edit.eventIds);
      events = part.events.filter((event) => !deleted.has(event.id));
      selectedEventIds = [];
      break;
    }
    case "move": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      if (
        !Number.isSafeInteger(edit.deltaTicks) ||
        edit.deltaTicks % PATTERN_TICKS_PER_STEP !== 0 ||
        !Number.isSafeInteger(edit.deltaNote)
      ) {
        return patternEditIssue(
          "payload.edit",
          "The move offset is outside the Piano Roll grid.",
          "Move events by whole 1/16 steps and semitones.",
        );
      }
      const moved = new Set(edit.eventIds);
      events = part.events.map((event) =>
        moved.has(event.id)
          ? {
              ...event,
              positionTicks: event.positionTicks + edit.deltaTicks,
              data: { ...event.data, note: event.data.note + edit.deltaNote },
            }
          : event,
      );
      selectedEventIds = edit.eventIds;
      break;
    }
    case "resize": {
      const selected = requireEditedEvents(part, [edit.eventId], "payload.edit.eventId");
      if ("issue" in selected) return { issue: selected.issue };
      const event = selected.events[0];
      if (event?.type !== "note") {
        return patternEditIssue(
          "payload.edit.eventId",
          "A trigger does not have a duration edge.",
          "Resize a pitched note.",
        );
      }
      events = part.events.map((candidate) =>
        candidate.id === edit.eventId
          ? {
              ...event,
              positionTicks: edit.positionTicks ?? event.positionTicks,
              durationTicks: edit.durationTicks,
            }
          : candidate,
      );
      selectedEventIds = [edit.eventId];
      break;
    }
    case "duplicate": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      const copies = selected.events.map((event) => ({
        ...event,
        id: createNoteEventId(idFactory),
        positionTicks: event.positionTicks + PATTERN_TICKS_PER_STEP,
        data: { ...event.data },
      }));
      events = [...part.events, ...copies];
      selectedEventIds = copies.map((event) => event.id);
      break;
    }
    case "velocity": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      if (!Number.isFinite(edit.velocity) || edit.velocity < 0 || edit.velocity > 1) {
        return patternEditIssue(
          "payload.edit.velocity",
          "Velocity must be between 0 and 1.",
          "Choose a valid velocity.",
        );
      }
      const changed = new Set(edit.eventIds);
      events = part.events.map((event) =>
        changed.has(event.id)
          ? { ...event, data: { ...event.data, velocity: edit.velocity } }
          : event,
      );
      selectedEventIds = edit.eventIds;
      break;
    }
    case "properties": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      const allowed = new Set([
        "velocity",
        "accent",
        "slide",
        "probability",
        "microTimingTicks",
        "flam",
        "roll",
      ]);
      if (Object.keys(edit.values).some((key) => !allowed.has(key))) {
        return patternEditIssue(
          "payload.edit.values",
          "The event property is not supported.",
          "Choose a supported event property.",
        );
      }
      const changed = new Set(edit.eventIds);
      events = part.events.map((event) =>
        changed.has(event.id)
          ? { ...event, data: { ...event.data, ...edit.values } }
          : event,
      );
      selectedEventIds = edit.eventIds;
      break;
    }
  }

  const issue = validatePatternEvents(part.length, events);
  if (issue !== undefined) return { issue };
  return { events: sortPatternEvents(events), selectedEventIds };
}

export function validatePatternEvents(
  partLength: number,
  events: readonly PatternEvent[],
): PatternEditIssue | undefined {
  if (!Number.isSafeInteger(partLength) || partLength < 1 || partLength > 64) {
    return {
      field: "payload.patternId",
      message: "The Pattern part length is outside 1 through 64 steps.",
      recoveryAction: "Use a valid Pattern part.",
    };
  }
  const endTicks = partLength * PATTERN_TICKS_PER_STEP;
  const ids = new Set<string>();
  let eventType: PatternEvent["type"] | undefined;
  for (const event of events) {
    if (ids.has(event.id)) {
      return {
        field: "payload.edit",
        message: "The edit creates a duplicate event ID.",
        recoveryAction: "Retry the edit with unique events.",
      };
    }
    ids.add(event.id);
    if (eventType !== undefined && event.type !== eventType) {
      return {
        field: "payload.edit",
        message: "A Pattern part cannot mix notes and triggers.",
        recoveryAction: "Create events supported by the selected module.",
      };
    }
    eventType = event.type;
    if (
      !Number.isSafeInteger(event.positionTicks) ||
      event.positionTicks < 0 ||
      event.positionTicks >= endTicks ||
      event.positionTicks % PATTERN_TICKS_PER_STEP !== 0
    ) {
      return {
        field: "payload.edit",
        message: "An event position is outside the Pattern or the 1/16 grid.",
        recoveryAction: "Place the event on a valid grid step.",
      };
    }
    if (
      !Number.isInteger(event.data.note) ||
      event.data.note < 0 ||
      event.data.note > 127 ||
      !Number.isFinite(event.data.velocity) ||
      event.data.velocity < 0 ||
      event.data.velocity > 1 ||
      typeof event.data.accent !== "boolean" ||
      typeof event.data.slide !== "boolean" ||
      !Number.isFinite(event.data.probability) ||
      event.data.probability < 0 ||
      event.data.probability > 1 ||
      !Number.isInteger(event.data.microTimingTicks) ||
      event.data.microTimingTicks < -60 ||
      event.data.microTimingTicks > 60 ||
      !Number.isInteger(event.data.flam) ||
      event.data.flam < 0 ||
      event.data.flam > 3 ||
      !Number.isInteger(event.data.roll) ||
      event.data.roll < 0 ||
      event.data.roll > 7
    ) {
      return {
        field: "payload.edit",
        message: "An event property is outside its supported range.",
        recoveryAction: "Use values in the supported event-property ranges.",
      };
    }
    if (event.type === "note") {
      if (
        !Number.isSafeInteger(event.durationTicks) ||
        event.durationTicks <= 0 ||
        event.durationTicks % PATTERN_TICKS_PER_STEP !== 0 ||
        event.positionTicks + event.durationTicks > endTicks
      ) {
        return {
          field: "payload.edit",
          message: "A note duration is outside the Pattern or the 1/16 grid.",
          recoveryAction: "Resize the note within the Pattern.",
        };
      }
    } else if (Object.prototype.hasOwnProperty.call(event, "durationTicks")) {
      return {
        field: "payload.edit",
        message: "A trigger cannot have a duration.",
        recoveryAction: "Create a fixed one-cell trigger.",
      };
    }
  }

  const sorted = sortPatternEvents(events);
  if (eventType === "note") {
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (
        previous !== undefined &&
        current !== undefined &&
        previous.positionTicks + (previous.durationTicks ?? 0) > current.positionTicks
      ) {
        return {
          field: "payload.edit",
          message: "Monophonic notes cannot overlap.",
          recoveryAction: "Move or resize the notes so that they do not overlap.",
        };
      }
    }
  } else if (eventType === "trigger") {
    const occupied = new Set<string>();
    for (const event of sorted) {
      const key = `${String(event.positionTicks)}:${String(event.data.note)}`;
      if (occupied.has(key)) {
        return {
          field: "payload.edit",
          message: "A drum voice already has a trigger at this step.",
          recoveryAction: "Use another voice or step.",
        };
      }
      occupied.add(key);
    }
  }
  return undefined;
}

export function automationStepsFitPart(
  part: PatternPartState,
  length: number,
  lanes: Readonly<Record<string, { readonly steps: readonly { readonly tick: number }[] }>>,
): boolean {
  return part.automationLaneIds.every((id) =>
    (lanes[id] ?? { steps: [] }).steps.every((step) => step.tick < length * PATTERN_TICKS_PER_STEP),
  );
}

export function sortPatternEvents(events: readonly PatternEvent[]): readonly PatternEvent[] {
  return [...events].sort(
    (left, right) =>
      left.positionTicks - right.positionTicks ||
      left.data.note - right.data.note ||
      left.id.localeCompare(right.id),
  );
}
