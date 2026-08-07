import { describe, expect, it } from "vitest";

import type { IdFactory } from "../../../src/contracts/ids";
import { createDefaultProjectState } from "../../../src/composition/default-project";
import { DEFAULT_PROJECT_NAME } from "../../../src/state/default-state";

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

function decibels(gain: number): number {
  return 20 * Math.log10(gain);
}

/** Section 9.1: the supplied default project. */
describe("default project", () => {
  const state = createDefaultProjectState(deterministicIds());
  const project = state.project;
  const modulesInRackOrder = project.rackSlots.map((slot) =>
    slot.moduleId === undefined ? undefined : project.modules[slot.moduleId],
  );

  it("pins the default tempo, timing amounts, and 16-step patterns", () => {
    expect(project.name).toBe("Neon Basement");
    expect(project.tempo).toBe(128);
    expect(project.swing).toBe(0);
    expect(state.transport.status).toBe("stopped");
    for (const pattern of project.patterns) {
      expect(pattern.humanize).toBe(0);
      expect(pattern.length).toBe(16);
    }
  });

  // Decision D92: the section 9.1 bar counts are the default Song chain, and a
  // bar count is the entry's repeat count. The chain ships disabled.
  it("ships the section 9.1 Song chain, disabled", () => {
    expect(project.song.enabled).toBe(false);
    expect(project.song.entries).toEqual([
      { patternIndex: 0, repeats: 8 },
      { patternIndex: 1, repeats: 16 },
      { patternIndex: 2, repeats: 8 },
      { patternIndex: 3, repeats: 16 },
      { patternIndex: 4, repeats: 8 },
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

  it("names the five default Patterns and selects Verse", () => {
    expect(project.patterns.map((pattern) => pattern.name)).toEqual([
      "Intro",
      "Verse",
      "Break",
      "Drop",
      "Outro",
    ]);
    expect(project.activePatternIndex).toBe(1);
  });

  it("leaves master headroom: about -8 dB per channel, about -6 dB master", () => {
    expect(decibels(project.masterLevel)).toBeCloseTo(-6, 0);
    for (const module of modulesInRackOrder) {
      if (module === undefined) continue;
      expect(decibels(module.level)).toBeCloseTo(-8, 0);
    }
  });

  it("ships an original coherent demo loop with a distinct role per machine", () => {
    const verseParts = modulesInRackOrder
      .filter((module) => module !== undefined)
      .map((module) => module.parts[1]);
    for (const part of verseParts) {
      expect(part?.events.length).toBeGreaterThan(0);
    }
    // Every machine plays its own pattern, not a restated copy.
    const signatures = verseParts.map((part) =>
      JSON.stringify(part?.events.map((event) => [event.positionTicks, event.data.note])),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

/**
 * Section 9.2: the starter template creates a fresh copy of the section 9.1
 * default project. It owns no rack order, tempo, or note data of its own, so
 * these assertions guard against the template drifting away from section 9.1.
 */
describe("starter template", () => {
  // One shared factory, so a repeated ID is a real collision rather than two
  // independent counters restarting at the same value.
  const ids = deterministicIds();
  const first = createDefaultProjectState(ids).project;
  const second = createDefaultProjectState(ids).project;

  it("carries the section 9.1 name, tempo, and rack order", () => {
    expect(first.name).toBe(DEFAULT_PROJECT_NAME);
    expect(first.tempo).toBe(128);
    expect(
      first.rackSlots.map((slot) =>
        slot.moduleId === undefined ? undefined : first.modules[slot.moduleId]?.pluginId,
      ),
    ).toEqual([
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

  it("repeats the same note data on every call", () => {
    const notes = (project: typeof first) =>
      project.rackSlots.map((slot) =>
        slot.moduleId === undefined
          ? undefined
          : project.modules[slot.moduleId]?.parts.map((part) => ({
              length: part.length,
              events: part.events.map((event) => ({
                type: event.type,
                positionTicks: event.positionTicks,
                ...(event.durationTicks === undefined
                  ? {}
                  : { durationTicks: event.durationTicks }),
                data: event.data,
              })),
            })),
      );
    expect(JSON.stringify(notes(second))).toBe(JSON.stringify(notes(first)));
  });

  it("gives each new project its own project, lineage, and module IDs", () => {
    expect(second.id).not.toBe(first.id);
    expect(second.lineageId).not.toBe(first.lineageId);
    const moduleIds = (project: typeof first) => project.rackSlots.map((slot) => slot.moduleId);
    for (const id of moduleIds(second)) {
      if (id !== undefined) expect(moduleIds(first)).not.toContain(id);
    }
  });
});
