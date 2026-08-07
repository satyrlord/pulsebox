import type { NoteEventId } from "../contracts/ids";
import { PATTERN_TICKS_PER_STEP, type PatternEvent, type PatternEventData } from "./model";

const MINIMUM_PART_LENGTH = 1;
const MAXIMUM_PART_LENGTH = 64;
const MAXIMUM_MICRO_TIMING_TICKS = 60;
const MAXIMUM_FLAM = 3;
const MAXIMUM_ROLL = 7;
const HUMANIZE_VELOCITY_RANGE = 0.2;
const VARIATION_NOTE_RANGE = 12;
const MAXIMUM_VARIATION_STEPS = 4;
const EMPTY_EVENTS: readonly PatternEvent[] = Object.freeze([]);

export type PatternTransformRandom = () => number;
export type PatternEventIdFactory = () => NoteEventId;

export interface PatternTransformOptions {
  readonly length: number;
}

export interface EuclideanTriggerOptions extends PatternTransformOptions {
  readonly note: number;
  readonly pulses: number;
  readonly idFactory: PatternEventIdFactory;
  readonly cycleLength?: number;
  readonly rotation?: number;
  readonly data?: Partial<Omit<PatternEventData, "note">>;
}

export interface RandomizePatternOptions extends PatternTransformOptions {
  readonly strength: number;
  readonly random: PatternTransformRandom;
}

export interface HumanizePatternOptions extends PatternTransformOptions {
  readonly timingStrength: number;
  readonly velocityStrength: number;
  readonly random: PatternTransformRandom;
}

export interface PatternVariationOptions extends PatternTransformOptions {
  readonly similarity: number;
  readonly random: PatternTransformRandom;
}

export interface InvertPatternOptions extends PatternTransformOptions {
  readonly pivot?: number;
}

export interface TransposePatternOptions extends PatternTransformOptions {
  readonly semitones: number;
}

export interface ShiftPatternOptions extends PatternTransformOptions {
  readonly steps: number;
}

export interface StretchPatternOptions {
  readonly sourceLength: number;
  readonly targetLength: number;
}

/**
 * Replace one drum voice with an evenly distributed Euclidean trigger cycle.
 * The cycle repeats through the supplied part length.
 */
export function generateEuclideanTriggers(
  events: readonly PatternEvent[],
  options: EuclideanTriggerOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  if (events.some((event) => event.type !== "trigger")) {
    throw new TypeError("Euclidean trigger generation needs a trigger part.");
  }

  const note = clampInteger(options.note, 0, 127);
  const cycleLength = clampInteger(options.cycleLength ?? length, 1, length);
  const pulses = clampInteger(options.pulses, 0, cycleLength);
  const rotation = toInteger(options.rotation ?? 0);
  const ids = new Set(events.map((event) => event.id));
  const generated: PatternEvent[] = [];

  for (let step = 0; step < length; step += 1) {
    const cycleStep = wrapStep(step - rotation, cycleLength);
    if (!isEuclideanHit(cycleStep, cycleLength, pulses)) continue;
    const id = nextUniqueId(ids, options.idFactory, length);
    generated.push({
      id,
      type: "trigger",
      positionTicks: step * PATTERN_TICKS_PER_STEP,
      data: triggerData(note, options.data),
    });
  }

  return finalizeEvents(
    [...events.filter((event) => event.data.note !== note), ...generated],
    length,
  );
}

/** Randomize bounded event properties without changing the grid position. */
export function randomizePatternEvents(
  events: readonly PatternEvent[],
  options: RandomizePatternOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  const strength = unitAmount(options.strength);
  if (strength === 0) return finalizeEvents(events, length);
  return finalizeEvents(
    events.map((event) => withData(event, randomizeData(event.data, strength, options.random))),
    length,
  );
}

/** Humanize only velocity and micro-timing. The event grid position stays fixed. */
export function humanizePatternEvents(
  events: readonly PatternEvent[],
  options: HumanizePatternOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  const timingStrength = unitAmount(options.timingStrength);
  const velocityStrength = unitAmount(options.velocityStrength);
  if (timingStrength === 0 && velocityStrength === 0) return finalizeEvents(events, length);

  return finalizeEvents(
    events.map((event) => {
      const timingOffset = signedRandom(options.random) * MAXIMUM_MICRO_TIMING_TICKS * timingStrength;
      const velocityOffset = signedRandom(options.random) * HUMANIZE_VELOCITY_RANGE * velocityStrength;
      return withData(event, {
        ...event.data,
        velocity: clampNumber(event.data.velocity + velocityOffset, 0, 1),
        microTimingTicks: clampInteger(
          event.data.microTimingTicks + Math.round(timingOffset),
          -MAXIMUM_MICRO_TIMING_TICKS,
          MAXIMUM_MICRO_TIMING_TICKS,
        ),
      });
    }),
    length,
  );
}

