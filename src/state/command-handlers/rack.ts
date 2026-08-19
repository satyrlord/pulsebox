import type { PulseCommand } from "../commands";
import type { PulseCommandHandlers, PulseCommandTransition } from "./types";

type RackCommand = Extract<PulseCommand, { readonly type: `rack-${string}` }>;

export function routeRackCommand<Delta>(
  command: RackCommand,
  handlers: PulseCommandHandlers<Delta>,
): PulseCommandTransition<Delta> {
  const handler = handlers[command.type] as (
    command: RackCommand,
  ) => PulseCommandTransition<Delta>;
  return handler(command);
}
