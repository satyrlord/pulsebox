import type { CommandEnvelope } from "../contracts/commands";
import type {
  ModuleInstanceId,
  NoteEventId,
  PatternId,
  RackSlotId,
  SongPlacementId,
  VoiceId,
} from "../contracts/ids";
import type { PluginId } from "../contracts/parameters";
import type {
  PatternEvent,
  PatternEventDataInput,
  PatternScale,
  VoiceCycleLengthKey,
} from "./model";

export type NewPatternEvent =
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

export type PatternEventEdit =
  | { readonly type: "create"; readonly event: NewPatternEvent }
  | { readonly type: "delete"; readonly eventIds: readonly NoteEventId[] }
  | {
      readonly type: "move";
      readonly eventIds: readonly NoteEventId[];
      readonly deltaTicks: number;
      readonly deltaNote: number;
    }
  | {
      readonly type: "resize";
      readonly eventId: NoteEventId;
      readonly durationTicks: number;
      readonly positionTicks?: number;
    }
  | { readonly type: "duplicate"; readonly eventIds: readonly NoteEventId[] }
  | { readonly type: "velocity"; readonly eventIds: readonly NoteEventId[]; readonly velocity: number }
  | {
      readonly type: "properties";
      readonly eventIds: readonly NoteEventId[];
      readonly values: Partial<
        Pick<
          PatternEventDataInput,
          "velocity" | "accent" | "slide" | "probability" | "microTimingTicks" | "flam" | "roll"
        >
      >;
    };

