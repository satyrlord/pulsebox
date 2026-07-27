import { defineElement } from "../define-element";

export class PulseEditorWorkspace extends HTMLElement {
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
          min-height: 210px;
          height: clamp(210px, 28vh, 300px);
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
          overflow: hidden;
        }
        header {
          display: flex;
          min-height: 32px;
          align-items: center;
          justify-content: space-between;
          border-block-end: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          padding-inline: var(--pulse-space-2, 8px);
        }
        .content {
          min-width: 0;
          min-height: 0;
          overflow: auto;
          padding: var(--pulse-space-2, 8px);
          background: var(--pulse-color-surface-inset, #080a0c);
        }
      </style>
      <section aria-label="Editor workspace">
        <header><slot name="tabs"></slot><slot name="tools"></slot></header>
        <div class="content"><slot></slot></div>
      </section>
    `;
  }
}

defineElement("pulse-editor-workspace", PulseEditorWorkspace);
