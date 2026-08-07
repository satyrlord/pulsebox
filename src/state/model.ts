import type { EffectsState } from "../contracts/effects";
import type {
  ModuleInstanceId,
  NoteEventId,
  PatternId,
  ProjectId,
  ProjectLineageId,
  RackSlotId,
  StateRevision,
} from "../contracts/ids";
import type { ParameterValue, PluginId } from "../contracts/parameters";

export const PATTERN_TICKS_PER_STEP = 240;

export interface PatternEventData {
  readonly note: number;
  readonly velocity: number;
  readonly accent: boolean;
  readonly slide: boolean;
}

export type PatternEvent =
  | {
      readonly id: NoteEventId;
      readonly type: "note";
      readonly positionTicks: number;
      readonly durationTicks: number;
      readonly data: PatternEventData;
    }
  | {
      readonly id: NoteEventId;
      readonly type: "trigger";
      readonly positionTicks: number;
      readonly durationTicks?: never;
      readonly data: PatternEventData;
    };

export interface PatternPartState {
  readonly length: number;
  readonly events: readonly PatternEvent[];
}

/**
 * One named Pattern in the project bank. The bank is project-level so a Pattern
 * name means the same thing on every module; the steps for it live on each
 * module as the part at the same index.
 */
export interface PatternSlotState {
  readonly id: PatternId;
  readonly name: string;
  readonly length: number;
  /** Pattern-owned deterministic Humanize amount, 0 through 1. */
  readonly humanize: number;
  /** Stored Pattern seed. The same seed replays the same variation. */
  readonly seed: number;
}

export interface RackModuleState {
  readonly id: ModuleInstanceId;
  readonly pluginId: PluginId;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  /** One event part per project Pattern slot, indexed in step with it. */
  readonly parts: readonly PatternPartState[];
  readonly muted: boolean;
  readonly solo: boolean;
  /** Mixer fader position, 0 to 1. */
  readonly level: number;
  /** Stereo position, -1 hard left to 1 hard right. */
  readonly pan: number;
}

export interface SongEntry {
  readonly patternIndex: number;
  readonly repeats: number;
}

export interface SongState {
  /** When false the active Pattern loops; when true the chain plays. */
  readonly enabled: boolean;
  readonly entries: readonly SongEntry[];
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
  /** 0 is straight; 1 is a 2:1 triplet shuffle. */
  readonly swing: number;
  readonly masterLevel: number;
  readonly rackSlots: readonly RackSlotState[];
  readonly modules: Readonly<Record<ModuleInstanceId, RackModuleState>>;
  readonly effects: EffectsState;
  readonly patterns: readonly PatternSlotState[];
  readonly activePatternIndex: number;
  readonly song: SongState;
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
  readonly pianoRollSelection:
    | {
        readonly moduleId: ModuleInstanceId;
        readonly patternIndex: number;
        readonly eventIds: readonly NoteEventId[];
      }
    | undefined;
  readonly pianoRollParameter: string;
}

export interface PulseState {
  readonly project: ProjectState;
  readonly transport: TransportState;
  readonly ui: UiState;
  readonly history: HistoryAvailability;
}