export type PulseCommand =
  | CommandEnvelope<"transport-play", Record<string, never>>
  | CommandEnvelope<"transport-pause", { readonly positionTicks: number }>
  | CommandEnvelope<"transport-stop", Record<string, never>>
  | CommandEnvelope<"transport-record-toggle", Record<string, never>>
  | CommandEnvelope<"transport-tempo-set", { readonly tempo: number }>
  | CommandEnvelope<"rack-module-select", { readonly moduleId?: ModuleInstanceId }>
  | CommandEnvelope<"rack-module-add", { readonly slotId: RackSlotId; readonly pluginId: PluginId }>
  | CommandEnvelope<"rack-module-remove", { readonly moduleId: ModuleInstanceId }>
  | CommandEnvelope<
      "rack-module-duplicate",
      { readonly moduleId: ModuleInstanceId; readonly slotId: RackSlotId }
    >
  | CommandEnvelope<
      "rack-module-move",
      { readonly moduleId: ModuleInstanceId; readonly slotId: RackSlotId }
    >
  | CommandEnvelope<
      "rack-module-swap",
      { readonly moduleId: ModuleInstanceId; readonly pluginId: PluginId }
    >
  | CommandEnvelope<
      "rack-parameter-set",
      {
        readonly moduleId: ModuleInstanceId;
        readonly parameter: string;
        readonly value: number | boolean | string;
      }
    >
  | CommandEnvelope<
      "voice-insert-set",
      {
        readonly moduleId: ModuleInstanceId;
        readonly voiceId: VoiceId;
        readonly effectPluginId: PluginId | null;
      }
    >
  | CommandEnvelope<
      "pattern-events-edit",
      {
        readonly moduleId: ModuleInstanceId;
        readonly patternId: PatternId;
        readonly edit: PatternEventEdit;
      }
    >
  | CommandEnvelope<
      "piano-roll-selection-set",
      {
        readonly moduleId: ModuleInstanceId;
        readonly patternId: PatternId;
        readonly eventIds: readonly NoteEventId[];
      }
    >
  | CommandEnvelope<"piano-roll-parameter-set", { readonly parameter: string }>
  | CommandEnvelope<"transport-swing-set", { readonly swing: number }>
  | CommandEnvelope<"transport-seek", { readonly positionTicks: number }>
  | CommandEnvelope<
      "pattern-humanize-set",
      { readonly patternId: PatternId; readonly humanize: number }
    >
  | CommandEnvelope<"pattern-seed-set", { readonly patternId: PatternId; readonly seed: number }>
  | CommandEnvelope<"pattern-select", { readonly patternId: PatternId }>
  | CommandEnvelope<"pattern-rename", { readonly patternId: PatternId; readonly name: string }>
  | CommandEnvelope<"pattern-color-set", { readonly patternId: PatternId; readonly color: string }>
  | CommandEnvelope<
      "pattern-duration-set",
      { readonly patternId: PatternId; readonly durationBars: number }
    >
  | CommandEnvelope<"pattern-scale-set", { readonly patternId: PatternId; readonly scale: PatternScale }>
  | CommandEnvelope<
      "pattern-add",
      { readonly name?: string; readonly afterPatternId?: PatternId }
    >
  | CommandEnvelope<"pattern-duplicate", { readonly patternId: PatternId }>
  | CommandEnvelope<"pattern-delete", { readonly patternId: PatternId }>
  | CommandEnvelope<
      "pattern-reorder",
      { readonly patternId: PatternId; readonly afterPatternId?: PatternId }
    >
  | CommandEnvelope<"pattern-clear", { readonly patternId: PatternId }>
  | CommandEnvelope<
      "pattern-part-events-replace",
      {
        readonly patternId: PatternId;
        readonly moduleId: ModuleInstanceId;
        readonly events: readonly PatternEvent[];
        /** Stretch applies events and this target cycle length atomically. */
        readonly length?: number;
      }
    >
  | CommandEnvelope<
      "automation-lane-steps-set",
      {
        readonly patternId: PatternId;
        readonly moduleId: ModuleInstanceId;
        readonly parameterId: string;
        readonly steps: readonly { readonly tick: number; readonly value: number | boolean | string }[];
      }
    >
  | CommandEnvelope<
      "pattern-part-length-set",
      { readonly patternId: PatternId; readonly moduleId: ModuleInstanceId; readonly length: number }
    >
  | CommandEnvelope<
      "pattern-part-voice-cycle-length-set",
      {
        readonly patternId: PatternId;
        readonly moduleId: ModuleInstanceId;
        readonly voiceKey: VoiceCycleLengthKey;
        /** Undefined removes the voice cycle override. */
        readonly length?: number;
      }
    >
  | CommandEnvelope<
      "pattern-part-events-transfer",
      {
        readonly fromPatternId: PatternId;
        readonly fromModuleId: ModuleInstanceId;
        readonly toPatternId: PatternId;
        readonly toModuleId: ModuleInstanceId;
        readonly eventIds: readonly NoteEventId[];
        readonly mode: "copy" | "move";
      }
    >
  | CommandEnvelope<"song-mode-toggle", Record<string, never>>
  | CommandEnvelope<"song-placement-add", { readonly patternId: PatternId }>
  | CommandEnvelope<"song-placement-remove", { readonly placementId: SongPlacementId }>
  | CommandEnvelope<
      "song-placement-repeat-count-set",
      { readonly placementId: SongPlacementId; readonly repeatCount: number }
    >
  | CommandEnvelope<
      "song-placement-reorder",
      { readonly placementId: SongPlacementId; readonly afterPlacementId?: SongPlacementId }
    >
  | CommandEnvelope<
      "song-placement-duplicate",
      { readonly placementId: SongPlacementId }
    >
  | CommandEnvelope<
      "song-placement-pattern-set",
      { readonly placementId: SongPlacementId; readonly patternId: PatternId }
    >
  | CommandEnvelope<"mixer-mute-toggle", { readonly moduleId: ModuleInstanceId }>
  | CommandEnvelope<"mixer-solo-toggle", { readonly moduleId: ModuleInstanceId }>
  | CommandEnvelope<
      "mixer-level-set",
      { readonly moduleId: ModuleInstanceId; readonly level: number }
    >
  | CommandEnvelope<"mixer-pan-set", { readonly moduleId: ModuleInstanceId; readonly pan: number }>
  | CommandEnvelope<"mixer-master-level-set", { readonly level: number }>;
