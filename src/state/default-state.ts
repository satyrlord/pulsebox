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

export function createDefaultState(idFactory: IdFactory, seed?: ModuleSeed): PulseState {
  const projectId = createProjectId(idFactory);
  const lineageId = createProjectLineageId(idFactory);
  const epoch = createStateRevisionEpoch(idFactory);
  const module = seed === undefined ? undefined : createModule(idFactory, seed);
  return Object.freeze({
    project: Object.freeze({
      id: projectId,
      lineageId,
      revision: Object.freeze({ epoch, counter: 0 }),
      name: "Phase 1 session",
      tempo: 130,
      rackSlots: Object.freeze(
        RACK_SLOT_IDS.map((id, index) => Object.freeze(index === 0 && module !== undefined ? { id, moduleId: module.id } : { id })),
      ),
      modules: Object.freeze(module === undefined ? {} : { [module.id]: module }),
    }),
    transport: Object.freeze({
      status: "stopped",
      recordArmed: false,
      positionTicks: 0,
      startMarkerTicks: 0,
    }),
    ui: Object.freeze({
      selectedModuleId: module?.id,
      collapsedModuleIds: new Set<ModuleInstanceId>(),
    }),
    history: Object.freeze({ canUndo: false, canRedo: false }),
  });
}

export function createModule(idFactory: IdFactory, seed: ModuleSeed, source?: RackModuleState): RackModuleState {
  const steps: readonly PatternStep[] = source?.pattern.steps ?? seed.steps;
  return Object.freeze({
    id: createModuleInstanceId(idFactory),
    pluginId: seed.pluginId,
    parameters: Object.freeze({ ...(source?.parameters ?? seed.parameters) }),
    pattern: Object.freeze({
      id: createPatternId(idFactory),
      name: source?.pattern.name ?? "Pattern 1",
      length: source?.pattern.length ?? 16,
      steps: Object.freeze(steps.map((step) => Object.freeze({ ...step }))),
    }),
    muted: source?.muted ?? false,
    solo: source?.solo ?? false,
  });
}
