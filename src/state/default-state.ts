import {
  RACK_SLOT_IDS,
  createModuleInstanceId,
  createNoteEventId,
  createPatternId,
  createProjectId,
  createProjectLineageId,
  createSongPlacementId,
  createStateRevisionEpoch,
  type IdFactory,
  type ModuleInstanceId,
  type VoiceId,
} from "../contracts/ids";
import type { EffectsState } from "../contracts/effects";
import type { ParameterValue, PluginId } from "../contracts/parameters";
import type {
  PatternEvent,
  PatternEventDataInput,
  PatternPartState,
  PatternState,
  PulseState,
  RackModuleState,
} from "./model";

export type PatternEventSeed =
  | {
      readonly type: "note";
      readonly positionTicks: number;
      readonly durationTicks: number;
      readonly data: PatternEventDataInput;
    }
  | {
      readonly type: "trigger";
      readonly positionTicks: number;
      readonly durationTicks?: never;
      readonly data: PatternEventDataInput;
    };

export interface ModuleSeed {
  readonly pluginId: PluginId;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly events: readonly PatternEventSeed[];
  /** Drum voices that own durable insert slots. Pitched modules omit this. */
  readonly voiceIds?: readonly VoiceId[];
}

/** The supplied project contains five Patterns. Projects can hold 1 through 32. */
export const DEFAULT_PATTERN_COUNT = 5;
export const MINIMUM_PATTERN_COUNT = 1;
export const MAXIMUM_PATTERN_COUNT = 32;
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
const DEFAULT_PATTERN_COLORS = ["#E6A23C", "#F26D6D", "#58B8F6", "#A87CFF", "#63C78F"] as const;

/**
 * The section 9.1 default project name. The section 9.2 starter template creates
 * a copy of that project, so this is also the template's name.
 */
export const DEFAULT_PROJECT_NAME = "Neon Basement";

export function createEmptyPatternPart(
  moduleId: ModuleInstanceId,
  length = PATTERN_STEP_COUNT,
): PatternPartState {
  return Object.freeze({
    moduleId,
    length,
    voiceCycleLengths: Object.freeze({}),
    events: Object.freeze([]),
    automationLaneIds: Object.freeze([]),
  });
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
  now: () => string = () => new Date().toISOString(),
): PulseState {
  const projectId = createProjectId(idFactory);
  const lineageId = createProjectLineageId(idFactory);
  const epoch = createStateRevisionEpoch(idFactory);
  const seeds: readonly ModuleSeed[] = seed === undefined ? [] : isSeedList(seed) ? seed : [seed];
  const modules = seeds.slice(0, RACK_SLOT_IDS.length).map((one) => createModule(idFactory, one));
  const effects = createInitialEffectsState(modules, seeds);
  const timestamp = now();
  const patterns = Array.from({ length: DEFAULT_PATTERN_COUNT }, (_, index) => {
    const id = createPatternId(idFactory);
    const parts: Record<ModuleInstanceId, PatternPartState> = {};
    if (index === 1) {
      for (const [moduleIndex, module] of modules.entries()) {
        const events = seeds[moduleIndex]?.events ?? [];
        parts[module.id] = Object.freeze({
          moduleId: module.id,
          length: PATTERN_STEP_COUNT,
          voiceCycleLengths: Object.freeze({}),
          events: Object.freeze(events.map((event) => materializeEvent(idFactory, event))),
          automationLaneIds: Object.freeze([]),
        });
      }
    }
    return Object.freeze({
      id,
      name: DEFAULT_PATTERN_NAMES[index] ?? `Pattern ${String(index + 1)}`,
      color: DEFAULT_PATTERN_COLORS[index] ?? "#E6A23C",
      durationBars: 1,
      scale: "Chromatic",
      humanize: DEFAULT_PATTERN_HUMANIZE,
      seed: patternSeedFromId(id),
      parts: Object.freeze(parts),
      automationLaneIds: Object.freeze([]),
      createdAt: timestamp,
      modifiedAt: timestamp,
    } satisfies PatternState);
  });
  const verse = patterns[1];
  if (verse === undefined) throw new Error("The supplied project needs a Verse Pattern.");
  const intro = patterns[0];
  const breakPattern = patterns[2];
  const drop = patterns[3];
  const outro = patterns[4];
  if (
    intro === undefined ||
    breakPattern === undefined ||
    drop === undefined ||
    outro === undefined
  ) {
    throw new Error("The supplied project needs five default Patterns.");
  }
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
      patterns: Object.freeze(patterns),
      activePatternId: verse.id,
      automationLanes: Object.freeze({}),
      // Section 9.1: the bar counts describe the default Song chain. Each
      // Pattern is one bar of sixteen steps, so a bar count is a repeat count.
      // The chain ships disabled; enabling Song mode plays the arrangement.
      song: Object.freeze({
        enabled: false,
        placements: Object.freeze([
          Object.freeze({ id: createSongPlacementId(idFactory), patternId: intro.id, repeatCount: 8 }),
          Object.freeze({ id: createSongPlacementId(idFactory), patternId: verse.id, repeatCount: 16 }),
          Object.freeze({ id: createSongPlacementId(idFactory), patternId: breakPattern.id, repeatCount: 8 }),
          Object.freeze({ id: createSongPlacementId(idFactory), patternId: drop.id, repeatCount: 16 }),
          Object.freeze({ id: createSongPlacementId(idFactory), patternId: outro.id, repeatCount: 8 }),
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
  return freezeEvent({
    ...event,
    id: createNoteEventId(idFactory),
    data: {
      ...event.data,
      probability: event.data.probability ?? 1,
      microTimingTicks: event.data.microTimingTicks ?? 0,
      flam: event.data.flam ?? 0,
      roll: event.data.roll ?? 0,
    },
  });
}

export function createModule(
  idFactory: IdFactory,
  seed: ModuleSeed,
  source?: RackModuleState,
): RackModuleState {
  return Object.freeze({
    id: createModuleInstanceId(idFactory),
    pluginId: source?.pluginId ?? seed.pluginId,
    parameters: Object.freeze({ ...(source?.parameters ?? seed.parameters) }),
    muted: source?.muted ?? false,
    solo: source?.solo ?? false,
    level: source?.level ?? DEFAULT_MODULE_LEVEL,
    pan: source?.pan ?? 0,
  });
}
