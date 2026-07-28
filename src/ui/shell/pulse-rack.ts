import { defineElement } from "../define-element";

export class PulseRack extends HTMLElement {
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
          min-height: 0;
          color: var(--pulse-color-text-primary, #f3f5f6);
        }
        section {
          display: grid;
          height: 100%;
          min-height: 0;
          grid-template-rows: auto 1fr;
          border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          border-radius: var(--pulse-radius-panel, 6px);
          background: var(--pulse-color-surface-panel, #15191d);
          box-shadow: var(--pulse-shadow-panel, 0 4px 12px #0009);
        }
        header {
          display: flex;
          min-height: 32px;
          align-items: center;
          justify-content: space-between;
          border-block-end: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          padding-inline: var(--pulse-space-2, 8px);
          color: var(--pulse-color-text-secondary, #bac2c8);
          font-size: var(--pulse-type-10, 10px);
          font-weight: var(--pulse-weight-strong, 650);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        /*
         * The rack interior is recessed so that raised module faceplates read
         * against it. This is the enclosure, not a card surface.
         */
        .modules {
          min-height: 0;
          background: var(--pulse-color-app, #0b0d0f);
          box-shadow: inset 0 2px 4px 0 #00000073;
          overflow: auto;
          padding: var(--pulse-space-2, 8px);
        }
        ::slotted(pulse-rack-module) {
          margin-block-end: var(--pulse-space-2, 8px);
        }
      </style>
      <section aria-label="Instrument rack">
        <header><slot name="heading">Rack</slot><slot name="actions"></slot></header>
        <div class="modules"><slot></slot></div>
      </section>
    `;
  }
}

defineElement("pulse-rack", PulseRack);
