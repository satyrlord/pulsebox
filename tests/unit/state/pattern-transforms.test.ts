import { describe, expect, it } from "vitest";

import type { NoteEventId } from "../../../src/contracts/ids";
import {
  doubleTimePatternEvents,
  generateEuclideanTriggers,
  halfTimePatternEvents,
  humanizePatternEvents,
  invertPatternEvents,
  legatoPatternEvents,
  randomizePatternEvents,
  reversePatternEvents,
  shiftPatternEvents,
  stretchPatternEvents,
  transposePatternEvents,
  varyPatternEvents,
  type PatternTransformRandom,
} from "../../../src/state/pattern-transforms";
import { PATTERN_TICKS_PER_STEP, type PatternEvent } from "../../../src/state/model";

const LENGTH = 16;

function id(value: number): NoteEventId {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}` as NoteEventId;
}

function trigger(
  identifier: number,
  step: number,
  note: number,
  overrides: Partial<PatternEvent["data"]> = {},
): PatternEvent {
  return {
    id: id(identifier),
    type: "trigger",
    positionTicks: step * PATTERN_TICKS_PER_STEP,
    data: {
      note,
      velocity: 0.8,
      accent: false,
      slide: false,
      probability: 1,
      microTimingTicks: 0,
      flam: 0,
      roll: 0,
      ...overrides,
    },
  };
}

function note(
  identifier: number,
  step: number,
  duration: number,
  pitch: number,
  overrides: Partial<PatternEvent["data"]> = {},
): PatternEvent {
  return {
    id: id(identifier),
    type: "note",
    positionTicks: step * PATTERN_TICKS_PER_STEP,
    durationTicks: duration * PATTERN_TICKS_PER_STEP,
    data: {
      note: pitch,
      velocity: 0.8,
      accent: false,
      slide: false,
      probability: 1,
      microTimingTicks: 0,
      flam: 0,
      roll: 0,
      ...overrides,
    },
  };
}

function randomValues(values: readonly number[]): PatternTransformRandom {
  let index = 0;
  return () => values[index++ % values.length] ?? 0.5;
}

function assertValid(events: readonly PatternEvent[], length: number): void {
  expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  expect(events.every((event) => event.positionTicks % PATTERN_TICKS_PER_STEP === 0)).toBe(true);
  expect(events.every((event) => event.positionTicks >= 0)).toBe(true);
  expect(events.every((event) => event.positionTicks < length * PATTERN_TICKS_PER_STEP)).toBe(true);
  expect(events.every((event) => event.data.note >= 0 && event.data.note <= 127)).toBe(true);
  expect(events.every((event) => event.data.velocity >= 0 && event.data.velocity <= 1)).toBe(true);
  expect(events.every((event) => event.data.probability >= 0 && event.data.probability <= 1)).toBe(true);
  expect(events.every((event) => Math.abs(event.data.microTimingTicks) <= 60)).toBe(true);
  expect(events.every((event) => event.data.flam >= 0 && event.data.flam <= 3)).toBe(true);
  expect(events.every((event) => event.data.roll >= 0 && event.data.roll <= 7)).toBe(true);

  const seenTriggers = new Set<string>();
  for (const event of events) {
    if (event.type === "trigger") {
      const key = `${String(event.positionTicks)}:${String(event.data.note)}`;
      expect(seenTriggers.has(key)).toBe(false);
      seenTriggers.add(key);
      continue;
    }
    expect(event.durationTicks % PATTERN_TICKS_PER_STEP).toBe(0);
    expect(event.positionTicks + event.durationTicks).toBeLessThanOrEqual(
      length * PATTERN_TICKS_PER_STEP,
    );
  }

  const notes = events.filter((event): event is Extract<PatternEvent, { type: "note" }> => event.type === "note");
  for (let index = 1; index < notes.length; index += 1) {
    const previous = notes[index - 1];
    const current = notes[index];
    expect(previous).toBeDefined();
    expect(current).toBeDefined();
    if (previous === undefined || current === undefined) continue;
    expect(previous.positionTicks + previous.durationTicks).toBeLessThanOrEqual(current.positionTicks);
  }
}

describe("generateEuclideanTriggers", () => {
  it("replaces only the selected voice with deterministic, unique grid triggers", () => {
    const source = [trigger(1, 0, 36), trigger(2, 1, 40)];
    const before = structuredClone(source);
    const candidates = [id(2), id(3), id(4), id(5), id(6), id(7), id(8)];
    const result = generateEuclideanTriggers(source, {
      length: LENGTH,
      note: 36,
      pulses: 3,
      cycleLength: 8,
      idFactory: () => candidates.shift() ?? id(99),
      data: { velocity: 0.6, probability: 0.4, microTimingTicks: -20, flam: 2, roll: 4 },
    });

    expect(result.filter((event) => event.data.note === 36).map((event) => event.positionTicks)).toEqual([
      0,
      3 * PATTERN_TICKS_PER_STEP,
      6 * PATTERN_TICKS_PER_STEP,
      8 * PATTERN_TICKS_PER_STEP,
      11 * PATTERN_TICKS_PER_STEP,
      14 * PATTERN_TICKS_PER_STEP,
    ]);
    expect(result.find((event) => event.data.note === 40)).toEqual(source[1]);
    expect(result.filter((event) => event.data.note === 36).every((event) => event.data.flam === 2)).toBe(true);
    expect(result.filter((event) => event.data.note === 36).every((event) => event.data.roll === 4)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0]?.data)).toBe(true);
    expect(source).toEqual(before);
    assertValid(result, LENGTH);
  });
});

describe("Pattern generators", () => {
  it("uses injected values for bounded deterministic randomize, humanize, and variation", () => {
    const source = [trigger(1, 0, 36, { velocity: 0.99, probability: 0.01, microTimingTicks: 55, flam: 3, roll: 7 })];
    const before = structuredClone(source);
    const randomized = randomizePatternEvents(source, {
      length: LENGTH,
      strength: 1,
      random: randomValues([1, 1, 1, 1, 1, 1, 1, 1]),
    });
    const repeated = randomizePatternEvents(source, {
      length: LENGTH,
      strength: 1,
      random: randomValues([1, 1, 1, 1, 1, 1, 1, 1]),
    });
    const humanized = humanizePatternEvents(source, {
      length: LENGTH,
      timingStrength: 1,
      velocityStrength: 1,
      random: randomValues([1, 1]),
    });
    const varied = varyPatternEvents(source, {
      length: LENGTH,
      similarity: 0,
      random: randomValues([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    });
    const identicalVariation = varyPatternEvents(source, {
      length: LENGTH,
      similarity: 1,
      random: randomValues([0]),
    });

    expect(randomized).toEqual(repeated);
    expect(randomized[0]?.data).toMatchObject({ velocity: 1, probability: 1, flam: 3, roll: 7 });
    expect(humanized[0]?.data).toMatchObject({ velocity: 1, microTimingTicks: 60, flam: 3, roll: 7 });
    expect(varied[0]?.positionTicks).toBe(4 * PATTERN_TICKS_PER_STEP);
    expect(identicalVariation).toEqual(source);
    expect(identicalVariation).not.toBe(source);
    expect(identicalVariation[0]).not.toBe(source[0]);
    expect(source).toEqual(before);
    assertValid(randomized, LENGTH);
    assertValid(humanized, LENGTH);
    assertValid(varied, LENGTH);
  });
});

describe("Pattern transforms", () => {
  it("reverses, inverts, transposes, shifts, legatos, and stretches notes on the fixed grid", () => {
    const source = [note(1, 0, 2, 60), note(2, 4, 2, 64), note(3, 8, 4, 67)];
    const before = structuredClone(source);
    const reversed = reversePatternEvents(source, { length: LENGTH });
    const inverted = invertPatternEvents(source, { length: LENGTH, pivot: 64 });
    const transposed = transposePatternEvents(source, { length: LENGTH, semitones: 80 });
    const shifted = shiftPatternEvents(source, { length: LENGTH, steps: -2 });
    const legato = legatoPatternEvents(source, { length: LENGTH });
    const stretched = stretchPatternEvents(source, { sourceLength: LENGTH, targetLength: 8 });

    expect(reversed.map((event) => [event.positionTicks / PATTERN_TICKS_PER_STEP, event.data.note])).toEqual([
      [4, 67],
      [10, 64],
      [14, 60],
    ]);
    expect(inverted.map((event) => event.data.note)).toEqual([68, 64, 61]);
    expect(transposed.map((event) => event.data.note)).toEqual([127, 127, 127]);
    expect(shifted.map((event) => event.positionTicks / PATTERN_TICKS_PER_STEP)).toEqual([2, 6, 14]);
    expect(legato.map((event) => event.type === "note" ? event.durationTicks / PATTERN_TICKS_PER_STEP : 0)).toEqual([4, 4, 8]);
    expect(stretched.map((event) => [event.positionTicks / PATTERN_TICKS_PER_STEP, event.type === "note" ? event.durationTicks / PATTERN_TICKS_PER_STEP : 0])).toEqual([
      [0, 1],
      [2, 1],
      [4, 2],
    ]);
    expect(source).toEqual(before);
    for (const result of [reversed, inverted, transposed, shifted, legato]) assertValid(result, LENGTH);
    assertValid(stretched, 8);
  });

  it("coalesces transform collisions and omits half-time events that do not fit", () => {
    const source = [trigger(1, 0, 36), trigger(2, 1, 36), trigger(3, 9, 40)];
    const doubled = doubleTimePatternEvents(source, { length: LENGTH });
    const halved = halfTimePatternEvents(source, { length: LENGTH });

    expect(doubled.filter((event) => event.data.note === 36)).toHaveLength(1);
    expect(halved.map((event) => event.positionTicks / PATTERN_TICKS_PER_STEP)).toEqual([0, 2]);
    assertValid(doubled, LENGTH);
    assertValid(halved, LENGTH);
  });
});
