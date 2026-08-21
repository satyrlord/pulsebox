import { describe, expect, it } from "vitest";

import type { IdFactory } from "../../../src/contracts/ids";
import type { ProjectRevision } from "../../../src/contracts";
import {
  ACID_FABLE_PROJECT_NAME,
  ACID_FABLE_TEMPO,
  createAcidFableProjectState,
} from "../../../src/composition/acid-fable-project";
import { drumVoiceIdsFor } from "../../../src/composition/default-project";
import { BUILT_IN_MODULES } from "../../../src/engine/public";
import {
  DEFAULT_MASTER_LEVEL,
  DEFAULT_MODULE_LEVEL,
  parseStoredProject,
  serializeProject,
} from "../../../src/state/public";

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) throw new Error("The demo song is missing required content.");
  return value;
}

const PATTERN_NAMES = [
  "Once Upon",
  "First Steps",
  "The Serpent",
  "Deep Woods",
  "Full Cry",
  "Ever After",
] as const;

/** Section 9.3: the supplied demo song behind the second built-in template. */
describe("Acid Fable demo song", () => {
  const state = createAcidFableProjectState(deterministicIds());
  const project = state.project;
  const modulesInRackOrder = project.rackSlots.map((slot) =>
    slot.moduleId === undefined ? undefined : project.modules[slot.moduleId],
  );
  const lowSerpent = required(modulesInRackOrder[0]);
  const highSerpent = required(modulesInRackOrder[1]);

  it("pins the name, timing, and Pattern model", () => {
    expect(project.name).toBe(ACID_FABLE_PROJECT_NAME);
    expect(project.tempo).toBe(ACID_FABLE_TEMPO);
    expect(project.swing).toBe(0);
    expect(state.transport.status).toBe("stopped");
    expect(project.patterns.map((pattern) => pattern.name)).toEqual([...PATTERN_NAMES]);
    for (const pattern of project.patterns) {
      expect(pattern.humanize).toBe(0);
      expect(pattern.durationBars).toBe(1);
    }
    expect(project.activePatternId).toBe(
      required(project.patterns.find((pattern) => pattern.name === "The Serpent")).id,
    );
  });

  it("keeps the section 9.3 rack order with one empty slot", () => {
    expect(project.rackSlots).toHaveLength(8);
    expect(modulesInRackOrder.map((module) => module?.pluginId)).toEqual([
      "bass-mono",
      "bass-mono",
      "drum-analog-small",
      "drum-analog-large",
      "drum-hybrid",
      "drum-digital-a",
      "drum-digital-b",
      undefined,
    ]);
  });

  it("ships the Song chain enabled with the fable arrangement", () => {
    expect(project.song.enabled).toBe(true);
    expect(project.song.placements.map((placement) => ({
      name: required(project.patterns.find((pattern) => pattern.id === placement.patternId)).name,
      repeatCount: placement.repeatCount,
    }))).toEqual([
      { name: "Once Upon", repeatCount: 4 },
      { name: "First Steps", repeatCount: 8 },
      { name: "The Serpent", repeatCount: 8 },
      { name: "Deep Woods", repeatCount: 4 },
      { name: "Full Cry", repeatCount: 16 },
      { name: "Ever After", repeatCount: 4 },
    ]);
  });

  it("gives the two Silver Serpents independent sound and mix settings", () => {
    expect(lowSerpent.parameters.waveform).toBe("saw");
    expect(highSerpent.parameters.waveform).toBe("square");
    expect(highSerpent.level).toBeLessThan(lowSerpent.level);
    expect(highSerpent.pan).toBeGreaterThan(0);
    const sendA = (module: typeof lowSerpent) =>
      required(Object.entries(module.sends).find(([id]) => id === "send-a"))[1].amount;
    expect(sendA(lowSerpent)).toBeGreaterThan(0);
    expect(sendA(highSerpent)).toBeGreaterThan(sendA(lowSerpent));
  });

  it("carries the two cutoff automation lanes on the low serpent", () => {
    const lanes = Object.values(project.automationLanes);
    expect(lanes).toHaveLength(2);
    const laneNames = lanes.map((lane) => ({
      pattern: required(project.patterns.find((pattern) => pattern.id === lane.patternId)).name,
      scope: lane.scope,
      targetId: lane.targetId,
      parameterId: lane.parameterId,
    }));
    expect(laneNames).toEqual(
      expect.arrayContaining([
        {
          pattern: "The Serpent",
          scope: "module",
          targetId: lowSerpent.id,
          parameterId: "cutoff",
        },
        { pattern: "Full Cry", scope: "module", targetId: lowSerpent.id, parameterId: "cutoff" },
      ]),
    );
    for (const lane of lanes) {
      const pattern = required(
        project.patterns.find((candidate) => candidate.id === lane.patternId),
      );
      expect(pattern.automationLaneIds).toContain(lane.id);
      expect(required(pattern.parts[lowSerpent.id]).automationLaneIds).toContain(lane.id);
      expect(lane.steps.length).toBeGreaterThan(0);
    }
  });

  it("leaves the required master and module headroom", () => {
    expect(project.masterLevel).toBe(DEFAULT_MASTER_LEVEL);
    for (const module of modulesInRackOrder) {
      if (module !== undefined && module !== highSerpent) {
        expect(module.level).toBe(DEFAULT_MODULE_LEVEL);
      }
    }
  });

  it("puts note data on every occupied slot across the song", () => {
    for (const module of modulesInRackOrder) {
      if (module === undefined) continue;
      const total = project.patterns.reduce(
        (sum, pattern) => sum + (pattern.parts[module.id]?.events.length ?? 0),
        0,
      );
      expect(total).toBeGreaterThan(0);
    }
  });

  it("repeats the same content on every call", () => {
    const ids = deterministicIds();
    const first = createAcidFableProjectState(ids).project;
    const second = createAcidFableProjectState(ids).project;
    const shape = (project: typeof first) => ({
      name: project.name,
      tempo: project.tempo,
      patterns: project.patterns.map((pattern) => ({
        name: pattern.name,
        parts: Object.values(pattern.parts).map((part) =>
          part.events.map((event) => ({ ...event, id: undefined })),
        ),
      })),
      lanes: Object.values(project.automationLanes).map((lane) => ({
        parameterId: lane.parameterId,
        steps: lane.steps,
      })),
    });
    expect(shape(second)).toEqual(shape(first));
  });

  it("round-trips through the validated stored-project path", () => {
    const parseOptions = {
      knownPluginIds: BUILT_IN_MODULES.map(({ manifest }) => manifest.pluginId as string),
      parameterDescriptorsByPluginId: Object.fromEntries(
        BUILT_IN_MODULES.map(({ manifest }) => [manifest.pluginId, manifest.parameters]),
      ),
      stateSchemaVersionByPluginId: Object.fromEntries(
        BUILT_IN_MODULES.map(({ manifest }) => [manifest.pluginId, manifest.stateSchemaVersion]),
      ),
      voiceIdsByPluginId: Object.fromEntries(
        BUILT_IN_MODULES.flatMap(({ manifest }) => {
          const voiceIds = drumVoiceIdsFor(manifest);
          return voiceIds.length > 0 ? [[manifest.pluginId, voiceIds]] : [];
        }),
      ),
    };
    const document = serializeProject(state, {
      createdAt: "2026-08-21T00:00:00.000Z",
      modifiedAt: "2026-08-21T00:00:00.000Z",
      projectRevision: {
        epoch: "0b32ad32-3584-4a91-a012-5eaa968af162",
        counter: 0,
      } as ProjectRevision,
    });
    const parsed = parseStoredProject(
      {
        id: project.id as string,
        name: project.name,
        modifiedAt: "2026-08-21T00:00:00.000Z",
        document,
      },
      parseOptions,
    );
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));

    const restored = parsed.value.document;
    const restoredLowSerpent = required(restored.rack[0]);
    const restoredHighSerpent = required(restored.rack[1]);
    expect(restored.rack.map((slot) => slot.pluginId)).toEqual([
      "bass-mono",
      "bass-mono",
      "drum-analog-small",
      "drum-analog-large",
      "drum-hybrid",
      "drum-digital-a",
      "drum-digital-b",
      undefined,
    ]);
    expect(restoredLowSerpent.parameters).toMatchObject({
      waveform: "saw",
      cutoff: 640,
      resonance: 0.66,
    });
    expect(restoredHighSerpent.parameters).toMatchObject({
      waveform: "square",
      cutoff: 1400,
      volume: 0.55,
    });
    expect(restoredHighSerpent.level).toBe(0.3);
    expect(restoredHighSerpent.pan).toBe(0.2);

    const sendAmount = (slot: typeof restoredLowSerpent, busId: string) =>
      required(slot.sends?.find((send) => send.busId === busId)).amount;
    expect(sendAmount(restoredLowSerpent, "send-a")).toBe(0.22);
    expect(sendAmount(restoredHighSerpent, "send-a")).toBe(0.35);
    expect(sendAmount(required(restored.rack[5]), "send-b")).toBe(0.3);
    expect(sendAmount(required(restored.rack[6]), "send-b")).toBe(0.18);

    expect(restored.song.enabled).toBe(true);
    expect(
      restored.song.playlist.map((placement) => ({
        name: required(restored.patterns.find((pattern) => pattern.id === placement.patternId)).name,
        repeatCount: placement.repeatCount,
      })),
    ).toEqual([
      { name: "Once Upon", repeatCount: 4 },
      { name: "First Steps", repeatCount: 8 },
      { name: "The Serpent", repeatCount: 8 },
      { name: "Deep Woods", repeatCount: 4 },
      { name: "Full Cry", repeatCount: 16 },
      { name: "Ever After", repeatCount: 4 },
    ]);

    const restoredLanes = restored.automation;
    expect(restoredLanes).toHaveLength(2);
    for (const lane of restoredLanes) {
      const pattern = required(restored.patterns.find((candidate) => candidate.id === lane.patternId));
      const part = required(pattern.parts.find((candidate) => candidate.moduleId === lane.targetId));
      expect(lane.targetId).toBe(restoredLowSerpent.moduleId);
      expect(lane.parameterId).toBe("cutoff");
      expect(pattern.automationLaneIds).toContain(lane.id);
      expect(part.automationLaneIds).toContain(lane.id);
      expect(lane.steps.length).toBeGreaterThan(0);
    }
    expect(restored.activePatternId).toBe(
      required(restored.patterns.find((pattern) => pattern.name === "The Serpent")).id,
    );
  });
});
