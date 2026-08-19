import type { PulseCommand } from "../commands";
import { routeMixerEffectsCommand } from "./mixer-effects";
import { routePatternCommand } from "./pattern";
import { routeRackCommand } from "./rack";
import { routeSongCommand } from "./song";
import { routeTransportCommand } from "./transport";
import type { PulseCommandHandlers, PulseCommandTransition } from "./types";

export const commandHandlerDomains = [
  "transport",
  "rack",
  "pattern",
  "song",
  "mixer-effects",
] as const;

type CommandHandlerDomain = (typeof commandHandlerDomains)[number];

export const commandDomainByType = {
  "transport-play": "transport",
  "transport-pause": "transport",
  "transport-stop": "transport",
  "transport-record-toggle": "transport",
  "transport-tempo-set": "transport",
  "transport-swing-set": "transport",
  "transport-seek": "transport",
  "rack-module-select": "rack",
  "rack-module-add": "rack",
  "rack-module-remove": "rack",
  "rack-module-duplicate": "rack",
  "rack-module-move": "rack",
  "rack-module-swap": "rack",
  "rack-parameter-set": "rack",
  "pattern-events-edit": "pattern",
  "piano-roll-selection-set": "pattern",
  "piano-roll-parameter-set": "pattern",
  "piano-roll-automation-target-set": "pattern",
  "pattern-humanize-set": "pattern",
  "pattern-seed-set": "pattern",
  "pattern-select": "pattern",
  "pattern-rename": "pattern",
  "pattern-color-set": "pattern",
  "pattern-duration-set": "pattern",
  "pattern-scale-set": "pattern",
  "pattern-add": "pattern",
  "pattern-duplicate": "pattern",
  "pattern-delete": "pattern",
  "pattern-reorder": "pattern",
  "pattern-clear": "pattern",
  "pattern-part-events-replace": "pattern",
  "automation-lane-steps-set": "pattern",
  "pattern-part-length-set": "pattern",
  "pattern-part-voice-cycle-length-set": "pattern",
  "pattern-part-events-transfer": "pattern",
  "song-mode-toggle": "song",
  "song-placement-add": "song",
  "song-placement-remove": "song",
  "song-placement-repeat-count-set": "song",
  "song-placement-reorder": "song",
  "song-placement-duplicate": "song",
  "song-placement-pattern-set": "song",
  "mixer-mute-toggle": "mixer-effects",
  "mixer-solo-toggle": "mixer-effects",
  "mixer-level-set": "mixer-effects",
  "mixer-pan-set": "mixer-effects",
  "mixer-master-level-set": "mixer-effects",
  "mixer-send-amount-set": "mixer-effects",
  "effects-chain-effect-add": "mixer-effects",
  "effects-chain-effect-remove": "mixer-effects",
  "effects-chain-effect-replace": "mixer-effects",
  "effects-chain-effect-reorder": "mixer-effects",
  "effects-instance-bypass-set": "mixer-effects",
  "effects-instance-mix-set": "mixer-effects",
  "effects-instance-gain-set": "mixer-effects",
  "effects-instance-parameter-set": "mixer-effects",
  "effects-send-return-level-set": "mixer-effects",
  "effects-send-chain-bypass-set": "mixer-effects",
  "effects-module-chain-bypass-toggle": "mixer-effects",
  "effects-send-all-bypass-toggle": "mixer-effects",
  "effects-send-focus-set": "mixer-effects",
  "effects-master-bypass-toggle": "mixer-effects",
} as const satisfies Record<PulseCommand["type"], CommandHandlerDomain>;

export function routePulseCommand<Delta>(
  command: PulseCommand,
  handlers: PulseCommandHandlers<Delta>,
): PulseCommandTransition<Delta> {
  const domain = commandDomainByType[command.type];
  if (domain === "transport") return routeTransportCommand(command as never, handlers);
  if (domain === "rack") return routeRackCommand(command as never, handlers);
  if (domain === "pattern") return routePatternCommand(command as never, handlers);
  if (domain === "song") return routeSongCommand(command as never, handlers);
  return routeMixerEffectsCommand(command as never, handlers);
}
