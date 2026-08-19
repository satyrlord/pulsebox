import { describe, expect, it, vi } from "vitest";

import {
  SEND_BUS_IDS,
  type EffectInstanceId,
  type IdFactory,
  type ModuleInstanceId,
  type PatternId,
  type ProjectRevision,
  type VoiceId,
} from "../../../src/contracts/ids";
import type { PluginId } from "../../../src/contracts/parameters";
import {
  PROTECTED_LIMITER_EFFECT_PLUGIN_ID,
  type EffectInstanceState,
} from "../../../src/contracts/effects";
import { RACK_SLOT_IDS } from "../../../src/contracts/ids";
import { BASS_MONO_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import {
  createDefaultState,
  DEFAULT_PATTERN_COUNT,
  type ModuleSeed,
} from "../../../src/state/default-state";
import {
  createParameterValidator,
  parseProjectDocument,
  serializeProject,
} from "../../../src/state/persistence/project-document";
import {
  PulseStore,
  type ChainEffectPlacement,
} from "../../../src/state/pulse-store";

const TIMESTAMP = "2026-08-07T12:00:00.000Z";
const SEED: ModuleSeed = {
  pluginId: BASS_MONO_MANIFEST.pluginId,
  parameters: { cutoff: 720, waveform: "saw", volume: 0.62 },
  events: Array.from({ length: 4 }, (_, index) => ({
    type: "note" as const,
    positionTicks: index * 4 * 240,
    durationTicks: 240,
    data: { note: 36, velocity: 0.8, accent: false, slide: false },
  })),
};

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

function deterministicIds(): IdFactory {
  let value = 1;
  return {
    createUuid: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  };
}

function harness(seed: ModuleSeed = SEED, onDelta = () => undefined) {
  const ids = deterministicIds();
  const store = new PulseStore(
    createDefaultState(ids, seed, () => TIMESTAMP),
    ids,
    seed,
    onDelta,
    createParameterValidator((pluginId) =>
      pluginId === BASS_MONO_MANIFEST.pluginId ? BASS_MONO_MANIFEST.parameters : undefined,
    ),
    () => TIMESTAMP,
  );
  const moduleId = required(store.getState().ui.selectedModuleId);
  return { store, moduleId };
}

function createCatalogEffect(
  id: EffectInstanceId,
  pluginId: PluginId,
  placement?: ChainEffectPlacement,
): EffectInstanceState | undefined {
  if (pluginId === ("missing-effect" as PluginId)) return undefined;
  const limitedPlacement = new Map<PluginId, ChainEffectPlacement>([
    ["module-only" as PluginId, "module-pedalboard"],
    ["send-only" as PluginId, "send-chain"],
    ["master-only" as PluginId, "master-chain"],
  ]).get(pluginId);
  if (placement !== undefined && limitedPlacement !== undefined && placement !== limitedPlacement) {
    return undefined;
  }
  return {
    id,
    pluginId,
    stateVersion: 1,
    state: { preset: pluginId },
    bypassed: false,
    mix: 1,
    gainDecibels: 0,
  };
}

function effectHarness() {
  const ids = deterministicIds();
  const store = new PulseStore(
    createDefaultState(ids, SEED, () => TIMESTAMP, createCatalogEffect),
    ids,
    SEED,
    () => undefined,
    createParameterValidator((pluginId) =>
      pluginId === BASS_MONO_MANIFEST.pluginId ? BASS_MONO_MANIFEST.parameters : undefined,
    ),
    () => TIMESTAMP,
    (effect, parameter, value) =>
      effect.pluginId === ("chorus" as PluginId) &&
      parameter === "rate" &&
      typeof value === "number" &&
      value >= 0 &&
      value <= 1,
    createCatalogEffect,
  );
  return { store, moduleId: required(store.getState().ui.selectedModuleId) };
}

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) throw new Error("Test fixture did not create the expected value.");
  return value;
}

function requiredEffectId(
  value: EffectInstanceId | null | undefined,
): EffectInstanceId {
  if (value === undefined || value === null) {
    throw new Error("Test fixture did not create the expected effect.");
  }
  return value;
}

function patternId(store: PulseStore, name: string): PatternId {
  return required(store.getState().project.patterns.find((pattern) => pattern.name === name)).id;
}

function part(store: PulseStore, id: PatternId, moduleId: ModuleInstanceId) {
  return required(required(store.getState().project.patterns.find((pattern) => pattern.id === id)).parts[moduleId]);
}

