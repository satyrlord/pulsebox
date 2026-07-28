import {
  PULSE_THEME_IDS,
  type PulseAppearanceSelection,
  type PulseThemeService,
} from "../../themes";
import { defineElement } from "../define-element";

/**
 * The Settings page, per spec-001 section 11.4.
 *
 * Theme and high-contrast selection appear here and nowhere else; the
 * application header never contains a theme selector. Appearance is a global UI
 * preference, so every control on this page writes through the theme service
 * and never reaches the project store or undo history.
 */

interface ThemeOption {
  readonly id: PulseAppearanceSelection;
  readonly label: string;
  readonly direction: string;
}

/** Visible labels and directions are the exact section 11.4 table. */
const THEME_OPTIONS: readonly ThemeOption[] = Object.freeze([
  { id: "rack", label: "Rack", direction: "Studio hardware, graphite and steel" },
  { id: "mono", label: "Mono", direction: "Near-black, minimal, high contrast" },
  { id: "cosmic", label: "Cosmic", direction: "Deep blue, restrained luminous detail" },
  { id: "analog", label: "Analog", direction: "Warm silver and tactile metal" },
  { id: "rust", label: "Rust", direction: "Industrial, angular, weathered" },
]);

export class PulseSettingsPage extends HTMLElement {
  #service: PulseThemeService | undefined;
  #unsubscribe: (() => void) | undefined;

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
          color: var(--pulse-color-text-primary, #f3f5f6);
          font-family: var(--pulse-font-ui, system-ui, sans-serif);
        }
        section {
          border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          border-radius: var(--pulse-radius-panel, 6px);
          background: var(--pulse-color-surface-panel, #15191d);
          padding: var(--pulse-space-3, 12px);
        }
        h2 {
          margin: 0 0 var(--pulse-space-1, 4px);
          font-size: var(--pulse-type-16, 16px);
          font-weight: var(--pulse-weight-strong, 650);
          line-height: var(--pulse-line-tight, 1.2);
        }
        .hint {
          margin: 0 0 var(--pulse-space-3, 12px);
          color: var(--pulse-color-text-secondary, #bac2c8);
          font-size: var(--pulse-type-12, 12px);
          line-height: var(--pulse-line-normal, 1.4);
        }
        fieldset {
          margin: 0 0 var(--pulse-space-4, 16px);
          border: 0;
          padding: 0;
        }
        legend {
          padding: 0;
          font-size: var(--pulse-type-12, 12px);
          font-weight: var(--pulse-weight-medium, 500);
          color: var(--pulse-color-text-secondary, #bac2c8);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .themes {
          display: grid;
          gap: var(--pulse-space-2, 8px);
          margin-block-start: var(--pulse-space-2, 8px);
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .theme {
          display: flex;
          gap: var(--pulse-space-2, 8px);
          align-items: flex-start;
          min-height: var(--pulse-target-min, 24px);
          border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          border-radius: var(--pulse-radius-control, 4px);
          padding: var(--pulse-space-2, 8px);
          background: var(--pulse-color-surface-control, #242a30);
          cursor: pointer;
        }
        /* Selection carries a border weight change and a check mark, never
           color alone. High contrast keeps both cues.

           The state comes from an attribute the component sets rather than from
           a :has() selector alone, so the non-color cue cannot depend on
           selector support. */
        .theme[data-selected="true"] {
          border-color: var(--pulse-color-accent, #7ed9a3);
          border-width: var(--pulse-border-strong, 2px);
          outline: var(--pulse-operational-outline, 0 solid transparent);
        }
        .theme-name {
          display: flex;
          gap: var(--pulse-space-1, 4px);
          align-items: center;
          font-size: var(--pulse-type-14, 14px);
          font-weight: var(--pulse-weight-medium, 500);
          line-height: var(--pulse-line-tight, 1.2);
        }
        .check {
          width: 12px;
          height: 12px;
          flex: none;
          color: var(--pulse-color-accent, #7ed9a3);
          visibility: hidden;
        }
        .theme[data-selected="true"] .check {
          visibility: visible;
        }
        .theme-direction {
          margin-block-start: 2px;
          color: var(--pulse-color-text-secondary, #bac2c8);
          font-size: var(--pulse-type-12, 12px);
          line-height: var(--pulse-line-normal, 1.4);
        }
        .contrast {
          display: flex;
          gap: var(--pulse-space-2, 8px);
          align-items: center;
          min-height: var(--pulse-target-min, 24px);
          margin-block-start: var(--pulse-space-2, 8px);
          font-size: var(--pulse-type-14, 14px);
        }
        input[type="radio"],
        input[type="checkbox"] {
          width: 16px;
          height: 16px;
          flex: none;
          margin: 0;
          accent-color: var(--pulse-color-accent, #7ed9a3);
        }
        /* The 24 pixel target is met by the surrounding label, so the visible
           control art stays compact without shrinking the hit area. */
        label {
          position: relative;
        }
        :host(:focus-within) .theme:has(input:focus-visible),
        .theme:has(input:focus-visible) {
          outline: var(--pulse-focus-width, 2px) solid var(--pulse-color-focus-inner, #ffffff);
          outline-offset: var(--pulse-focus-gap, 1px);
          box-shadow: 0 0 0 calc(var(--pulse-focus-width, 2px) + var(--pulse-focus-gap, 1px))
            var(--pulse-color-focus-outer, #000000);
        }
        input:focus-visible {
          outline: var(--pulse-focus-width, 2px) solid var(--pulse-color-focus-inner, #ffffff);
          outline-offset: var(--pulse-focus-gap, 1px);
        }
      </style>
      <!--
        The check mark is defined once and cloned per option. Parsing it as
        markup gives it the SVG namespace without naming a namespace URL, which
        the source policy reserves for real remote endpoints.
      -->
      <template id="check-template">
        <svg class="check" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M2 6.4 4.6 9 10 3.2" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </template>
      <section aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Appearance</h2>
        <p class="hint">
          Theme and high contrast are saved for this browser. They change appearance
          only, never a project or its sound.
        </p>
        <fieldset>
          <legend>Theme</legend>
          <div class="themes" role="radiogroup" aria-label="Theme"></div>
        </fieldset>
        <fieldset>
          <legend>Contrast</legend>
          <label class="contrast">
            <input type="checkbox" data-field="high-contrast">
            <span>High contrast</span>
          </label>
        </fieldset>
      </section>
    `;
  }

  /**
   * Binds the page to the appearance owner. The page holds no preference state
   * of its own: it renders from the service and re-renders on every change,
   * including one written by another tab.
   */
  connect(service: PulseThemeService): void {
    this.#service = service;
    this.#render();
    this.#unsubscribe?.();
    this.#unsubscribe = service.subscribe(() => this.#patch());
  }

  disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  #render(): void {
    const shadow = this.shadowRoot;
    const service = this.#service;
    if (shadow === null || service === undefined) return;
    const group = shadow.querySelector(".themes");
    if (!(group instanceof HTMLElement)) return;

    const checkTemplate = shadow.querySelector("#check-template");

    group.replaceChildren();
    for (const option of THEME_OPTIONS) {
      const label = document.createElement("label");
      label.className = "theme";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "pulse-theme";
      input.value = option.id;
      input.addEventListener("change", () => {
        if (input.checked) this.#selectTheme(option.id);
      });

      const name = document.createElement("span");
      name.className = "theme-name";
      // The check mark is the non-color selection cue required alongside the
      // accent border, so selection never rests on color alone.
      if (checkTemplate instanceof HTMLTemplateElement) {
        name.append(checkTemplate.content.cloneNode(true));
      }
      name.append(document.createTextNode(option.label));

      const direction = document.createElement("span");
      direction.className = "theme-direction";
      direction.textContent = option.direction;

      const text = document.createElement("span");
      text.append(name, direction);
      label.append(input, text);
      group.append(label);
    }

    const contrast = shadow.querySelector("[data-field='high-contrast']");
    if (contrast instanceof HTMLInputElement) {
      contrast.addEventListener("change", () => {
        this.#setHighContrast(contrast.checked);
      });
    }
    this.#patch();
  }

  /**
   * Mirrors the committed appearance. A rejected change leaves the service
   * unchanged, so re-reading it here restores the control that was clicked.
   */
  #patch(): void {
    const shadow = this.shadowRoot;
    const service = this.#service;
    if (shadow === null || service === undefined) return;
    const { highContrast, theme } = service.appearance;
    for (const input of shadow.querySelectorAll("input[name='pulse-theme']")) {
      if (!(input instanceof HTMLInputElement)) continue;
      const selected = input.value === theme;
      input.checked = selected;
      // The visible cue is driven from here, not from the checked state alone.
      input.closest(".theme")?.setAttribute("data-selected", String(selected));
    }
    const contrast = shadow.querySelector("[data-field='high-contrast']");
    if (contrast instanceof HTMLInputElement) contrast.checked = highContrast;
  }

  #selectTheme(theme: PulseAppearanceSelection): void {
    if (this.#service?.setTheme(theme) !== true) this.#patch();
  }

  #setHighContrast(highContrast: boolean): void {
    if (this.#service?.setHighContrast(highContrast) !== true) this.#patch();
  }
}

export { PULSE_THEME_IDS, THEME_OPTIONS };

defineElement("pulse-settings-page", PulseSettingsPage);
