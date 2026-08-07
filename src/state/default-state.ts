import {
  RACK_SLOT_IDS,
  createModuleInstanceId,
  createNoteEventId,
  createPatternId,
  createProjectId,
  createProjectLineageId,
  createStateRevisionEpoch,
  type IdFactory,
  type ModuleInstanceId,
  type VoiceId,
} from "../contracts/ids";
import type { EffectsState } from "../contracts/effects";
import type { ParameterValue, PluginId } from "../contracts/parameters";
import type {
  PatternEvent,
  PatternPartState,
  PulseState,
  RackModuleState,
} from "./model";

export type PatternEventSeed<Event extends PatternEvent = PatternEvent> = Event extends PatternEvent
  ? Omit<Event, "id">
  : never;

export interface ModuleSeed {
  readonly pluginId: PluginId;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly events: readonly PatternEventSeed[];
  /** Drum voices that own durable insert slots. Pitched modules omit this. */
  readonly voiceIds?: readonly VoiceId[];
}

/** Size of the project Pattern bank. */
export const PATTERN_SLOT_COUNT = 5;
export const PATTERN_STEP_COUNT = 16;
/** Section 9.1: about -8 dB per occupied channel. 0.4 linear is -7.96 dB. */
export const DEFAULT_MODULE_LEVEL = 0.4;
/** Section 9.1: about -6 dB on the master. 0.5 linear is -6.02 dB. */
export const DEFAULT_MASTER_LEVEL = 0.5;
/** Specification default: Humanize starts at 0 percent. */
export const DEFAULT_PATTERN_HUMANIZE = 0;
/** Pattern seeds are unsigned 32-bit integers. */
export const MAXIMUM_PATTERN_SEED = 0xffff_ffff;

/**
 * Derives a stable default seed from a Pattern ID, so a new Pattern gets a
 * repeatable variation without a second random source. Tests that inject a
 * deterministic ID factory get deterministic seeds for free.
 */
