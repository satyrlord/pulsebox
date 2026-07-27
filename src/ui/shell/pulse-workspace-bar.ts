import { defineElement } from "../define-element";

export class PulseWorkspaceBar extends HTMLElement {
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
          min-height: 40px;
          height: clamp(40px, 5vh, 46px);
          color: var(--pulse-color-text-primary, #f3f5f6);
        }
        nav {
          display: grid;
          height: 100%;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: var(--pulse-space-2, 8px);
          border-block-start: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          padding-inline: var(--pulse-space-3, 12px);
          background: var(--pulse-color-surface-panel, #15191d);
        }
        .group {
          display: flex;
          align-items: center;
          gap: var(--pulse-space-1, 4px);
        }
        .center {
          justify-content: center;
        }
        .right {
          justify-content: flex-end;
        }
      </style>
      <nav aria-label="Workspace">
        <div class="group"><slot name="modes"></slot></div>
        <div class="group center"><slot name="editors"></slot></div>
        <div class="group right"><slot name="actions"></slot></div>
      </nav>
    `;
  }
}

defineElement("pulse-workspace-bar", PulseWorkspaceBar);
