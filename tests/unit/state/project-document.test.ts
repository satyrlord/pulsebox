import { describe, expect, it } from "vitest";

import {
  DISTORTION_EFFECT_PLUGIN_ID,
  type EffectInstanceId,
  type ParameterId,
  type PluginId,
  type ProjectRevision,
  type VoiceId,
} from "../../../src/contracts";
import { browserIdFactory } from "../../../src/composition/browser-id-factory";
import { BASS_MONO_MANIFEST } from "../../../src/engine/public";
import {
  createDefaultState,
  createAutosave,
  createMemoryProjectRepository,
  documentToState,
  nextProjectRevision,
  parseProjectDocument,
  parseProjectJson,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  parsePortableProject,
  parseStoredProject,
  portableProjectFilename,
  serializeProject,
  serializePortableProject,
  serializeProjectToJson,
  type ModuleSeed,
  type ProjectDocument,
} from "../../../src/state/public";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearanceEnvelope,
  serializeAppearance,
} from "../../../src/themes";

const SEED: ModuleSeed = {
  pluginId: BASS_MONO_MANIFEST.pluginId,
  parameters: { cutoff: 720, resonance: 0.38, waveform: "saw" },
  events: Array.from({ length: 4 }, (_, index) => ({
    type: "note" as const,
    positionTicks: index * 4 * 240,
    durationTicks: 240,
    data: { note: 36, velocity: 0.8, accent: index === 0, slide: false },
  })),
};

const voiceId = (value: string): VoiceId => value as VoiceId;
const parameterId = (value: string): ParameterId => value as ParameterId;
const DRUM_VOICE_IDS = [voiceId("kick"), voiceId("snare")] as const;
const EFFECT_ID = "00000000-0000-4000-8000-000000000777" as EffectInstanceId;
const SINGLE_DRUM_VOICE_ID = voiceId("clap");
const STATEFUL_EFFECT_ID = "00000000-0000-4000-8000-000000000778" as EffectInstanceId;
const STATEFUL_EFFECT_PLUGIN_ID = "stateful-drive" as PluginId;
const DRUM_SEED: ModuleSeed = {
  pluginId: "drum-analog-small" as PluginId,
  parameters: {},
  events: SEED.events.map((event) => ({
    type: "trigger" as const,
    positionTicks: event.positionTicks,
    data: { ...event.data, slide: false },
  })),
  voiceIds: DRUM_VOICE_IDS,
};
const SINGLE_DRUM_SEED: ModuleSeed = {
  pluginId: "drum-one-voice" as PluginId,
  parameters: {},
  events: SEED.events.map((event) => ({
    type: "trigger" as const,
    positionTicks: event.positionTicks,
    data: { ...event.data, slide: false },
  })),
  voiceIds: [SINGLE_DRUM_VOICE_ID],
};

const OPTIONS = {
  createdAt: "2026-07-28T00:00:00.000Z",
  modifiedAt: "2026-07-28T00:00:00.000Z",
  projectRevision: {
    epoch: "0b32ad32-3584-4a91-a012-5eaa968af162" as const,
    counter: 0,
  } as ProjectRevision,
};

const TEST_ID_FACTORY = {
  createUuid: () => "c050f0fb-b0f2-4e7a-9e02-92fd6f5fe9bd",
};

const PARSE = {
  knownPluginIds: [BASS_MONO_MANIFEST.pluginId as string],
  parameterDescriptorsByPluginId: {
    [BASS_MONO_MANIFEST.pluginId]: BASS_MONO_MANIFEST.parameters,
  },
};

const VOICE_INSERT_PARSE = {
  knownPluginIds: [...PARSE.knownPluginIds, DRUM_SEED.pluginId as string],
  parameterDescriptorsByPluginId: {
    ...PARSE.parameterDescriptorsByPluginId,
    [DRUM_SEED.pluginId]: [],
  },
  knownVoiceInsertEffectPluginIds: [DISTORTION_EFFECT_PLUGIN_ID as string],
  stateSchemaVersionByPluginId: {
    [BASS_MONO_MANIFEST.pluginId]: 1,
    [DRUM_SEED.pluginId]: 1,
    [DISTORTION_EFFECT_PLUGIN_ID]: 1,
  },
  voiceInsertEffectsByPluginId: {
    [DISTORTION_EFFECT_PLUGIN_ID]: {
      stateSchemaVersion: 1,
      parameters: [],
    },
  },
  voiceIdsByPluginId: {
    [DRUM_SEED.pluginId]: DRUM_VOICE_IDS,
  },
};

