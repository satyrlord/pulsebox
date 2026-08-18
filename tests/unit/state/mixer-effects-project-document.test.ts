import { describe, expect, it, vi } from "vitest";

import type {
  AutomationLaneId,
  ProjectRevision,
} from "../../../src/contracts/ids";
import type { PluginId } from "../../../src/contracts/parameters";
import { BUILT_IN_EFFECTS } from "../../../src/engine/effects/registry";
import { createDefaultState } from "../../../src/state/default-state";
import type { AutomationLaneState } from "../../../src/state/model";
import {
  documentToState,
  parseProjectDocument,
  serializeProject,
  type ProjectDocument,
} from "../../../src/state/persistence/project-document";
import { restoreAutosave } from "../../../src/state/persistence/autosave";
import {
  createMemoryProjectRepository,
  parseStoredProject,
} from "../../../src/state/persistence/project-repository";

const TIMESTAMP = "2026-08-17T12:00:00.000Z";
const OPTIONS = {
  createdAt: TIMESTAMP,
  modifiedAt: TIMESTAMP,
  projectRevision: {
    epoch: "00000000-0000-4000-8000-000000000001",
    counter: 0,
  } as ProjectRevision,
};
const PARSE_OPTIONS = {
  knownPluginIds: ["bass-test"],
  parameterDescriptorsByPluginId: { "bass-test": [] },
};
const MIGRATION_PARSE_OPTIONS = {
  ...PARSE_OPTIONS,
  effectDescriptorsByPluginId: Object.fromEntries(
    BUILT_IN_EFFECTS.map(({ manifest }) => [manifest.pluginId, {
      stateSchemaVersion: manifest.stateSchemaVersion,
      parameters: manifest.pluginId === "limiter"
        ? manifest.parameters.filter((parameter) => parameter.id === "input")
        : [],
      placements: manifest.placements,
    }]),
  ),
};

