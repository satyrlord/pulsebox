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