const STATEFUL_VOICE_INSERT_PARSE = {
  ...VOICE_INSERT_PARSE,
  knownVoiceInsertEffectPluginIds: [
    ...VOICE_INSERT_PARSE.knownVoiceInsertEffectPluginIds,
    STATEFUL_EFFECT_PLUGIN_ID as string,
  ],
  stateSchemaVersionByPluginId: {
    ...VOICE_INSERT_PARSE.stateSchemaVersionByPluginId,
    [STATEFUL_EFFECT_PLUGIN_ID]: 2,
  },
  voiceInsertEffectsByPluginId: {
    ...VOICE_INSERT_PARSE.voiceInsertEffectsByPluginId,
    [STATEFUL_EFFECT_PLUGIN_ID]: {
      stateSchemaVersion: 2,
      parameters: [
        { id: parameterId("drive"), valueType: "float", minimum: 0, maximum: 1 },
        { id: parameterId("enabled"), valueType: "boolean" },
        { id: parameterId("mode"), valueType: "enum", enumValues: ["soft", "hard"] },
        { id: parameterId("steps"), valueType: "integer", minimum: 1, maximum: 8 },
      ] as const,
    },
  },
};

function document(seed: ModuleSeed = SEED): ProjectDocument {
  return serializeProject(createDefaultState(browserIdFactory, seed), OPTIONS);
}