describe("project-owned Pattern bank", () => {
  it("seeds stable Patterns, stable module-keyed parts, and default event properties", () => {
    const { store, moduleId } = harness();
    const project = store.getState().project;
    const verse = required(project.patterns.find((pattern) => pattern.name === "Verse"));

    expect(project.patterns).toHaveLength(DEFAULT_PATTERN_COUNT);
    expect(project.activePatternId).toBe(verse.id);
    expect(verse.scale).toBe("Chromatic");
    expect(verse.parts[moduleId]?.events).toHaveLength(4);
    expect(verse.parts[moduleId]?.events[0]?.data).toMatchObject({
      probability: 1,
      microTimingTicks: 0,
      flam: 0,
      roll: 0,
    });
    expect(project.patterns.filter((pattern) => pattern.id !== verse.id).every((pattern) => pattern.parts[moduleId] === undefined)).toBe(true);
  });

  it("enforces the Pattern-name limit in UTF-8 bytes for each naming command", () => {
    const { store } = harness();
    const verseId = patternId(store, "Verse");
    const trailingHighSurrogate = String.fromCharCode(0xd800);
    const aboveLimit = "🎹".repeat(65);

    expect(
      store.dispatch(
        store.createCommand("pattern-rename", {
          patternId: verseId,
          name: trailingHighSurrogate,
        }),
      ).status,
    ).toBe("rejected");
    expect(
      store.dispatch(
        store.createCommand("pattern-add", {
          name: trailingHighSurrogate,
          afterPatternId: verseId,
        }),
      ).status,
    ).toBe("rejected");
    expect(
      store.dispatch(
        store.createCommand("pattern-rename", { patternId: verseId, name: aboveLimit }),
      ).status,
    ).toBe("rejected");
    expect(
      store.dispatch(
        store.createCommand("pattern-add", { name: aboveLimit, afterPatternId: verseId }),
      ).status,
    ).toBe("rejected");

    const boundaryName = "🎹".repeat(64);
    expect(
      store.dispatch(
        store.createCommand("pattern-rename", { patternId: verseId, name: boundaryName }),
      ).status,
    ).toBe("accepted");
    expect(
      store.dispatch(store.createCommand("pattern-duplicate", { patternId: verseId })).status,
    ).toBe("rejected");
  });

  it("adds, duplicates, reorders, and deletes by stable Pattern ID", () => {
    const { store, moduleId } = harness();
    const verseId = patternId(store, "Verse");
    const source = part(store, verseId, moduleId);

    expect(store.dispatch(store.createCommand("pattern-add", { name: "Bridge", afterPatternId: verseId })).status).toBe("accepted");
    const bridgeId = patternId(store, "Bridge");
    expect(store.dispatch(store.createCommand("pattern-duplicate", { patternId: verseId })).status).toBe("accepted");
    const copy = required(store.getState().project.patterns.find((pattern) => pattern.name === "Verse copy"));
    const copyPart = part(store, copy.id, moduleId);
    expect(copy.id).not.toBe(verseId);
    expect(copyPart.events.map((event) => event.id)).not.toEqual(source.events.map((event) => event.id));
    expect(copyPart.events.map((event) => event.data)).toEqual(source.events.map((event) => event.data));

    expect(store.dispatch(store.createCommand("pattern-reorder", { patternId: copy.id })).status).toBe("accepted");
    expect(store.getState().project.patterns[0]?.id).toBe(copy.id);
    expect(store.dispatch(store.createCommand("pattern-delete", { patternId: bridgeId })).status).toBe("accepted");
    expect(store.getState().project.patterns.some((pattern) => pattern.id === bridgeId)).toBe(false);
  });

  it("sets undoable scale, duration, part length, and a drum voice cycle length", () => {
    const { store, moduleId } = harness();
    const verseId = patternId(store, "Verse");

    expect(store.dispatch(store.createCommand("pattern-scale-set", { patternId: verseId, scale: "Dorian" })).status).toBe("accepted");
    expect(store.dispatch(store.createCommand("pattern-duration-set", { patternId: verseId, durationBars: 4 })).status).toBe("accepted");
    expect(store.dispatch(store.createCommand("pattern-part-length-set", { patternId: verseId, moduleId, length: 32 })).status).toBe("accepted");
    expect(required(store.getState().project.patterns.find((pattern) => pattern.id === verseId)).scale).toBe("Dorian");
    expect(part(store, verseId, moduleId).length).toBe(32);
    expect(store.undo().status).toBe("accepted");
    expect(part(store, verseId, moduleId).length).toBe(16);

    const drum = harness(DRUM_SEED);
    const drumVerseId = patternId(drum.store, "Verse");
    expect(drum.store.dispatch(drum.store.createCommand("pattern-part-voice-cycle-length-set", {
      patternId: drumVerseId,
      moduleId: drum.moduleId,
      voiceKey: "kick" as VoiceId,
      length: 8,
    })).status).toBe("accepted");
    expect(part(drum.store, drumVerseId, drum.moduleId).voiceCycleLengths["kick" as VoiceId]).toBe(8);
    expect(drum.store.dispatch(drum.store.createCommand("pattern-part-voice-cycle-length-set", {
      patternId: drumVerseId,
      moduleId: drum.moduleId,
      voiceKey: "kick" as VoiceId,
    })).status).toBe("accepted");
    expect(part(drum.store, drumVerseId, drum.moduleId).voiceCycleLengths["kick" as VoiceId]).toBeUndefined();
  });

  it("edits advanced event properties and transfers compatible part events", () => {
    const deltas = vi.fn();
    const { store, moduleId } = harness(SEED, deltas);
    const verseId = patternId(store, "Verse");
    const eventId = required(part(store, verseId, moduleId).events[0]).id;
    expect(store.dispatch(store.createCommand("pattern-events-edit", {
      moduleId,
      patternId: verseId,
      edit: {
        type: "properties",
        eventIds: [eventId],
        values: { probability: 0.45, microTimingTicks: -12, flam: 2, roll: 4 },
      },
    })).status).toBe("accepted");
    expect(part(store, verseId, moduleId).events[0]?.data).toMatchObject({
      probability: 0.45,
      microTimingTicks: -12,
      flam: 2,
      roll: 4,
    });
    expect(store.dispatch(store.createCommand("pattern-events-edit", {
      moduleId,
      patternId: verseId,
      edit: { type: "properties", eventIds: [eventId], values: { probability: 2 } },
    })).status).toBe("rejected");

    expect(store.dispatch(store.createCommand("rack-module-add", {
      slotId: required(RACK_SLOT_IDS[1]),
      pluginId: BASS_MONO_MANIFEST.pluginId,
    })).status).toBe("accepted");
    const targetModuleId = required(store.getState().project.rackSlots[1]?.moduleId);
    expect(store.dispatch(store.createCommand("pattern-part-events-transfer", {
      fromPatternId: verseId,
      fromModuleId: moduleId,
      toPatternId: verseId,
      toModuleId: targetModuleId,
      eventIds: [eventId],
      mode: "copy",
    })).status).toBe("accepted");
    const copiedEvent = required(part(store, verseId, targetModuleId).events[0]);
    expect(copiedEvent.id).not.toBe(eventId);
    expect(copiedEvent.data.probability).toBe(0.45);
    expect(deltas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "project-replace",
        targetIds: [moduleId, targetModuleId],
      }),
    );
  });

  it("replaces a complete part with one undoable, validated command", () => {
    const { store, moduleId } = harness();
    const verseId = patternId(store, "Verse");
    const original = part(store, verseId, moduleId).events;
    const replacement = original.slice(0, 2).map((event) => ({
      ...event,
      data: { ...event.data, velocity: 0.5 },
    }));

    expect(store.dispatch(store.createCommand("pattern-part-events-replace", {
      patternId: verseId,
      moduleId,
      events: replacement,
    })).status).toBe("accepted");
    expect(part(store, verseId, moduleId).events).toHaveLength(2);
    expect(store.undo().status).toBe("accepted");
    expect(part(store, verseId, moduleId).events).toHaveLength(original.length);
  });
});

