import { describe, expect, it, vi } from "vitest";

import type { IdFactory, ModuleInstanceId, PatternId, VoiceId } from "../../../src/contracts/ids";
import type { PluginId } from "../../../src/contracts/parameters";
import { RACK_SLOT_IDS } from "../../../src/contracts/ids";
import { BASS_MONO_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import {
  createDefaultState,
  DEFAULT_PATTERN_COUNT,
  type ModuleSeed,
} from "../../../src/state/default-state";
import { createParameterValidator } from "../../../src/state/persistence/project-document";
import { PulseStore } from "../../../src/state/pulse-store";

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
    undefined,
    () => TIMESTAMP,
  );
  const moduleId = required(store.getState().ui.selectedModuleId);
  return { store, moduleId };
}

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) throw new Error("Test fixture did not create the expected value.");
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
});
