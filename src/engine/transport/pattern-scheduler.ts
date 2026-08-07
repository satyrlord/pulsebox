import {
  compareScheduledVoiceEvents,
  SCHEDULED_EVENT_QUEUE_CAPACITY,
  type PatternAutomationStepView,
  type PatternEventView,
  type PatternPartView,
  type ScheduledParameterChange,
  type ScheduledVoiceEvent,
} from "./scheduled-event";

/** One fixed Piano Roll grid step at 960 ticks per quarter note. */
const PATTERN_STEP_TICKS = 240;

/** All events that begin at one resolved Pattern step. */
export interface ResolvedStep {
  readonly events: readonly PatternEventView[];
  readonly automationSteps?: readonly PatternAutomationStepView[];
  readonly patternIndex: number;
  /** Position inside the source Pattern, used for deterministic Humanize. */
  readonly stepInPattern: number;
}

/** Resolves an absolute transport step to all events at that Pattern position. */
export type StepResolver = (absoluteStep: number) => ResolvedStep | undefined;

/** Pattern-owned deterministic timing, mirrored from the state layer. */
export interface PatternTiming {
  /** 0 is mechanical; 1 is the maximum deterministic variation. */
  readonly humanize: number;
  /** Stored Pattern seed. The same seed always produces the same playback. */
  readonly seed: number;
}

export interface PatternWindowRequest {
  readonly resolveStep: StepResolver;
  /** Exact frames per fixed sixteenth. */
  readonly stepFrames: number;
  /** 0 is straight; 1 delays every odd step to a 2:1 triplet feel. */
  readonly swing: number;
  readonly patternTiming?: readonly PatternTiming[];
  /** Stable per-module salt for independent Humanize. */
  readonly voiceSalt?: number;
  readonly windowStartFrame: number;
  readonly windowEndFrame: number;
  readonly patternStartFrame: number;
  /** Fraction of one step used for a trigger release. */
  readonly gateRatio?: number;
  readonly maximumEvents?: number;
  readonly minimumStepExclusive?: number;
}

const DEFAULT_GATE_RATIO = 0.82;
const DEFAULT_MAXIMUM_EVENTS = SCHEDULED_EVENT_QUEUE_CAPACITY;
const MAXIMUM_SWING_FRACTION = 1 / 3;
const MAXIMUM_HUMANIZE_FRACTION = 0.25;
const MAXIMUM_VELOCITY_FRACTION = 0.25;
const MAXIMUM_PATTERN_STEPS = 64;
const MAXIMUM_MICRO_TIMING_TICKS = PATTERN_STEP_TICKS / 4;
const MAXIMUM_FLAM_COUNT = 3;
const MAXIMUM_ROLL_COUNT = 7;
const FLAM_WINDOW_FRACTION = 1 / 8;

function eventBuckets(part: PatternPartView): ReadonlyMap<number, readonly PatternEventView[]> {
  const mutable = new Map<number, PatternEventView[]>();
  for (const event of part.events) {
    const bucket = mutable.get(event.positionTicks);
    if (bucket === undefined) mutable.set(event.positionTicks, [event]);
    else bucket.push(event);
  }
  return mutable;
}

