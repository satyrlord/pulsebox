import type { CommandResult } from "../../contracts/commands";
import type { PulseCommand } from "../commands";
import type { PulseState } from "../model";

export type PulseCommandTransition<Delta> =
  | {
      readonly state: PulseState;
      readonly projectChanged: boolean;
      readonly delta?: Delta;
    }
  | { readonly error: CommandResult };

export type PulseCommandHandlers<Delta> = {
  readonly [Type in PulseCommand["type"]]: (
    command: Extract<PulseCommand, { readonly type: Type }>,
  ) => PulseCommandTransition<Delta>;
};