function patternSeedFromId(id: string): number {
  const hex = id.replaceAll("-", "").slice(0, 8);
  const parsed = Number.parseInt(hex, 16);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

const DEFAULT_PATTERN_NAMES = ["Intro", "Verse", "Break", "Drop", "Outro"] as const;

/**
 * The section 9.1 default project name. The section 9.2 starter template creates
 * a copy of that project, so this is also the template's name.
 */
export const DEFAULT_PROJECT_NAME = "Neon Basement";

export function createEmptyPatternPart(length = PATTERN_STEP_COUNT): PatternPartState {
  return Object.freeze({ length, events: Object.freeze([]) });
}

/**
 * Seeds fill the rack from slot one upward, in order. Passing several is how the
 * default project ships more than one instrument.
 *
 * The section 9.1 name and tempo are fixed. Section 9.2 has no separate content,
 * so no caller overrides them.
 */
export function createDefaultState(
  idFactory: IdFactory,
  seed?: ModuleSeed | readonly ModuleSeed[],
): PulseState {
  const projectId = createProjectId(idFactory);
  const lineageId = createProjectLineageId(idFactory);
  const epoch = createStateRevisionEpoch(idFactory);
  const seeds: readonly ModuleSeed[] = seed === undefined ? [] : isSeedList(seed) ? seed : [seed];
  const modules = seeds.slice(0, RACK_SLOT_IDS.length).map((one) => createModule(idFactory, one));
  const effects = createInitialEffectsState(modules, seeds);
  return Object.freeze({
    project: Object.freeze({
      id: projectId,
      lineageId,
      revision: Object.freeze({ epoch, counter: 0 }),
      name: DEFAULT_PROJECT_NAME,
      tempo: 128,
      swing: 0,
      masterLevel: DEFAULT_MASTER_LEVEL,
      rackSlots: Object.freeze(
        RACK_SLOT_IDS.map((id, index) => {
          const module = modules[index];
          return Object.freeze(module === undefined ? { id } : { id, moduleId: module.id });
        }),
      ),
      modules: Object.freeze(Object.fromEntries(modules.map((module) => [module.id, module]))),
      effects,
      patterns: Object.freeze(
        Array.from({ length: PATTERN_SLOT_COUNT }, (_, index) => {
          const id = createPatternId(idFactory);
          return Object.freeze({
            id,
            name: DEFAULT_PATTERN_NAMES[index] ?? `Pattern ${String(index + 1)}`,
            length: PATTERN_STEP_COUNT,
            humanize: DEFAULT_PATTERN_HUMANIZE,
            seed: patternSeedFromId(id),
          });
        }),
      ),
      activePatternIndex: 1,
      // Section 9.1: the bar counts describe the default Song chain. Each
      // Pattern is one bar of sixteen steps, so a bar count is a repeat count.
      // The chain ships disabled; enabling Song mode plays the arrangement.
      song: Object.freeze({
        enabled: false,
        entries: Object.freeze([
          Object.freeze({ patternIndex: 0, repeats: 8 }),
          Object.freeze({ patternIndex: 1, repeats: 16 }),
          Object.freeze({ patternIndex: 2, repeats: 8 }),
          Object.freeze({ patternIndex: 3, repeats: 16 }),
          Object.freeze({ patternIndex: 4, repeats: 8 }),
        ]),
      }),
    }),
    transport: Object.freeze({
      status: "stopped",
      recordArmed: false,
      positionTicks: 0,
      startMarkerTicks: 0,
    }),
    ui: Object.freeze({
      selectedModuleId: modules[0]?.id,
      pianoRollSelection: undefined,
      pianoRollParameter: "velocity",
    }),
    history: Object.freeze({ canUndo: false, canRedo: false }),
  });
}

function createInitialEffectsState(
  modules: readonly RackModuleState[],
  seeds: readonly ModuleSeed[],
): EffectsState {
  const voiceInserts: Record<ModuleInstanceId, Record<VoiceId, null>> = {};
  for (const [index, module] of modules.entries()) {
    const voiceIds = seeds[index]?.voiceIds;
    if (voiceIds === undefined || voiceIds.length === 0) continue;
    const slots: Record<VoiceId, null> = {};
    for (const voiceId of voiceIds) slots[voiceId] = null;
    voiceInserts[module.id] = Object.freeze(slots);
  }
  return Object.freeze({
    instances: Object.freeze({}),
    voiceInserts: Object.freeze(voiceInserts),
  });
}

function isSeedList(seed: ModuleSeed | readonly ModuleSeed[]): seed is readonly ModuleSeed[] {
  return Array.isArray(seed);
}

function freezeEvent(event: PatternEvent): PatternEvent {
  return Object.freeze({ ...event, data: Object.freeze({ ...event.data }) });
}

function materializeEvent(idFactory: IdFactory, event: PatternEventSeed): PatternEvent {
  return freezeEvent({ ...event, id: createNoteEventId(idFactory) });
}

function clonePart(idFactory: IdFactory, part: PatternPartState): PatternPartState {
  return Object.freeze({
    length: part.length,
    events: Object.freeze(
      part.events.map((event) =>
        freezeEvent({ ...event, id: createNoteEventId(idFactory), data: { ...event.data } }),
      ),
    ),
  });
}

export function createModule(
  idFactory: IdFactory,
  seed: ModuleSeed,
  source?: RackModuleState,
): RackModuleState {
  // A duplicated module carries its whole Pattern bank. A fresh module seeds
  // the default Verse and leaves the other Patterns silent.
  const parts: readonly PatternPartState[] =
    source === undefined
      ? Array.from({ length: PATTERN_SLOT_COUNT }, (_, index) =>
          index === 1
            ? Object.freeze({
                length: PATTERN_STEP_COUNT,
                events: Object.freeze(seed.events.map((event) => materializeEvent(idFactory, event))),
              })
            : createEmptyPatternPart(),
        )
      : source.parts.map((part) => clonePart(idFactory, part));
  return Object.freeze({
    id: createModuleInstanceId(idFactory),
    pluginId: source?.pluginId ?? seed.pluginId,
    parameters: Object.freeze({ ...(source?.parameters ?? seed.parameters) }),
    parts: Object.freeze(parts),
    muted: source?.muted ?? false,
    solo: source?.solo ?? false,
    level: source?.level ?? DEFAULT_MODULE_LEVEL,
    pan: source?.pan ?? 0,
  });
}
