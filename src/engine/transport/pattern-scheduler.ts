import {
  compareScheduledVoiceEvents,
  type PatternEventView,
  type PatternPartView,
  type ScheduledVoiceEvent,
} from "./scheduled-event";

/** One fixed Piano Roll grid step at 960 ticks per quarter note. */
const PATTERN_STEP_TICKS = 240;

/** All events that begin at one resolved Pattern step. */
export interface ResolvedStep {
  readonly events: readonly PatternEventView[];
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
const DEFAULT_MAXIMUM_EVENTS = 256;
const MAXIMUM_SWING_FRACTION = 1 / 3;
const MAXIMUM_HUMANIZE_FRACTION = 0.25;
const MAXIMUM_VELOCITY_FRACTION = 0.25;
const MAXIMUM_PATTERN_STEPS = 64;

function eventBuckets(part: PatternPartView): ReadonlyMap<number, readonly PatternEventView[]> {
  const mutable = new Map<number, PatternEventView[]>();
  for (const event of part.events) {
    const bucket = mutable.get(event.positionTicks);
    if (bucket === undefined) mutable.set(event.positionTicks, [event]);
    else bucket.push(event);
  }
  return mutable;
}

export function loopingStepResolver(
  part: PatternPartView,
  patternIndex = 0,
): StepResolver {
  if (!Number.isSafeInteger(part.length) || part.length <= 0) return () => undefined;
  const eventsByPosition = eventBuckets(part);
  return (absoluteStep) => {
    if (!Number.isSafeInteger(absoluteStep) || absoluteStep < 0) return undefined;
    const stepInPattern = absoluteStep % part.length;
    return {
      events: eventsByPosition.get(stepInPattern * PATTERN_STEP_TICKS) ?? [],
      patternIndex,
      stepInPattern,
    };
  };
}

/** Plays each part in order, then repeats the whole chain. */
export function chainedStepResolver(
  patterns: readonly { readonly part: PatternPartView; readonly patternIndex: number }[],
): StepResolver {
  const playable = patterns.filter((pattern) => pattern.part.length > 0);
  const total = playable.reduce((sum, pattern) => sum + pattern.part.length, 0);
  if (total === 0) return () => undefined;
  const buckets = playable.map((pattern) => eventBuckets(pattern.part));
  return (absoluteStep) => {
    if (!Number.isSafeInteger(absoluteStep) || absoluteStep < 0) return undefined;
    let offset = absoluteStep % total;
    for (let index = 0; index < playable.length; index += 1) {
      const pattern = playable[index];
      if (pattern === undefined) continue;
      if (offset < pattern.part.length) {
        return {
          events: buckets[index]?.get(offset * PATTERN_STEP_TICKS) ?? [],
          patternIndex: pattern.patternIndex,
          stepInPattern: offset,
        };
      }
      offset -= pattern.part.length;
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
  const next = context.resolveStep(nextAbsoluteStep)?.events.find(
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
  if (end === undefined || end.events.length === 0) return nominalRelease;
  return Math.max(onset + 1, Math.min(nominalRelease, onsetFrame(context, endStep) - 1));
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
    const nextOnset = onsetFrame(context, next.absoluteStep);
    if (nextOnset > latestStartedFrame) return undefined;
    currentEvent = next.event;
    currentStep = next.absoluteStep;
    currentOnset = nextOnset;
  }
  return undefined;
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
    const frame = onsetFrame(context, absoluteStep);
    if (frame < windowStartFrame || frame >= windowEndFrame) continue;
    const resolved = resolveStep(absoluteStep);
    if (resolved === undefined || resolved.events.length === 0) continue;
    const releases = resolved.events.map((event) =>
      releaseFrameFor(context, event, absoluteStep, frame, triggerGateFrames),
    );
    const requiredEvents = releases.reduce<number>(
      (count, release) => count + 1 + (release === undefined ? 0 : 1),
      0,
    );
    // Keep all simultaneous triggers together. A note that leads into a Slide
    // has no release in this group because its adjacent note keeps the gate open.
    if (events.length + requiredEvents > maximumEvents) break;

    for (let index = 0; index < resolved.events.length; index += 1) {
      const event = resolved.events[index];
      if (event === undefined) continue;
      events.push({
        atFrame: frame,
        type: "note-on",
        sourceStep: absoluteStep,
        note: event.data.note,
        velocity: humanizedVelocity(context, resolved, event),
        accent: event.data.accent,
        slide: event.data.slide,
      });
      const release = releases[index];
      if (release !== undefined) {
        events.push({ atFrame: release, type: "note-off", note: event.data.note });
      }
    }
  }

  return events.sort(compareScheduledVoiceEvents);
}

export function highestStepBefore(
  request: Omit<PatternWindowRequest, "windowStartFrame" | "windowEndFrame">,
  boundaryFrame: number,
): number {
  const { resolveStep, stepFrames, swing, patternTiming, voiceSalt = 0, patternStartFrame } =
    request;
  if (!Number.isFinite(stepFrames) || stepFrames <= 0) return -1;
  const context: OnsetContext = {
    resolveStep,
    stepFrames,
    swingFrames: swingFramesFor(stepFrames, swing),
    patternStartFrame,
    patternTiming,
    voiceSalt: voiceSalt | 0,
  };
  const nearest = Math.floor((boundaryFrame - patternStartFrame) / stepFrames) + 3;
  for (let absoluteStep = nearest; absoluteStep >= 0; absoluteStep -= 1) {
    if (onsetFrame(context, absoluteStep) < boundaryFrame) return absoluteStep;
  }
  return -1;
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
    const frame = onsetFrame(context, absoluteStep);
    if (frame > playheadFrame) continue;
    const resolved = resolveStep(absoluteStep);
    if (resolved === undefined) continue;
    const note = resolved.events.find((event) => event.type === "note");
    if (note === undefined) continue;
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
