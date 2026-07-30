import {
  compareScheduledVoiceEvents,
  type PatternStepView,
  type ScheduledVoiceEvent,
} from "./scheduled-event";

/**
 * One resolved step plus the bank index of the Pattern it came from. The bank
 * index selects the Pattern-owned timing (Humanize amount and seed), so a Song
 * chain plays each Pattern with that Pattern's own feel.
 */
export interface ResolvedStep {
  readonly step: PatternStepView;
  readonly patternIndex: number;
}

/**
 * Resolves an absolute step index to the step that should sound there, or
 * `undefined` for silence. A single looping pattern, a chained pattern list, and
 * a song arrangement are all just different resolvers, so the scheduler itself
 * never learns about chaining or song mode.
 */
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
  /** Frames per sixteenth at the current tempo. */
  readonly stepFrames: number;
  /** 0 is straight; 1 delays every odd step to a 2:1 triplet feel. */
  readonly swing: number;
  /** Pattern-owned timing by bank index. A missing entry plays mechanically. */
  readonly patternTiming?: readonly PatternTiming[];
  /**
   * Per-module salt so each voice drifts independently. Without it every module
   * would shift together and Humanize would just move the whole grid.
   */
  readonly voiceSalt?: number;
  readonly windowStartFrame: number;
  readonly windowEndFrame: number;
  readonly patternStartFrame: number;
  /** Fraction of a step a non-slid note holds before releasing. */
  readonly gateRatio?: number;
  readonly maximumEvents?: number;
}

const DEFAULT_GATE_RATIO = 0.82;
const DEFAULT_MAXIMUM_EVENTS = 256;

/**
 * Full swing delays the offbeat to two thirds of the pair, which is the 2:1
 * triplet feel. That is one third of a step.
 */
const MAXIMUM_SWING_FRACTION = 1 / 3;

/**
 * Full Humanize moves an onset at most a quarter step either way. Together with
 * the swing maximum of one third this keeps onsets in absolute-step order, so a
 * note-off clamp can always find the next onset ahead of the current one.
 */
const MAXIMUM_HUMANIZE_FRACTION = 0.25;

/** Full Humanize scales a velocity by at most this fraction either way. */
const MAXIMUM_VELOCITY_FRACTION = 0.25;

export function loopingStepResolver(
  steps: readonly PatternStepView[],
  patternIndex = 0,
): StepResolver {
  if (steps.length === 0) return () => undefined;
  return (absoluteStep) => {
    if (!Number.isFinite(absoluteStep) || absoluteStep < 0) return undefined;
    const step = steps[absoluteStep % steps.length];
    return step === undefined ? undefined : { step, patternIndex };
  };
}

/**
 * Builds a resolver that plays each pattern in order for its own length, then
 * repeats the whole chain. An empty chain is silence.
 */
export function chainedStepResolver(
  patterns: readonly { readonly steps: readonly PatternStepView[]; readonly patternIndex: number }[],
): StepResolver {
  const playable = patterns.filter((pattern) => pattern.steps.length > 0);
  const total = playable.reduce((sum, pattern) => sum + pattern.steps.length, 0);
  if (total === 0) return () => undefined;
  return (absoluteStep) => {
    if (!Number.isFinite(absoluteStep) || absoluteStep < 0) return undefined;
    let offset = absoluteStep % total;
    for (const pattern of playable) {
      if (offset < pattern.steps.length) {
        const step = pattern.steps[offset];
        return step === undefined ? undefined : { step, patternIndex: pattern.patternIndex };
      }
      offset -= pattern.steps.length;
    }
    return undefined;
  };
}

function swingFramesFor(stepFrames: number, swing: number): number {
  if (!Number.isFinite(swing) || swing <= 0) return 0;
  return Math.round(Math.min(1, swing) * stepFrames * MAXIMUM_SWING_FRACTION);
}

/**
 * Deterministic hash of (seed, absolute step, salt) into [-1, 1). Pure 32-bit
 * integer math, so the same stored seed replays the same variation on every
 * platform and in every render.
 */
