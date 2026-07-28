import type { GestureId } from "../contracts";

export type PulseControlSource =
  | "keyboard"
  | "numeric"
  | "pointer"
  | "reset"
  | "wheel";

export interface PulseControlEventDetail<T extends boolean | number = boolean | number> {
  readonly controlId: string;
  readonly source: PulseControlSource;
  readonly value: T;
}

export interface PulseStepChangeDetail {
  readonly active: boolean;
  readonly gestureId: GestureId;
  readonly index: number;
}

declare global {
  interface HTMLElementEventMap {
    "pulse-control-commit": CustomEvent<PulseControlEventDetail>;
    "pulse-control-input": CustomEvent<PulseControlEventDetail<number>>;
    "pulse-step-change": CustomEvent<PulseStepChangeDetail>;
    "pulse-note-create": CustomEvent<unknown>;
    "pulse-note-change": CustomEvent<unknown>;
    "pulse-note-delete": CustomEvent<unknown>;
    "pulse-module-add": CustomEvent<unknown>;
    "pulse-module-move": CustomEvent<unknown>;
    "pulse-module-remove": CustomEvent<unknown>;
    "pulse-module-duplicate": CustomEvent<unknown>;
    "pulse-channel-change": CustomEvent<unknown>;
    "pulse-effect-change": CustomEvent<unknown>;
    "pulse-pattern-change": CustomEvent<unknown>;
    "pulse-pattern-select": CustomEvent<unknown>;
    "pulse-pattern-reorder": CustomEvent<unknown>;
    "pulse-automation-change": CustomEvent<unknown>;
    "pulse-transport-command": CustomEvent<unknown>;
  }
}

export function dispatchPulseEvent(
  target: HTMLElement,
  type: string,
  detail: unknown,
): void {
  target.dispatchEvent(
    new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail,
    }),
  );
}
