import { describe, expect, it, vi } from "vitest";

import {
  DISTORTION_EFFECT_PLUGIN_ID,
  type EffectInstanceState,
} from "../../../src/contracts/effects";
import {
  createGestureId,
  type EffectInstanceId,
  type IdFactory,
  type VoiceId,
} from "../../../src/contracts/ids";
import type { ParameterId, PluginId } from "../../../src/contracts/parameters";
import { createDefaultState } from "../../../src/state/default-state";
import {
  createParameterValidator,
  type ImportParameterDescriptor,
} from "../../../src/state/persistence/project-document";
import { PulseStore } from "../../../src/state/pulse-store";

const seed = {
  pluginId: "bass-mono" as PluginId,
  parameters: { cutoff: 720, waveform: "saw", volume: 0.62 },
  events: Array.from({ length: 8 }, (_, index) => ({
    type: "note" as const,
    positionTicks: index * 2 * 240,
    durationTicks: 240,
    data: { note: 36, velocity: 0.8, accent: index % 2 === 0, slide: false },
  })),
};

const parameterId = (value: string): ParameterId => value as ParameterId;
const voiceId = (value: string): VoiceId => value as VoiceId;
const KICK = voiceId("kick");
const SNARE = voiceId("snare");
const CLAP = voiceId("clap");
const DRUM_VOICE_IDS = [KICK, SNARE] as const;

// The store requires the shared descriptor-based validator, so these fixtures
// declare the exact parameters the tests dispatch.
const DESCRIPTORS: Readonly<Record<string, readonly ImportParameterDescriptor[]>> = {
  "bass-mono": [
    { id: parameterId("cutoff"), valueType: "float", minimum: 0, maximum: 20_000 },
    { id: parameterId("volume"), valueType: "float", minimum: 0, maximum: 1 },
    { id: parameterId("waveform"), valueType: "enum", enumValues: ["saw", "square"] },
  ],
  "drum-analog-small": [
    { id: parameterId("tone"), valueType: "float", minimum: 0, maximum: 1 },
    { id: parameterId("drive"), valueType: "float", minimum: 0, maximum: 1 },
  ],
};

const validateParameter = createParameterValidator((pluginId) => DESCRIPTORS[pluginId]);

function createStore(ids: IdFactory, onDelta = () => undefined): PulseStore {
  return new PulseStore(createDefaultState(ids, seed), ids, seed, onDelta, validateParameter);
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Test fixture is missing a required value.");
  return value;
}

function defaultPatternId(store: PulseStore) {
  return required(store.getState().project.patterns[1]).id;
}

function part(store: PulseStore, moduleId: string) {
  return required(store.getState().project.patterns[1]?.parts[moduleId as never]);
}

function moduleParts(store: PulseStore, moduleId: string) {
  return store.getState().project.patterns.flatMap((pattern) => {
    const value = pattern.parts[moduleId as never];
    return value === undefined ? [] : [value];
  });
}

function requiredEffectId(value: EffectInstanceId | null | undefined): EffectInstanceId {
  if (value === undefined || value === null) throw new Error("Test fixture is missing an effect.");
  return value;
}

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

function createDistortionVoiceInsert(
  id: EffectInstanceId,
  pluginId: PluginId,
): EffectInstanceState | undefined {
  if (pluginId !== DISTORTION_EFFECT_PLUGIN_ID) return undefined;
  return { id, pluginId, stateVersion: 1, state: {} };
}

