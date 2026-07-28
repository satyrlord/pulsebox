import {
  dispatchPulseEvent,
  type PulseControlEventDetail,
  type PulseControlSource,
} from "../events";
import { requiredElement } from "../required-element";

const RANGE_STYLE = String.raw`
  :host,
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :host {
    display: inline-grid;
    min-width: var(--pulse-target-min, 24px);
    color: var(--pulse-color-text-primary, #f3f5f6);
    font: var(--pulse-weight-medium, 500) var(--pulse-type-10, 10px) / var(--pulse-line-tight, 1.2) var(--pulse-font-ui, system-ui, sans-serif);
    justify-items: center;
  }

  :host([disabled]) {
    color: var(--pulse-color-text-muted, #919ba3);
    opacity: 0.72;
  }

  .control {
    position: relative;
    display: grid;
    place-items: center;
    width: 44px;
    min-height: 44px;
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
  }

  /*
   * The ring is the value track. Its lit arc uses the module accent, and the
   * cap sits inside it as a separate raised surface, so the value reading and
   * the tactile cap never share a colour.
   */
  .dial {
    width: 38px;
    height: 38px;
    border-radius: var(--pulse-radius-round, 999px);
    background:
      conic-gradient(
        from 225deg,
        var(--module-control-ring, var(--pulse-color-control-fill, #b0f2ca)) 0deg var(--angle),
        var(--pulse-color-control-track, #6f7b84) var(--angle) 270deg,
        transparent 270deg
      );
  }

  /* The raised cap, drawn over the ring with a recessed dark face. */
  .dial::after {
    position: absolute;
    inset: 8px;
    border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
    border-radius: var(--pulse-radius-round, 999px);
    background: var(--pulse-color-surface-control, #242a30);
    box-shadow:
      inset 0 1px 0 0 #ffffff1a,
      inset 0 -2px 3px 0 #00000066,
      var(--pulse-shadow-control, 0 1px 3px #0008);
    content: "";
  }

  .marker {
    position: absolute;
    z-index: 1;
    inset-block-start: 10px;
    inset-inline-start: calc(50% - 1px);
    width: 2px;
    height: 10px;
    border-radius: 1px;
    background: var(--pulse-color-control-thumb, #e1e6e9);
    transform: rotate(var(--rotation)) translateY(2px);
    transform-origin: 1px 12px;
  }

  input[type="range"] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    cursor: inherit;
    opacity: 0;
  }

  /* Short technical control labels use uppercase, per specification 11.3. */
  .label {
    max-width: 76px;
    overflow: hidden;
    color: var(--pulse-color-text-secondary, #bac2c8);
    letter-spacing: 0.06em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .numeric {
    width: 66px;
    min-height: var(--pulse-target-min, 24px);
    border: var(--pulse-border-thin, 1px) solid transparent;
    border-radius: var(--pulse-radius-control, 4px);
    color: var(--pulse-color-text-primary, #f3f5f6);
    background: transparent;
    font: var(--pulse-type-12, 12px) / var(--pulse-line-tight, 1.2) var(--pulse-font-mono, ui-monospace, monospace);
    text-align: center;
  }

  .numeric:hover,
  .numeric:focus-visible {
    border-color: var(--pulse-color-border-default, #6d7881);
    background: var(--pulse-color-surface-inset, #080a0c);
  }

  .control,
  .numeric {
    outline: var(--pulse-operational-outline, 0 solid transparent);
    outline-offset: -2px;
  }

  .unit {
    margin-inline-start: 2px;
    color: var(--pulse-color-text-muted, #919ba3);
  }

  :focus-visible {
    outline: var(--pulse-focus-width, 2px) solid var(--pulse-color-focus-inner, #fff);
    outline-offset: var(--pulse-focus-gap, 1px);
    box-shadow: 0 0 0 calc(var(--pulse-focus-width, 2px) * 2 + var(--pulse-focus-gap, 1px)) var(--pulse-color-focus-outer, #000);
  }
`;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function precisionFor(step: number): number {
  const decimal = step.toString().split(".")[1];
  return decimal === undefined ? 0 : Math.min(decimal.length, 6);
}

export abstract class PulseRangeControl extends HTMLElement {
  static readonly observedAttributes = [
    "control-id",
    "default-value",
    "disabled",
    "label",
    "max",
    "min",
    "step",
    "unit",
    "value",
  ];

