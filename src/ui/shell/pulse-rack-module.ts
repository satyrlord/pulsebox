import { defineElement } from "../define-element";
import { requiredElement } from "../required-element";

export class PulseRackModule extends HTMLElement {
  static readonly observedAttributes = ["disabled", "label", "selected", "short-label", "slot-number"];

  readonly #article: HTMLElement;
  readonly #labelElement: HTMLSpanElement;
  readonly #shortLabelElement: HTMLSpanElement;
  readonly #slotElement: HTMLSpanElement;
  #abortController: AbortController | undefined;

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
          --module-accent: var(--pulse-color-accent, #7ed9a3);
          --module-accent-muted: var(--pulse-color-border-default, #6d7881);
          --module-led: var(--pulse-color-control-fill, #b0f2ca);
          --module-control-ring: var(--pulse-color-control-fill, #b0f2ca);
        }
        /*
         * The faceplate is a raised plate held between two darker rack ears.
         * Depth comes from a one-pixel top highlight and a modest drop shadow,
         * not from gradients or texture art.
         */
        article {
          position: relative;
          display: grid;
          min-height: 86px;
          max-height: 98px;
          grid-template-columns: 76px minmax(148px, 12%) minmax(0, 1fr) minmax(220px, 38%);
          border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          border-inline-start: 3px solid var(--module-accent);
          border-radius: var(--pulse-radius-panel, 6px);
          color: var(--pulse-color-text-primary, #f3f5f6);
          background: var(--pulse-color-surface-control, #242a30);
          box-shadow:
            inset 0 1px 0 0 #ffffff14,
            inset 0 -1px 0 0 #00000059,
            var(--pulse-shadow-control, 0 1px 3px #0008);
          overflow: hidden;
        }
        /*
         * Selection is carried by a thicker boundary and an accent underline,
         * never by colour alone.
         */
        article[data-selected="true"] {
          border-color: var(--pulse-color-border-strong, #aab4bc);
          box-shadow:
            inset 0 -2px 0 var(--module-accent),
            inset 0 1px 0 0 #ffffff1f,
            var(--pulse-shadow-control, 0 1px 3px #0008);
        }
        /*
         * An empty bay is a recessed opening in the rack, not a raised plate.
         * It loses the highlight and drops back to the enclosure surface.
         */
        :host([disabled]) article {
          color: var(--pulse-color-text-muted, #919ba3);
          border-style: dashed;
          border-inline-start-color: var(--pulse-color-disabled, #7b858d);
          background: var(--pulse-color-surface-panel, #15191d);
          box-shadow: inset 0 2px 6px 0 #00000073;
        }
        /* An empty bay has no faceplate or sequencer, so it shows no wells. */
        :host([disabled]) .identity,
        :host([disabled]) .actions {
          border-inline-end: none;
          background: none;
          box-shadow: none;
        }
        :host([disabled]) .pattern {
          border-inline-start: none;
          background: none;
          box-shadow: none;
        }
        /* Darker inset bay carrying the slot number and module identity. */
        .identity {
          display: grid;
          min-width: 0;
          align-content: center;
          justify-items: center;
          border-inline-end: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          padding: var(--pulse-space-1, 4px);
          background: var(--pulse-color-surface-panel, #15191d);
          box-shadow: inset -1px 0 0 0 #00000059;
          overflow: hidden;
        }
        .slot {
          color: var(--pulse-color-text-muted, #919ba3);
          font: var(--pulse-type-10, 10px) / 1 var(--pulse-font-mono, ui-monospace, monospace);
          letter-spacing: 0.08em;
        }
        .short-label {
          color: var(--module-accent);
          font-size: var(--pulse-type-16, 16px);
          font-weight: var(--pulse-weight-strong, 650);
          letter-spacing: 0.1em;
        }
        .full-label {
          max-width: 58px;
          overflow: hidden;
          color: var(--pulse-color-text-secondary, #bac2c8);
          font-size: var(--pulse-type-10, 10px);
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .faceplate,
        .actions,
        .pattern {
          display: flex;
          min-width: 0;
          align-items: center;
          overflow: hidden;
          padding: var(--pulse-space-1, 4px) var(--pulse-space-2, 8px);
        }
        /*
         * Module actions wrap rather than clip. Hiding overflow here would cut
         * operable controls off at the narrowest supported width.
         */
        .actions {
          justify-content: center;
          border-inline-end: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          padding-inline: var(--pulse-space-1, 4px);
          overflow: visible;
        }
        /* Recessed sequencer well, per specification 11.1. */
        .pattern {
          border-inline-start: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          background: var(--pulse-color-surface-inset, #080a0c);
          box-shadow: inset 1px 0 0 0 #00000059, inset 0 1px 3px 0 #00000073;
          overflow-x: auto;
        }
      </style>
      <article>
        <header class="identity">
          <span class="slot"></span>
          <span class="short-label"></span>
          <span class="full-label"></span>
        </header>
        <div class="actions"><slot name="actions"></slot></div>
        <div class="faceplate"><slot></slot></div>
        <div class="pattern"><slot name="pattern"></slot></div>
      </article>
    `;
    this.#article = requiredElement(shadow, "article", HTMLElement);
    this.#labelElement = requiredElement(shadow, ".full-label", HTMLSpanElement);
    this.#shortLabelElement = requiredElement(shadow, ".short-label", HTMLSpanElement);
    this.#slotElement = requiredElement(shadow, ".slot", HTMLSpanElement);
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value);
  }

  get label(): string {
    return this.getAttribute("label") ?? "Empty";
  }

  set label(value: string) {
    this.setAttribute("label", value);
  }

  get selected(): boolean {
    return this.hasAttribute("selected");
  }

  set selected(value: boolean) {
    this.toggleAttribute("selected", value);
  }

  get shortLabel(): string {
    return this.getAttribute("short-label") ?? "";
  }

  set shortLabel(value: string) {
    this.setAttribute("short-label", value);
  }

  get slotNumber(): number {
    return Number(this.getAttribute("slot-number") ?? 1);
  }

  set slotNumber(value: number) {
    this.setAttribute("slot-number", String(value));
  }

  connectedCallback(): void {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;
    for (const slot of this.shadowRoot?.querySelectorAll("slot") ?? []) {
      slot.addEventListener("slotchange", () => this.#patch(), { signal });
    }
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
    const slot = String(Math.max(1, this.slotNumber)).padStart(2, "0");
    this.#article.dataset.selected = String(this.selected);
    this.#article.setAttribute("aria-label", `Rack slot ${slot}: ${this.label}`);
    if (this.disabled && !this.#hasEnabledControl()) {
      this.#article.setAttribute("aria-disabled", "true");
    } else {
      this.#article.removeAttribute("aria-disabled");
    }
    this.#labelElement.textContent = this.label;
    this.#shortLabelElement.textContent = this.shortLabel;
    this.#slotElement.textContent = slot;
  }

  #hasEnabledControl(): boolean {
    return this.querySelector(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
    ) !== null;
  }
}

defineElement("pulse-rack-module", PulseRackModule);
