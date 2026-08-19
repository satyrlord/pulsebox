import type { PulseCommand } from "../commands";
import type { PulseCommandHandlers, PulseCommandTransition } from "./types";

type TransportCommand = Extract<PulseCommand, { readonly type: `transport-${string}` }>;

export function routeTransportCommand<Delta>(
  command: TransportCommand,
  handlers: PulseCommandHandlers<Delta>,
): PulseCommandTransition<Delta> {
  const handler = handlers[command.type] as (
    command: TransportCommand,
  ) => PulseCommandTransition<Delta>;
  return handler(command);
}
