import type {
  ModuleInstanceId,
  PatternId,
  ProjectId,
  ProjectLineageId,
  RackSlotId,
  StateRevision,
} from "../contracts/ids";
import type { PluginId } from "../contracts/parameters";

export type ParameterValue = number | boolean | string;

export interface PatternStep {
  readonly active: boolean;
  readonly note: number;
  readonly velocity: number;
  readonly accent: boolean;
  readonly slide: boolean;
}

export interface ModulePattern {
  readonly id: PatternId;
  readonly name: string;
  readonly length: number;
  readonly steps: readonly PatternStep[];
}

export interface RackModuleState {
  readonly id: ModuleInstanceId;
  readonly pluginId: PluginId;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly pattern: ModulePattern;
  readonly muted: boolean;
  readonly solo: boolean;
}

export interface RackSlotState {
  readonly id: RackSlotId;
  readonly moduleId?: ModuleInstanceId;
}

export interface ProjectState {
  readonly id: ProjectId;
  readonly lineageId: ProjectLineageId;
  readonly revision: StateRevision;
  readonly name: string;
  readonly tempo: number;
  readonly rackSlots: readonly RackSlotState[];
  readonly modules: Readonly<Record<ModuleInstanceId, RackModuleState>>;
}

export interface TransportState {
  readonly status: "stopped" | "playing" | "paused";
  readonly recordArmed: boolean;
  readonly positionTicks: number;
  readonly startMarkerTicks: number;
}

export interface HistoryAvailability {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface UiState {
  readonly selectedModuleId: ModuleInstanceId | undefined;
  readonly collapsedModuleIds: ReadonlySet<ModuleInstanceId>;
}

export interface PulseState {
  readonly project: ProjectState;
  readonly transport: TransportState;
  readonly ui: UiState;
  readonly history: HistoryAvailability;
}
