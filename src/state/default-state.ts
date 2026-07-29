import {
  RACK_SLOT_IDS,
  createModuleInstanceId,
  createPatternId,
  createProjectId,
  createProjectLineageId,
  createStateRevisionEpoch,
  type IdFactory,
  type ModuleInstanceId,
} from "../contracts/ids";
import type { PluginId } from "../contracts/parameters";
import type { ParameterValue, PatternStep, PulseState, RackModuleState } from "./model";

export interface ModuleSeed {
  readonly pluginId: PluginId;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly steps: readonly PatternStep[];
}

/** Size of the project Pattern bank. */
export const PATTERN_SLOT_COUNT = 4;
export const PATTERN_STEP_COUNT = 16;
export const DEFAULT_MODULE_LEVEL = 0.8;
export const DEFAULT_MASTER_LEVEL = 0.8;

export function createSilentSteps(length = PATTERN_STEP_COUNT): readonly PatternStep[] {
  return Object.freeze(
    Array.from({ length }, () =>
      Object.freeze({ active: false, note: 36, velocity: 0.7, accent: false, slide: false }),
    ),
  );
}

/**
 * Seeds fill the rack from slot one upward, in order. Passing several is how the
 * default project ships more than one instrument.
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
  return Object.freeze({
    project: Object.freeze({
      id: projectId,
      lineageId,
      revision: Object.freeze({ epoch, counter: 0 }),
      name: "Phase 1 session",
      tempo: 130,
      swing: 0,
      masterLevel: DEFAULT_MASTER_LEVEL,
      rackSlots: Object.freeze(
        RACK_SLOT_IDS.map((id, index) => {
          const module = modules[index];
          return Object.freeze(module === undefined ? { id } : { id, moduleId: module.id });
        }),
      ),
      modules: Object.freeze(Object.fromEntries(modules.map((module) => [module.id, module]))),
      patterns: Object.freeze(
        Array.from({ length: PATTERN_SLOT_COUNT }, (_, index) =>
          Object.freeze({
            id: createPatternId(idFactory),
            name: `Pattern ${String(index + 1)}`,
            length: PATTERN_STEP_COUNT,
          }),
        ),
      ),
      activePatternIndex: 0,
      song: Object.freeze({ enabled: false, entries: Object.freeze([]) }),
    }),
    transport: Object.freeze({
      status: "stopped",
      recordArmed: false,
      positionTicks: 0,
      startMarkerTicks: 0,
    }),
    ui: Object.freeze({
      selectedModuleId: modules[0]?.id,
      collapsedModuleIds: new Set<ModuleInstanceId>(),
    }),
    history: Object.freeze({ canUndo: false, canRedo: false }),
  });
}

function isSeedList(seed: ModuleSeed | readonly ModuleSeed[]): seed is readonly ModuleSeed[] {
  return Array.isArray(seed);
}

function freezeSteps(steps: readonly PatternStep[]): readonly PatternStep[] {
  return Object.freeze(steps.map((step) => Object.freeze({ ...step })));
}

export function createModule(
  idFactory: IdFactory,
  seed: ModuleSeed,
  source?: RackModuleState,
): RackModuleState {
  // A duplicated module carries its whole Pattern bank; a fresh one seeds slot
  // one and leaves the rest silent so every slot is immediately playable.
  const parts: readonly (readonly PatternStep[])[] =
    source?.parts ??
    Array.from({ length: PATTERN_SLOT_COUNT }, (_, index) =>
      index === 0 ? seed.steps : createSilentSteps(),
    );
  return Object.freeze({
    id: createModuleInstanceId(idFactory),
    pluginId: source?.pluginId ?? seed.pluginId,
    parameters: Object.freeze({ ...(source?.parameters ?? seed.parameters) }),
    parts: Object.freeze(parts.map(freezeSteps)),
    muted: source?.muted ?? false,
    solo: source?.solo ?? false,
    level: source?.level ?? DEFAULT_MODULE_LEVEL,
    pan: source?.pan ?? 0,
  });
}
