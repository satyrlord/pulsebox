import type { CommandEnvelope } from "../contracts/commands";
import type { ModuleInstanceId, RackSlotId } from "../contracts/ids";

export type PulseCommand =
  | CommandEnvelope<"transport-play", Record<string, never>>
  | CommandEnvelope<"transport-pause", { readonly positionTicks: number }>
  | CommandEnvelope<"transport-stop", Record<string, never>>
  | CommandEnvelope<"transport-record-toggle", Record<string, never>>
  | CommandEnvelope<"transport-tempo-set", { readonly tempo: number }>
  | CommandEnvelope<"rack-module-select", { readonly moduleId?: ModuleInstanceId }>
  | CommandEnvelope<"rack-module-add", { readonly slotId: RackSlotId }>
  | CommandEnvelope<"rack-module-remove", { readonly moduleId: ModuleInstanceId }>
  | CommandEnvelope<"rack-module-duplicate", { readonly moduleId: ModuleInstanceId; readonly slotId: RackSlotId }>
  | CommandEnvelope<"rack-module-move", { readonly moduleId: ModuleInstanceId; readonly slotId: RackSlotId }>
  | CommandEnvelope<"rack-module-collapse-toggle", { readonly moduleId: ModuleInstanceId }>
  | CommandEnvelope<
      "rack-parameter-set",
      { readonly moduleId: ModuleInstanceId; readonly parameter: string; readonly value: number | boolean | string }
    >
  | CommandEnvelope<"pattern-step-toggle", { readonly moduleId: ModuleInstanceId; readonly step: number }>;
