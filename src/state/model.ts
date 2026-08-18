import type { EffectsState } from "../contracts/effects";
import type {
  EffectInstanceId,
  ModuleInstanceId,
  NoteEventId,
  AutomationLaneId,
  PatternId,
  ProjectId,
  ProjectLineageId,
  RackSlotId,
  SendBusId,
  SongPlacementId,
  StateRevision,
  VoiceId,
} from "../contracts/ids";
import type { ParameterValue, PluginId } from "../contracts/parameters";

export const PATTERN_TICKS_PER_STEP = 240;
export const PATTERN_TICKS_PER_BAR = PATTERN_TICKS_PER_STEP * 16;

export const DEFAULT_PATTERN_EVENT_PROPERTIES = Object.freeze({
  probability: 1,
  microTimingTicks: 0,
  flam: 0,
  roll: 0,
});

/** The Pattern inspector offers only these pitch scales in the MVP. */
export const PATTERN_SCALES = ["Chromatic", "Minor", "Dorian", "Phrygian", "Pentatonic"] as const;
export type PatternScale = (typeof PATTERN_SCALES)[number];

/** A drum voice ID or a numeric note text key can own an independent cycle length. */
export type VoiceCycleLengthKey = VoiceId | `${number}`;

export interface PatternEventData {
  readonly note: number;
  readonly velocity: number;
  readonly accent: boolean;
  readonly slide: boolean;
  /** Chance that this event plays, on the closed unit interval. */
  readonly probability: number;
  /** Signed onset shift in ticks. The supported range is -60 through 60. */
  readonly microTimingTicks: number;
  /** Extra onset count for a flam. The supported range is 0 through 3. */
  readonly flam: number;
  /** Extra onset count for a roll. The supported range is 0 through 7. */
  readonly roll: number;
}

/** Input data keeps new event properties optional and normalizes them at the state boundary. */
export type PatternEventDataInput =
  & Pick<PatternEventData, "note" | "velocity" | "accent" | "slide">
  & Partial<Pick<PatternEventData, "probability" | "microTimingTicks" | "flam" | "roll">>;

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
  readonly moduleId: ModuleInstanceId;
  readonly length: number;
  /** Optional drum-voice cycle lengths, keyed by voice ID or numeric note text. */
  readonly voiceCycleLengths: Readonly<Record<VoiceCycleLengthKey, number>>;
  readonly events: readonly PatternEvent[];
  readonly automationLaneIds: readonly AutomationLaneId[];
}

/** One named, complete multi-module Pattern owned by the project. */
export interface PatternState {
  readonly id: PatternId;
  readonly name: string;
  /** Opaque six-digit sRGB color text, such as #E6A23C. */
  readonly color: string;
  /** Positive whole bar count. */
  readonly durationBars: number;
  /** Pitch scale used by the Pattern editor. */
  readonly scale: PatternScale;
  /** Pattern-owned deterministic Humanize amount, 0 through 1. */
  readonly humanize: number;
  /** Stored Pattern seed. The same seed replays the same variation. */
  readonly seed: number;
  /** Pattern-local module parts keyed by durable module instance ID. */
  readonly parts: Readonly<Record<ModuleInstanceId, PatternPartState>>;
  readonly automationLaneIds: readonly AutomationLaneId[];
  readonly createdAt: string;
  readonly modifiedAt: string;
}

export interface RackModuleState {
  readonly id: ModuleInstanceId;
  readonly pluginId: PluginId;
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly muted: boolean;
  readonly solo: boolean;
  /** Mixer fader position, 0 to 1. */
  readonly level: number;
  /** Stereo position, -1 hard left to 1 hard right. */
  readonly pan: number;
  /** Four fixed send taps. Amount zero makes a send inactive. */
  readonly sends: Readonly<Record<SendBusId, MixerSendState>>;
}

export interface MixerSendState {
  readonly amount: number;
  readonly mode: "pre-fader" | "post-fader";
}

export interface SongPlacement {
  readonly id: SongPlacementId;
  readonly patternId: PatternId;
  readonly repeatCount: number;
}

export interface SongState {
  /** When false the active Pattern loops; when true the chain plays. */
  readonly enabled: boolean;
  readonly placements: readonly SongPlacement[];
}

export interface AutomationStepState {
  readonly tick: number;
  readonly value: ParameterValue;
}

/**
 * The minimal Pattern automation record. Later scopes use this same state type
 * when their owner defines the target contract.
 */
export type AutomationScope = "module" | "mixer" | "send" | "send-return" | "effect" | "master";

/** The target ID stays stable when a pedal moves within a chain. */
export type AutomationTargetId = ModuleInstanceId | SendBusId | EffectInstanceId | "master";

/** A non-module lane that is armed from its owning mixer or effects control. */
export interface ExternalAutomationTarget {
  readonly scope: Exclude<AutomationScope, "module">;
  readonly targetId: Exclude<AutomationTargetId, ModuleInstanceId> | ModuleInstanceId;
  readonly parameterId: string;
}

export interface AutomationLaneState {
  readonly id: AutomationLaneId;
  readonly scope: AutomationScope;
  readonly targetId: AutomationTargetId;
  readonly parameterId: string;
  readonly patternId: PatternId;
  readonly stepTicks: typeof PATTERN_TICKS_PER_STEP;
  readonly steps: readonly AutomationStepState[];
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
  /** Array order is display order only. Pattern IDs own identity. */
  readonly patterns: readonly PatternState[];
  readonly activePatternId: PatternId;
  readonly automationLanes: Readonly<Record<AutomationLaneId, AutomationLaneState>>;
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
        readonly patternId: PatternId;
        readonly eventIds: readonly NoteEventId[];
      }
    | undefined;
  readonly pianoRollParameter: string;
  /** An armed mixer, send, effect, or master lane. Arming does not edit the project. */
  readonly pianoRollAutomationTarget: ExternalAutomationTarget | undefined;
}

export interface PulseState {
  readonly project: ProjectState;
  readonly transport: TransportState;
  readonly ui: UiState;
  readonly history: HistoryAvailability;
}
