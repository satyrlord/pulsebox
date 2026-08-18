import { describe, expect, it } from "vitest";

import type {
  AutomationLaneId,
  ProjectRevision,
} from "../../../src/contracts/ids";
import type { PluginId } from "../../../src/contracts/parameters";
import { createDefaultState } from "../../../src/state/default-state";
import type { AutomationLaneState } from "../../../src/state/model";
import {
  documentToState,
  parseProjectDocument,
  serializeProject,
} from "../../../src/state/persistence/project-document";

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
      { scope: "effect", targetId: effectId, parameterId: "wet-dry", value: 0.6 },
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
      "master",
    ]);
    const rewritten = serializeProject(restored, OPTIONS);
    const reparsed = parseProjectDocument(rewritten, PARSE_OPTIONS);
    expect(reparsed.ok).toBe(true);
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