  readonly #control: HTMLDivElement;
  readonly #labelElement: HTMLSpanElement;
  readonly #numeric: HTMLInputElement;
  readonly #range: HTMLInputElement;
  readonly #unitElement: HTMLSpanElement;
  #abortController: AbortController | undefined;
  #defaultValue = 0;
  #dragStartValue = 0;
  #dragStartY = 0;
  #maximum = 1;
  #minimum = 0;
  #keyboardBeforeValue = 0;
  #keyboardDirty = false;
  #keyboardKey: string | undefined;
  #pointerDirty = false;
  #pointerId: number | undefined;
  #step = 0.01;
  #value = 0;
  #wheelDirty = false;
  #wheelBeforeValue = 0;
  #wheelCommitTimer: number | undefined;

  constructor(extraStyle = "") {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>${RANGE_STYLE}${extraStyle}</style>
      <span class="label"></span>
      <div class="control">
        <div class="dial" aria-hidden="true"></div>
        <span class="marker" aria-hidden="true"></span>
        <input class="range" type="range">
      </div>
      <label class="value-row">
        <span class="sr-only"></span>
        <input class="numeric" type="number">
        <span class="unit" aria-hidden="true"></span>
      </label>
    `;
    this.#control = requiredElement(shadow, ".control", HTMLDivElement);
    this.#labelElement = requiredElement(shadow, ".label", HTMLSpanElement);
    this.#numeric = requiredElement(shadow, ".numeric", HTMLInputElement);
    this.#range = requiredElement(shadow, ".range", HTMLInputElement);
    this.#unitElement = requiredElement(shadow, ".unit", HTMLSpanElement);
  }

  get controlId(): string {
    return this.getAttribute("control-id") ?? this.id;
  }

  set controlId(value: string) {
    this.setAttribute("control-id", value);
  }

  get defaultValue(): number {
    return this.#defaultValue;
  }

  set defaultValue(value: number) {
    this.#defaultValue = clamp(value, this.#minimum, this.#maximum);
    this.setAttribute("default-value", String(value));
    this.#patch();
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value);
  }

  get label(): string {
    return this.getAttribute("label") ?? "Control";
  }

  set label(value: string) {
    this.setAttribute("label", value);
  }

  get max(): number {
    return this.#maximum;
  }

  set max(value: number) {
    this.setAttribute("max", String(value));
  }

  get min(): number {
    return this.#minimum;
  }

  set min(value: number) {
    this.setAttribute("min", String(value));
  }

  get step(): number {
    return this.#step;
  }

  set step(value: number) {
    this.setAttribute("step", String(value));
  }

  get unit(): string {
    return this.getAttribute("unit") ?? "";
  }

  set unit(value: string) {
    this.setAttribute("unit", value);
  }

  get value(): number {
    return this.#value;
  }

  set value(value: number) {
    this.#value = this.#normalize(value);
    this.setAttribute("value", String(this.#value));
    this.#patch();
  }

  connectedCallback(): void {
    this.#readAttributes();
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;

    this.#range.addEventListener(
      "input",
      () => {
        const changed = this.#setFromUser(this.#range.valueAsNumber, "keyboard", false);
        if (this.#keyboardKey !== undefined) {
          this.#keyboardDirty = changed || this.#keyboardDirty;
        }
      },
      { signal },
    );
    this.#range.addEventListener(
      "change",
      () => {
        if (this.#keyboardKey === undefined) {
          this.#emit("pulse-control-commit", "keyboard");
        }
      },
      { signal },
    );
    this.#range.addEventListener("keydown", (event) => this.#onKeyDown(event), { signal });
    this.#range.addEventListener("keyup", (event) => this.#onKeyUp(event), { signal });
    this.#range.addEventListener("blur", () => this.#finalizeKeyboard(), { signal });
    this.#numeric.addEventListener("change", () => this.#commitNumeric(), { signal });
    this.#numeric.addEventListener(
      "keydown",
      (event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          this.#numeric.value = this.#formatValue();
          this.#numeric.blur();
        }
      },
      { signal },
    );
    this.#control.addEventListener("pointerdown", (event) => this.#onPointerDown(event), {
      signal,
    });
    this.#control.addEventListener("pointermove", (event) => this.#onPointerMove(event), {
      signal,
    });
    this.#control.addEventListener("pointerup", (event) => this.#onPointerEnd(event), {
      signal,
    });
    this.#control.addEventListener("pointercancel", (event) => this.#onPointerEnd(event), {
      signal,
    });
    this.#control.addEventListener("dblclick", () => this.#reset(), { signal });
    this.addEventListener("wheel", (event) => this.#onWheel(event), { passive: false, signal });
    window.addEventListener("blur", () => this.#finalizeGestures(), { signal });
    this.#patch();
  }

  disconnectedCallback(): void {
    this.#finalizeGestures();
    this.#abortController?.abort();
    this.#abortController = undefined;
  }

  attributeChangedCallback(): void {
    if (this.isConnected) {
      this.#readAttributes();
      this.#patch();
    }
  }

  #commitNumeric(): void {
    if (!Number.isFinite(this.#numeric.valueAsNumber)) {
      this.#numeric.value = this.#formatValue();
      return;
    }
    this.#setFromUser(this.#numeric.valueAsNumber, "numeric", true);
  }

  #emit(type: "pulse-control-commit" | "pulse-control-input", source: PulseControlSource): void {
    const detail: PulseControlEventDetail<number> = {
      controlId: this.controlId,
      source,
      value: this.#value,
    };
    dispatchPulseEvent(this, type, detail);
  }

  #formatValue(): string {
    return this.#value.toFixed(precisionFor(this.#step));
  }

  #normalize(value: number): number {
    if (!Number.isFinite(value)) {
      return this.#minimum;
    }
    const steps = Math.round((clamp(value, this.#minimum, this.#maximum) - this.#minimum) / this.#step);
    return clamp(this.#minimum + steps * this.#step, this.#minimum, this.#maximum);
  }

  #onKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === "Escape") {
      if (this.#hasActiveGesture()) {
        event.preventDefault();
        this.#cancelGestures();
      }
      return;
    }
    if (!isRangeAdjustmentKey(event.key)) return;
    if (this.#keyboardKey === undefined) {
      this.#keyboardKey = event.key;
      this.#keyboardBeforeValue = this.#value;
      this.#keyboardDirty = false;
    }
    const largeStep = this.#step * 10;
    let next: number | undefined;
    if (event.key === "PageUp") next = this.#value + largeStep;
    if (event.key === "PageDown") next = this.#value - largeStep;
    if (event.key === "Home") next = this.#minimum;
    if (event.key === "End") next = this.#maximum;
    if (next !== undefined) {
      event.preventDefault();
      this.#keyboardDirty =
        this.#setFromUser(next, "keyboard", false) || this.#keyboardDirty;
    }
  }

  #onKeyUp(event: KeyboardEvent): void {
    if (!isRangeAdjustmentKey(event.key) || this.#keyboardKey === undefined) return;
    event.stopPropagation();
    this.#finalizeKeyboard();
  }

  #onPointerDown(event: PointerEvent): void {
    if (this.disabled || event.button !== 0 || this.#pointerId !== undefined) return;
    event.preventDefault();
    this.#dragStartY = event.clientY;
    this.#dragStartValue = this.#value;
    this.#pointerDirty = false;
    this.#pointerId = event.pointerId;
    this.#control.setPointerCapture(event.pointerId);
  }

  #onPointerEnd(event: PointerEvent): void {
    if (this.#pointerId !== event.pointerId) return;
    this.#finalizePointer();
  }

  #onPointerMove(event: PointerEvent): void {
    if (
      this.#pointerId !== event.pointerId ||
      !this.#control.hasPointerCapture(event.pointerId)
    ) return;
    const fine = event.shiftKey ? 0.1 : 1;
    const span = this.#maximum - this.#minimum;
    const delta = ((this.#dragStartY - event.clientY) / 160) * span * fine;
    this.#pointerDirty =
      this.#setFromUser(this.#dragStartValue + delta, "pointer", false) ||
      this.#pointerDirty;
  }

  #onWheel(event: WheelEvent): void {
    if (this.disabled || (!this.matches(":hover") && !this.matches(":focus-within"))) return;
    event.preventDefault();
    const wheelStep = event.shiftKey ? this.#step : this.#step * 10;
    const direction = event.deltaY < 0 ? 1 : -1;
    const before = this.#value;
    if (!this.#setFromUser(this.#value + direction * wheelStep, "wheel", false)) return;
    if (!this.#wheelDirty) this.#wheelBeforeValue = before;
    this.#wheelDirty = true;
    if (this.#wheelCommitTimer !== undefined) window.clearTimeout(this.#wheelCommitTimer);
    this.#wheelCommitTimer = window.setTimeout(() => {
      this.#finalizeWheel();
    }, 250);
  }

  #finalizeGestures(): void {
    this.#finalizePointer();
    this.#finalizeKeyboard();
    this.#finalizeWheel();
  }

  #hasActiveGesture(): boolean {
    return this.#pointerId !== undefined || this.#keyboardKey !== undefined || this.#wheelDirty;
  }

  #cancelGestures(): void {
    const restore = this.#pointerId !== undefined
      ? this.#dragStartValue
      : this.#keyboardKey !== undefined
        ? this.#keyboardBeforeValue
        : this.#wheelBeforeValue;
    const pointerId = this.#pointerId;
    this.#pointerId = undefined;
    if (pointerId !== undefined && this.#control.hasPointerCapture(pointerId)) {
      this.#control.releasePointerCapture(pointerId);
    }
    this.#pointerDirty = false;
    this.#keyboardKey = undefined;
    this.#keyboardDirty = false;
    if (this.#wheelCommitTimer !== undefined) window.clearTimeout(this.#wheelCommitTimer);
    this.#wheelCommitTimer = undefined;
    this.#wheelDirty = false;
    this.#setFromUser(restore, "keyboard", false);
  }

  #finalizePointer(): void {
    const pointerId = this.#pointerId;
    if (pointerId === undefined) return;
    this.#pointerId = undefined;
    if (this.#control.hasPointerCapture(pointerId)) {
      this.#control.releasePointerCapture(pointerId);
    }
    const shouldCommit = this.#pointerDirty;
    this.#pointerDirty = false;
    if (shouldCommit) this.#emit("pulse-control-commit", "pointer");
  }

  #finalizeKeyboard(): void {
    if (this.#keyboardKey === undefined) return;
    this.#keyboardKey = undefined;
    const shouldCommit = this.#keyboardDirty;
    this.#keyboardDirty = false;
    if (shouldCommit) this.#emit("pulse-control-commit", "keyboard");
  }

  #finalizeWheel(): void {
    if (this.#wheelCommitTimer !== undefined) {
      window.clearTimeout(this.#wheelCommitTimer);
      this.#wheelCommitTimer = undefined;
    }
    const shouldCommit = this.#wheelDirty;
    this.#wheelDirty = false;
    if (shouldCommit) this.#emit("pulse-control-commit", "wheel");
  }

  #patch(): void {
    const span = this.#maximum - this.#minimum;
    const ratio = span === 0 ? 0 : (this.#value - this.#minimum) / span;
    this.#control.style.setProperty("--angle", `${String(ratio * 270)}deg`);
    this.#control.style.setProperty("--rotation", `${String(ratio * 270 - 135)}deg`);
    this.#range.min = String(this.#minimum);
    this.#range.max = String(this.#maximum);
    this.#range.step = String(this.#step);
    this.#range.value = String(this.#value);
    this.#range.disabled = this.disabled;
    this.#range.setAttribute("aria-label", this.label);
    this.#range.title = `${this.label}: ${this.#formatValue()}${this.unit}`;
    this.#numeric.min = String(this.#minimum);
    this.#numeric.max = String(this.#maximum);
    this.#numeric.step = String(this.#step);
    this.#numeric.value = this.#formatValue();
    this.#numeric.disabled = this.disabled;
    this.#numeric.setAttribute("aria-label", `${this.label} value`);
    this.#labelElement.textContent = this.label;
    this.#unitElement.textContent = this.unit;
  }

  #readAttributes(): void {
    const minimum = Number(this.getAttribute("min") ?? 0);
    const maximum = Number(this.getAttribute("max") ?? 1);
    const step = Number(this.getAttribute("step") ?? 0.01);
    this.#minimum = Number.isFinite(minimum) ? minimum : 0;
    this.#maximum = Number.isFinite(maximum) && maximum > this.#minimum ? maximum : this.#minimum + 1;
    this.#step = Number.isFinite(step) && step > 0 ? step : 0.01;
    this.#defaultValue = this.#normalize(Number(this.getAttribute("default-value") ?? this.#minimum));
    this.#value = this.#normalize(Number(this.getAttribute("value") ?? this.#defaultValue));
  }

  #reset(): void {
    if (!this.disabled) this.#setFromUser(this.#defaultValue, "reset", true);
  }

  #setFromUser(
    value: number,
    source: PulseControlSource,
    commit: boolean,
  ): boolean {
    const next = this.#normalize(value);
    if (next === this.#value) return false;
    this.#value = next;
    this.setAttribute("value", String(next));
    this.#patch();
    this.#emit("pulse-control-input", source);
    if (commit) this.#emit("pulse-control-commit", source);
    return true;
  }
}

function isRangeAdjustmentKey(key: string): boolean {
  return [
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "End",
    "Home",
    "PageDown",
    "PageUp",
  ].includes(key);
}
