import type { PulseCommand } from "../commands";
import type { PulseCommandHandlers, PulseCommandTransition } from "./types";

type MixerEffectsCommand = Extract<PulseCommand, { readonly type: `mixer-${string}` | `effects-${string}` }>;

export function routeMixerEffectsCommand<Delta>(
  command: MixerEffectsCommand,
  handlers: PulseCommandHandlers<Delta>,
): PulseCommandTransition<Delta> {
  const handler = handlers[command.type] as (
    command: MixerEffectsCommand,
  ) => PulseCommandTransition<Delta>;
  return handler(command);
}
