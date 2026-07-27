import { defineElement } from "../define-element";
import { PulseRangeControl } from "./range-control";

const FADER_STYLE = String.raw`
  :host {
    min-width: 56px;
  }

  .control {
    width: 32px;
    height: 112px;
    min-height: 112px;
    cursor: ns-resize;
  }

  .dial {
    width: 8px;
    height: 96px;
    border-radius: var(--pulse-radius-control, 4px);
    background: linear-gradient(
      to top,
      var(--pulse-color-control-fill, #b0f2ca) 0 var(--fader-fill),
      var(--pulse-color-control-track, #6f7b84) var(--fader-fill) 100%
    );
    box-shadow: inset 0 0 0 2px var(--pulse-color-surface-inset, #080a0c);
  }

  .marker {
    inset-block-start: auto;
    inset-block-end: calc(var(--fader-fill) - 5px);
    inset-inline-start: 4px;
    width: 24px;
    height: 10px;
    border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-strong, #aab4bc);
    border-radius: var(--pulse-radius-control, 4px);
    background: var(--pulse-color-control-thumb, #e1e6e9);
    transform: none;
    transform-origin: center;
    box-shadow: var(--pulse-shadow-control, 0 1px 3px #0008);
  }
`;

export class PulseFader extends PulseRangeControl {
  constructor() {
    super(FADER_STYLE);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.shadowRoot
      ?.querySelector<HTMLInputElement>('input[type="range"]')
      ?.setAttribute("aria-orientation", "vertical");
    this.#patchFill();
    this.addEventListener("pulse-control-input", this.#patchFill);
  }

  override disconnectedCallback(): void {
    this.removeEventListener("pulse-control-input", this.#patchFill);
    super.disconnectedCallback();
  }

  override attributeChangedCallback(): void {
    super.attributeChangedCallback();
    if (this.isConnected) this.#patchFill();
  }

  readonly #patchFill = (): void => {
    const span = this.max - this.min;
    const ratio = span === 0 ? 0 : (this.value - this.min) / span;
    this.shadowRoot
      ?.querySelector<HTMLElement>(".dial")
      ?.style.setProperty("--fader-fill", `${String(ratio * 100)}%`);
  };
}

defineElement("pulse-fader", PulseFader);