function validCycleLength(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function eventsAtPatternStep(
  part: PatternPartView,
  buckets: ReadonlyMap<number, readonly PatternEventView[]>,
  patternStep: number,
): readonly PatternEventView[] {
  const overrides = part.voiceCycleLengths;
  const partStep = patternStep % part.length;
  const direct = (buckets.get(partStep * PATTERN_STEP_TICKS) ?? []).filter(
    (event) => validCycleLength(overrides?.[String(event.data.note)], part.length) === part.length,
  );
  if (overrides === undefined) return direct;
  // Resolve an overridden voice against the unwrapped Pattern position. This
  // lets a 32-step voice run independently inside a 16-step module part.
  const included = new Map(direct.map((event) => [event.id, event]));
  for (const event of part.events) {
    const voiceCycle = validCycleLength(overrides[String(event.data.note)], part.length);
    if (voiceCycle === part.length) continue;
    const eventStep = Math.floor(event.positionTicks / PATTERN_STEP_TICKS);
    if (patternStep % voiceCycle === eventStep % voiceCycle) included.set(event.id, event);
  }
  return [...included.values()];
}

function automationBuckets(
  part: PatternPartView,
): ReadonlyMap<number, readonly PatternAutomationStepView[]> {
  const mutable = new Map<number, PatternAutomationStepView[]>();
  for (const step of part.automationSteps ?? []) {
    const bucket = mutable.get(step.positionTicks);
    if (bucket === undefined) mutable.set(step.positionTicks, [step]);
    else bucket.push(step);
  }
  return mutable;
}

export function loopingStepResolver(
  part: PatternPartView,
  patternIndex = 0,
): StepResolver {
  if (!Number.isSafeInteger(part.length) || part.length <= 0) return () => undefined;
  const eventsByPosition = eventBuckets(part);
  const automationByPosition = automationBuckets(part);
  const duration = validCycleLength(part.durationSteps, part.length);
  return (absoluteStep) => {
    if (!Number.isSafeInteger(absoluteStep) || absoluteStep < 0) return undefined;
    const stepInPattern = absoluteStep % duration;
    const partStep = stepInPattern % part.length;
    return {
      events: eventsAtPatternStep(part, eventsByPosition, absoluteStep),
      automationSteps: automationByPosition.get(partStep * PATTERN_STEP_TICKS) ?? [],
      patternIndex,
      stepInPattern,
    };
  };
}

/** Plays each part in order, then repeats the whole chain. */
export function chainedStepResolver(
  patterns: readonly {
    readonly part: PatternPartView;
    readonly patternIndex: number;
    readonly repeats?: number;
  }[],
): StepResolver {
  const playable = patterns.filter((pattern) => pattern.part.length > 0);
  const total = playable.reduce(
    (sum, pattern) =>
      sum +
      validCycleLength(pattern.part.durationSteps, pattern.part.length) *
        Math.max(1, pattern.repeats ?? 1),
    0,
  );
  if (total === 0) return () => undefined;
  const buckets = playable.map((pattern) => eventBuckets(pattern.part));
  const automation = playable.map((pattern) => automationBuckets(pattern.part));
  return (absoluteStep) => {
    if (!Number.isSafeInteger(absoluteStep) || absoluteStep < 0) return undefined;
    let offset = absoluteStep % total;
    for (let index = 0; index < playable.length; index += 1) {
      const pattern = playable[index];
      if (pattern === undefined) continue;
      const duration = validCycleLength(pattern.part.durationSteps, pattern.part.length);
      const placementDuration = duration * Math.max(1, pattern.repeats ?? 1);
      if (offset < placementDuration) {
        const stepInPattern = offset % duration;
        const stepInPart = stepInPattern % pattern.part.length;
        return {
          events: eventsAtPatternStep(pattern.part, buckets[index] ?? new Map(), offset),
          automationSteps:
            automation[index]?.get(stepInPart * PATTERN_STEP_TICKS) ?? [],
          patternIndex: pattern.patternIndex,
          stepInPattern,
        };
      }
      offset -= placementDuration;
    }
    return undefined;
  };
}

function swingFramesFor(stepFrames: number, swing: number): number {
  if (!Number.isFinite(swing) || swing <= 0) return 0;
  return Math.round(Math.min(1, swing) * stepFrames * MAXIMUM_SWING_FRACTION);
}

function humanizeUnit(seed: number, stepInPattern: number, salt: number): number {
  let hash =
    ((seed | 0) ^ Math.imul(stepInPattern + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) | 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x80000000 - 1;
}

function clampHumanize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

interface OnsetContext {
  readonly resolveStep: StepResolver;
  readonly stepFrames: number;
  readonly swingFrames: number;
  readonly patternStartFrame: number;
  readonly patternTiming: readonly PatternTiming[] | undefined;
  readonly voiceSalt: number;
}

const TIMING_SALT = 0;
const VELOCITY_SALT = 1;
const PROBABILITY_SALT = 2;

function eventSalt(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(index)) | 0;
  }
  return hash;
}

function probabilityFor(event: PatternEventView): number {
  const probability = event.data.probability;
  if (probability === undefined || !Number.isFinite(probability)) return 1;
  return Math.min(1, Math.max(0, probability));
}

function boundedCount(value: number | undefined, maximum: number): number {
  if (value === undefined || !Number.isSafeInteger(value)) return 0;
  return Math.min(maximum, Math.max(0, value));
}

