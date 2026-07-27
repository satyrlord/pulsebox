import { defineElement } from "../define-element";
import { dispatchPulseEvent, type PulseControlEventDetail } from "../events";
import { requiredElement } from "../required-element";

const TOGGLE_STYLE = String.raw`
  :host,
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :host {
    display: inline-block;
    min-width: var(--pulse-target-min, 24px);
    min-height: var(--pulse-target-min, 24px);
    color: var(--pulse-color-text-primary, #f3f5f6);
    font: var(--pulse-weight-medium, 500) var(--pulse-type-10, 10px) / var(--pulse-line-tight, 1.2) var(--pulse-font-ui, system-ui, sans-serif);
  }

  button {
    display: inline-flex;
    min-width: var(--pulse-target-min, 24px);
    min-height: var(--pulse-target-min, 24px);
    align-items: center;
    justify-content: center;
    gap: var(--pulse-space-1, 4px);
    border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
    border-radius: var(--pulse-radius-control, 4px);
    padding: var(--pulse-space-1, 4px) var(--pulse-space-2, 8px);
    color: inherit;
    background: var(--pulse-color-surface-control, #242a30);
    box-shadow: var(--pulse-shadow-control, 0 1px 3px #0008);
    outline: var(--pulse-operational-outline, 0 solid transparent);
    outline-offset: -2px;
    cursor: pointer;
  }

  button[aria-pressed="true"] {
    border-color: var(--pulse-color-border-strong, #aab4bc);
    color: var(--pulse-color-on-accent, #07110b);
    background: var(--pulse-color-accent, #7ed9a3);
    box-shadow: inset 0 -2px 0 var(--pulse-color-on-accent, #07110b);
  }

  button:disabled {
    color: var(--pulse-color-text-muted, #919ba3);
    border-color: var(--pulse-color-disabled, #7b858d);
    cursor: not-allowed;
    opacity: 0.72;
  }

  button:focus-visible {
    outline: var(--pulse-focus-width, 2px) solid var(--pulse-color-focus-inner, #fff);
    outline-offset: var(--pulse-focus-gap, 1px);
    box-shadow: 0 0 0 calc(var(--pulse-focus-width, 2px) * 2 + var(--pulse-focus-gap, 1px)) var(--pulse-color-focus-outer, #000);
  }

  .led {
    display: none;
    width: 7px;
    height: 7px;
    border: 1px solid currentColor;
    border-radius: var(--pulse-radius-round, 999px);
    background: transparent;
  }

  :host([led]) .led {
    display: inline-block;
  }

  :host([led][pressed]) .led {
    background: var(--module-led, var(--pulse-color-status-success, #62d28a));
  }
`;

export class PulseToggle extends HTMLElement {
  static readonly observedAttributes = ["control-id", "disabled", "label", "pressed"];

  readonly #button: HTMLButtonElement;
  readonly #labelElement: HTMLSpanElement;
  #abortController: AbortController | undefined;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>${TOGGLE_STYLE}</style>
      <button type="button">
        <span class="led" aria-hidden="true"></span>
        <span class="label"></span>
      </button>
    `;
    this.#button = requiredElement(shadow, "button", HTMLButtonElement);
    this.#labelElement = requiredElement(shadow, ".label", HTMLSpanElement);
  }

  get controlId(): string {
    return this.getAttribute("control-id") ?? this.id;
  }

  set controlId(value: string) {
    this.setAttribute("control-id", value);
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value);
  }

  get label(): string {
    return this.getAttribute("label") ?? "Toggle";
  }

  set label(value: string) {
    this.setAttribute("label", value);
  }

  get pressed(): boolean {
    return this.hasAttribute("pressed");
  }

  set pressed(value: boolean) {
    this.toggleAttribute("pressed", value);
  }

  connectedCallback(): void {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    this.#button.addEventListener(
      "click",
      (event) => {
        if (this.disabled) return;
        this.pressed = !this.pressed;
        const detail: PulseControlEventDetail<boolean> = {
          controlId: this.controlId,
          source: event.detail === 0 ? "keyboard" : "pointer",
          value: this.pressed,
        };
        dispatchPulseEvent(this, "pulse-control-commit", detail);
      },
      { signal: this.#abortController.signal },
    );
    this.#button.addEventListener(
      "keydown",
      (event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      },
      { signal: this.#abortController.signal },
    );
    this.#patch();
  }

  disconnectedCallback(): void {
    this.#abortController?.abort();
    this.#abortController = undefined;
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.#patch();
  }

  #patch(): void {
    this.#button.disabled = this.disabled;
    this.#button.setAttribute("aria-label", this.label);
    this.#button.setAttribute("aria-pressed", String(this.pressed));
    this.#button.title = this.label;
    this.#labelElement.textContent = this.label;
  }
}

export class PulseLedButton extends PulseToggle {
  override connectedCallback(): void {
    this.setAttribute("led", "");
    super.connectedCallback();
  }
}

defineElement("pulse-toggle", PulseToggle);
defineElement("pulse-led-button", PulseLedButton);