describe("stable Playlist placements", () => {
  it("adds, changes, duplicates, reorders, and removes placement IDs", () => {
    const { store } = harness();
    const verseId = patternId(store, "Verse");
    const introId = patternId(store, "Intro");
    const baseline = store.getState().project.song.placements.length;

    expect(store.dispatch(store.createCommand("song-placement-add", { patternId: verseId })).status).toBe("accepted");
    const placement = required(store.getState().project.song.placements.at(-1));
    expect(store.dispatch(store.createCommand("song-placement-repeat-count-set", { placementId: placement.id, repeatCount: 4 })).status).toBe("accepted");
    expect(store.dispatch(store.createCommand("song-placement-pattern-set", { placementId: placement.id, patternId: introId })).status).toBe("accepted");
    expect(store.dispatch(store.createCommand("song-placement-duplicate", { placementId: placement.id })).status).toBe("accepted");
    const copy = required(store.getState().project.song.placements.at(-1));
    expect(copy.id).not.toBe(placement.id);
    expect(store.dispatch(store.createCommand("song-placement-reorder", { placementId: copy.id })).status).toBe("accepted");
    expect(store.getState().project.song.placements[0]?.id).toBe(copy.id);
    expect(store.dispatch(store.createCommand("song-placement-remove", { placementId: placement.id })).status).toBe("accepted");
    expect(store.getState().project.song.placements).toHaveLength(baseline + 1);
  });
});