function microTimingTicksFor(event: PatternEventView): number {
  const offset = event.data.microTimingTicks;
  if (offset === undefined || !Number.isSafeInteger(offset)) return 0;
  return Math.min(MAXIMUM_MICRO_TIMING_TICKS, Math.max(-MAXIMUM_MICRO_TIMING_TICKS, offset));
}

function onsetFrame(context: OnsetContext, absoluteStep: number): number {
  const swung = absoluteStep % 2 === 1 ? context.swingFrames : 0;
  const base = context.patternStartFrame + Math.round(absoluteStep * context.stepFrames) + swung;
  const resolved = context.resolveStep(absoluteStep);
  if (resolved === undefined) return base;
  const timing = context.patternTiming?.[resolved.patternIndex];
  const humanize = clampHumanize(timing?.humanize);
  if (humanize === 0 || timing === undefined) return base;
  const unit = humanizeUnit(
    timing.seed,
    resolved.stepInPattern,
    context.voiceSalt * 2 + TIMING_SALT,
  );
  return base + Math.round(unit * humanize * MAXIMUM_HUMANIZE_FRACTION * context.stepFrames);
}

function eventOnsetFrame(
  context: OnsetContext,
  event: PatternEventView,
  absoluteStep: number,
): number {
  return (
    onsetFrame(context, absoluteStep) +
    Math.round((microTimingTicksFor(event) / PATTERN_STEP_TICKS) * context.stepFrames)
  );
}

function earliestEventOnsetFrame(
  context: OnsetContext,
  events: readonly PatternEventView[],
  absoluteStep: number,
): number {
  return events.reduce(
    (earliest, event) => Math.min(earliest, eventOnsetFrame(context, event, absoluteStep)),
    Number.POSITIVE_INFINITY,
  );
}

function playsEvent(
  context: OnsetContext,
  resolved: ResolvedStep,
  event: PatternEventView,
): boolean {
  const probability = probabilityFor(event);
  if (probability <= 0) return false;
  if (probability >= 1) return true;
  const seed = context.patternTiming?.[resolved.patternIndex]?.seed ?? 0;
  const unit = (humanizeUnit(seed, resolved.stepInPattern, context.voiceSalt * 3 + PROBABILITY_SALT + eventSalt(event.id)) + 1) / 2;
  return unit < probability;
}

function playedEvents(
  context: OnsetContext,
  resolved: ResolvedStep,
): readonly PatternEventView[] {
  return resolved.events.filter((event) => playsEvent(context, resolved, event));
}

function humanizedVelocity(
  context: OnsetContext,
  resolved: ResolvedStep,
  event: PatternEventView,
): number {
  const timing = context.patternTiming?.[resolved.patternIndex];
  const humanize = clampHumanize(timing?.humanize);
  if (humanize === 0 || timing === undefined) return event.data.velocity;
  const unit = humanizeUnit(
    timing.seed,
    resolved.stepInPattern,
    context.voiceSalt * 2 + VELOCITY_SALT,
  );
  const scaled = event.data.velocity * (1 + unit * humanize * MAXIMUM_VELOCITY_FRACTION);
  return Math.min(1, Math.max(0, scaled));
}

function durationStepsFor(event: PatternEventView): number {
  if (event.type !== "note") return 1;
  const duration = event.durationTicks ?? PATTERN_STEP_TICKS;
  return Math.max(1, Math.round(duration / PATTERN_STEP_TICKS));
}

function adjacentSlidNote(
  context: OnsetContext,
  event: PatternEventView,
  absoluteStep: number,
): { readonly event: PatternEventView; readonly absoluteStep: number } | undefined {
  if (event.type !== "note" || event.durationTicks === undefined) return undefined;
  const durationSteps = event.durationTicks / PATTERN_STEP_TICKS;
  if (!Number.isSafeInteger(durationSteps) || durationSteps <= 0) return undefined;
  const nextAbsoluteStep = absoluteStep + durationSteps;
  const resolved = context.resolveStep(nextAbsoluteStep);
  const next = resolved === undefined
    ? undefined
    : playedEvents(context, resolved).find(
        (candidate) => candidate.type === "note" && candidate.data.slide,
      );
  return next === undefined ? undefined : { event: next, absoluteStep: nextAbsoluteStep };
}

