import { describe, expect, it } from "vitest";

import type { IdFactory, ProjectRevision, VoiceId } from "../../../src/contracts/ids";
import type { ParameterId, PluginId } from "../../../src/contracts/parameters";
import { createDefaultState, type ModuleSeed } from "../../../src/state/default-state";
import {
  documentToState,
  parseProjectDocument,
  serializeProject,
} from "../../../src/state/persistence/project-document";

const TIMESTAMP = "2026-08-07T12:00:00.000Z";
const DRUM_SEED: ModuleSeed = {
  pluginId: "drum-test" as PluginId,
  parameters: {},
  events: [
    {
      type: "trigger",
      positionTicks: 0,
      data: { note: 36, velocity: 0.8, accent: false, slide: false },
    },
  ],
  voiceIds: ["kick" as VoiceId],
};

const OPTIONS = {
  createdAt: TIMESTAMP,
  modifiedAt: TIMESTAMP,
  projectRevision: {
    epoch: "00000000-0000-4000-8000-000000000099",
    counter: 0,
  } as ProjectRevision,
};

const PARSE_OPTIONS = {
  knownPluginIds: [DRUM_SEED.pluginId],
  parameterDescriptorsByPluginId: {
    [DRUM_SEED.pluginId]: [
      { id: "tone" as ParameterId, valueType: "float" as const, minimum: 0, maximum: 1 },
    ],
  },
  voiceIdsByPluginId: { [DRUM_SEED.pluginId]: ["kick"] },
};

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) throw new Error("Test fixture did not create the expected value.");
  return value;
}

describe("Pattern project document", () => {
  it("serializes and restores ID-owned Patterns, advanced event data, and voice cycles", () => {
    const state = createDefaultState(deterministicIds(), DRUM_SEED, () => TIMESTAMP);
    const verse = required(state.project.patterns.find((pattern) => pattern.name === "Verse"));
    const moduleId = required(state.ui.selectedModuleId);
    const patternState = {
      ...state,
      project: {
        ...state.project,
        patterns: state.project.patterns.map((pattern) =>
          pattern.id !== verse.id
            ? pattern
            : {
                ...pattern,
                scale: "Phrygian" as const,
                parts: {
                  ...pattern.parts,
                  [moduleId]: {
                    ...required(pattern.parts[moduleId]),
                    voiceCycleLengths: { ["kick" as VoiceId]: 8 },
                    events: required(pattern.parts[moduleId]).events.map((event) => ({
                      ...event,
                      data: {
                        ...event.data,
                        probability: 0.4,
                        microTimingTicks: -8,
                        flam: 1,
                        roll: 3,
                      },
                    })),
                  },
                },
              },
        ),
      },
    };

    const document = serializeProject(patternState, OPTIONS);
    const verseDocument = required(document.patterns.find((pattern) => pattern.id === verse.id));
    const partDocument = required(verseDocument.parts.find((part) => part.moduleId === moduleId));
    expect(document.activePatternId).toBe(verse.id);
    expect(document.song.playlist.every((placement) => document.patterns.some((pattern) => pattern.id === placement.patternId))).toBe(true);
    expect(verseDocument.scale).toBe("Phrygian");
    expect(partDocument.voiceCycleLengths).toEqual({ kick: 8 });
    expect(partDocument.events[0]?.data).toMatchObject({
      probability: 0.4,
      microTimingTicks: -8,
      flam: 1,
      roll: 3,
    });

    const parsed = parseProjectDocument(document, PARSE_OPTIONS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = documentToState(parsed.value, state);
    const restoredVerse = required(restored.project.patterns.find((pattern) => pattern.id === verse.id));
    expect(restoredVerse.scale).toBe("Phrygian");
    expect(restoredVerse.parts[moduleId]?.voiceCycleLengths["kick" as VoiceId]).toBe(8);
    expect(restoredVerse.parts[moduleId]?.events[0]?.data.roll).toBe(3);
  });

  it("rejects an out-of-range voice cycle length", () => {
    const document = serializeProject(createDefaultState(deterministicIds(), DRUM_SEED, () => TIMESTAMP), OPTIONS);
    const malformed = structuredClone(document) as unknown as {
      patterns: { parts: { voiceCycleLengths: Record<string, number> }[] }[];
    };
    required(required(malformed.patterns[1]).parts[0]).voiceCycleLengths = { kick: 65 };

    expect(parseProjectDocument(malformed, PARSE_OPTIONS)).toMatchObject({ ok: false });
  });

  it("rejects unknown, out-of-range, and out-of-part automation data", () => {
    const state = createDefaultState(deterministicIds(), DRUM_SEED, () => TIMESTAMP);
    const document = serializeProject(state, OPTIONS);
    const pattern = required(document.patterns[1]);
    const part = required(pattern.parts[0]);
    const laneId = "00000000-0000-4000-8000-000000000988";
    const withLane = structuredClone(document) as unknown as {
      patterns: {
        id: string;
        automationLaneIds: string[];
        parts: { moduleId: string; length: number; automationLaneIds: string[] }[];
      }[];
      automation: {
        id: string;
        scope: "module";
        targetId: string;
        parameterId: string;
        patternId: string;
        stepTicks: number;
        steps: { tick: number; value: number }[];
      }[];
    };
    const targetPattern = required(withLane.patterns[1]);
    const targetPart = required(targetPattern.parts[0]);
    targetPattern.automationLaneIds = [laneId];
    targetPart.automationLaneIds = [laneId];
    withLane.automation = [
      {
        id: laneId,
        scope: "module",
        targetId: part.moduleId,
        parameterId: "tone",
        patternId: pattern.id,
        stepTicks: 240,
        steps: [{ tick: 0, value: 0.5 }],
      },
    ];
    expect(parseProjectDocument(withLane, PARSE_OPTIONS)).toMatchObject({ ok: true });

    const automationLane = required(withLane.automation[0]);
    automationLane.parameterId = "unknown";
    expect(parseProjectDocument(withLane, PARSE_OPTIONS)).toMatchObject({ ok: false });

    automationLane.parameterId = "tone";
    automationLane.steps = [{ tick: 0, value: 2 }];
    expect(parseProjectDocument(withLane, PARSE_OPTIONS)).toMatchObject({ ok: false });

    automationLane.steps = [{ tick: targetPart.length * 240, value: 0.5 }];
    expect(parseProjectDocument(withLane, PARSE_OPTIONS)).toMatchObject({ ok: false });

    automationLane.steps = [
      { tick: 240, value: 0.5 },
      { tick: 0, value: 0.4 },
    ];
    expect(parseProjectDocument(withLane, PARSE_OPTIONS)).toMatchObject({ ok: false });

    automationLane.steps = [{ tick: 0, value: 0.5 }];
    targetPart.automationLaneIds = [];
    expect(parseProjectDocument(withLane, PARSE_OPTIONS)).toMatchObject({ ok: false });
  });
});
