import type { ScheduledBassEvent } from "../modules/bass-mono/adapter";

export interface ScheduledPatternStep {
  readonly active: boolean;
  readonly note: number;
  readonly velocity: number;
  readonly accent: boolean;
  readonly slide: boolean;
}

export function schedulePatternWindow(
  steps: readonly ScheduledPatternStep[],
  stepFrames: number,
  windowStartFrame: number,
  windowEndFrame: number,
  patternStartFrame: number,
): readonly ScheduledBassEvent[] {
  if (steps.length === 0 || !Number.isSafeInteger(stepFrames) || stepFrames <= 0) return [];
  const events: ScheduledBassEvent[] = [];
  const firstIndex = Math.max(0, Math.floor((windowStartFrame - patternStartFrame) / stepFrames));
  const lastIndex = Math.ceil((windowEndFrame - patternStartFrame) / stepFrames);
  for (let absoluteStep = firstIndex; absoluteStep < lastIndex && events.length < 256; absoluteStep += 1) {
    const frame = patternStartFrame + absoluteStep * stepFrames;
    if (frame < windowStartFrame || frame >= windowEndFrame) continue;
    const step = steps[absoluteStep % steps.length];
    if (step?.active !== true) continue;
    events.push({
      atFrame: frame,
      type: "note-on",
      note: step.note,
      velocity: step.velocity,
      accent: step.accent,
      slide: step.slide,
    });
    if (!step.slide) events.push({ atFrame: frame + Math.max(1, Math.floor(stepFrames * 0.82)), type: "note-off" });
  }
  return events.sort((left, right) => left.atFrame - right.atFrame || eventPriority(left) - eventPriority(right));
}

function eventPriority(event: ScheduledBassEvent): number {
  return event.type === "note-off" ? 0 : event.type === "reset" ? 1 : 2;
}