describe("project document", () => {
  it("writes the specified root record", () => {
    const written = document();
    expect(written.format).toBe(PROJECT_FORMAT);
    expect(written.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(Object.keys(written).sort()).toEqual([
      "activePatternIndex",
      "assets",
      "automation",
      "effects",
      "format",
      "formatVersion",
      "migrations",
      "mixer",
      "patterns",
      "plugins",
      "project",
      "rack",
      "song",
      "songEnabled",
    ]);
  });

  it("round-trips a project through JSON without losing pattern or parameter data", () => {
    const state = createDefaultState(browserIdFactory, SEED);
    const json = serializeProjectToJson(state, OPTIONS);
    const parsed = parseProjectJson(json, PARSE);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));

    const restored = documentToState(parsed.value, state);
    const before = Object.values(state.project.modules)[0];
    const after = Object.values(restored.project.modules)[0];

    expect(after?.pluginId).toBe(before?.pluginId);
    expect(after?.parameters).toEqual(before?.parameters);
    expect(after?.parts).toEqual(before?.parts);
    expect(restored.project.tempo).toBe(state.project.tempo);
    expect(restored.project.rackSlots).toHaveLength(state.project.rackSlots.length);
  });

  it("records exactly the plugins the project requires", () => {
    expect(document().plugins).toEqual([
      { pluginId: BASS_MONO_MANIFEST.pluginId, stateSchemaVersion: 1 },
    ]);
  });

  it("round-trips a distortion voice insert and its null sibling slots", () => {
    const base = createDefaultState(browserIdFactory, DRUM_SEED);
    const moduleId = Object.values(base.project.modules)[0]?.id;
    if (moduleId === undefined) throw new Error("Test fixture is missing the drum module.");
    const state = {
      ...base,
      project: {
        ...base.project,
        effects: {
          instances: {
            [EFFECT_ID]: {
              id: EFFECT_ID,
              pluginId: DISTORTION_EFFECT_PLUGIN_ID,
              stateVersion: 1,
              state: {},
            },
          },
          voiceInserts: {
            [moduleId]: { kick: EFFECT_ID, snare: null },
          },
        },
      },
    };
    const written = serializeProject(state, OPTIONS);

    expect(written.plugins).toEqual([
      { pluginId: DRUM_SEED.pluginId, stateSchemaVersion: 1 },
      { pluginId: DISTORTION_EFFECT_PLUGIN_ID, stateSchemaVersion: 1 },
    ]);
    expect(written.effects).toEqual({
      instances: [
        {
          id: EFFECT_ID,
          pluginId: DISTORTION_EFFECT_PLUGIN_ID,
          stateVersion: 1,
          state: {},
        },
      ],
      voiceInserts: [
        { moduleId, voiceId: "kick", effectInstanceId: EFFECT_ID },
        { moduleId, voiceId: "snare", effectInstanceId: null },
      ],
    });
    const parsed = parseProjectDocument(written, VOICE_INSERT_PARSE);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    const restored = documentToState(parsed.value, base);

    expect(restored.project.effects.voiceInserts[moduleId]).toEqual({
      kick: EFFECT_ID,
      snare: null,
    });
    expect(restored.project.effects.instances[EFFECT_ID]).toMatchObject({
      pluginId: DISTORTION_EFFECT_PLUGIN_ID,
      stateVersion: 1,
      state: {},
    });
  });

  it("provisions and round-trips the one insert slot of a one-voice drum", () => {
    const base = createDefaultState(browserIdFactory, SINGLE_DRUM_SEED);
    const moduleId = Object.values(base.project.modules)[0]?.id;
    if (moduleId === undefined) throw new Error("Test fixture is missing the one-voice drum.");
    expect(base.project.effects.voiceInserts[moduleId]).toEqual({ clap: null });

    const state = {
      ...base,
      project: {
        ...base.project,
        effects: {
          instances: {
            [EFFECT_ID]: {
              id: EFFECT_ID,
              pluginId: DISTORTION_EFFECT_PLUGIN_ID,
              stateVersion: 1,
              state: {},
            },
          },
          voiceInserts: { [moduleId]: { clap: EFFECT_ID } },
        },
      },
    };
    const written = serializeProject(state, OPTIONS);
    const parsed = parseProjectDocument(written, {
      ...VOICE_INSERT_PARSE,
      knownPluginIds: [...PARSE.knownPluginIds, SINGLE_DRUM_SEED.pluginId],
      parameterDescriptorsByPluginId: {
        ...PARSE.parameterDescriptorsByPluginId,
        [SINGLE_DRUM_SEED.pluginId]: [],
      },
      stateSchemaVersionByPluginId: {
        ...VOICE_INSERT_PARSE.stateSchemaVersionByPluginId,
        [SINGLE_DRUM_SEED.pluginId]: 1,
      },
      voiceIdsByPluginId: { [SINGLE_DRUM_SEED.pluginId]: [SINGLE_DRUM_VOICE_ID] },
    });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(documentToState(parsed.value, base).project.effects.voiceInserts[moduleId]).toEqual({
      clap: EFFECT_ID,
    });
  });

  it("uses registered schema and state contracts for a future voice insert", () => {
    const base = createDefaultState(browserIdFactory, DRUM_SEED);
    const moduleId = Object.values(base.project.modules)[0]?.id;
    if (moduleId === undefined) throw new Error("Test fixture is missing the drum module.");
    const state = {
      ...base,
      project: {
        ...base.project,
        effects: {
          instances: {
            [STATEFUL_EFFECT_ID]: {
              id: STATEFUL_EFFECT_ID,
              pluginId: STATEFUL_EFFECT_PLUGIN_ID,
              stateVersion: 2,
              state: { drive: 0.72, enabled: false, mode: "hard", steps: 4 },
            },
          },
          voiceInserts: { [moduleId]: { kick: STATEFUL_EFFECT_ID, snare: null } },
        },
      },
    };
    const written = serializeProject(state, {
      ...OPTIONS,
      manifestVersionFor: (pluginId) => (pluginId === STATEFUL_EFFECT_PLUGIN_ID ? 2 : 1),
    });
    expect(written.plugins).toContainEqual({
      pluginId: STATEFUL_EFFECT_PLUGIN_ID,
      stateSchemaVersion: 2,
    });
    const parsed = parseProjectDocument(written, STATEFUL_VOICE_INSERT_PARSE);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(parsed.value.effects.instances[0]).toMatchObject({
      pluginId: STATEFUL_EFFECT_PLUGIN_ID,
      stateVersion: 2,
      state: { drive: 0.72, enabled: false, mode: "hard", steps: 4 },
    });
  });

  it("rejects voice-insert state outside its registered parameter descriptors", () => {
    const base = createDefaultState(browserIdFactory, DRUM_SEED);
    const moduleId = Object.values(base.project.modules)[0]?.id;
    if (moduleId === undefined) throw new Error("Test fixture is missing the drum module.");
    const validState = { drive: 0.72, enabled: false, mode: "hard", steps: 4 };
    const state = {
      ...base,
      project: {
        ...base.project,
        effects: {
          instances: {
            [STATEFUL_EFFECT_ID]: {
              id: STATEFUL_EFFECT_ID,
              pluginId: STATEFUL_EFFECT_PLUGIN_ID,
              stateVersion: 2,
              state: validState,
            },
          },
          voiceInserts: { [moduleId]: { kick: STATEFUL_EFFECT_ID, snare: null } },
        },
      },
    };
    const written = serializeProject(state, {
      ...OPTIONS,
      manifestVersionFor: (pluginId) => (pluginId === STATEFUL_EFFECT_PLUGIN_ID ? 2 : 1),
    });
    const invalidStates = [
      { ...validState, drive: 1e300 },
      { ...validState, steps: 1.5 },
      { ...validState, mode: "unsafe" },
      { ...validState, extra: true },
      { enabled: false, mode: "hard", steps: 4 },
    ];

    for (const invalidState of invalidStates) {
      const result = parseProjectDocument(
        {
          ...written,
          effects: {
            ...written.effects,
            instances: written.effects.instances.map((instance) => ({
              ...instance,
              state: invalidState,
            })),
          },
        },
        STATEFUL_VOICE_INSERT_PARSE,
      );
      expect(result.ok, JSON.stringify(invalidState)).toBe(false);
    }
  });

  it("reads legacy empty effects as null slots and rejects missing voice slots", () => {
    const base = createDefaultState(browserIdFactory, DRUM_SEED);
    const moduleId = Object.values(base.project.modules)[0]?.id;
    if (moduleId === undefined) throw new Error("Test fixture is missing the drum module.");
    const written = serializeProject(base, OPTIONS);
    const legacy = { ...written, effects: {} };
    const parsedLegacy = parseProjectDocument(legacy, VOICE_INSERT_PARSE);
    if (!parsedLegacy.ok) throw new Error(JSON.stringify(parsedLegacy.issues));
    expect(parsedLegacy.value.effects.voiceInserts).toEqual([
      { moduleId, voiceId: "kick", effectInstanceId: null },
      { moduleId, voiceId: "snare", effectInstanceId: null },
    ]);

    const invalid = parseProjectDocument(
      {
        ...written,
        effects: {
          ...written.effects,
          voiceInserts: written.effects.voiceInserts.filter((slot) => slot.voiceId !== "snare"),
        },
      },
      VOICE_INSERT_PARSE,
    );
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.issues.some((issue) => issue.message.includes("Missing voice insert slot"))).toBe(
      true,
    );
  });

  it("rejects a voice-insert effect used as a rack module", () => {
    const written = serializeProject(createDefaultState(browserIdFactory, DRUM_SEED), OPTIONS);
    const result = parseProjectDocument(
      {
        ...written,
        plugins: [
          ...written.plugins,
          { pluginId: DISTORTION_EFFECT_PLUGIN_ID, stateSchemaVersion: 1 },
        ],
        rack: written.rack.map((slot) =>
          slot.moduleId === undefined
            ? slot
            : { ...slot, pluginId: DISTORTION_EFFECT_PLUGIN_ID, parameters: {} },
        ),
      },
      VOICE_INSERT_PARSE,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.some((issue) => issue.message.includes("no parameter validation contract")),
    ).toBe(true);
  });

  it("rejects a document that is not the project format", () => {
    const result = parseProjectDocument({ format: "something-else" }, PARSE);
    expect(result.ok).toBe(false);
  });

  it("rejects a format version newer than this build reads", () => {
    const result = parseProjectDocument({ ...document(), formatVersion: 99 }, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("cannot open format 99");
  });

  it("rejects unknown root keys rather than ignoring them", () => {
    const result = parseProjectDocument({ ...document(), script: "alert(1)" }, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("script");
  });

  it("rejects a project that requires a plugin this build cannot instantiate", () => {
    const result = parseProjectDocument(document(), {
      knownPluginIds: [],
      parameterDescriptorsByPluginId: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("cannot open");
  });

  it("rejects a rack over the eight-slot cap and reports every over-cap slot", () => {
    const written = document();
    const oversized = {
      ...written,
      rack: [...written.rack, ...written.rack, { id: "slot-09" }],
    };
    const result = parseProjectDocument(oversized, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(1);
    expect(result.issues.every((issue) => issue.path.startsWith("rack"))).toBe(true);
  });

  it("rejects a tempo outside the supported range", () => {
    const written = document();
    const result = parseProjectDocument(
      { ...written, project: { ...written.project, tempo: 999 } },
      PARSE,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed event envelope", () => {
    const written = document();
    const patterns = [{ ...written.patterns[0], events: [{ type: "note", positionTicks: -1 }] }];
    const result = parseProjectDocument({ ...written, patterns }, PARSE);
    expect(result.ok).toBe(false);
  });

  it("accepts simultaneous trigger voices and rejects duplicate voice triggers", () => {
    const written = document(DRUM_SEED);
    const first = written.patterns[0];
    if (first === undefined) throw new Error("Test fixture has no Pattern part.");
    const triggers = [
      {
        id: "00000000-0000-4000-8000-000000000901" as never,
        type: "trigger" as const,
        positionTicks: 0,
        data: { note: 36, velocity: 0.8, accent: false, slide: false },
      },
      {
        id: "00000000-0000-4000-8000-000000000902" as never,
        type: "trigger" as const,
        positionTicks: 0,
        data: { note: 38, velocity: 0.7, accent: false, slide: false },
      },
    ];
    const patterns = written.patterns.map((pattern, index) =>
      index === 0 ? { ...pattern, events: triggers } : pattern,
    );
    expect(parseProjectDocument({ ...written, patterns }, VOICE_INSERT_PARSE).ok).toBe(true);

    const secondTrigger = triggers[1];
    if (secondTrigger === undefined) throw new Error("Test fixture has no second trigger.");
    const duplicateVoice = [
      triggers[0],
      { ...secondTrigger, data: { ...secondTrigger.data, note: 36 } },
    ];
    const invalidPatterns = written.patterns.map((pattern, index) =>
      index === 0 ? { ...pattern, events: duplicateVoice } : pattern,
    );
    expect(parseProjectDocument({ ...written, patterns: invalidPatterns }, VOICE_INSERT_PARSE).ok).toBe(
      false,
    );
  });

  it("rejects an event type that the module does not support", () => {
    const bass = document();
    const bassPart = bass.patterns.find((pattern) => pattern.events.length > 0);
    const bassEvent = bassPart?.events[0];
    if (bassPart === undefined || bassEvent === undefined) {
      throw new Error("Test fixture has no bass event.");
    }
    const bassPatterns = bass.patterns.map((pattern) =>
      pattern.id === bassPart.id
        ? {
            ...pattern,
            events: [
              {
                id: bassEvent.id,
                type: "trigger" as const,
                positionTicks: bassEvent.positionTicks,
                data: bassEvent.data,
              },
            ],
          }
        : pattern,
    );
    expect(parseProjectDocument({ ...bass, patterns: bassPatterns }, PARSE).ok).toBe(false);

    const drum = document(DRUM_SEED);
    const drumPart = drum.patterns.find((pattern) => pattern.events.length > 0);
    const drumEvent = drumPart?.events[0];
    if (drumPart === undefined || drumEvent === undefined) {
      throw new Error("Test fixture has no drum event.");
    }
    const drumPatterns = drum.patterns.map((pattern) =>
      pattern.id === drumPart.id
        ? {
            ...pattern,
            events: [
              {
                id: drumEvent.id,
                type: "note" as const,
                positionTicks: drumEvent.positionTicks,
                durationTicks: 240,
                data: drumEvent.data,
              },
            ],
          }
        : pattern,
    );
    expect(parseProjectDocument({ ...drum, patterns: drumPatterns }, VOICE_INSERT_PARSE).ok).toBe(
      false,
    );
  });

  it("rejects overlapping note envelopes and a duration on a trigger", () => {
    const written = document();
    const first = written.patterns.find((pattern) => pattern.events.length > 0);
    const source = first?.events[0];
    if (first === undefined || source === undefined) {
      throw new Error("Test fixture has no Pattern event.");
    }
    const overlap = {
      ...source,
      id: "00000000-0000-4000-8000-000000000903" as never,
      positionTicks: source.positionTicks,
    };
    const overlapPatterns = written.patterns.map((pattern) =>
      pattern.id === first.id ? { ...pattern, events: [...pattern.events, overlap] } : pattern,
    );
    expect(parseProjectDocument({ ...written, patterns: overlapPatterns }, PARSE).ok).toBe(false);

    const triggerWithDuration = {
      ...source,
      type: "trigger" as const,
      durationTicks: 240,
    };
    const durationPatterns = written.patterns.map((pattern) =>
      pattern.id === first.id ? { ...pattern, events: [triggerWithDuration] } : pattern,
    );
    expect(parseProjectDocument({ ...written, patterns: durationPatterns }, PARSE).ok).toBe(false);
  });

  it("rejects malformed rack records and accumulates bounded semantic errors", () => {
    const written = document();
    const result = parseProjectDocument(
      {
        ...written,
        rack: [null, ...written.rack.slice(1, 7), { id: "slot-08", moduleId: "not-a-uuid" }],
        project: { ...written.project, swing: 200 },
      },
      PARSE,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "rack[0]")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "rack[7].moduleId")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "project.swing")).toBe(true);
    expect(result.issues.length).toBeLessThanOrEqual(100);
  });

  it("rejects rack plugins without an exact declared requirement", () => {
    const written = document();
    const occupied = written.rack.findIndex((slot) => slot.moduleId !== undefined);
    const rack = written.rack.map((slot, index) =>
      index === occupied ? { ...slot, pluginId: "drum-analog-small" } : slot,
    );
    const result = parseProjectDocument(
      { ...written, rack },
      {
        knownPluginIds: [...PARSE.knownPluginIds, "drum-analog-small"],
        parameterDescriptorsByPluginId: PARSE.parameterDescriptorsByPluginId,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.message.includes("matching requirement"))).toBe(
      true,
    );
  });

  it("rejects pattern references to modules outside the rack", () => {
    const written = document();
    const patterns = written.patterns.map((pattern, index) =>
      index === 0 ? { ...pattern, moduleId: "4b50c90c-4e3c-4c92-a0f1-668291d20c25" } : pattern,
    );
    const result = parseProjectDocument({ ...written, patterns }, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "patterns[0].moduleId")).toBe(true);
  });

  it("rejects duplicate object keys at any JSON nesting level before schema validation", () => {
    const json = serializeProjectToJson(createDefaultState(browserIdFactory, SEED), OPTIONS)
      .replace('"format":"pulsebox-project"', '"format":"pulsebox-project","format":"other"')
      .replace(/"tempo":\d+/, (tempo) => `${tempo},"\\u0074empo":121`);
    const result = parseProjectJson(json, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.some(
        (issue) => issue.path === "$.format" && issue.message.includes("Duplicate"),
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.path === "$.project.tempo" && issue.message.includes("Duplicate"),
      ),
    ).toBe(true);
    expect(result.issues).toHaveLength(2);
  });

  it("caps duplicate-key reports at the semantic issue limit", () => {
    const json = `{${Array.from({ length: 102 }, (_, index) => `"same":${String(index)}`).join(",")}}`;
    const result = parseProjectJson(json, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(100);
    expect(result.issues.every((issue) => issue.message.includes("Duplicate"))).toBe(true);
  });

  it("rejects unknown, mistyped, invalid-enum, and out-of-range plugin parameters", () => {
    const written = document();
    const occupied = written.rack.findIndex((slot) => slot.moduleId !== undefined);
    const rack = written.rack.map((slot, index) =>
      index === occupied
        ? {
            ...slot,
            parameters: {
              ...slot.parameters,
              cutoff: 12_001,
              resonance: "high",
              waveform: "triangle",
              invented: 0.5,
            },
          }
        : slot,
    );
    const result = parseProjectDocument({ ...written, rack }, PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const hasIssue = (parameter: string, message: string) =>
      result.issues.some(
        (issue) =>
          issue.path === `rack[${String(occupied)}].parameters.${parameter}` &&
          issue.message.includes(message),
      );
    expect(hasIssue("cutoff", "outside")).toBe(true);
    expect(hasIssue("resonance", "numeric")).toBe(true);
    expect(hasIssue("waveform", "enum")).toBe(true);
    expect(hasIssue("invented", "not declared")).toBe(true);
  });

  it("round-trips a deterministic canonical Store archive", () => {
    const written = document();
    const first = serializePortableProject(written);
    const second = serializePortableProject(written);
    expect(first).toEqual(second);
    expect(new DataView(first.buffer, first.byteOffset, first.byteLength).getUint32(0, true)).toBe(
      0x04034b50,
    );
    const parsed = parsePortableProject(first, PARSE);
    expect(parsed.ok).toBe(true);
  });

  it("rejects portable archives with trailing data or a bad CRC", () => {
    const archive = serializePortableProject(document());
    const trailing = new Uint8Array(archive.length + 1);
    trailing.set(archive);
    expect(parsePortableProject(trailing, PARSE).ok).toBe(false);

    const corrupt = archive.slice();
    const manifestOffset = 30 + "manifest.json".length;
    corrupt[manifestOffset] = (corrupt[manifestOffset] ?? 0) ^ 1;
    const parsed = parsePortableProject(corrupt, PARSE);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues[0]?.message).toContain("CRC-32");
  });

  it("reduces a free-text project name to a safe portable filename", () => {
    expect(portableProjectFilename("Neon Basement")).toBe("neon-basement.pulsebox");
    expect(portableProjectFilename("  Late/Night  Jam!  ")).toBe("late-night-jam.pulsebox");
    expect(portableProjectFilename("Track_09")).toBe("track_09.pulsebox");
    // A name made only of punctuation reduces to nothing, which would otherwise
    // download a file called just the extension.
    expect(portableProjectFilename("!!!")).toBe("project.pulsebox");
    expect(portableProjectFilename("")).toBe("project.pulsebox");
  });

  it("rejects a file that is not valid JSON", () => {
    expect(parseProjectJson("{ nope", PARSE).ok).toBe(false);
  });

  it("rejects a file beyond the 8 MiB manifest limit before parsing it", () => {
    const result = parseProjectJson("x".repeat(8 * 1024 * 1024 + 1), PARSE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("size limit");
  });
});

describe("project repository", () => {
  it("saves, lists, loads, and removes a project", async () => {
    const repository = createMemoryProjectRepository();
    const stored = {
      id: "project-1",
      name: "Neon Basement",
      modifiedAt: OPTIONS.modifiedAt,
      document: document(),
    };

    const committed = await repository.save(stored, TEST_ID_FACTORY);
    expect(committed.document.project.revision).toBe(0);
    expect(committed.document.project.revisionEpoch).toBe(TEST_ID_FACTORY.createUuid());
    expect(await repository.list()).toHaveLength(1);
    expect((await repository.load("project-1"))?.name).toBe("Neon Basement");

    await repository.remove("project-1");
    expect(await repository.load("project-1")).toBeUndefined();
  });

  it("advances only committed ProjectRevision tokens and rolls over safely", async () => {
    const repository = createMemoryProjectRepository();
    const state = createDefaultState(browserIdFactory, SEED);
    const candidate = {
      id: state.project.id,
      name: state.project.name,
      modifiedAt: OPTIONS.modifiedAt,
      document: serializeProject(state, OPTIONS),
    };
    const first = await repository.save(candidate, TEST_ID_FACTORY);
    const second = await repository.save(candidate, TEST_ID_FACTORY);
    expect(first.document.project.revision).toBe(0);
    expect(second.document.project.revision).toBe(1);
    expect(second.document.project.revisionEpoch).toBe(first.document.project.revisionEpoch);

    const rolled = nextProjectRevision(
      { epoch: first.document.project.revisionEpoch as never, counter: Number.MAX_SAFE_INTEGER },
      TEST_ID_FACTORY,
    );
    expect(rolled).toEqual({ epoch: TEST_ID_FACTORY.createUuid(), counter: 0 });
  });

  it("keeps exactly one autosave snapshot", async () => {
    const repository = createMemoryProjectRepository();
    const first = { id: "a", name: "A", modifiedAt: OPTIONS.modifiedAt, document: document() };
    const second = { id: "b", name: "B", modifiedAt: OPTIONS.modifiedAt, document: document() };

    await repository.saveAutosave(first);
    await repository.saveAutosave(second);
    expect((await repository.loadAutosave())?.id).toBe("b");

    await repository.clearAutosave();
    expect(await repository.loadAutosave()).toBeUndefined();
  });

  it("uses the creation timestamp of the currently loaded project for autosave", async () => {
    const repository = createMemoryProjectRepository();
    const state = createDefaultState(browserIdFactory, SEED);
    let createdAt = "2026-07-20T00:00:00.000Z";
    const autosave = createAutosave({
      repository,
      parseOptions: PARSE,
      createdAt: () => createdAt,
      now: () => "2026-07-29T00:00:00.000Z",
      projectRevision: () => OPTIONS.projectRevision,
    });

    await autosave.flush(state);
    expect((await repository.loadAutosave())?.document.project.createdAt).toBe(createdAt);

    createdAt = "2026-07-21T00:00:00.000Z";
    await autosave.flush(state);
    expect((await repository.loadAutosave())?.document.project.createdAt).toBe(createdAt);
    autosave.dispose();
  });

  it("validates the IndexedDB wrapper before returning a stored project", () => {
    const written = document();
    const result = parseStoredProject(
      {
        id: written.project.id,
        name: "A different name",
        modifiedAt: written.project.modifiedAt,
        document: written,
      },
      PARSE,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "name",
      message: "Stored record name does not match project metadata.",
    });
  });
});

describe("legacy saved data", () => {
  /**
   * The appearance preference is the only data any earlier build ever wrote, so
   * it is the whole legacy-migration surface. It must keep loading unchanged.
   */
  it("still reads the version 1 appearance envelope written by earlier builds", () => {
    expect(APPEARANCE_STORAGE_KEY).toBe("pulsebox.ui.appearance.v1");

    const legacy = JSON.stringify({
      version: 1,
      highContrast: true,
      theme: "rack",
      userTheme: null,
    });
    const parsed = parseAppearanceEnvelope(legacy);
    expect(parsed).toEqual({ highContrast: true, theme: "rack", userTheme: null });
  });

  it("treats an envelope naming a removed built-in theme as invalid data", () => {
    // Earlier builds could store mono, cosmic, analog, or rust. Those themes
    // were removed, so the envelope is invalid and the reader returns
    // undefined; the theme service then falls back to rack and reports the
    // corrupt preference once.
    const removed = JSON.stringify({
      version: 1,
      highContrast: true,
      theme: "cosmic",
      userTheme: null,
    });
    expect(parseAppearanceEnvelope(removed)).toBeUndefined();
  });

  it("falls back to the default appearance when the stored value is unreadable", () => {
    expect(parseAppearanceEnvelope("not json")).toBeUndefined();
    expect(parseAppearanceEnvelope(null)).toBeUndefined();
  });

  it("writes an envelope its own reader accepts", () => {
    const round = parseAppearanceEnvelope(serializeAppearance(DEFAULT_APPEARANCE));
    expect(round).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("format 1 documents", () => {
  it("round-trips the full bank, mixer, and song through JSON", () => {
    const base = createDefaultState(browserIdFactory, SEED);
    const state = {
      ...base,
      project: {
        ...base.project,
        swing: 0.4,
        masterLevel: 0.55,
        activePatternIndex: 2,
        song: { enabled: true, entries: [{ patternIndex: 1, repeats: 3 }] },
      },
    };

    const json = serializeProjectToJson(state, OPTIONS);
    const parsed = parseProjectJson(json, PARSE);
    if (!parsed.ok) throw new Error(parsed.issues[0]?.message ?? "Expected a valid document.");
    const restored = documentToState(parsed.value, base);

    expect(restored.project.swing).toBe(0.4);
    expect(restored.project.masterLevel).toBe(0.55);
    expect(restored.project.activePatternIndex).toBe(2);
    expect(restored.project.song).toEqual({
      enabled: true,
      entries: [{ patternIndex: 1, repeats: 3 }],
    });
  });
});

describe("global swing", () => {
  /** Decision D69: one project-wide Swing value, stored as percent. */
  it("stores Swing in project metadata as percent and restores it as a ratio", () => {
    const base = createDefaultState(browserIdFactory, SEED);
    const state = { ...base, project: { ...base.project, swing: 0.54 } };

    const written = serializeProject(state, OPTIONS);
    expect(written.project.swing).toBe(54);
    expect("swing" in written).toBe(false);

    const parsed = parseProjectDocument(written, PARSE);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(documentToState(parsed.value, base).project.swing).toBeCloseTo(0.54, 5);
  });

  it("defaults Swing to straight when an older document omits it", () => {
    const base = createDefaultState(browserIdFactory, SEED);
    const written = serializeProject(base, OPTIONS);
    const metadata: Record<string, unknown> = { ...written.project };
    delete metadata.swing;

    const parsed = parseProjectDocument({ ...written, project: metadata }, PARSE);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(documentToState(parsed.value, base).project.swing).toBe(0);
  });

  it("rejects a Swing percent outside 0 through 100", () => {
    const written = document();
    const result = parseProjectDocument(
      { ...written, project: { ...written.project, swing: 101 } },
      PARSE,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "project.swing")).toBe(true);
  });
});
