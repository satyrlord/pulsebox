import { defineElement } from "../define-element";

export class PulseTransportBar extends HTMLElement {
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
          height: clamp(64px, 6.5vh, 70px);
          min-height: 64px;
          color: var(--pulse-color-text-primary, #f3f5f6);
        }
        header {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
          height: 100%;
          align-items: center;
          gap: var(--pulse-space-3, 12px);
          border-block-end: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          padding-inline: var(--pulse-space-3, 12px);
          background: var(--pulse-color-surface-panel, #15191d);
          box-shadow:
            inset 0 1px 0 0 #ffffff14,
            var(--pulse-shadow-panel, 0 4px 12px #0009);
        }
        .side {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: var(--pulse-space-2, 8px);
        }
        .right {
          justify-content: flex-end;
        }
        .mark {
          color: var(--pulse-color-text-primary, #f3f5f6);
          font: var(--pulse-weight-strong, 650) var(--pulse-type-16, 16px) / 1 var(--pulse-font-ui, system-ui, sans-serif);
          letter-spacing: 0.18em;
          white-space: nowrap;
        }
        ::slotted(*) {
          flex: 0 0 auto;
        }
        @media (max-width: 1439px) {
          header {
            grid-template-columns: minmax(160px, 1fr) auto minmax(160px, 1fr);
            gap: var(--pulse-space-2, 8px);
            padding-inline: var(--pulse-space-2, 8px);
          }
        }
      </style>
      <header aria-label="Transport">
        <div class="side"><slot name="project"></slot><slot name="transport"></slot></div>
        <div class="mark" aria-label="PULSEBOX">PULSEBOX</div>
        <div class="side right"><slot name="position"></slot><slot name="master"></slot></div>
      </header>
    `;
  }
}

defineElement("pulse-transport-bar", PulseTransportBar);
