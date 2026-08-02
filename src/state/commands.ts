import type { CommandEnvelope } from "../contracts/commands";
import type { ModuleInstanceId, RackSlotId } from "../contracts/ids";
import type { PluginId } from "../contracts/parameters";

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
      "pattern-step-toggle",
      { readonly moduleId: ModuleInstanceId; readonly step: number }
    >
  | CommandEnvelope<"transport-swing-set", { readonly swing: number }>
  | CommandEnvelope<"transport-seek", { readonly positionTicks: number }>
  | CommandEnvelope<
      "pattern-humanize-set",
      { readonly patternIndex: number; readonly humanize: number }
    >
  | CommandEnvelope<"pattern-seed-set", { readonly patternIndex: number; readonly seed: number }>
  | CommandEnvelope<"pattern-select", { readonly patternIndex: number }>
  | CommandEnvelope<"pattern-rename", { readonly patternIndex: number; readonly name: string }>
  | CommandEnvelope<"pattern-clear", { readonly patternIndex: number }>
  | CommandEnvelope<
      "pattern-copy",
      { readonly fromPatternIndex: number; readonly toPatternIndex: number }
    >
  | CommandEnvelope<"song-mode-toggle", Record<string, never>>
  | CommandEnvelope<"song-entry-add", { readonly patternIndex: number }>
  | CommandEnvelope<"song-entry-remove", { readonly entryIndex: number }>
  | CommandEnvelope<
      "song-entry-repeats-set",
      { readonly entryIndex: number; readonly repeats: number }
    >
  | CommandEnvelope<"mixer-mute-toggle", { readonly moduleId: ModuleInstanceId }>
  | CommandEnvelope<"mixer-solo-toggle", { readonly moduleId: ModuleInstanceId }>
  | CommandEnvelope<
      "mixer-level-set",
      { readonly moduleId: ModuleInstanceId; readonly level: number }
    >
  | CommandEnvelope<"mixer-pan-set", { readonly moduleId: ModuleInstanceId; readonly pan: number }>
  | CommandEnvelope<"mixer-master-level-set", { readonly level: number }>;
