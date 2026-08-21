import { describe, expect, it } from "vitest";

import type { IdFactory } from "../../../src/contracts/ids";
import { createDefaultProjectState } from "../../../src/composition/default-project";
import { DEFAULT_PATTERN_COUNT, DEFAULT_PROJECT_NAME } from "../../../src/state/default-state";

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

function decibels(gain: number): number {
  return 20 * Math.log10(gain);
}

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) throw new Error("The default project is missing required content.");
  return value;
}

/** Section 9.1: the supplied default project. */
describe("default project", () => {
  const state = createDefaultProjectState(deterministicIds());
  const project = state.project;
  const modulesInRackOrder = project.rackSlots.map((slot) =>
    slot.moduleId === undefined ? undefined : project.modules[slot.moduleId],
  );
  const verse = required(project.patterns.find((pattern) => pattern.name === "Verse"));

  it("pins the default timing and Pattern model", () => {
    expect(project.name).toBe(DEFAULT_PROJECT_NAME);
    expect(project.tempo).toBe(128);
    expect(project.swing).toBe(0);
    expect(state.transport.status).toBe("stopped");
    expect(project.patterns).toHaveLength(DEFAULT_PATTERN_COUNT);
    for (const pattern of project.patterns) {
      expect(pattern.humanize).toBe(0);
      expect(pattern.durationBars).toBe(1);
      expect(pattern.scale).toBe("Chromatic");
    }
  });

  it("ships the named, ID-based Song playlist enabled", () => {
    expect(project.song.enabled).toBe(true);
    expect(project.song.placements.map((placement) => ({
      name: required(project.patterns.find((pattern) => pattern.id === placement.patternId)).name,
      repeatCount: placement.repeatCount,
    }))).toEqual([
      { name: "Intro", repeatCount: 8 },
      { name: "Verse", repeatCount: 16 },
      { name: "Break", repeatCount: 8 },
      { name: "Drop", repeatCount: 16 },
      { name: "Outro", repeatCount: 8 },
    ]);
  });

  it("keeps the section 9.1 rack order with two empty slots", () => {
    expect(project.rackSlots).toHaveLength(8);
    expect(modulesInRackOrder.map((module) => module?.pluginId)).toEqual([
      "bass-mono",
      "drum-analog-small",
      "drum-analog-large",
      "drum-hybrid",
      "drum-digital-a",
      "drum-digital-b",
      undefined,
      undefined,
    ]);
  });

  it("names five arranged Patterns, selects Verse, and gives each section distinct data", () => {
    expect(project.patterns.map((pattern) => pattern.name)).toEqual([
      "Intro",
      "Verse",
      "Break",
      "Drop",
      "Outro",
    ]);
    expect(project.activePatternId).toBe(verse.id);
    expect(
      project.patterns.map((pattern) =>
        Object.values(pattern.parts).reduce((total, part) => total + part.events.length, 0),
      ),
    ).toEqual([17, 41, 20, 56, 16]);

    const participatingModuleIds = new Set(
      project.patterns.flatMap((pattern) => Object.keys(pattern.parts)),
    );
    for (const module of modulesInRackOrder) {
      if (module !== undefined) expect(participatingModuleIds.has(module.id)).toBe(true);
    }

    const signatures = project.patterns.map((pattern) =>
      JSON.stringify(
        Object.values(pattern.parts).map((part) =>
          part.events.map((event) => [event.positionTicks, event.data.note, event.data.velocity]),
        ),
      ),
    );
    expect(new Set(signatures).size).toBe(project.patterns.length);
  });

  it("starts the Intro with the three core first-sound modules", () => {
    const intro = required(project.patterns.find((pattern) => pattern.name === "Intro"));
    const soundingAtStepZero = modulesInRackOrder
      .filter((module) => module !== undefined)
      .filter((module) => intro.parts[module.id]?.events.some((event) => event.positionTicks === 0))
      .map((module) => module.pluginId);
    expect(soundingAtStepZero).toEqual([
      "bass-mono",
      "drum-analog-small",
      "drum-analog-large",
    ]);
  });

  it("leaves the required master and module headroom", () => {
    expect(decibels(project.masterLevel)).toBeCloseTo(-6, 0);
    for (const module of modulesInRackOrder) {
      if (module !== undefined) expect(decibels(module.level)).toBeCloseTo(-8, 0);
    }
  });
});

describe("starter template", () => {
  const ids = deterministicIds();
  const first = createDefaultProjectState(ids).project;
  const second = createDefaultProjectState(ids).project;

  it("carries the default name, tempo, and rack order", () => {
    expect(first.name).toBe(DEFAULT_PROJECT_NAME);
    expect(first.tempo).toBe(128);
    expect(first.rackSlots.map((slot) =>
      slot.moduleId === undefined ? undefined : first.modules[slot.moduleId]?.pluginId,
    )).toEqual([
      "bass-mono",
      "drum-analog-small",
      "drum-analog-large",
      "drum-hybrid",
      "drum-digital-a",
      "drum-digital-b",
      undefined,
      undefined,
    ]);
  });

  it("repeats the same Pattern event content on every call", () => {
    const events = (project: typeof first) => project.patterns.map((pattern) => ({
      name: pattern.name,
      parts: Object.values(pattern.parts).map((part) => part.events.map((event) => ({
        type: event.type,
        positionTicks: event.positionTicks,
        ...(event.durationTicks === undefined ? {} : { durationTicks: event.durationTicks }),
        data: event.data,
      }))),
    }));
    expect(events(second)).toEqual(events(first));
  });

  it("gives each new project new project, lineage, module, Pattern, and placement IDs", () => {
    expect(second.id).not.toBe(first.id);
    expect(second.lineageId).not.toBe(first.lineageId);
    expect(second.patterns.map((pattern) => pattern.id)).not.toEqual(first.patterns.map((pattern) => pattern.id));
    expect(second.song.placements.map((placement) => placement.id)).not.toEqual(first.song.placements.map((placement) => placement.id));
  });
});