function humanizeUnit(seed: number, absoluteStep: number, salt: number): number {
  let hash =
    ((seed | 0) ^ Math.imul(absoluteStep + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) | 0;
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

/** Timing-offset salt and velocity salt keep the two variations independent. */
const TIMING_SALT = 0;
const VELOCITY_SALT = 1;

function onsetFrame(context: OnsetContext, absoluteStep: number): number {
  const swung = absoluteStep % 2 === 1 ? context.swingFrames : 0;
  const base = context.patternStartFrame + absoluteStep * context.stepFrames + swung;
  const resolved = context.resolveStep(absoluteStep);
  if (resolved === undefined) return base;
  const timing = context.patternTiming?.[resolved.patternIndex];
  const humanize = clampHumanize(timing?.humanize);
  if (humanize === 0 || timing === undefined) return base;
  const unit = humanizeUnit(timing.seed, absoluteStep, context.voiceSalt * 2 + TIMING_SALT);
  return base + Math.round(unit * humanize * MAXIMUM_HUMANIZE_FRACTION * context.stepFrames);
}

function humanizedVelocity(
  context: OnsetContext,
  absoluteStep: number,
  resolved: ResolvedStep,
): number {
  const timing = context.patternTiming?.[resolved.patternIndex];
  const humanize = clampHumanize(timing?.humanize);
  if (humanize === 0 || timing === undefined) return resolved.step.velocity;
  const unit = humanizeUnit(timing.seed, absoluteStep, context.voiceSalt * 2 + VELOCITY_SALT);
  const scaled = resolved.step.velocity * (1 + unit * humanize * MAXIMUM_VELOCITY_FRACTION);
  return Math.min(1, Math.max(0, scaled));
}

/**
 * Emits every event whose onset lands in `[windowStartFrame, windowEndFrame)`.
 * A note-off may be stamped past the window end; it travels with its note-on so
 * the pair is never split across two scheduling passes.
 */
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
  } = request;

  if (!Number.isSafeInteger(stepFrames) || stepFrames <= 0) return [];
  if (windowStartFrame >= windowEndFrame) return [];

  const swingFrames = swingFramesFor(stepFrames, swing);
  const gateFrames = Math.max(1, Math.floor(stepFrames * gateRatio));
  const context: OnsetContext = {
    resolveStep,
    stepFrames,
    swingFrames,
    patternStartFrame,
    patternTiming,
    voiceSalt: voiceSalt | 0,
  };

  // Swing only delays, but Humanize can also advance an onset, so the scanned
  // index range widens by two on each side to cover every shifted onset that can
  // enter the window.
  const firstIndex = Math.max(
    0,
    Math.floor((windowStartFrame - patternStartFrame) / stepFrames) - 2,
  );
  const lastIndex = Math.ceil((windowEndFrame - patternStartFrame) / stepFrames) + 2;

  const events: ScheduledVoiceEvent[] = [];
  for (let absoluteStep = firstIndex; absoluteStep < lastIndex; absoluteStep += 1) {
    if (events.length >= maximumEvents) break;
    const frame = onsetFrame(context, absoluteStep);
    if (frame < windowStartFrame || frame >= windowEndFrame) continue;
    const resolved = resolveStep(absoluteStep);
    if (resolved?.step.active !== true) continue;
    const step = resolved.step;

    events.push({
      atFrame: frame,
      type: "note-on",
      note: step.note,
      velocity: humanizedVelocity(context, absoluteStep, resolved),
      accent: step.accent,
      slide: step.slide,
    });

    if (step.slide) continue;
    // A held note must never ring past the next trigger. Swing and Humanize move
    // the next onset, so the release is clamped rather than fixed at the gate
    // ratio.
    const nextOnset = onsetFrame(context, absoluteStep + 1);
    events.push({
      atFrame: Math.max(frame + 1, Math.min(frame + gateFrames, nextOnset - 1)),
      type: "note-off",
    });
  }

  return events.sort(compareScheduledVoiceEvents);
}
