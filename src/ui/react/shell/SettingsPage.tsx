import { useEffect, useRef, useSyncExternalStore } from "react";

import { PULSE_APPEARANCE_SELECTIONS, type PulseThemeService } from "../../../themes";
import { useAppStore } from "../store/app-store-context";
import styles from "./SettingsPage.module.css";

export interface SettingsPageProps {
  readonly themeService: PulseThemeService;
}

const THEME_DIRECTIONS: Readonly<Record<string, string>> = {
  rack: "Studio hardware, graphite and steel",
  mono: "Near-black, minimal, high contrast",
  cosmic: "Deep blue, restrained luminous detail",
  analog: "Warm silver and tactile metal",
  rust: "Industrial, angular, weathered",
};

export function SettingsPage(props: SettingsPageProps) {
  const { themeService } = props;
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const panelRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const appearance = useSyncExternalStore(
    (listener) => themeService.subscribe(listener),
    () => themeService.appearance,
  );

  // Focus moves into the dialog and returns to whatever opened it, so keyboard
  // position is never lost.
  useEffect(() => {
    const opener = document.activeElement;
    headingRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // `aria-modal` tells assistive technology the rest of the app is hidden, so
  // Tab must not be able to walk out into it. Wrapping at both ends keeps the
  // claim and the keyboard behaviour consistent.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null || element === document.activeElement);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;

      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === headingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      data-component="settings-page"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <h2 ref={headingRef} tabIndex={-1} className={styles.heading} id="appearance-heading">
        Appearance
      </h2>

      <div className={styles.themes} role="radiogroup" aria-label="Theme">
        {PULSE_APPEARANCE_SELECTIONS.filter((id) => id !== "user").map((id) => (
          <label key={id} className={styles.theme}>
            <input
              type="radio"
              name="pulse-theme"
              value={id}
              checked={appearance.theme === id}
              onChange={() => {
                themeService.setTheme(id);
              }}
            />
            <span className={styles.themeName}>{id.charAt(0).toUpperCase() + id.slice(1)}</span>
            <span className={styles.themeDirection}>{THEME_DIRECTIONS[id]}</span>
          </label>
        ))}
      </div>

      <label className={styles.contrast}>
        <input
          type="checkbox"
          checked={appearance.highContrast}
          onChange={(event) => {
            themeService.setHighContrast(event.currentTarget.checked);
          }}
        />
        <span>High contrast</span>
      </label>

      <button
        type="button"
        className={styles.close}
        onClick={() => {
          setSettingsOpen(false);
        }}
      >
        Close
      </button>
    </section>
  );
}