describe("PulseStore", () => {
  it("creates, updates, removes, and undoes a Pattern-owned automation lane", () => {
    const store = createStore(deterministicIds());
    const moduleId = required(store.getState().ui.selectedModuleId);
    const patternId = defaultPatternId(store);
    const steps = [{ tick: 0, value: 840 }];

    expect(
      store.dispatch(
        store.createCommand("automation-lane-steps-set", {
          moduleId,
          patternId,
          parameterId: "cutoff",
          steps,
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });

    const pattern = required(store.getState().project.patterns.find((candidate) => candidate.id === patternId));
    const laneId = required(pattern.parts[moduleId]?.automationLaneIds[0]);
    expect(pattern.automationLaneIds).toEqual([laneId]);
    expect(store.getState().project.automationLanes[laneId]).toMatchObject({
      patternId,
      targetId: moduleId,
      parameterId: "cutoff",
      steps,
    });

    store.dispatch(
      store.createCommand("automation-lane-steps-set", {
        moduleId,
        patternId,
        parameterId: "cutoff",
        steps: [],
      }),
    );
    expect(store.getState().project.automationLanes[laneId]).toBeUndefined();
    expect(required(store.getState().project.patterns.find((candidate) => candidate.id === patternId)).automationLaneIds).toEqual([]);

    store.undo();
    expect(store.getState().project.automationLanes[laneId]?.steps).toEqual(steps);
  });

  it("creates an empty Pattern part for the first automation step", () => {
    const ids = deterministicIds();
    const initial = createDefaultState(ids, seed);
    const moduleId = required(initial.ui.selectedModuleId);
    const pattern = required(initial.project.patterns[1]);
    const store = new PulseStore(
      {
        ...initial,
        project: {
          ...initial.project,
          patterns: initial.project.patterns.map((candidate) =>
            candidate.id === pattern.id
              ? {
                  ...candidate,
                  parts: Object.fromEntries(
                    Object.entries(candidate.parts).filter(([id]) => id !== moduleId),
                  ),
                }
              : candidate,
          ),
        },
      },
      ids,
      seed,
      () => undefined,
      validateParameter,
    );

    expect(
      store.dispatch(
        store.createCommand("automation-lane-steps-set", {
          moduleId,
          patternId: pattern.id,
          parameterId: "cutoff",
          steps: [{ tick: 0, value: 840 }],
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    expect(
      required(
        store.getState().project.patterns.find((candidate) => candidate.id === pattern.id),
      ).parts[moduleId],
    ).toMatchObject({ length: 16, events: [], automationLaneIds: [expect.any(String)] });
  });

  it("clears Pattern events and automation as one restorable project replacement", () => {
    const deltas = vi.fn();
    const store = createStore(deterministicIds(), deltas);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const patternId = defaultPatternId(store);
    const originalEvents = part(store, moduleId).events;
    store.dispatch(
      store.createCommand("automation-lane-steps-set", {
        moduleId,
        patternId,
        parameterId: "cutoff",
        steps: [{ tick: 0, value: 840 }],
      }),
    );
    const laneId = required(part(store, moduleId).automationLaneIds[0]);

    expect(store.dispatch(store.createCommand("pattern-clear", { patternId }))).toMatchObject({
      status: "accepted",
      changed: true,
    });
    expect(part(store, moduleId)).toMatchObject({ events: [], automationLaneIds: [] });
    expect(store.getState().project.automationLanes[laneId]).toBeUndefined();
    expect(deltas).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "project-replace", targetIds: [moduleId] }),
    );

    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(part(store, moduleId).events).toEqual(originalEvents);
    expect(part(store, moduleId).automationLaneIds).toEqual([laneId]);
    expect(store.getState().project.automationLanes[laneId]?.steps).toEqual([
      { tick: 0, value: 840 },
    ]);
  });

  it("duplicates a Pattern with fresh automation lane and event IDs", () => {
    const store = createStore(deterministicIds());
    const moduleId = required(store.getState().ui.selectedModuleId);
    const patternId = defaultPatternId(store);
    store.dispatch(
      store.createCommand("automation-lane-steps-set", {
        moduleId,
        patternId,
        parameterId: "cutoff",
        steps: [{ tick: 0, value: 840 }],
      }),
    );
    const sourcePart = part(store, moduleId);
    const sourceLaneId = required(sourcePart.automationLaneIds[0]);

    store.dispatch(store.createCommand("pattern-duplicate", { patternId }));
    const copy = required(
      store.getState().project.patterns.find((pattern) => pattern.name === "Verse copy"),
    );
    const copyPart = required(copy.parts[moduleId]);
    const copyLaneId = required(copyPart.automationLaneIds[0]);
    expect(copyLaneId).not.toBe(sourceLaneId);
    expect(copy.automationLaneIds).toEqual([copyLaneId]);
    expect(copyPart.events.map((event) => event.id)).not.toEqual(
      sourcePart.events.map((event) => event.id),
    );
    expect(store.getState().project.automationLanes[copyLaneId]).toMatchObject({
      id: copyLaneId,
      patternId: copy.id,
      targetId: moduleId,
      parameterId: "cutoff",
      steps: [{ tick: 0, value: 840 }],
    });
  });

  it("duplicates a module with fresh automation lanes targeted at the copy", () => {
    const store = createStore(deterministicIds());
    const moduleId = required(store.getState().ui.selectedModuleId);
    const patternId = defaultPatternId(store);
    store.dispatch(
      store.createCommand("automation-lane-steps-set", {
        moduleId,
        patternId,
        parameterId: "cutoff",
        steps: [{ tick: 0, value: 840 }],
      }),
    );
    const sourceLaneId = required(part(store, moduleId).automationLaneIds[0]);
    const targetSlot = required(store.getState().project.rackSlots[1]);

    store.dispatch(
      store.createCommand("rack-module-duplicate", { moduleId, slotId: targetSlot.id }),
    );
    const copyModuleId = required(store.getState().project.rackSlots[1]?.moduleId);
    const pattern = required(
      store.getState().project.patterns.find((candidate) => candidate.id === patternId),
    );
    const copyPart = required(pattern.parts[copyModuleId]);
    const copyLaneId = required(copyPart.automationLaneIds[0]);
    expect(copyLaneId).not.toBe(sourceLaneId);
    expect(pattern.automationLaneIds).toEqual([sourceLaneId, copyLaneId]);
    expect(store.getState().project.automationLanes[copyLaneId]).toMatchObject({
      id: copyLaneId,
      patternId,
      targetId: copyModuleId,
      parameterId: "cutoff",
      steps: [{ tick: 0, value: 840 }],
    });
  });

  it("rejects a shortened part when its automation would leave the valid grid", () => {
    const store = createStore(deterministicIds());
    const moduleId = required(store.getState().ui.selectedModuleId);
    const patternId = defaultPatternId(store);
    store.dispatch(
      store.createCommand("pattern-part-events-replace", {
        moduleId,
        patternId,
        events: [],
      }),
    );
    store.dispatch(
      store.createCommand("automation-lane-steps-set", {
        moduleId,
        patternId,
        parameterId: "cutoff",
        steps: [{ tick: 15 * 240, value: 840 }],
      }),
    );

    expect(
      store.dispatch(
        store.createCommand("pattern-part-length-set", { moduleId, patternId, length: 8 }),
      ),
    ).toMatchObject({
      status: "rejected",
      error: { message: "Automation steps would fall outside the shortened Pattern part." },
    });
    expect(
      store.dispatch(
        store.createCommand("pattern-part-events-replace", {
          moduleId,
          patternId,
          events: [],
          length: 8,
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      error: { message: "Automation steps would fall outside the shortened Pattern part." },
    });
  });

  it("edits note duration and velocity through one undoable event command", () => {
    const ids = deterministicIds();
    const deltas = vi.fn();
    const store = createStore(ids, deltas);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const eventId = required(part(store, moduleId).events[0]?.id);

    expect(
      store.dispatch(
        store.createCommand("pattern-events-edit", {
          moduleId,
          patternId: defaultPatternId(store),
          edit: { type: "resize", eventId, durationTicks: 480 },
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    expect(part(store, moduleId).events[0]?.durationTicks).toBe(480);
    expect(deltas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "pattern-events-set",
        targetIds: [moduleId],
        payload: { moduleId, patternId: defaultPatternId(store) },
      }),
    );

    store.undo();
    expect(part(store, moduleId).events[0]?.durationTicks).toBe(240);
    store.redo();
    expect(part(store, moduleId).events[0]?.durationTicks).toBe(480);

    expect(
      store.dispatch(
        store.createCommand("pattern-events-edit", {
          moduleId,
          patternId: defaultPatternId(store),
          edit: { type: "resize", eventId, positionTicks: 240, durationTicks: 240 },
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    expect(part(store, moduleId).events[0]).toMatchObject({
      positionTicks: 240,
      durationTicks: 240,
    });

    store.undo();
    expect(part(store, moduleId).events[0]).toMatchObject({
      positionTicks: 0,
      durationTicks: 480,
    });
    store.redo();
    expect(part(store, moduleId).events[0]).toMatchObject({
      positionTicks: 240,
      durationTicks: 240,
    });
    expect(
      store.dispatch(
        store.createCommand("pattern-events-edit", {
          moduleId,
          patternId: defaultPatternId(store),
          edit: { type: "resize", eventId, positionTicks: 240, durationTicks: 480 },
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      error: { message: "Monophonic notes cannot overlap." },
    });

    store.dispatch(
      store.createCommand("pattern-events-edit", {
        moduleId,
        patternId: defaultPatternId(store),
        edit: { type: "velocity", eventIds: [eventId], velocity: 0.35 },
      }),
    );
    expect(part(store, moduleId).events[0]?.data.velocity).toBe(0.35);
  });

  it("rejects overlapping monophonic notes", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const eventId = required(part(store, moduleId).events[0]?.id);

    expect(
      store.dispatch(
        store.createCommand("pattern-events-edit", {
          moduleId,
          patternId: defaultPatternId(store),
          edit: { type: "move", eventIds: [eventId], deltaTicks: 480, deltaNote: 0 },
        }),
      ),
    ).toMatchObject({ status: "rejected", error: { message: "Monophonic notes cannot overlap." } });
  });

  it("allows simultaneous drum voices and rejects a duplicate voice trigger", () => {
    const ids = deterministicIds();
    const triggerSeed = {
      pluginId: "drum-analog-small" as PluginId,
      parameters: { tone: 0.45, drive: 0.2 },
      events: [],
      voiceIds: DRUM_VOICE_IDS,
    };
    const store = new PulseStore(
      createDefaultState(ids, triggerSeed),
      ids,
      triggerSeed,
      () => undefined,
      validateParameter,
    );
    const moduleId = required(store.getState().ui.selectedModuleId);
    const create = (note: number) =>
      store.dispatch(
        store.createCommand("pattern-events-edit", {
          moduleId,
          patternId: defaultPatternId(store),
          edit: {
            type: "create",
            event: {
              type: "trigger",
              positionTicks: 0,
              data: { note, velocity: 0.8, accent: false, slide: false },
            },
          },
        }),
      );

    expect(
      store.dispatch(
        store.createCommand("pattern-events-edit", {
          moduleId,
          patternId: defaultPatternId(store),
          edit: {
            type: "create",
            event: {
              type: "note",
              positionTicks: 0,
              durationTicks: 240,
              data: { note: 36, velocity: 0.8, accent: false, slide: false },
            },
          },
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      error: { message: "The event type does not match this module." },
    });
    expect(create(36)).toMatchObject({ status: "accepted", changed: true });
    expect(create(38)).toMatchObject({ status: "accepted", changed: true });
    expect(create(36)).toMatchObject({
      status: "rejected",
      error: { message: "A drum voice already has a trigger at this step." },
    });
    expect(part(store, moduleId).events).toHaveLength(2);
  });

  it("duplicates on the next grid step and filters deleted event selections", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const firstId = required(part(store, moduleId).events[0]?.id);
    const secondId = required(part(store, moduleId).events[1]?.id);

    store.dispatch(
      store.createCommand("pattern-events-edit", {
        moduleId,
        patternId: defaultPatternId(store),
        edit: { type: "duplicate", eventIds: [firstId] },
      }),
    );
    const duplicate = part(store, moduleId).events.find(
      (event) => event.positionTicks === 240,
    );
    expect(duplicate?.id).not.toBe(firstId);

    store.dispatch(
      store.createCommand("piano-roll-selection-set", {
        moduleId,
        patternId: defaultPatternId(store),
        eventIds: [firstId, secondId],
      }),
    );
    store.dispatch(
      store.createCommand("pattern-events-edit", {
        moduleId,
        patternId: defaultPatternId(store),
        edit: { type: "delete", eventIds: [firstId] },
      }),
    );
    expect(store.getState().ui.pianoRollSelection?.eventIds).toEqual([secondId]);
  });

  it("adds the selected registered plugin and duplicates its complete state", () => {
    const ids = deterministicIds();
    const drumSeed = {
      pluginId: "drum-analog-small" as PluginId,
      parameters: { tone: 0.45, drive: 0.2 },
      events: seed.events.map((event, index) => ({
        type: "trigger" as const,
        positionTicks: event.positionTicks,
        data: { ...event.data, note: 36 + (index % 6), slide: false },
      })),
      voiceIds: DRUM_VOICE_IDS,
    };
    const seeds = new Map<PluginId, typeof seed | typeof drumSeed>([
      [seed.pluginId, seed],
      [drumSeed.pluginId, drumSeed],
    ]);
    const store = new PulseStore(
      createDefaultState(ids, seed),
      ids,
      (pluginId) => seeds.get(pluginId),
      () => undefined,
      validateParameter,
    );
    const secondSlot = required(store.getState().project.rackSlots[1]);

    expect(
      store.dispatch(
        store.createCommand("rack-module-add", {
          slotId: secondSlot.id,
          pluginId: drumSeed.pluginId,
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    const drumId = required(store.getState().project.rackSlots[1]?.moduleId);
    const drum = required(store.getState().project.modules[drumId]);
    expect(drum).toMatchObject({ pluginId: drumSeed.pluginId, parameters: drumSeed.parameters });
    expect(
      store.dispatch(
        store.createCommand("pattern-events-edit", {
          moduleId: drumId,
          patternId: defaultPatternId(store),
          edit: {
            type: "create",
            event: {
              type: "trigger",
              positionTicks: 0,
              data: { note: 36, velocity: 0.8, accent: false, slide: false },
            },
          },
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });

    const thirdSlot = required(store.getState().project.rackSlots[2]);
    store.dispatch(
      store.createCommand("rack-module-duplicate", { moduleId: drumId, slotId: thirdSlot.id }),
    );
    const duplicateId = required(store.getState().project.rackSlots[2]?.moduleId);
    const duplicate = required(store.getState().project.modules[duplicateId]);
    expect(duplicateId).not.toBe(drumId);
    expect(duplicate.pluginId).toBe(drumSeed.pluginId);
    expect(duplicate.parameters).toEqual(drum.parameters);
    expect(moduleParts(store, duplicateId).map((item) => item.events.length)).toEqual(
      moduleParts(store, drumId).map((item) => item.events.length),
    );
    expect(moduleParts(store, duplicateId).flatMap((item) => item.events).map((event) => event.id)).not.toEqual(
      moduleParts(store, drumId).flatMap((item) => item.events).map((event) => event.id),
    );
  });

  it("exchanges validated in-memory projects and owns no serialization entry point", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const originalProject = store.saveProject();

    const reloaded = store.loadProject({
      ...originalProject,
      name: "Imported project",
      revision: { ...originalProject.revision, counter: originalProject.revision.counter + 1 },
    });
    expect(reloaded).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.name).toBe("Imported project");

    // Decision `D70`: serialization belongs to `src/state/persistence`, which
    // validates, migrates, and checks plugin compatibility before anything
    // reaches `loadProject`. The store owns no serialization entry point, so
    // untrusted bytes cannot arrive by bypassing that one validating path.
    expect("importProject" in store).toBe(false);
    expect("exportProject" in store).toBe(false);
  });

  it("owns null voice slots and clones, clears, and removes a registered voice insert", () => {
    const ids = deterministicIds();
    const drumSeed = {
      pluginId: "drum-analog-small" as PluginId,
      parameters: { tone: 0.45, drive: 0.2 },
      events: seed.events.map((event) => ({
        type: "trigger" as const,
        positionTicks: event.positionTicks,
        data: { ...event.data, slide: false },
      })),
      voiceIds: DRUM_VOICE_IDS,
    };
    const deltas = vi.fn();
    const store = new PulseStore(
      createDefaultState(ids, drumSeed),
      ids,
      drumSeed,
      deltas,
      validateParameter,
      createDistortionVoiceInsert,
    );
    const moduleId = required(store.getState().ui.selectedModuleId);

    expect(store.getState().project.effects.voiceInserts[moduleId]).toEqual({
      kick: null,
      snare: null,
    });
    expect(
      store.dispatch(
        store.createCommand("voice-insert-set", {
          moduleId,
          voiceId: KICK,
          effectPluginId: DISTORTION_EFFECT_PLUGIN_ID,
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    const effectId = requiredEffectId(
      store.getState().project.effects.voiceInserts[moduleId]?.[KICK],
    );
    expect(store.getState().project.effects.instances[effectId]).toMatchObject({
      id: effectId,
      pluginId: DISTORTION_EFFECT_PLUGIN_ID,
      stateVersion: 1,
      state: {},
    });
    expect(deltas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "module-effects-set",
        payload: {
          moduleId,
          voiceId: "kick",
          effectInstanceId: effectId,
          effectPluginId: DISTORTION_EFFECT_PLUGIN_ID,
        },
      }),
    );
    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.effects.voiceInserts[moduleId]?.[KICK]).toBeNull();
    expect(store.getState().project.effects.instances[effectId]).toBeUndefined();
    expect(store.redo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.effects.voiceInserts[moduleId]?.[KICK]).toBe(effectId);

    const targetSlot = required(store.getState().project.rackSlots[1]);
    store.dispatch(store.createCommand("rack-module-duplicate", { moduleId, slotId: targetSlot.id }));
    const duplicateId = required(store.getState().project.rackSlots[1]?.moduleId);
    const duplicateEffectId = requiredEffectId(
      store.getState().project.effects.voiceInserts[duplicateId]?.[KICK],
    );
    expect(duplicateEffectId).not.toBe(effectId);
    expect(store.getState().project.effects.instances[duplicateEffectId]?.state).toEqual({});

    expect(
      store.dispatch(
        store.createCommand("voice-insert-set", {
          moduleId,
          voiceId: KICK,
          effectPluginId: null,
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.effects.voiceInserts[moduleId]?.[KICK]).toBeNull();
    expect(store.getState().project.effects.instances[effectId]).toBeUndefined();
    expect(store.getState().project.effects.instances[duplicateEffectId]).toBeDefined();

    expect(
      store.dispatch(
        store.createCommand("voice-insert-set", {
          moduleId,
          voiceId: KICK,
          effectPluginId: "unknown-effect" as PluginId,
        }),
      ),
    ).toMatchObject({ status: "rejected", error: { field: "payload.effectPluginId" } });

    store.dispatch(store.createCommand("rack-module-remove", { moduleId: duplicateId }));
    expect(store.getState().project.effects.voiceInserts[duplicateId]).toBeUndefined();
    expect(store.getState().project.effects.instances[duplicateEffectId]).toBeUndefined();
  });

  it("accepts an insert command for the only voice of a drum module", () => {
    const ids = deterministicIds();
    const oneVoiceDrumSeed = {
      pluginId: "drum-one-voice" as PluginId,
      parameters: {},
      events: seed.events.map((event) => ({
        type: "trigger" as const,
        positionTicks: event.positionTicks,
        data: { ...event.data, slide: false },
      })),
      voiceIds: [CLAP],
    };
    const store = new PulseStore(
      createDefaultState(ids, oneVoiceDrumSeed),
      ids,
      oneVoiceDrumSeed,
      () => undefined,
      validateParameter,
      createDistortionVoiceInsert,
    );
    const moduleId = required(store.getState().ui.selectedModuleId);

    expect(store.getState().project.effects.voiceInserts[moduleId]).toEqual({ clap: null });
    expect(
      store.dispatch(
        store.createCommand("voice-insert-set", {
          moduleId,
          voiceId: CLAP,
          effectPluginId: DISTORTION_EFFECT_PLUGIN_ID,
        }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.effects.voiceInserts[moduleId]?.[CLAP]).not.toBeNull();
  });

  it("applies one atomic parameter command and supports undo and redo", () => {
    const ids = deterministicIds();
    const deltas = vi.fn();
    const store = createStore(ids, deltas);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const original = required(
      required(store.getState().project.modules[moduleId]).parameters.cutoff,
    );
    const command = store.createCommand("rack-parameter-set", {
      moduleId,
      parameter: "cutoff",
      value: 1200,
    });
    expect(store.dispatch(command)).toMatchObject({ status: "accepted", changed: true });
    const afterEdit = store.getState().project.revision.counter;
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);
    expect(store.getState().history).toEqual({ canUndo: true, canRedo: false });
    expect(deltas).toHaveBeenCalledTimes(1);
    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.revision.counter).toBe(afterEdit + 1);
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(original);
    expect(store.getState().history).toEqual({ canUndo: false, canRedo: true });
    expect(store.redo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.revision.counter).toBe(afterEdit + 2);
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);
    expect(store.getState().history).toEqual({ canUndo: true, canRedo: false });
  });

  it("stores tempo in the project and makes tempo edits reversible", () => {
    const ids = deterministicIds();
    const deltas = vi.fn();
    const store = createStore(ids, deltas);

    expect(store.getState().project.tempo).toBe(128);
    expect(
      store.dispatch(store.createCommand("transport-tempo-set", { tempo: 146 })),
    ).toMatchObject({
      status: "accepted",
      changed: true,
    });
    expect(store.getState().project.tempo).toBe(146);
    expect(deltas).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "transport", payload: { tempo: 146 } }),
    );

    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.tempo).toBe(128);
    expect(store.redo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.getState().project.tempo).toBe(146);
  });

  it("coalesces consecutive project edits with one gesture ID", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const original = required(store.getState().project.modules[moduleId]).parameters.cutoff;
    const gestureId = createGestureId(ids);

    store.dispatch(
      store.createCommand(
        "rack-parameter-set",
        { moduleId, parameter: "cutoff", value: 900 },
        { gestureId },
      ),
    );
    store.dispatch(
      store.createCommand(
        "rack-parameter-set",
        { moduleId, parameter: "cutoff", value: 1200 },
        { gestureId },
      ),
    );
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);

    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(original);
    expect(store.undo()).toMatchObject({ status: "accepted", changed: false });
    expect(store.redo()).toMatchObject({ status: "accepted", changed: true });
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);
  });

  it("drops a coalesced gesture that returns to its starting project value", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const original = required(
      required(store.getState().project.modules[moduleId]).parameters.cutoff,
    );
    const gestureId = createGestureId(ids);

    store.dispatch(
      store.createCommand(
        "rack-parameter-set",
        { moduleId, parameter: "cutoff", value: 900 },
        { gestureId },
      ),
    );
    store.dispatch(
      store.createCommand(
        "rack-parameter-set",
        { moduleId, parameter: "cutoff", value: original },
        { gestureId },
      ),
    );

    expect(store.getState().history).toEqual({ canUndo: false, canRedo: false });
    expect(store.undo()).toMatchObject({ status: "accepted", changed: false });
  });

  it("keeps one undo entry per gesture when two gestures interleave", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const originalCutoff = required(store.getState().project.modules[moduleId]).parameters.cutoff;
    const originalVolume = required(store.getState().project.modules[moduleId]).parameters.volume;
    const cutoffGesture = createGestureId(ids);
    const volumeGesture = createGestureId(ids);
    const set = (parameter: string, value: number, gestureId: typeof cutoffGesture) => {
      store.dispatch(
        store.createCommand("rack-parameter-set", { moduleId, parameter, value }, { gestureId }),
      );
    };

    // Section 7.4: a wheel burst on two targets interleaves two open gestures.
    set("cutoff", 900, cutoffGesture);
    set("volume", 0.5, volumeGesture);
    set("cutoff", 1200, cutoffGesture);
    set("volume", 0.4, volumeGesture);

    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(1200);
    expect(required(store.getState().project.modules[moduleId]).parameters.volume).toBe(0.4);

    // One entry per gesture: two undos restore the pre-gesture values exactly.
    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(store.undo()).toMatchObject({ status: "accepted", changed: true });
    expect(required(store.getState().project.modules[moduleId]).parameters.cutoff).toBe(
      originalCutoff,
    );
    expect(required(store.getState().project.modules[moduleId]).parameters.volume).toBe(
      originalVolume,
    );
    expect(store.getState().history).toEqual({ canUndo: false, canRedo: true });
  });

  it("rejects an oversized history entry before mutating state or engine projection", () => {
    const ids = deterministicIds();
    const deltas = vi.fn();
    const oversizedSeed = {
      ...seed,
      parameters: { payload: "x".repeat(9 * 1024 * 1024) },
    };
    const store = new PulseStore(
      createDefaultState(ids, oversizedSeed),
      ids,
      oversizedSeed,
      deltas,
      validateParameter,
    );
    const moduleId = required(store.getState().ui.selectedModuleId);
    const eventId = required(part(store, moduleId).events[0]?.id);
    const snapshot = store.getState();

    expect(
      store.dispatch(
        store.createCommand("pattern-events-edit", {
          moduleId,
          patternId: defaultPatternId(store),
          edit: { type: "velocity", eventIds: [eventId], velocity: 0.9 },
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      error: { field: "history" },
    });
    expect(store.getState()).toBe(snapshot);
    expect(store.getState().history).toEqual({ canUndo: false, canRedo: false });
    expect(deltas).not.toHaveBeenCalled();
  });

  it("rejects stale and invalid commands without mutation", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const command = store.createCommand("rack-parameter-set", {
      moduleId,
      parameter: "cutoff",
      value: 1200,
    });
    expect(store.dispatch(command).status).toBe("accepted");
    const snapshot = store.getState();
    expect(store.dispatch(command)).toMatchObject({
      status: "rejected",
      error: { field: "expectedProjectRevision" },
    });
    expect(store.getState()).toBe(snapshot);
    const invalid = store.createCommand("transport-tempo-set", { tempo: 999 });
    expect(store.dispatch(invalid)).toMatchObject({
      status: "rejected",
      error: { field: "payload.tempo" },
    });
    expect(store.getState()).toBe(snapshot);
  });

  it("notifies selectors only when their selected value changes", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const listener = vi.fn();
    store.subscribe((state) => state.project.tempo, listener);
    const moduleId = required(store.getState().ui.selectedModuleId);
    store.dispatch(
      store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 900 }),
    );
    expect(listener).not.toHaveBeenCalled();
    store.dispatch(store.createCommand("transport-tempo-set", { tempo: 132 }));
    expect(listener).toHaveBeenCalledWith(132, 128);
  });

  it("preserves module identity while moving and restores removal through undo", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const target = required(store.getState().project.rackSlots[1]).id;
    store.dispatch(store.createCommand("rack-module-move", { moduleId, slotId: target }));
    expect(required(store.getState().project.rackSlots[1]).moduleId).toBe(moduleId);
    store.dispatch(store.createCommand("rack-module-remove", { moduleId }));
    expect(store.getState().project.modules[moduleId]).toBeUndefined();
    store.undo();
    expect(store.getState().project.modules[moduleId]?.id).toBe(moduleId);
  });

  it("rolls the in-memory state revision independently at the safe-integer limit", () => {
    const ids = deterministicIds();
    const initial = createDefaultState(ids, seed);
    const stateAtLimit = {
      ...initial,
      project: {
        ...initial.project,
        revision: { ...initial.project.revision, counter: Number.MAX_SAFE_INTEGER },
      },
    };
    const store = new PulseStore(stateAtLimit, ids, seed, () => undefined, validateParameter);
    const moduleId = required(store.getState().ui.selectedModuleId);
    const previousEpoch = store.getState().project.revision.epoch;

    expect(
      store.dispatch(
        store.createCommand("rack-parameter-set", { moduleId, parameter: "cutoff", value: 900 }),
      ),
    ).toMatchObject({
      status: "accepted",
      changed: true,
    });
    expect(store.getState().project.revision.counter).toBe(0);
    expect(store.getState().project.revision.epoch).not.toBe(previousEpoch);
  });

  it("swaps the plugin while the module keeps identity, parts, and mixer state", () => {
    const ids = deterministicIds();
    const drumSeed = {
      pluginId: "drum-analog-small" as PluginId,
      parameters: { tone: 0.45, drive: 0.2 },
      events: seed.events.map((event) => ({
        type: "trigger" as const,
        positionTicks: event.positionTicks,
        data: { ...event.data, slide: false },
      })),
      voiceIds: DRUM_VOICE_IDS,
    };
    const seeds = new Map<PluginId, typeof seed | typeof drumSeed>([
      [seed.pluginId, seed],
      [drumSeed.pluginId, drumSeed],
    ]);
    const deltas = vi.fn();
    const store = new PulseStore(
      createDefaultState(ids, seed),
      ids,
      (pluginId) => seeds.get(pluginId),
      deltas,
      validateParameter,
    );
    const moduleId = required(store.getState().ui.selectedModuleId);
    store.dispatch(store.createCommand("mixer-level-set", { moduleId, level: 0.8 }));
    const before = required(store.getState().project.modules[moduleId]);
    const beforeParts = moduleParts(store, moduleId);

    expect(
      store.dispatch(
        store.createCommand("rack-module-swap", { moduleId, pluginId: drumSeed.pluginId }),
      ),
    ).toMatchObject({ status: "accepted", changed: true });
    const after = required(store.getState().project.modules[moduleId]);
    expect(after.id).toBe(moduleId);
    expect(after.pluginId).toBe(drumSeed.pluginId);
    expect(after.parameters).toEqual(drumSeed.parameters);
    expect(moduleParts(store, moduleId)).toEqual(beforeParts);
    expect(after.level).toBe(0.8);
    expect(deltas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "module-swap",
        payload: { moduleId, pluginId: drumSeed.pluginId },
      }),
    );

    store.undo();
    const undone = required(store.getState().project.modules[moduleId]);
    expect(undone.pluginId).toBe(seed.pluginId);
    expect(undone.parameters).toEqual(before.parameters);
  });

  it("rejects a swap to an unregistered plugin and skips a same-plugin swap", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const moduleId = required(store.getState().ui.selectedModuleId);

    expect(
      store.dispatch(
        store.createCommand("rack-module-swap", {
          moduleId,
          pluginId: "unknown-plugin" as PluginId,
        }),
      ),
    ).toMatchObject({ status: "rejected", error: { field: "payload.pluginId" } });
    expect(
      store.dispatch(
        store.createCommand("rack-module-swap", { moduleId, pluginId: seed.pluginId }),
      ),
    ).toMatchObject({ status: "accepted", changed: false });
  });

  it("removes dangling UI references when Undo or Redo removes a module", () => {
    const ids = deterministicIds();
    const store = createStore(ids);
    const targetSlot = required(store.getState().project.rackSlots[1]);

    store.dispatch(
      store.createCommand("rack-module-add", { slotId: targetSlot.id, pluginId: seed.pluginId }),
    );
    const addedModuleId = required(store.getState().project.rackSlots[1]?.moduleId);
    store.dispatch(store.createCommand("rack-module-select", { moduleId: addedModuleId }));

    store.undo();
    expect(store.getState().project.modules[addedModuleId]).toBeUndefined();
    expect(store.getState().ui.selectedModuleId).toBeUndefined();

    store.redo();
    store.dispatch(store.createCommand("rack-module-select", { moduleId: addedModuleId }));
    store.dispatch(store.createCommand("rack-module-remove", { moduleId: addedModuleId }));
    store.undo();
    store.dispatch(store.createCommand("rack-module-select", { moduleId: addedModuleId }));
    store.redo();
    expect(store.getState().project.modules[addedModuleId]).toBeUndefined();
    expect(store.getState().ui.selectedModuleId).toBeUndefined();
  });
});
