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
  /**
   * Position of this step inside its own Pattern. Humanize keys on this rather
   * than on the absolute step, so a loop replays the same feel every pass
   * instead of drifting into a new variation on every repeat.
   */
  readonly stepInPattern: number;
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
  /**
   * Frames per sixteenth at the current tempo. It may be fractional: each
   * onset rounds the whole product once, so the grid cannot drift by an
   * accumulated per-step rounding error.
   */
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
  /**
   * Exclusive lower bound on the absolute step index. Steps at or below it emit
   * nothing. A timing-change rebuild uses it so a step already preserved at its
   * old onset cannot fire again at its shifted new onset.
   */
  readonly minimumStepExclusive?: number;
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
    const stepInPattern = absoluteStep % steps.length;
    const step = steps[stepInPattern];
    return step === undefined ? undefined : { step, patternIndex, stepInPattern };
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
        return step === undefined
          ? undefined
          : { step, patternIndex: pattern.patternIndex, stepInPattern: offset };
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
 * Deterministic hash of (seed, step in pattern, salt) into [-1, 1). Pure 32-bit
 * integer math, so the same stored seed replays the same variation on every
 * platform and in every render.
 *
 * The step index is the position inside the Pattern, never the absolute step.
 * Keying on the absolute step would give the same beat a new offset on every
 * repeat, so the loop would never play the same way twice.
 */
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

/** Timing-offset salt and velocity salt keep the two variations independent. */
const TIMING_SALT = 0;
const VELOCITY_SALT = 1;

function onsetFrame(context: OnsetContext, absoluteStep: number): number {
  const swung = absoluteStep % 2 === 1 ? context.swingFrames : 0;
  // One rounding of the whole product per onset. Rounding the step size first
  // would multiply that error by the step index and drift the audible grid.
  const base =
    context.patternStartFrame + Math.round(absoluteStep * context.stepFrames) + swung;
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

function humanizedVelocity(context: OnsetContext, resolved: ResolvedStep): number {
  const timing = context.patternTiming?.[resolved.patternIndex];
  const humanize = clampHumanize(timing?.humanize);
  if (humanize === 0 || timing === undefined) return resolved.step.velocity;
  const unit = humanizeUnit(
    timing.seed,
    resolved.stepInPattern,
    context.voiceSalt * 2 + VELOCITY_SALT,
  );
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
    minimumStepExclusive,
  } = request;

  if (!Number.isFinite(stepFrames) || stepFrames <= 0) return [];
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
    if (minimumStepExclusive !== undefined && absoluteStep <= minimumStepExclusive) continue;
    const frame = onsetFrame(context, absoluteStep);
    if (frame < windowStartFrame || frame >= windowEndFrame) continue;
    const resolved = resolveStep(absoluteStep);
    if (resolved?.step.active !== true) continue;
    const step = resolved.step;
    // A note-off travels with its note-on, so the whole pair must fit under
    // the cap. Emitting the onset alone would strand a note with no release.
    if (events.length + (step.slide ? 1 : 2) > maximumEvents) break;

    events.push({
      atFrame: frame,
      type: "note-on",
      sourceStep: absoluteStep,
      note: step.note,
      velocity: humanizedVelocity(context, resolved),
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

/**
 * The highest absolute step whose onset lies before `boundaryFrame`, or -1 when
 * no onset does. Onsets stay in absolute-step order, so the first hit while
 * scanning down from just past the boundary is the highest.
 *
 * A timing change captures the lead window at its old onsets and uses this
 * value as the exclusive step filter for the rebuild: every step at or below it
 * either already sounded or travels in the preserved batch, so the rebuild must
 * not emit it again.
 */
export function highestStepBefore(
  request: Omit<PatternWindowRequest, "windowStartFrame" | "windowEndFrame">,
  boundaryFrame: number,
): number {
  const {
    resolveStep,
    stepFrames,
    swing,
    patternTiming,
    voiceSalt = 0,
    patternStartFrame,
  } = request;
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

/**
 * The clamped gate release still owed for the newest onset at or before
 * `playheadFrame`, or `undefined` when that note already released or slides.
 *
 * A bounded reschedule clears the queued horizon, and that queue held this
 * note-off. Re-emitting it keeps the sounding voice on its natural release
 * instead of a blanket cut at the reschedule point.
 */
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

  // Onsets stay in absolute-step order, so scan back from just past the
  // playhead. Once even an unclamped gate has expired, every older onset
  // released long ago.
  const nearest = Math.floor((playheadFrame - patternStartFrame) / stepFrames) + 3;
  for (let absoluteStep = nearest; absoluteStep >= 0; absoluteStep -= 1) {
    const frame = onsetFrame(context, absoluteStep);
    if (frame > playheadFrame) continue;
    if (frame + gateFrames <= playheadFrame) return undefined;
    const resolved = resolveStep(absoluteStep);
    if (resolved?.step.active !== true) continue;
    if (resolved.step.slide) return undefined;
    const releaseFrame = Math.max(
      frame + 1,
      Math.min(frame + gateFrames, onsetFrame(context, absoluteStep + 1) - 1),
    );
    return releaseFrame > playheadFrame
      ? { atFrame: releaseFrame, type: "note-off" }
      : undefined;
  }
  return undefined;
}
