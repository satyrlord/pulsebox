import type { PulseCommand } from "../commands";
import type { PulseCommandHandlers, PulseCommandTransition } from "./types";

type PatternCommand = Extract<PulseCommand, { readonly type: `pattern-${string}` | `piano-roll-${string}` | `automation-${string}` }>;

export function routePatternCommand<Delta>(
  command: PatternCommand,
  handlers: PulseCommandHandlers<Delta>,
): PulseCommandTransition<Delta> {
  const handler = handlers[command.type] as (
    command: PatternCommand,
  ) => PulseCommandTransition<Delta>;
  return handler(command);
}
