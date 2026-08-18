import {
  RACK_SLOT_IDS,
  SEND_BUS_IDS,
  createEffectInstanceId,
  createModuleInstanceId,
  createNoteEventId,
  createPatternId,
  createProjectId,
  createProjectLineageId,
  createSongPlacementId,
  createStateRevisionEpoch,
  type EffectInstanceId,
  type IdFactory,
  type ModuleInstanceId,
  type VoiceId,
} from "../contracts/ids";
import {
  DEFAULT_MASTER_EFFECT_PLUGIN_IDS,
  DEFAULT_SEND_EFFECT_PLUGIN_IDS,
  MASTER_EFFECT_CHAIN_SLOT_COUNT,
  MODULE_EFFECT_CHAIN_SLOT_COUNT,
  SEND_EFFECT_CHAIN_SLOT_COUNT,
  type EffectInstanceState,
  type EffectsState,
} from "../contracts/effects";
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
  /** Drum voice IDs let state validate trigger events without importing engine manifests. */
  readonly voiceIds?: readonly VoiceId[];
}

/** The composition boundary can provide manifest defaults without making state import engine code. */
export type DefaultEffectInstanceFactory = (
  id: EffectInstanceId,
  pluginId: PluginId,
) => EffectInstanceState | undefined;

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
  createEffectInstance?: DefaultEffectInstanceFactory,
): PulseState {
  const projectId = createProjectId(idFactory);
  const lineageId = createProjectLineageId(idFactory);
  const epoch = createStateRevisionEpoch(idFactory);
  const seeds: readonly ModuleSeed[] = seed === undefined ? [] : isSeedList(seed) ? seed : [seed];
  const modules = seeds.slice(0, RACK_SLOT_IDS.length).map((one) => createModule(idFactory, one));
  const effects = createInitialEffectsState(idFactory, modules, createEffectInstance);
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
      pianoRollAutomationTarget: undefined,
    }),
    history: Object.freeze({ canUndo: false, canRedo: false }),
  });
}

function createInitialEffectsState(
  idFactory: IdFactory,
  modules: readonly RackModuleState[],
  createEffectInstance: DefaultEffectInstanceFactory | undefined,
): EffectsState {
  const moduleChains: Record<ModuleInstanceId, readonly null[]> = {};
  for (const module of modules) {
    moduleChains[module.id] = Object.freeze(Array.from({ length: MODULE_EFFECT_CHAIN_SLOT_COUNT }, () => null));
  }
  const instances: Record<string, EffectInstanceState> = {};
  const sendChains = Object.fromEntries(SEND_BUS_IDS.map((sendBusId) => {
    const id = createEffectInstanceId(idFactory);
    const pluginId = DEFAULT_SEND_EFFECT_PLUGIN_IDS[sendBusId];
    if (pluginId === undefined) throw new Error("A default send effect is missing.");
    instances[id] = createEffectInstance?.(id, pluginId) ?? createDefaultEffectInstance(id, pluginId);
    return [sendBusId, Object.freeze({
      slots: Object.freeze([id, ...Array.from({ length: SEND_EFFECT_CHAIN_SLOT_COUNT - 1 }, () => null)]),
      returnLevel: 1,
      bypassed: false,
      pinnedEffectId: id,
    })];
  })) as EffectsState["sendChains"];
  const masterIds = DEFAULT_MASTER_EFFECT_PLUGIN_IDS.map((pluginId) => {
    const id = createEffectInstanceId(idFactory);
    instances[id] = createEffectInstance?.(id, pluginId) ?? createDefaultEffectInstance(id, pluginId);
    return id;
  });
  return Object.freeze({
    instances: Object.freeze(instances),
    moduleChains: Object.freeze(moduleChains),
    sendChains: Object.freeze(sendChains),
    masterChain: Object.freeze([
      ...masterIds.slice(0, -1),
      ...Array.from({ length: MASTER_EFFECT_CHAIN_SLOT_COUNT - masterIds.length }, () => null),
      masterIds.at(-1) ?? null,
    ]),
    masterEffectsBypassed: false,
  });
}

function createDefaultEffectInstance(id: EffectInstanceId, pluginId: PluginId): EffectInstanceState {
  return Object.freeze({
    id,
    pluginId,
    stateVersion: 1,
    state: Object.freeze({}),
    bypassed: false,
    mix: 1,
    gainDecibels: 0,
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
    sends: Object.freeze(Object.fromEntries(SEND_BUS_IDS.map((id) => {
      const send = source?.sends[id];
      return [id, Object.freeze({ amount: send?.amount ?? 0 })];
    }))),
  });
}