function releaseFrameFor(
  context: OnsetContext,
  event: PatternEventView,
  absoluteStep: number,
  onset: number,
  triggerGateFrames: number,
): number | undefined {
  if (event.type === "trigger") return onset + triggerGateFrames;
  if (adjacentSlidNote(context, event, absoluteStep) !== undefined) return undefined;
  const durationSteps = durationStepsFor(event);
  const nominalRelease = onset + Math.max(1, Math.round(durationSteps * context.stepFrames));
  const endStep = absoluteStep + durationSteps;
  const end = context.resolveStep(endStep);
  if (end === undefined) return nominalRelease;
  const sounding = playedEvents(context, end);
  if (sounding.length === 0) return nominalRelease;
  return Math.max(
    onset + 1,
    Math.min(nominalRelease, earliestEventOnsetFrame(context, sounding, endStep) - 1),
  );
}

function terminalReleaseFor(
  context: OnsetContext,
  event: PatternEventView,
  absoluteStep: number,
  onset: number,
  triggerGateFrames: number,
  latestStartedFrame: number,
): { readonly frame: number; readonly note: number } | undefined {
  let currentEvent = event;
  let currentStep = absoluteStep;
  let currentOnset = onset;
  for (let traversed = 0; traversed < DEFAULT_MAXIMUM_EVENTS; traversed += 1) {
    const release = releaseFrameFor(
      context,
      currentEvent,
      currentStep,
      currentOnset,
      triggerGateFrames,
    );
    if (release !== undefined) return { frame: release, note: currentEvent.data.note };
    const next = adjacentSlidNote(context, currentEvent, currentStep);
    if (next === undefined) return undefined;
    const nextOnset = eventOnsetFrame(context, next.event, next.absoluteStep);
    if (nextOnset > latestStartedFrame) return undefined;
    currentEvent = next.event;
    currentStep = next.absoluteStep;
    currentOnset = nextOnset;
  }
  return undefined;
}

interface ScheduledOnset {
  readonly event: PatternEventView;
  readonly atFrame: number;
  readonly occurrenceId: string;
}

function expandedOnsets(
  event: PatternEventView,
  onset: number,
  stepFrames: number,
  absoluteStep: number,
): readonly ScheduledOnset[] {
  if (event.type !== "trigger") {
    return [{ event, atFrame: onset, occurrenceId: `${event.id}:${String(absoluteStep)}:main` }];
  }
  const flam = boundedCount(event.data.flam, MAXIMUM_FLAM_COUNT);
  const roll = boundedCount(event.data.roll, MAXIMUM_ROLL_COUNT);
  const flamSpacing = Math.max(
    1,
    Math.floor((stepFrames * FLAM_WINDOW_FRACTION) / (flam + 1)),
  );
  const rollSpacing = Math.max(1, Math.floor(stepFrames / (roll + 1)));
  return [
    ...Array.from({ length: flam }, (_, index) => ({
      event,
      atFrame: onset - (flam - index) * flamSpacing,
      occurrenceId: `${event.id}:${String(absoluteStep)}:flam:${String(index)}`,
    })),
    { event, atFrame: onset, occurrenceId: `${event.id}:${String(absoluteStep)}:main` },
    ...Array.from({ length: roll }, (_, index) => ({
      event,
      atFrame: onset + (index + 1) * rollSpacing,
      occurrenceId: `${event.id}:${String(absoluteStep)}:roll:${String(index)}`,
    })),
  ];
}

function nextTriggerOnsetFrame(
  context: OnsetContext,
  event: PatternEventView,
  absoluteStep: number,
  onset: number,
  stepFrames: number,
): number | undefined {
  let earliest = Number.POSITIVE_INFINITY;
  for (let step = absoluteStep; step <= absoluteStep + 1; step += 1) {
    const resolved = context.resolveStep(step);
    if (resolved === undefined) continue;
    for (const candidate of resolved.events) {
      if (
        candidate.type !== "trigger" ||
        candidate.data.note !== event.data.note ||
        !playsEvent(context, resolved, candidate)
      ) {
        continue;
      }
      for (const candidateOnset of expandedOnsets(
        candidate,
        eventOnsetFrame(context, candidate, step),
        stepFrames,
        step,
      )) {
        if (candidateOnset.atFrame > onset) earliest = Math.min(earliest, candidateOnset.atFrame);
      }
    }
  }
  return Number.isFinite(earliest) ? earliest : undefined;
}