describe("mixer commands", () => {
  it("keeps levels in range and restores master level through Undo", () => {
    const { store, moduleId } = harness();
    expect(store.dispatch(store.createCommand("mixer-level-set", { moduleId, level: 0.25 })).status).toBe("accepted");
    expect(store.dispatch(store.createCommand("mixer-pan-set", { moduleId, pan: -0.5 })).status).toBe("accepted");
    expect(store.getState().project.modules[moduleId]?.level).toBe(0.25);
    expect(store.dispatch(store.createCommand("mixer-level-set", { moduleId, level: 1.5 })).status).toBe("rejected");

    store.dispatch(store.createCommand("mixer-master-level-set", { level: 0.4 }));
    expect(store.undo().status).toBe("accepted");
    expect(store.getState().project.masterLevel).toBe(0.5);
  });

  it("stores four pre-fader send amounts and restores an edit through Undo", () => {
    const { store, moduleId } = harness();
    expect(
      store.dispatch(
        store.createCommand("mixer-send-amount-set", {
          moduleId,
          sendBusId: "send-a" as never,
          amount: 0.65,
        }),
      ).status,
    ).toBe("accepted");
    expect(store.getState().project.modules[moduleId]?.sends["send-a" as never]).toEqual({
      amount: 0.65,
    });
    store.undo();
    expect(store.getState().project.modules[moduleId]?.sends["send-a" as never]).toEqual({
      amount: 0,
    });
  });

  it.each(["mix", "gain"])(
    "rejects shared %s state through the plugin parameter command",
    (parameterId) => {
      const { store } = effectHarness();
      const effectId = requiredEffectId(
        store.getState().project.effects.sendChains["send-a" as never]?.slots[0],
      );
      const result = store.dispatch(store.createCommand("effects-instance-parameter-set", {
        effectInstanceId: effectId,
        parameterId,
        value: 0.5,
      }));
      expect(result.status).toBe("rejected");
      expect(store.getState().project.effects.instances[effectId]?.state).not.toHaveProperty(parameterId);
    },
  );

  it("removes module and chained-effect automation lanes with all Pattern references", () => {
    const { store, moduleId } = effectHarness();
    const verseId = patternId(store, "Verse");
    expect(store.dispatch(store.createCommand("effects-chain-effect-add", {
      chain: { scope: "module", targetId: moduleId },
      effectPluginId: "module-effect" as PluginId,
    })).status).toBe("accepted");
    const effectId = requiredEffectId(
      store.getState().project.effects.moduleChains[moduleId]?.slots.find((id) => id !== null),
    );
    expect(store.dispatch(store.createCommand("automation-lane-steps-set", {
      patternId: verseId,
      scope: "mixer",
      targetId: moduleId,
      parameterId: "level",
      steps: [{ tick: 0, value: 0.5 }],
    })).status).toBe("accepted");
    expect(store.dispatch(store.createCommand("automation-lane-steps-set", {
      patternId: verseId,
      scope: "effect",
      targetId: effectId,
      parameterId: "mix",
      steps: [{ tick: 0, value: 0.5 }],
    })).status).toBe("accepted");

    expect(store.dispatch(store.createCommand("rack-module-remove", { moduleId })).status).toBe("accepted");
    expect(Object.values(store.getState().project.automationLanes)).toEqual([]);
    for (const pattern of store.getState().project.patterns) {
      expect(pattern.automationLaneIds).toEqual([]);
      expect(Object.values(pattern.parts).flatMap((part) => part.automationLaneIds)).toEqual([]);
    }

    const document = serializeProject(store.getState(), {
      createdAt: TIMESTAMP,
      modifiedAt: TIMESTAMP,
      projectRevision: {
        epoch: "00000000-0000-4000-8000-000000000999",
        counter: 0,
      } as ProjectRevision,
    });
    expect(parseProjectDocument(document, {
      knownPluginIds: [BASS_MONO_MANIFEST.pluginId],
      parameterDescriptorsByPluginId: {
        [BASS_MONO_MANIFEST.pluginId]: BASS_MONO_MANIFEST.parameters,
      },
    }).ok).toBe(true);
  });

  it("clears a deleted automation target after deletion, replacement, Undo, and Redo", () => {
    const { store, moduleId } = effectHarness();
    expect(store.dispatch(store.createCommand("piano-roll-automation-target-set", {
      target: { scope: "mixer", targetId: moduleId, parameterId: "level" },
    })).status).toBe("accepted");
    const replacement = createDefaultState(deterministicIds(), undefined, () => TIMESTAMP).project;
    expect(store.loadProject(replacement).status).toBe("accepted");
    expect(store.getState().ui.pianoRollAutomationTarget).toBeUndefined();

    const targetSlotId = required(store.getState().project.rackSlots[0]).id;
    expect(store.dispatch(store.createCommand("rack-module-add", {
      slotId: targetSlotId,
      pluginId: BASS_MONO_MANIFEST.pluginId,
    })).status).toBe("accepted");
    const targetModuleId = required(store.getState().project.rackSlots[0]?.moduleId);
    store.dispatch(store.createCommand("piano-roll-automation-target-set", {
      target: { scope: "mixer", targetId: targetModuleId, parameterId: "level" },
    }));
    store.dispatch(store.createCommand("rack-module-remove", { moduleId: targetModuleId }));
    expect(store.getState().ui.pianoRollAutomationTarget).toBeUndefined();
    store.undo();
    expect(store.getState().ui.pianoRollAutomationTarget).toBeUndefined();
    expect(store.dispatch(store.createCommand("effects-chain-effect-add", {
      chain: { scope: "module", targetId: targetModuleId },
      effectPluginId: "module-effect" as PluginId,
    })).status).toBe("accepted");
    const effectId = requiredEffectId(
      store.getState().project.effects.moduleChains[targetModuleId]?.slots.find((id) => id !== null),
    );
    store.dispatch(store.createCommand("piano-roll-automation-target-set", {
      target: { scope: "effect", targetId: effectId, parameterId: "mix" },
    }));
    store.dispatch(store.createCommand("effects-chain-effect-remove", { effectInstanceId: effectId }));
    expect(store.getState().ui.pianoRollAutomationTarget).toBeUndefined();

    store.undo();
    expect(store.getState().ui.pianoRollAutomationTarget).toBeUndefined();
    store.dispatch(store.createCommand("piano-roll-automation-target-set", {
      target: { scope: "effect", targetId: effectId, parameterId: "mix" },
    }));
    store.redo();
    expect(store.getState().ui.pianoRollAutomationTarget).toBeUndefined();
  });

  it("rejects unsupported and malformed external automation targets when arming", () => {
    const { store, moduleId } = effectHarness();
    expect(store.dispatch(store.createCommand("piano-roll-automation-target-set", {
      target: { scope: "mixer", targetId: moduleId, parameterId: "unknown" },
    }))).toMatchObject({
      status: "rejected",
      error: { message: "Automation parameter is not supported." },
    });
    expect(store.dispatch(store.createCommand("piano-roll-automation-target-set", {
      target: { scope: "invalid" as never, targetId: moduleId, parameterId: "level" },
    }))).toMatchObject({
      status: "rejected",
      error: { message: "Automation scope is invalid." },
    });

    expect(store.dispatch(store.createCommand("effects-chain-effect-add", {
      chain: { scope: "module", targetId: moduleId },
      effectPluginId: "chorus" as PluginId,
    })).status).toBe("accepted");
    const effectId = requiredEffectId(
      store.getState().project.effects.moduleChains[moduleId]?.slots.find((id) => id !== null),
    );
    expect(store.dispatch(store.createCommand("piano-roll-automation-target-set", {
      target: { scope: "effect", targetId: effectId, parameterId: "rate" },
    }))).toMatchObject({ status: "accepted", changed: true });
    expect(store.dispatch(store.createCommand("piano-roll-automation-target-set", {
      target: { scope: "effect", targetId: effectId, parameterId: "unknown" },
    }))).toMatchObject({
      status: "rejected",
      error: { message: "Automation parameter is not supported." },
    });
  });

  it("clears plugin automation targets after replacement and keeps shared targets", () => {
    const prepareTarget = (parameterId: string) => {
      const { store, moduleId } = effectHarness();
      expect(store.dispatch(store.createCommand("effects-chain-effect-add", {
        chain: { scope: "module", targetId: moduleId },
        effectPluginId: "chorus" as PluginId,
      })).status).toBe("accepted");
      const effectId = requiredEffectId(
        store.getState().project.effects.moduleChains[moduleId]?.slots.find((id) => id !== null),
      );
      expect(store.dispatch(store.createCommand("piano-roll-automation-target-set", {
        target: { scope: "effect", targetId: effectId, parameterId },
      })).status).toBe("accepted");
      return { store, effectId };
    };

    const pluginTarget = prepareTarget("rate");
    expect(pluginTarget.store.dispatch(pluginTarget.store.createCommand(
      "effects-chain-effect-replace",
      { effectInstanceId: pluginTarget.effectId, effectPluginId: "compressor" as PluginId },
    )).status).toBe("accepted");
    expect(pluginTarget.store.getState().ui.pianoRollAutomationTarget).toBeUndefined();

    for (const parameterId of ["mix", "gain", "bypassed"]) {
      const sharedTarget = prepareTarget(parameterId);
      expect(sharedTarget.store.dispatch(sharedTarget.store.createCommand(
        "effects-chain-effect-replace",
        { effectInstanceId: sharedTarget.effectId, effectPluginId: "compressor" as PluginId },
      )).status).toBe("accepted");
      expect(sharedTarget.store.getState().ui.pianoRollAutomationTarget).toEqual({
        scope: "effect",
        targetId: sharedTarget.effectId,
        parameterId,
      });
    }
  });

  it("keeps default return chains, the protected limiter, and master bypass in project state", () => {
    const { store } = harness();
    const effects = store.getState().project.effects;
    expect(effects.sendChains["send-a" as never]?.pinnedEffectId).not.toBeNull();
    expect(effects.masterChain.filter((id) => id !== null)).toHaveLength(3);
    const limiterId = effects.masterChain.at(-1);
    expect(limiterId).not.toBeNull();
    if (limiterId === null || limiterId === undefined) throw new Error("Expected the protected limiter.");
    expect(effects.instances[limiterId]?.pluginId).toBe(PROTECTED_LIMITER_EFFECT_PLUGIN_ID);
    expect(store.dispatch(store.createCommand("effects-master-bypass-toggle", {})).status).toBe("accepted");
    expect(store.getState().project.effects.masterEffectsBypassed).toBe(true);
    expect(store.undo().status).toBe("accepted");
    expect(store.getState().project.effects.masterEffectsBypassed).toBe(false);
  });

  it("toggles Rack FX and all Send FX as independent group overrides", () => {
    const { store, moduleId } = effectHarness();
    expect(
      store.dispatch(
        store.createCommand("effects-chain-effect-add", {
          chain: { scope: "module", targetId: moduleId },
          effectPluginId: "module-effect" as PluginId,
        }),
      ).status,
    ).toBe("accepted");
    const rackEffectId = requiredEffectId(
      store.getState().project.effects.moduleChains[moduleId]?.slots[0],
    );
    store.dispatch(
      store.createCommand("effects-instance-bypass-set", {
        effectInstanceId: rackEffectId,
        bypassed: true,
      }),
    );
    const sendA = required(SEND_BUS_IDS[0]);
    store.dispatch(
      store.createCommand("effects-send-chain-bypass-set", {
        sendBusId: sendA,
        bypassed: true,
      }),
    );

    expect(
      store.dispatch(
        store.createCommand("effects-module-chain-bypass-toggle", { moduleId }),
      ).status,
    ).toBe("accepted");
    expect(store.getState().project.effects.moduleChains[moduleId]?.bypassed).toBe(true);
    expect(store.getState().project.effects.instances[rackEffectId]?.bypassed).toBe(true);
    expect(store.undo().status).toBe("accepted");
    expect(store.getState().project.effects.moduleChains[moduleId]?.bypassed).toBe(false);
    expect(store.redo().status).toBe("accepted");
    expect(store.getState().project.effects.moduleChains[moduleId]?.bypassed).toBe(true);

    expect(
      store.dispatch(store.createCommand("effects-send-all-bypass-toggle", {})).status,
    ).toBe("accepted");
    expect(store.getState().project.effects.sendEffectsBypassed).toBe(true);
    expect(store.getState().project.effects.sendChains[sendA]?.bypassed).toBe(true);
    expect(store.undo().status).toBe("accepted");
    expect(store.getState().project.effects.sendEffectsBypassed).toBe(false);
    expect(store.getState().project.effects.sendChains[sendA]?.bypassed).toBe(true);
  });

  it("appends a send effect and reorders it by stable effect ID", () => {
    const { store } = effectHarness();
    const sendId = required(SEND_BUS_IDS[0]);
    const initialId = requiredEffectId(
      store.getState().project.effects.sendChains[sendId]?.slots[0],
    );

    expect(
      store.dispatch(
        store.createCommand("effects-chain-effect-add", {
          chain: { scope: "send", targetId: sendId },
          effectPluginId: "chorus" as PluginId,
        }),
      ).status,
    ).toBe("accepted");
    const addedId = requiredEffectId(
      store.getState().project.effects.sendChains[sendId]?.slots.find(
        (effectId) =>
          effectId !== null &&
          store.getState().project.effects.instances[effectId]?.pluginId === ("chorus" as PluginId),
      ),
    );
    expect(store.getState().project.effects.sendChains[sendId]?.slots.slice(0, 2)).toEqual([
      initialId,
      addedId,
    ]);

    expect(
      store.dispatch(
        store.createCommand("effects-chain-effect-reorder", { effectInstanceId: addedId }),
      ).status,
    ).toBe("accepted");
    expect(store.getState().project.effects.sendChains[sendId]?.slots[0]).toBe(addedId);
  });

  it("pins the first effect added after a send chain becomes empty", () => {
    const { store } = effectHarness();
    const sendId = required(SEND_BUS_IDS[0]);
    const initialId = requiredEffectId(
      store.getState().project.effects.sendChains[sendId]?.slots[0],
    );

    expect(
      store.dispatch(
        store.createCommand("effects-chain-effect-remove", { effectInstanceId: initialId }),
      ).status,
    ).toBe("accepted");
    expect(store.getState().project.effects.sendChains[sendId]?.pinnedEffectId).toBeNull();

    expect(
      store.dispatch(
        store.createCommand("effects-chain-effect-add", {
          chain: { scope: "send", targetId: sendId },
          effectPluginId: "chorus" as PluginId,
        }),
      ).status,
    ).toBe("accepted");
    const addedId = requiredEffectId(
      store.getState().project.effects.sendChains[sendId]?.slots[0],
    );
    expect(store.getState().project.effects.sendChains[sendId]?.pinnedEffectId).toBe(addedId);
  });

  it("replaces one effect in place and restores its plugin and automation with one Undo", () => {
    const { store } = effectHarness();
    const sendId = required(SEND_BUS_IDS[0]);
    store.dispatch(
      store.createCommand("effects-chain-effect-add", {
        chain: { scope: "send", targetId: sendId },
        effectPluginId: "chorus" as PluginId,
      }),
    );
    const effectId = requiredEffectId(
      store.getState().project.effects.sendChains[sendId]?.slots.find(
        (candidate) =>
          candidate !== null &&
          store.getState().project.effects.instances[candidate]?.pluginId === ("chorus" as PluginId),
      ),
    );
    store.dispatch(
      store.createCommand("effects-send-focus-set", {
        sendBusId: sendId,
        effectInstanceId: effectId,
      }),
    );
    const patternId = required(store.getState().project.patterns[1]).id;
    store.dispatch(
      store.createCommand("automation-lane-steps-set", {
        patternId,
        scope: "effect",
        targetId: effectId,
        parameterId: "rate",
        steps: [{ tick: 0, value: 0.5 }],
      }),
    );
    store.dispatch(
      store.createCommand("automation-lane-steps-set", {
        patternId,
        scope: "effect",
        targetId: effectId,
        parameterId: "mix",
        steps: [{ tick: 0, value: 0.75 }],
      }),
    );
    const parameterLaneId = required(
      Object.values(store.getState().project.automationLanes).find(
        (lane) => lane.targetId === effectId && lane.parameterId === "rate",
      ),
    ).id;
    const genericLaneId = required(
      Object.values(store.getState().project.automationLanes).find(
        (lane) => lane.targetId === effectId && lane.parameterId === "mix",
      ),
    ).id;

    expect(
      store.dispatch(
        store.createCommand("effects-chain-effect-replace", {
          effectInstanceId: effectId,
          effectPluginId: "phaser" as PluginId,
        }),
      ).status,
    ).toBe("accepted");
    expect(store.getState().project.effects.instances[effectId]).toMatchObject({
      id: effectId,
      pluginId: "phaser",
      state: { preset: "phaser" },
    });
    expect(store.getState().project.effects.sendChains[sendId]?.pinnedEffectId).toBe(effectId);
    expect(store.getState().project.automationLanes[parameterLaneId]).toBeUndefined();
    expect(store.getState().project.automationLanes[genericLaneId]).toBeDefined();

    expect(store.undo().status).toBe("accepted");
    expect(store.getState().project.effects.instances[effectId]?.pluginId).toBe("chorus");
    expect(store.getState().project.automationLanes[parameterLaneId]).toBeDefined();
    expect(store.getState().project.effects.sendChains[sendId]?.pinnedEffectId).toBe(effectId);
  });

  it("removes effect automation and restores the complete target through one Undo", () => {
    const { store } = effectHarness();
    const sendId = required(SEND_BUS_IDS[0]);
    store.dispatch(
      store.createCommand("effects-chain-effect-add", {
        chain: { scope: "send", targetId: sendId },
        effectPluginId: "chorus" as PluginId,
      }),
    );
    const effectId = requiredEffectId(
      store.getState().project.effects.sendChains[sendId]?.slots.find(
        (candidate) =>
          candidate !== null &&
          store.getState().project.effects.instances[candidate]?.pluginId === ("chorus" as PluginId),
      ),
    );
    const patternId = required(store.getState().project.patterns[1]).id;
    store.dispatch(
      store.createCommand("automation-lane-steps-set", {
        patternId,
        scope: "effect",
        targetId: effectId,
        parameterId: "mix",
        steps: [{ tick: 0, value: 0.75 }],
      }),
    );
    const laneId = required(
      Object.values(store.getState().project.automationLanes).find(
        (lane) => lane.targetId === effectId,
      ),
    ).id;

    expect(
      store.dispatch(
        store.createCommand("effects-chain-effect-remove", { effectInstanceId: effectId }),
      ).status,
    ).toBe("accepted");
    expect(store.getState().project.effects.instances[effectId]).toBeUndefined();
    expect(store.getState().project.automationLanes[laneId]).toBeUndefined();
    expect(
      store.getState().project.patterns.find((pattern) => pattern.id === patternId)
        ?.automationLaneIds,
    ).not.toContain(laneId);

    expect(store.undo().status).toBe("accepted");
    expect(store.getState().project.effects.instances[effectId]?.pluginId).toBe("chorus");
    expect(store.getState().project.automationLanes[laneId]).toBeDefined();
    expect(
      store.getState().project.patterns.find((pattern) => pattern.id === patternId)
        ?.automationLaneIds,
    ).toContain(laneId);
  });

  it("rejects effects that do not support the target chain placement", () => {
    const { store, moduleId } = effectHarness();
    const sendId = required(SEND_BUS_IDS[0]);
    const attempts = [
      store.createCommand("effects-chain-effect-add", {
        chain: { scope: "module" as const, targetId: moduleId },
        effectPluginId: "send-only" as PluginId,
      }),
      store.createCommand("effects-chain-effect-add", {
        chain: { scope: "send" as const, targetId: sendId },
        effectPluginId: "master-only" as PluginId,
      }),
      store.createCommand("effects-chain-effect-add", {
        chain: { scope: "master" as const },
        effectPluginId: "module-only" as PluginId,
      }),
    ];
    for (const command of attempts) expect(store.dispatch(command).status).toBe("rejected");
    const sendEffectId = requiredEffectId(
      store.getState().project.effects.sendChains[sendId]?.slots[0],
    );
    expect(
      store.dispatch(
        store.createCommand("effects-chain-effect-replace", {
          effectInstanceId: sendEffectId,
          effectPluginId: "master-only" as PluginId,
        }),
      ).status,
    ).toBe("rejected");
  });

  it("rejects replacement of the protected limiter", () => {
    const { store } = effectHarness();
    const limiterId = required(store.getState().project.effects.masterChain.at(-1));
    expect(limiterId).not.toBeNull();
    if (limiterId === null) throw new Error("Expected the protected limiter.");

    expect(
      store.dispatch(
        store.createCommand("effects-chain-effect-replace", {
          effectInstanceId: limiterId,
          effectPluginId: "phaser" as PluginId,
        }),
      ).status,
    ).toBe("rejected");
    expect(store.getState().project.effects.instances[limiterId]?.pluginId).toBe(
      PROTECTED_LIMITER_EFFECT_PLUGIN_ID,
    );
  });
});