/**
 * Make a bounded deterministic variation. A similarity of one returns the
 * same event values. Lower similarity permits wider timing, pitch, and
 * property changes.
 */
export function varyPatternEvents(
  events: readonly PatternEvent[],
  options: PatternVariationOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  const amount = 1 - unitAmount(options.similarity);
  if (amount === 0) return finalizeEvents(events, length);
  const stepRange = Math.min(MAXIMUM_VARIATION_STEPS, Math.floor(length / 2));

  return finalizeEvents(
    events.map((event) => {
      const shiftedStep = wrapStep(
        event.positionTicks / PATTERN_TICKS_PER_STEP + Math.round(signedRandom(options.random) * stepRange * amount),
        length,
      );
      const data = randomizeData(event.data, amount, options.random);
      return withTiming(
        withData(event, {
          ...data,
          note: clampInteger(
            data.note + Math.round(signedRandom(options.random) * VARIATION_NOTE_RANGE * amount),
            0,
            127,
          ),
        }),
        shiftedStep,
        durationSteps(event, length),
      );
    }),
    length,
  );
}

/** Reverse the events inside the current part cycle. */
export function reversePatternEvents(
  events: readonly PatternEvent[],
  options: PatternTransformOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  return finalizeEvents(
    events.map((event) => {
      const duration = durationSteps(event, length);
      const position = event.type === "note"
        ? length - event.positionTicks / PATTERN_TICKS_PER_STEP - duration
        : length - event.positionTicks / PATTERN_TICKS_PER_STEP - 1;
      return withTiming(event, position, duration);
    }),
    length,
  );
}

/** Invert pitches around the supplied pivot or the source pitch midpoint. */
export function invertPatternEvents(
  events: readonly PatternEvent[],
  options: InvertPatternOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  const pivot = clampInteger(options.pivot ?? sourcePitchMidpoint(events), 0, 127);
  return finalizeEvents(
    events.map((event) =>
      withData(event, { ...event.data, note: clampInteger(pivot * 2 - event.data.note, 0, 127) }),
    ),
    length,
  );
}

/** Transpose pitches by a bounded whole-semitone value. */
export function transposePatternEvents(
  events: readonly PatternEvent[],
  options: TransposePatternOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  const semitones = clampInteger(options.semitones, -127, 127);
  return finalizeEvents(
    events.map((event) =>
      withData(event, { ...event.data, note: clampInteger(event.data.note + semitones, 0, 127) }),
    ),
    length,
  );
}

/** Compress events into the first half of the part without sub-grid positions. */
export function doubleTimePatternEvents(
  events: readonly PatternEvent[],
  options: PatternTransformOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  return finalizeEvents(
    events.map((event) =>
      withTiming(
        event,
        Math.floor((event.positionTicks / PATTERN_TICKS_PER_STEP) / 2),
        Math.max(1, Math.floor(durationSteps(event, length) / 2)),
      ),
    ),
    length,
  );
}

/** Expand events twofold and omit events that no longer fit in the part. */
export function halfTimePatternEvents(
  events: readonly PatternEvent[],
  options: PatternTransformOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  return finalizeEvents(
    events.flatMap((event) => {
      const position = (event.positionTicks / PATTERN_TICKS_PER_STEP) * 2;
      if (position >= length) return [];
      return [withTiming(event, position, durationSteps(event, length) * 2)];
    }),
    length,
  );
}

/** Shift events through the current cycle. A positive value shifts later. */
export function shiftPatternEvents(
  events: readonly PatternEvent[],
  options: ShiftPatternOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  const offset = toInteger(options.steps);
  return finalizeEvents(
    events.map((event) =>
      withTiming(
        event,
        wrapStep(event.positionTicks / PATTERN_TICKS_PER_STEP + offset, length),
        durationSteps(event, length),
      ),
    ),
    length,
  );
}

