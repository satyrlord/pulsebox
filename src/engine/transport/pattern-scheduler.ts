import {
  compareScheduledVoiceEvents,
  type PatternStepView,
  type ScheduledVoiceEvent,
} from "./scheduled-event";

/**
 * Resolves an absolute step index to the step that should sound there, or
 * `undefined` for silence. A single looping pattern, a chained pattern list, and
 * a song arrangement are all just different resolvers, so the scheduler itself
 * never learns about chaining or song mode.
 */
export type StepResolver = (absoluteStep: number) => PatternStepView | undefined;

export interface PatternWindowRequest {
  readonly resolveStep: StepResolver;
  /** Frames per sixteenth at the current tempo. */
  readonly stepFrames: number;
  /** 0 is straight; 1 delays every odd step to a 2:1 triplet feel. */
  readonly swing: number;
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

export function loopingStepResolver(steps: readonly PatternStepView[]): StepResolver {
  if (steps.length === 0) return () => undefined;
  return (absoluteStep) => {
    if (!Number.isFinite(absoluteStep) || absoluteStep < 0) return undefined;
    return steps[absoluteStep % steps.length];
  };
}

/**
 * Builds a resolver that plays each pattern in order for its own length, then
 * repeats the whole chain. An empty chain is silence.
 */
export function chainedStepResolver(
  patterns: readonly (readonly PatternStepView[])[],
): StepResolver {
  const playable = patterns.filter((pattern) => pattern.length > 0);
  const total = playable.reduce((sum, pattern) => sum + pattern.length, 0);
  if (total === 0) return () => undefined;
  return (absoluteStep) => {
    if (!Number.isFinite(absoluteStep) || absoluteStep < 0) return undefined;
    let offset = absoluteStep % total;
    for (const pattern of playable) {
      if (offset < pattern.length) return pattern[offset];
      offset -= pattern.length;
    }
    return undefined;
  };
}

function swingFramesFor(stepFrames: number, swing: number): number {
  if (!Number.isFinite(swing) || swing <= 0) return 0;
  return Math.round(Math.min(1, swing) * stepFrames * MAXIMUM_SWING_FRACTION);
}

function onsetFrame(
  absoluteStep: number,
  patternStartFrame: number,
  stepFrames: number,
  swingFrames: number,
): number {
  const swung = absoluteStep % 2 === 1 ? swingFrames : 0;
  return patternStartFrame + absoluteStep * stepFrames + swung;
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

  // Swing only ever delays an onset, so widening the scanned index range by one
  // on each side covers every step whose shifted onset can enter the window.
  const firstIndex = Math.max(
    0,
    Math.floor((windowStartFrame - patternStartFrame) / stepFrames) - 1,
  );
  const lastIndex = Math.ceil((windowEndFrame - patternStartFrame) / stepFrames) + 1;

  const events: ScheduledVoiceEvent[] = [];
  for (let absoluteStep = firstIndex; absoluteStep < lastIndex; absoluteStep += 1) {
    if (events.length >= maximumEvents) break;
    const frame = onsetFrame(absoluteStep, patternStartFrame, stepFrames, swingFrames);
    if (frame < windowStartFrame || frame >= windowEndFrame) continue;
    const step = resolveStep(absoluteStep);
    if (step?.active !== true) continue;

    events.push({
      atFrame: frame,
      type: "note-on",
      note: step.note,
      velocity: step.velocity,
      accent: step.accent,
      slide: step.slide,
    });

    if (step.slide) continue;
    // A held note must never ring past the next trigger. Swing moves the next
    // onset, so the release is clamped rather than fixed at the gate ratio.
    const nextOnset = onsetFrame(absoluteStep + 1, patternStartFrame, stepFrames, swingFrames);
    events.push({
      atFrame: Math.max(frame + 1, Math.min(frame + gateFrames, nextOnset - 1)),
      type: "note-off",
    });
  }

  return events.sort(compareScheduledVoiceEvents);
}
