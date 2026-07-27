import { defineElement } from "../define-element";
import { requiredElement } from "../required-element";

export class PulseSegmentDisplay extends HTMLElement {
  static readonly observedAttributes = ["label", "value"];

  readonly #labelElement: HTMLSpanElement;
  readonly #output: HTMLOutputElement;

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
          display: inline-grid;
          min-width: 72px;
          gap: 2px;
          color: var(--pulse-color-text-primary, #f3f5f6);
          font-family: var(--pulse-font-ui, system-ui, sans-serif);
        }
        .label {
          color: var(--pulse-color-text-secondary, #bac2c8);
          font-size: var(--pulse-type-10, 10px);
          line-height: var(--pulse-line-tight, 1.2);
        }
        output {
          display: block;
          min-height: var(--pulse-target-min, 24px);
          border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          border-radius: var(--pulse-radius-control, 4px);
          padding: var(--pulse-space-1, 4px) var(--pulse-space-2, 8px);
          color: var(--module-led, var(--pulse-color-control-fill, #b0f2ca));
          background: var(--pulse-color-surface-inset, #080a0c);
          font: var(--pulse-type-12, 12px) / var(--pulse-line-tight, 1.2) var(--pulse-font-mono, ui-monospace, monospace);
          font-variant-numeric: tabular-nums;
          text-align: center;
          white-space: nowrap;
        }
      </style>
      <span class="label"></span>
      <output></output>
    `;
    this.#labelElement = requiredElement(shadow, ".label", HTMLSpanElement);
    this.#output = requiredElement(shadow, "output", HTMLOutputElement);
  }

  get label(): string {
    return this.getAttribute("label") ?? "Value";
  }

  set label(value: string) {
    this.setAttribute("label", value);
  }

  get value(): string {
    return this.getAttribute("value") ?? "--";
  }

  set value(value: string) {
    this.setAttribute("value", value);
  }

  connectedCallback(): void {
    this.#patch();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.#patch();
  }

  #patch(): void {
    this.#labelElement.textContent = this.label;
    this.#output.textContent = this.value;
    this.#output.setAttribute("aria-label", `${this.label}: ${this.value}`);
  }
}

defineElement("pulse-segment-display", PulseSegmentDisplay);