/** Extend each monophonic note to the next note or to the part end. */
export function legatoPatternEvents(
  events: readonly PatternEvent[],
  options: PatternTransformOptions,
): readonly PatternEvent[] {
  const length = requirePartLength(options.length);
  if (events.length === 0 || events[0]?.type !== "note") return finalizeEvents(events, length);
  const notes = events
    .filter((event): event is Extract<PatternEvent, { readonly type: "note" }> => event.type === "note")
    .sort(compareEvents);

  return finalizeEvents(
    notes.map((event, index) => {
      const next = notes[index + 1];
      const end = next === undefined ? length : next.positionTicks / PATTERN_TICKS_PER_STEP;
      return withTiming(event, event.positionTicks / PATTERN_TICKS_PER_STEP, end - event.positionTicks / PATTERN_TICKS_PER_STEP);
    }),
    length,
  );
}

/** Map an event list between valid part lengths without sub-grid timing. */
export function stretchPatternEvents(
  events: readonly PatternEvent[],
  options: StretchPatternOptions,
): readonly PatternEvent[] {
  const sourceLength = requirePartLength(options.sourceLength);
  const targetLength = requirePartLength(options.targetLength);
  return finalizeEvents(
    events.flatMap((event) => {
      const position = Math.floor((event.positionTicks / PATTERN_TICKS_PER_STEP * targetLength) / sourceLength);
      if (position >= targetLength) return [];
      const duration = Math.max(1, Math.floor((durationSteps(event, sourceLength) * targetLength) / sourceLength));
      return [withTiming(event, position, duration)];
    }),
    targetLength,
  );
}

function triggerData(
  note: number,
  data: Partial<Omit<PatternEventData, "note">> | undefined,
): PatternEventData {
  return {
    note,
    velocity: clampNumber(data?.velocity ?? 0.8, 0, 1),
    accent: data?.accent ?? false,
    slide: data?.slide ?? false,
    probability: clampNumber(data?.probability ?? 1, 0, 1),
    microTimingTicks: clampInteger(
      data?.microTimingTicks ?? 0,
      -MAXIMUM_MICRO_TIMING_TICKS,
      MAXIMUM_MICRO_TIMING_TICKS,
    ),
    flam: clampInteger(data?.flam ?? 0, 0, MAXIMUM_FLAM),
    roll: clampInteger(data?.roll ?? 0, 0, MAXIMUM_ROLL),
  };
}

function randomizeData(
  data: PatternEventData,
  strength: number,
  random: PatternTransformRandom,
): PatternEventData {
  return {
    note: data.note,
    velocity: blend(data.velocity, unitRandom(random), strength),
    accent: selectBoolean(data.accent, random, strength),
    slide: selectBoolean(data.slide, random, strength),
    probability: blend(data.probability, unitRandom(random), strength),
    microTimingTicks: clampInteger(
      Math.round(blend(data.microTimingTicks, signedRandom(random) * MAXIMUM_MICRO_TIMING_TICKS, strength)),
      -MAXIMUM_MICRO_TIMING_TICKS,
      MAXIMUM_MICRO_TIMING_TICKS,
    ),
    flam: clampInteger(
      Math.round(blend(data.flam, unitRandom(random) * MAXIMUM_FLAM, strength)),
      0,
      MAXIMUM_FLAM,
    ),
    roll: clampInteger(
      Math.round(blend(data.roll, unitRandom(random) * MAXIMUM_ROLL, strength)),
      0,
      MAXIMUM_ROLL,
    ),
  };
}

function selectBoolean(
  current: boolean,
  random: PatternTransformRandom,
  strength: number,
): boolean {
  const candidate = unitRandom(random) >= 0.5;
  return unitRandom(random) < strength ? candidate : current;
}

function finalizeEvents(events: readonly PatternEvent[], length: number): readonly PatternEvent[] {
  const uniqueEvents = new Map<NoteEventId, PatternEvent>();
  for (const event of events) {
    if (uniqueEvents.has(event.id)) continue;
    uniqueEvents.set(event.id, normalizeEvent(event, length));
  }
  const normalized = [...uniqueEvents.values()].sort(compareEvents);
  const type = normalized[0]?.type;
  if (type === undefined) return EMPTY_EVENTS;
  return type === "trigger"
    ? freezeEvents(normalizeTriggers(normalized, length))
    : freezeEvents(normalizeNotes(normalized, length));
}

function normalizeEvent(event: PatternEvent, length: number): PatternEvent {
  const position = clampInteger(
    Math.round(event.positionTicks / PATTERN_TICKS_PER_STEP),
    0,
    length - 1,
  );
  if (event.type === "trigger") {
    return { ...event, positionTicks: position * PATTERN_TICKS_PER_STEP, data: { ...event.data } };
  }
  const duration = Math.min(durationSteps(event, length), length - position);
  return {
    ...event,
    positionTicks: position * PATTERN_TICKS_PER_STEP,
    durationTicks: Math.max(1, duration) * PATTERN_TICKS_PER_STEP,
    data: { ...event.data },
  };
}