function ids() {
  let value = 1;
  return { createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}` };
}

function document() {
  return serializeProject(
    createDefaultState(ids(), {
      pluginId: "bass-test" as PluginId,
      parameters: {},
      events: [],
    }, () => TIMESTAMP),
    OPTIONS,
  );
}

interface FormatTwoTestDocument {
  formatVersion: number;
  project: { id: string; name: string; modifiedAt: string };
  effects: { instances: Record<string, unknown>[] };
  rack: { sends?: Record<string, unknown>[] }[];
  mixer: { channels: { sends: Record<string, unknown>[] }[] };
  patterns: { id: string; automationLaneIds: string[] }[];
  automation: unknown[];
  migrations?: unknown;
}

function formatTwoDocument(): FormatTwoTestDocument {
  const legacy = structuredClone(document()) as unknown as FormatTwoTestDocument;
  legacy.formatVersion = 2;
  for (const effect of legacy.effects.instances) {
    const state = { ...(effect.state as Record<string, unknown>) };
    if (effect.pluginId === "limiter") state.gain = 0;
    effect.state = state;
    effect.wetDry = 1;
    delete effect.mix;
    delete effect.gainDecibels;
  }
  for (const slot of legacy.rack) {
    for (const send of slot.sends ?? []) send.mode = "post-fader";
  }
  for (const channel of legacy.mixer.channels) {
    for (const send of channel.sends) send.mode = "post-fader";
  }
  return legacy;
}

async function expectFormatTwoRejectedAcrossPaths(legacy: FormatTwoTestDocument): Promise<void> {
  expect(parseProjectDocument(legacy, MIGRATION_PARSE_OPTIONS).ok).toBe(false);
  const stored = {
    id: legacy.project.id,
    name: legacy.project.name,
    modifiedAt: legacy.project.modifiedAt,
    document: legacy as unknown as ProjectDocument,
  };
  expect(parseStoredProject(stored, MIGRATION_PARSE_OPTIONS).ok).toBe(false);
  const repository = createMemoryProjectRepository();
  await repository.saveAutosave(stored);
  const onError = vi.fn();
  const restored = await restoreAutosave(createDefaultState(ids()), {
    repository,
    parseOptions: MIGRATION_PARSE_OPTIONS,
    onError,
  });
  expect(restored.document).toBeUndefined();
  expect(onError).toHaveBeenCalledOnce();
  expect(await repository.loadAutosave()).toBeUndefined();
}

describe("mixer and effects project document", () => {
  it("round-trips the canonical eight-channel mixer and effect chains", () => {
    const written = document();
    expect(written.mixer.channels).toHaveLength(8);
    expect(written.mixer.sends.map((send) => send.busId)).toEqual([
      "send-a",
      "send-b",
      "send-c",
      "send-d",
    ]);
    expect(written.effects.sendChains).toHaveLength(4);
    expect(written.effects.masterChain.slots).toHaveLength(6);
    expect(written.effects.instances.every((effect) => "mix" in effect && "gainDecibels" in effect)).toBe(true);
    expect(written.effects.instances.every((effect) => !("wetDry" in effect))).toBe(true);
    expect(written.mixer.channels.every((channel) => channel.sends.every((send) => !("mode" in send)))).toBe(true);
    const parsed = parseProjectDocument(written, PARSE_OPTIONS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    const restored = documentToState(parsed.value, createDefaultState(ids(), undefined, () => TIMESTAMP));
    expect(restored.project.masterLevel).toBe(written.mixer.master.level);
    expect(restored.project.effects.masterChain).toHaveLength(6);
    expect(restored.project.effects.masterEffectsBypassed).toBe(false);
  });

  it("round-trips every external automation scope", () => {
    const written = document();
    const moduleId = written.rack.find((slot) => slot.moduleId !== undefined)?.moduleId;
    const effectId = written.effects.instances[0]?.id;
    const pattern = written.patterns[0];
    if (moduleId === undefined || effectId === undefined || pattern === undefined) {
      throw new Error("Expected module, effect, and Pattern fixtures.");
    }
    const lanes = [
      { scope: "mixer", targetId: moduleId, parameterId: "level", value: 0.5 },
      { scope: "send", targetId: moduleId, parameterId: "send-a-amount", value: 0.4 },
      { scope: "send-return", targetId: "send-a", parameterId: "return-level", value: 0.7 },
      { scope: "effect", targetId: effectId, parameterId: "mix", value: 0.6 },
      { scope: "effect", targetId: effectId, parameterId: "gain", value: -3 },
      { scope: "master", targetId: "master", parameterId: "level", value: 0.8 },
    ].map(({ value, ...lane }, index) => ({
      id: `00000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`,
      ...lane,
      patternId: pattern.id,
      stepTicks: 240,
      steps: [{ tick: 0, value }],
    }));
    const withAutomation = structuredClone(written);
    (withAutomation as unknown as { automation: unknown[] }).automation = lanes;
    (withAutomation.patterns[0] as unknown as { automationLaneIds: string[] }).automationLaneIds = lanes.map(
      (lane) => lane.id,
    );

    const parsed = parseProjectDocument(withAutomation, PARSE_OPTIONS);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(parsed.ok).toBe(true);
    const restored = documentToState(
      parsed.value,
      createDefaultState(ids(), undefined, () => TIMESTAMP),
    );
    expect(Object.values(restored.project.automationLanes).map((lane) => lane.scope)).toEqual([
      "mixer",
      "send",
      "send-return",
      "effect",
      "effect",
      "master",
    ]);
    const rewritten = serializeProject(restored, OPTIONS);
    const reparsed = parseProjectDocument(rewritten, PARSE_OPTIONS);
    expect(reparsed.ok).toBe(true);
  });

  it("migrates format 2 effect stages through import, open, and autosave", async () => {
    const current = document();
    const legacy = structuredClone(current) as unknown as {
      formatVersion: number;
      effects: { instances: Record<string, unknown>[]; moduleChains: { moduleId: string }[] };
      rack: { sends?: Record<string, unknown>[] }[];
      mixer: { channels: { sends: Record<string, unknown>[] }[] };
      patterns: { id: string; automationLaneIds: string[] }[];
      automation: Record<string, unknown>[];
      migrations: unknown[];
    };
    legacy.formatVersion = 2;
    for (const [index, effect] of legacy.effects.instances.entries()) {
      const state = { ...(effect.state as Record<string, unknown>) };
      if (index === 0) state.mix = 0.4;
      if (effect.pluginId === "limiter") state.gain = 12;
      effect.state = state;
      effect.wetDry = index === 0 ? 0.5 : 1;
      delete effect.mix;
      delete effect.gainDecibels;
    }
    for (const slot of legacy.rack) {
      for (const send of slot.sends ?? []) send.mode = "post-fader";
    }
    for (const channel of legacy.mixer.channels) {
      for (const send of channel.sends) send.mode = "post-fader";
    }
    const effectId = String(legacy.effects.instances[0]?.id);
    const limiterId = String(
      legacy.effects.instances.find((effect) => effect.pluginId === "limiter")?.id,
    );
    const occupiedModuleId = legacy.effects.moduleChains[0]?.moduleId;
    if (occupiedModuleId === undefined) throw new Error("Expected a module chain.");
    const legacyPattern = legacy.patterns[0];
    if (legacyPattern === undefined) throw new Error("Expected a migration Pattern.");
    const patternId = legacyPattern.id;
    const innerLaneId = "00000000-0000-4000-8000-000000000801";
    const outerLaneId = "00000000-0000-4000-8000-000000000802";
    const sendModeLaneId = "00000000-0000-4000-8000-000000000803";
    const limiterGainLaneId = "00000000-0000-4000-8000-000000000804";
    legacy.automation = [
      {
        id: innerLaneId,
        scope: "effect",
        targetId: effectId,
        parameterId: "mix",
        patternId,
        stepTicks: 240,
        steps: [{ tick: 0, value: 0.4 }],
      },
      {
        id: outerLaneId,
        scope: "effect",
        targetId: effectId,
        parameterId: "wet-dry",
        patternId,
        stepTicks: 240,
        steps: [{ tick: 0, value: 1 }],
      },
      {
        id: sendModeLaneId,
        scope: "send",
        targetId: occupiedModuleId,
        parameterId: "send-a-mode",
        patternId,
        stepTicks: 240,
        steps: [{ tick: 0, value: "pre-fader" }],
      },
      {
        id: limiterGainLaneId,
        scope: "effect",
        targetId: limiterId,
        parameterId: "gain",
        patternId,
        stepTicks: 240,
        steps: [{ tick: 0, value: 6 }],
      },
    ];
    legacyPattern.automationLaneIds = [
      innerLaneId,
      outerLaneId,
      sendModeLaneId,
      limiterGainLaneId,
    ];

    const parsed = parseProjectDocument(legacy, MIGRATION_PARSE_OPTIONS);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(parsed.value.formatVersion).toBe(3);
    expect(parsed.value.effects.instances[0]?.state).not.toHaveProperty("mix");
    const dry = Math.cos(Math.PI / 4) + Math.cos(0.4 * Math.PI / 2) * Math.sin(Math.PI / 4);
    const wet = Math.sin(0.4 * Math.PI / 2) * Math.sin(Math.PI / 4);
    const expectedGain = Math.hypot(dry, wet);
    expect(parsed.value.effects.instances[0]?.mix).toBeCloseTo(
      (Math.atan2(wet, dry) * 2) / Math.PI,
      12,
    );
    expect(parsed.value.effects.instances[0]?.gainDecibels).toBeCloseTo(
      20 * Math.log10(expectedGain),
      12,
    );
    const limiter = parsed.value.effects.instances.find((effect) => effect.pluginId === "limiter");
    expect(limiter?.state).toEqual({ input: 12 });
    expect(parsed.value.mixer.channels[0]?.sends[0]).toEqual({ busId: "send-a", amount: 0 });
    expect(parsed.value.automation.map((lane) => lane.parameterId)).toEqual([
      "input",
      "mix",
      "gain",
    ]);
    expect(parsed.value.automation.map((lane) => lane.id)).toEqual([
      limiterGainLaneId,
      outerLaneId,
      innerLaneId,
    ]);
    expect(parsed.value.patterns[0]?.automationLaneIds).toEqual([
      innerLaneId,
      outerLaneId,
      limiterGainLaneId,
    ]);
    expect(parsed.value.migrations).toContainEqual({
      scope: "project",
      id: "project-format-2-to-3-effect-stages",
      fromVersion: 2,
      toVersion: 3,
      implementation: "1.0.0",
    });

    const stored = {
      id: current.project.id,
      name: current.project.name,
      modifiedAt: current.project.modifiedAt,
      document: legacy as unknown as ProjectDocument,
    };
    const opened = parseStoredProject(stored, MIGRATION_PARSE_OPTIONS);
    expect(opened.ok && opened.value.document.formatVersion).toBe(3);
    const repository = createMemoryProjectRepository();
    await repository.saveAutosave(stored);
    const restored = await restoreAutosave(createDefaultState(ids()), {
      repository,
      parseOptions: MIGRATION_PARSE_OPTIONS,
    });
    expect(restored.document?.formatVersion).toBe(3);
  });

  it.each([
    ["missing wetDry", (legacy: FormatTwoTestDocument) => {
      delete legacy.effects.instances[0]?.wetDry;
    }],
    ["out-of-range wetDry", (legacy: FormatTwoTestDocument) => {
      const effect = legacy.effects.instances[0];
      if (effect !== undefined) effect.wetDry = 2;
    }],
    ["invalid present plugin Mix", (legacy: FormatTwoTestDocument) => {
      const effect = legacy.effects.instances[0];
      if (effect === undefined) return;
      effect.state = { ...(effect.state as Record<string, unknown>), mix: 2 };
    }],
  ])("rejects format 2 %s through import, open, and autosave", async (_name, mutate) => {
    const legacy = formatTwoDocument();
    mutate(legacy);
    await expectFormatTwoRejectedAcrossPaths(legacy);
  });

  it.each([
    ["non-object lane", (legacy: FormatTwoTestDocument) => {
      legacy.automation = [null];
    }],
    ["non-object step", (legacy: FormatTwoTestDocument) => {
      const effectId = String(legacy.effects.instances[0]?.id);
      const pattern = legacy.patterns[0];
      if (pattern === undefined) throw new Error("Expected a migration Pattern.");
      const laneId = "00000000-0000-4000-8000-000000000805";
      legacy.automation = [{
        id: laneId,
        scope: "effect",
        targetId: effectId,
        parameterId: "wet-dry",
        patternId: pattern.id,
        stepTicks: 240,
        steps: [null],
      }];
      pattern.automationLaneIds = [laneId];
    }],
    ["out-of-range Mix step", (legacy: FormatTwoTestDocument) => {
      const effectId = String(legacy.effects.instances[0]?.id);
      const pattern = legacy.patterns[0];
      if (pattern === undefined) throw new Error("Expected a migration Pattern.");
      const laneId = "00000000-0000-4000-8000-000000000806";
      legacy.automation = [{
        id: laneId,
        scope: "effect",
        targetId: effectId,
        parameterId: "mix",
        patternId: pattern.id,
        stepTicks: 240,
        steps: [{ tick: 0, value: 2 }],
      }];
      pattern.automationLaneIds = [laneId];
    }],
  ])("rejects format 2 automation with a %s through all restore paths", async (_name, mutate) => {
    const legacy = formatTwoDocument();
    mutate(legacy);
    await expectFormatTwoRejectedAcrossPaths(legacy);
  });

  it.each([
    ["missing migration list", (legacy: FormatTwoTestDocument) => {
      delete legacy.migrations;
    }],
    ["non-array migration list", (legacy: FormatTwoTestDocument) => {
      legacy.migrations = {};
    }],
  ])("rejects a format 2 %s through all restore paths", async (_name, mutate) => {
    const legacy = formatTwoDocument();
    mutate(legacy);
    await expectFormatTwoRejectedAcrossPaths(legacy);
  });

  it("rejects a rack and canonical mixer mismatch", () => {
    const written = document();
    const mismatched = structuredClone(written);
    const channel = mismatched.mixer.channels[0];
    if (channel === undefined) throw new Error("Expected first mixer channel.");
    (channel as { level: number }).level = 0.9;
    const parsed = parseProjectDocument(mismatched, PARSE_OPTIONS);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.some((issue) => issue.path === "mixer.channels[0].level")).toBe(true);
  });

  it("writes the installed plugin identity instead of a hard-coded version", () => {
    const written = serializeProject(
      createDefaultState(
        ids(),
        { pluginId: "bass-test" as PluginId, parameters: {}, events: [] },
        () => TIMESTAMP,
      ),
      {
        ...OPTIONS,
        pluginMetadataByPluginId: {
          "bass-test": {
            kind: "instrument",
            pluginVersion: "2.3.4",
            apiVersion: 1,
            stateSchemaVersion: 7,
          },
        },
      },
    );

    expect(written.plugins).toContainEqual({
      pluginId: "bass-test",
      kind: "instrument",
      pluginVersion: "2.3.4",
      apiVersion: 1,
      stateSchemaVersion: 7,
    });
  });

  it("sorts root automation lanes by stable ID for canonical serialization", () => {
    const base = createDefaultState(
      ids(),
      { pluginId: "bass-test" as PluginId, parameters: {}, events: [] },
      () => TIMESTAMP,
    );
    const moduleId = base.ui.selectedModuleId;
    const patternId = base.project.patterns[0]?.id;
    if (moduleId === undefined || patternId === undefined) {
      throw new Error("Expected a module and Pattern fixture.");
    }
    const lateId = "00000000-0000-4000-8000-000000000999" as AutomationLaneId;
    const earlyId = "00000000-0000-4000-8000-000000000001" as AutomationLaneId;
    const lanes: Record<AutomationLaneId, AutomationLaneState> = {
      [lateId]: {
        id: lateId,
        scope: "mixer",
        targetId: moduleId,
        parameterId: "level",
        patternId,
        stepTicks: 240,
        steps: [{ tick: 0, value: 0.5 }],
      },
      [earlyId]: {
        id: earlyId,
        scope: "mixer",
        targetId: moduleId,
        parameterId: "pan",
        patternId,
        stepTicks: 240,
        steps: [{ tick: 0, value: 0 }],
      },
    };
    const state = {
      ...base,
      project: {
        ...base.project,
        automationLanes: lanes,
        patterns: base.project.patterns.map((pattern) =>
          pattern.id === patternId
            ? { ...pattern, automationLaneIds: [lateId, earlyId] }
            : pattern,
        ),
      },
    };

    const written = serializeProject(state, OPTIONS);
    expect(written.automation.map((lane) => lane.id)).toEqual([earlyId, lateId]);
    expect(parseProjectDocument(written, PARSE_OPTIONS).ok).toBe(true);
  });

  it("rejects broken effect references, invalid pinned focus, and a missing limiter", () => {
    const written = document();
    const malformed = structuredClone(written);
    const sendChain = malformed.effects.sendChains[0];
    if (sendChain === undefined) throw new Error("Expected first send chain.");
    (sendChain as { pinnedEffectId: string | null }).pinnedEffectId =
      "00000000-0000-4000-8000-000000000999";
    const masterSlots = malformed.effects.masterChain.slots as (string | null)[];
    const last = masterSlots.findLastIndex((slot) => slot !== null);
    if (last < 0) throw new Error("Expected protected limiter.");
    masterSlots[last] = null;
    const parsed = parseProjectDocument(malformed, PARSE_OPTIONS);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.some((issue) => issue.path === "effects.sendChains[0].pinnedEffectId")).toBe(true);
    expect(parsed.issues.some((issue) => issue.path === "effects.masterChain.slots")).toBe(true);
  });
});