/** Emits each persisted event whose onset lands in the requested frame window. */
export function schedulePatternWindow(
  request: PatternWindowRequest,
): readonly ScheduledVoiceEvent[] {
  const {
    resolveStep,
    stepFrames,
    swing,
    patternTiming,
    voiceSalt = 0,
    windowStartFrame,
    windowEndFrame,
    patternStartFrame,
    gateRatio = DEFAULT_GATE_RATIO,
    maximumEvents = DEFAULT_MAXIMUM_EVENTS,
    minimumStepExclusive,
  } = request;

  if (!Number.isFinite(stepFrames) || stepFrames <= 0) return [];
  if (windowStartFrame >= windowEndFrame) return [];

  const triggerGateFrames = Math.max(1, Math.floor(stepFrames * gateRatio));
  const context: OnsetContext = {
    resolveStep,
    stepFrames,
    swingFrames: swingFramesFor(stepFrames, swing),
    patternStartFrame,
    patternTiming,
    voiceSalt: voiceSalt | 0,
  };
  const firstIndex = Math.max(
    0,
    Math.floor((windowStartFrame - patternStartFrame) / stepFrames) - 2,
  );
  const lastIndex = Math.ceil((windowEndFrame - patternStartFrame) / stepFrames) + 2;

  const events: ScheduledVoiceEvent[] = [];
  for (let absoluteStep = firstIndex; absoluteStep < lastIndex; absoluteStep += 1) {
    if (minimumStepExclusive !== undefined && absoluteStep <= minimumStepExclusive) continue;
    const resolved = resolveStep(absoluteStep);
    if (resolved === undefined || resolved.events.length === 0) continue;
    const candidateOnsets = resolved.events.flatMap((event) => {
      if (!playsEvent(context, resolved, event)) return [];
      return expandedOnsets(
        event,
        eventOnsetFrame(context, event, absoluteStep),
        stepFrames,
        absoluteStep,
      );
    });
    const onsets = candidateOnsets.filter(
      ({ atFrame }) => atFrame >= windowStartFrame && atFrame < windowEndFrame,
    );
    if (onsets.length === 0) continue;
    const releases = onsets.map(({ event, atFrame }) => {
      if (event.type !== "trigger") {
        return releaseFrameFor(context, event, absoluteStep, atFrame, triggerGateFrames);
      }
      const nextRetrigger = nextTriggerOnsetFrame(
        context,
        event,
        absoluteStep,
        atFrame,
        stepFrames,
      );
      return nextRetrigger === undefined
        ? atFrame + triggerGateFrames
        : Math.max(atFrame + 1, Math.min(atFrame + triggerGateFrames, nextRetrigger - 1));
    });
    const requiredEvents = onsets.length + releases.filter((release) => release !== undefined).length;
    // Keep all simultaneous triggers together. A note that leads into a Slide
    // has no release in this group because its adjacent note keeps the gate open.
    if (events.length + requiredEvents > maximumEvents) {
      if (request.maximumEvents !== undefined) break;
      throw new RangeError("The Pattern window exceeds the bounded event queue capacity.");
    }

    for (let index = 0; index < onsets.length; index += 1) {
      const onset = onsets[index];
      if (onset === undefined) continue;
      const { event, atFrame, occurrenceId } = onset;
      events.push({
        atFrame,
        type: "note-on",
        sourceStep: absoluteStep,
        occurrenceId,
        note: event.data.note,
        velocity: humanizedVelocity(context, resolved, event),
        accent: event.data.accent,
        slide: event.data.slide,
      });
      const release = releases[index];
      if (release !== undefined) {
        events.push({
          atFrame: release,
          type: "note-off",
          occurrenceId,
          note: event.data.note,
        });
      }
    }
  }

  return events.sort(compareScheduledVoiceEvents);
}

