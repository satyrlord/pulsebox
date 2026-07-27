import { defineElement } from "../define-element";

export class PulseUnsupportedSize extends HTMLElement {
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
          place-items: center;
          padding: var(--pulse-space-6, 24px);
          color: var(--pulse-color-text-primary, #f3f5f6);
          background: var(--pulse-color-app, #0b0d0f);
        }
        section {
          width: min(560px, 100%);
          border: var(--pulse-border-strong, 2px) solid var(--pulse-color-border-strong, #aab4bc);
          border-radius: var(--pulse-radius-panel, 6px);
          padding: var(--pulse-space-6, 24px);
          background: var(--pulse-color-surface-panel, #15191d);
          box-shadow: var(--pulse-shadow-panel, 0 4px 12px #0009);
        }
        h1 {
          margin: 0 0 var(--pulse-space-2, 8px);
          font-size: var(--pulse-type-20, 20px);
        }
        p {
          margin: 0 0 var(--pulse-space-4, 16px);
          color: var(--pulse-color-text-secondary, #bac2c8);
          font-size: var(--pulse-type-14, 14px);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--pulse-space-2, 8px);
        }
      </style>
      <section role="region" aria-labelledby="pulse-size-heading">
        <h1 id="pulse-size-heading">More space is required</h1>
        <p>Pulsebox editing needs a viewport of at least 1280 by 720 CSS pixels. Enlarge the window to continue editing.</p>
        <div class="actions"><slot name="actions"></slot></div>
        <slot name="summary"></slot>
      </section>
    `;
  }
}

defineElement("pulse-unsupported-size", PulseUnsupportedSize);
