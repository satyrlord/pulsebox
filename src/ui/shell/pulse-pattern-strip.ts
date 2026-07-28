import {
  browserIdFactory,
  createGestureId,
  type GestureId,
} from "../../contracts";
import { defineElement } from "../define-element";
import { dispatchPulseEvent, type PulseStepChangeDetail } from "../events";
import { requiredElement } from "../required-element";

export interface PulsePatternStep {
  readonly accent?: boolean;
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly probability?: number;
  readonly slide?: boolean;
  readonly tie?: boolean;
}

const DEFAULT_STEPS: readonly PulsePatternStep[] = Array.from({ length: 16 }, () => ({
  active: false,
}));

export class PulsePatternStrip extends HTMLElement {
  static readonly observedAttributes = ["current-step", "disabled", "label"];

  readonly #buttons: HTMLButtonElement[] = [];
  readonly #grid: HTMLDivElement;
  #abortController: AbortController | undefined;
  #ignorePointerClickUntil = 0;
  #paintActive = false;
  #paintGestureId: GestureId | undefined;
  #paintPointer: number | undefined;
  #steps: readonly PulsePatternStep[] = DEFAULT_STEPS;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host,
        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }
        :host {
          display: block;
          min-width: 0;
          width: 100%;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(16, minmax(var(--pulse-target-min, 24px), 1fr));
          gap: 2px;
          min-width: 416px;
        }
        /*
         * A step is a recessed well holding a step pad. The pad lights with the
         * module accent when the step is active; the well itself stays dark, so
         * a full row of active steps still reads as a sequencer, not a bar.
         */
        button {
          position: relative;
          display: grid;
          min-width: var(--pulse-target-min, 24px);
          min-height: var(--pulse-target-min, 24px);
          place-items: center;
          border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          border-radius: 2px;
          padding: 0;
          color: var(--pulse-color-text-muted, #919ba3);
          background: var(--pulse-color-surface-inset, #080a0c);
          box-shadow: inset 0 1px 2px 0 #00000073;
          font: var(--pulse-type-10, 10px) / 1 var(--pulse-font-mono, ui-monospace, monospace);
          cursor: pointer;
          outline: var(--pulse-operational-outline, 0 solid transparent);
          outline-offset: -2px;
        }
        /* The lit pad. Inactive steps keep an unlit pad so the grid reads evenly. */
        .pad {
          width: 10px;
          height: 10px;
          border: var(--pulse-border-thin, 1px) solid var(--pulse-color-control-track, #6f7b84);
          border-radius: 2px;
          background: var(--pulse-color-meter-track, #20262b);
          pointer-events: none;
        }
        /* Every fourth step starts a beat and carries a stronger boundary. */
        button:nth-child(4n + 1) {
          border-inline-start-color: var(--pulse-color-border-strong, #aab4bc);
          border-inline-start-width: var(--pulse-border-strong, 2px);
        }
        /*
         * Active state uses the lit pad plus a strengthened cell boundary, so
         * it never depends on colour alone.
         */
        button[data-active="true"] {
          border-color: var(--pulse-color-border-strong, #aab4bc);
        }
        button[data-active="true"] .pad {
          border-color: var(--module-led, var(--pulse-color-control-fill, #b0f2ca));
          background: var(--module-accent, var(--pulse-color-accent, #7ed9a3));
        }
        /* Playhead outline on the cell the transport is currently sounding. */
        button[data-current="true"] {
          box-shadow:
            inset 0 0 0 2px var(--pulse-color-border-strong, #aab4bc),
            inset 0 1px 2px 0 #00000073;
        }
        /* Accent, tie, and slide are shape cues drawn beside the pad. */
        button[data-accent="true"] {
          border-block-start-width: 3px;
          border-block-start-color: var(--pulse-color-border-strong, #aab4bc);
        }
        button[data-accent="true"] .pad {
          width: 13px;
          height: 13px;
        }
        button[data-tie="true"]::before {
          position: absolute;
          inset-inline: 20%;
          inset-block-end: 3px;
          height: 2px;
          background: var(--pulse-color-text-secondary, #bac2c8);
          content: "";
        }
        button[data-slide="true"]::after {
          position: absolute;
          inset-block-start: 2px;
          inset-inline-end: 2px;
          border-block-end: 5px solid var(--pulse-color-text-secondary, #bac2c8);
          border-inline-start: 5px solid transparent;
          content: "";
        }
        button:disabled {
          color: var(--pulse-color-text-muted, #919ba3);
          border-color: var(--pulse-color-disabled, #7b858d);
          background: var(--pulse-color-surface-panel, #15191d);
          cursor: not-allowed;
          opacity: 0.72;
        }
        button:focus-visible {
          z-index: 1;
          outline: var(--pulse-focus-width, 2px) solid var(--pulse-color-focus-inner, #fff);
          outline-offset: var(--pulse-focus-gap, 1px);
          box-shadow: 0 0 0 calc(var(--pulse-focus-width, 2px) * 2 + var(--pulse-focus-gap, 1px)) var(--pulse-color-focus-outer, #000);
        }
      </style>
      <div class="grid" role="group"></div>
    `;
    this.#grid = requiredElement(shadow, ".grid", HTMLDivElement);
    for (let index = 0; index < 16; index += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.index = String(index);
      const pad = document.createElement("span");
      pad.className = "pad";
      button.append(pad);
      this.#buttons.push(button);
      this.#grid.append(button);
    }
  }

  get currentStep(): number {
    return Number(this.getAttribute("current-step") ?? -1);
  }

  set currentStep(value: number) {
    this.setAttribute("current-step", String(value));
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value);
  }

  get label(): string {
    return this.getAttribute("label") ?? "Pattern steps";
  }

  set label(value: string) {
    this.setAttribute("label", value);
  }

  get steps(): readonly PulsePatternStep[] {
    return this.#steps;
  }

  set steps(value: readonly PulsePatternStep[]) {
    this.#steps = Array.from({ length: 16 }, (_, index) => value[index] ?? { active: false });
    this.#patch();
  }

  connectedCallback(): void {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;
    this.#grid.addEventListener("click", (event) => this.#onClick(event), { signal });
    this.#grid.addEventListener(
      "keydown",
      (event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      },
      { signal },
    );
    this.#grid.addEventListener("pointerdown", (event) => this.#onPointerDown(event), { signal });
    this.#grid.addEventListener("pointermove", (event) => this.#onPointerMove(event), { signal });
    this.#grid.addEventListener("pointerup", (event) => this.#onPointerEnd(event), { signal });
    this.#grid.addEventListener("pointercancel", (event) => this.#onPointerEnd(event), { signal });
    this.#patch();
  }

  disconnectedCallback(): void {
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#paintGestureId = undefined;
    this.#paintPointer = undefined;
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.#patch();
  }

  #announceChange(
    index: number,
    active: boolean,
    gestureId = createGestureId(browserIdFactory),
  ): void {
    this.#steps = this.#steps.map((step, stepIndex) =>
      stepIndex === index ? { ...step, active } : step,
    );
    this.#patch();
    const detail: PulseStepChangeDetail = { active, gestureId, index };
    dispatchPulseEvent(this, "pulse-step-change", detail);
  }

  #buttonFromEvent(event: Event): HTMLButtonElement | undefined {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return undefined;
    const button = target.closest("button");
    return button?.dataset.index !== undefined ? button : undefined;
  }

  #onClick(event: MouseEvent): void {
    if (event.detail > 0 && performance.now() < this.#ignorePointerClickUntil) return;
    const button = this.#buttonFromEvent(event);
    if (button === undefined || button.disabled) return;
    const index = Number(button.dataset.index);
    this.#announceChange(index, !this.#steps[index]?.active);
  }

  #onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const button = this.#buttonFromEvent(event);
    if (button === undefined || button.disabled) return;
    event.preventDefault();
    const index = Number(button.dataset.index);
    this.#paintActive = !this.#steps[index]?.active;
    this.#paintGestureId = createGestureId(browserIdFactory);
    this.#paintPointer = event.pointerId;
    this.#ignorePointerClickUntil = performance.now() + 500;
    this.#grid.setPointerCapture(event.pointerId);
    this.#announceChange(index, this.#paintActive, this.#paintGestureId);
  }

  #onPointerEnd(event: PointerEvent): void {
    if (this.#paintPointer !== event.pointerId) return;
    if (this.#grid.hasPointerCapture(event.pointerId)) this.#grid.releasePointerCapture(event.pointerId);
    this.#paintGestureId = undefined;
    this.#paintPointer = undefined;
  }

  #onPointerMove(event: PointerEvent): void {
    if (this.#paintPointer !== event.pointerId) return;
    const target = this.shadowRoot?.elementFromPoint(event.clientX, event.clientY);
    // The pad is `pointer-events: none`, but guard the closest button anyway so
    // any future cell child cannot break painting.
    const button = target instanceof HTMLElement ? target.closest("button") : null;
    if (button === null || button.disabled) return;
    const index = Number(button.dataset.index);
    if (
      this.#steps[index]?.active !== this.#paintActive &&
      this.#paintGestureId !== undefined
    ) {
      this.#announceChange(index, this.#paintActive, this.#paintGestureId);
    }
  }

  #patch(): void {
    this.#grid.setAttribute("aria-label", this.label);
    this.#buttons.forEach((button, index) => {
      const state = this.#steps[index] ?? { active: false };
      const descriptors = [state.active ? "active" : "inactive"];
      if (state.accent) descriptors.push("accented");
      if (state.tie) descriptors.push("tied");
      if (state.slide) descriptors.push("slide");
      if (state.probability !== undefined) {
        descriptors.push(`${String(Math.round(state.probability * 100))}% probability`);
      }
      // The pad is the persistent child; never replace it with text content.
      button.disabled = this.disabled || state.disabled === true;
      button.dataset.active = String(state.active);
      button.dataset.accent = String(state.accent === true);
      button.dataset.current = String(this.currentStep === index);
      button.dataset.slide = String(state.slide === true);
      button.dataset.tie = String(state.tie === true);
      button.setAttribute("aria-pressed", String(state.active));
      button.setAttribute("aria-label", `Step ${String(index + 1)}: ${descriptors.join(", ")}`);
    });
  }
}

defineElement("pulse-pattern-strip", PulsePatternStrip);
