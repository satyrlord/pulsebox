import type { PulseCommand } from "../commands";
import type { PulseCommandHandlers, PulseCommandTransition } from "./types";

type SongCommand = Extract<PulseCommand, { readonly type: `song-${string}` }>;

export function routeSongCommand<Delta>(
  command: SongCommand,
  handlers: PulseCommandHandlers<Delta>,
): PulseCommandTransition<Delta> {
  const handler = handlers[command.type] as (
    command: SongCommand,
  ) => PulseCommandTransition<Delta>;
  return handler(command);
}