/** Emits each module automation step whose frame lands in the requested window. */
export function schedulePatternAutomationWindow(
  request: PatternWindowRequest,
): readonly ScheduledParameterChange[] {
  const {
    resolveStep,
    stepFrames,
    swing,
    patternTiming,
    voiceSalt = 0,
    windowStartFrame,
    windowEndFrame,
    patternStartFrame,
    minimumStepExclusive,
  } = request;
  if (!Number.isFinite(stepFrames) || stepFrames <= 0) return [];
  if (windowStartFrame >= windowEndFrame) return [];
  const context: OnsetContext = {
    resolveStep,
    stepFrames,
    swingFrames: swingFramesFor(stepFrames, swing),
    patternStartFrame,
    patternTiming,
    voiceSalt: voiceSalt | 0,
  };
  const firstIndex = Math.max(
    0,
    Math.floor((windowStartFrame - patternStartFrame) / stepFrames) - 2,
  );
  const lastIndex = Math.ceil((windowEndFrame - patternStartFrame) / stepFrames) + 2;
  const changes: ScheduledParameterChange[] = [];
  for (let absoluteStep = firstIndex; absoluteStep < lastIndex; absoluteStep += 1) {
    if (minimumStepExclusive !== undefined && absoluteStep <= minimumStepExclusive) continue;
    const resolved = resolveStep(absoluteStep);
    if (resolved === undefined || resolved.automationSteps?.length === 0) continue;
    const atFrame = onsetFrame(context, absoluteStep);
    if (atFrame < windowStartFrame || atFrame >= windowEndFrame) continue;
    for (const step of resolved.automationSteps ?? []) {
      changes.push({
        atFrame,
        occurrenceId: `${String(resolved.patternIndex)}:${step.parameterId}:${String(absoluteStep)}`,
        parameterId: step.parameterId,
        value: step.value,
      });
    }
  }
  return changes.sort(
    (left, right) =>
      left.atFrame - right.atFrame || left.parameterId.localeCompare(right.parameterId),
  );
}

/** Removes every endpoint for an onset occurrence already retained in a queue. */
export function withoutExcludedOccurrences(
  events: readonly ScheduledVoiceEvent[],
  occurrenceIds: ReadonlySet<string> | undefined,
): readonly ScheduledVoiceEvent[] {
  if (occurrenceIds === undefined || occurrenceIds.size === 0) return events;
  return events.filter(
    (event) => event.occurrenceId === undefined || !occurrenceIds.has(event.occurrenceId),
  );
}

/** Removes automation occurrences already retained in a processor queue. */
export function withoutExcludedParameterOccurrences(
  changes: readonly ScheduledParameterChange[],
  occurrenceIds: ReadonlySet<string> | undefined,
): readonly ScheduledParameterChange[] {
  if (occurrenceIds === undefined || occurrenceIds.size === 0) return changes;
  return changes.filter(
    (change) =>
      change.occurrenceId === undefined || !occurrenceIds.has(change.occurrenceId),
  );
}

/** Returns the duration-based release that a bounded queue rebuild must retain. */
export function pendingReleaseEvent(
  request: Omit<PatternWindowRequest, "windowStartFrame" | "windowEndFrame">,
  playheadFrame: number,
): ScheduledVoiceEvent | undefined {
  const {
    resolveStep,
    stepFrames,
    swing,
    patternTiming,
    voiceSalt = 0,
    patternStartFrame,
    gateRatio = DEFAULT_GATE_RATIO,
  } = request;
  if (!Number.isFinite(stepFrames) || stepFrames <= 0) return undefined;
  const context: OnsetContext = {
    resolveStep,
    stepFrames,
    swingFrames: swingFramesFor(stepFrames, swing),
    patternStartFrame,
    patternTiming,
    voiceSalt: voiceSalt | 0,
  };
  const triggerGateFrames = Math.max(1, Math.floor(stepFrames * gateRatio));
  const nearest = Math.floor((playheadFrame - patternStartFrame) / stepFrames) + 3;
  const oldest = Math.max(0, nearest - MAXIMUM_PATTERN_STEPS - 3);
  for (let absoluteStep = nearest; absoluteStep >= oldest; absoluteStep -= 1) {
    const resolved = resolveStep(absoluteStep);
    if (resolved === undefined) continue;
    const note = playedEvents(context, resolved).find((event) => event.type === "note");
    if (note === undefined) continue;
    const frame = eventOnsetFrame(context, note, absoluteStep);
    if (frame > playheadFrame) continue;
    const release = terminalReleaseFor(
      context,
      note,
      absoluteStep,
      frame,
      triggerGateFrames,
      playheadFrame,
    );
    return release !== undefined && release.frame > playheadFrame
      ? { atFrame: release.frame, type: "note-off", note: release.note }
      : undefined;
  }
  return undefined;
}