function normalizeTriggers(events: readonly PatternEvent[], length: number): readonly PatternEvent[] {
  const occupied = new Set<string>();
  const triggers: PatternEvent[] = [];
  for (const event of events) {
    if (event.type !== "trigger") continue;
    const key = `${String(event.positionTicks)}:${String(event.data.note)}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    triggers.push(normalizeEvent(event, length));
  }
  return triggers;
}

function normalizeNotes(events: readonly PatternEvent[], length: number): readonly PatternEvent[] {
  const notes: Extract<PatternEvent, { readonly type: "note" }>[] = [];
  for (const event of events) {
    if (event.type !== "note") continue;
    const current = normalizeEvent(event, length);
    if (current.type !== "note") continue;
    const previous = notes.at(-1);
    if (previous !== undefined && previous.positionTicks + previous.durationTicks > current.positionTicks) {
      const availableTicks = current.positionTicks - previous.positionTicks;
      if (availableTicks < PATTERN_TICKS_PER_STEP) continue;
      notes[notes.length - 1] = {
        ...previous,
        durationTicks: availableTicks,
        data: { ...previous.data },
      };
    }
    notes.push(current);
  }
  return notes;
}

function withData(event: PatternEvent, data: PatternEventData): PatternEvent {
  if (event.type === "trigger") return { ...event, data };
  return { ...event, data };
}

function withTiming(event: PatternEvent, positionSteps: number, duration: number): PatternEvent {
  const positionTicks = positionSteps * PATTERN_TICKS_PER_STEP;
  if (event.type === "trigger") return { ...event, positionTicks, data: { ...event.data } };
  return {
    ...event,
    positionTicks,
    durationTicks: Math.max(1, duration) * PATTERN_TICKS_PER_STEP,
    data: { ...event.data },
  };
}

function freezeEvents(events: readonly PatternEvent[]): readonly PatternEvent[] {
  return Object.freeze(events.map(freezeEvent));
}

function freezeEvent(event: PatternEvent): PatternEvent {
  if (event.type === "trigger") {
    return Object.freeze({ ...event, data: Object.freeze({ ...event.data }) });
  }
  return Object.freeze({ ...event, data: Object.freeze({ ...event.data }) });
}

function durationSteps(event: PatternEvent, length: number): number {
  if (event.type !== "note") return 1;
  return clampInteger(Math.round(event.durationTicks / PATTERN_TICKS_PER_STEP), 1, length);
}

function sourcePitchMidpoint(events: readonly PatternEvent[]): number {
  if (events.length === 0) return 60;
  let minimum = 127;
  let maximum = 0;
  for (const event of events) {
    minimum = Math.min(minimum, event.data.note);
    maximum = Math.max(maximum, event.data.note);
  }
  return Math.round((minimum + maximum) / 2);
}

function nextUniqueId(
  ids: Set<NoteEventId>,
  idFactory: PatternEventIdFactory,
  length: number,
): NoteEventId {
  const maximumAttempts = Math.max(32, ids.size + length + 1);
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const candidate = idFactory();
    if (ids.has(candidate)) continue;
    ids.add(candidate);
    return candidate;
  }
  throw new RangeError("The event ID factory did not supply a unique ID.");
}

function isEuclideanHit(step: number, cycleLength: number, pulses: number): boolean {
  return pulses > 0 && (step * pulses) % cycleLength < pulses;
}

function compareEvents(left: PatternEvent, right: PatternEvent): number {
  return left.positionTicks - right.positionTicks || left.data.note - right.data.note || left.id.localeCompare(right.id);
}

function requirePartLength(length: number): number {
  if (!Number.isSafeInteger(length) || length < MINIMUM_PART_LENGTH || length > MAXIMUM_PART_LENGTH) {
    throw new RangeError("The Pattern part length must be a whole number from 1 through 64.");
  }
  return length;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.round(clampNumber(value, minimum, maximum));
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function unitAmount(value: number): number {
  return clampNumber(value, 0, 1);
}

function unitRandom(random: PatternTransformRandom): number {
  return unitAmount(random());
}

function signedRandom(random: PatternTransformRandom): number {
  return unitRandom(random) * 2 - 1;
}

function blend(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}

function toInteger(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function wrapStep(step: number, length: number): number {
  const result = toInteger(step) % length;
  return result < 0 ? result + length : result;
}
