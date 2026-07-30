import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { importUserTheme, type PulseThemeService, type UserThemeReport } from "../../../themes";
import { useAppStore } from "../store/app-store-context";
import styles from "./SettingsPage.module.css";

const STORAGE_FAILURE_MESSAGE =
  "The appearance preference was not changed because it could not be saved. Try again.";

export interface SettingsPageProps {
  readonly themeService: PulseThemeService;
}

export function SettingsPage(props: SettingsPageProps) {
  const { themeService } = props;
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const panelRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [importReport, setImportReport] = useState<UserThemeReport | undefined>(undefined);
  const [appearanceMessage, setAppearanceMessage] = useState<string | undefined>(undefined);

  const appearance = useSyncExternalStore(
    (listener) => themeService.subscribe(listener),
    () => themeService.appearance,
  );

  // A change that the service could not persist keeps the current appearance,
  // so the page reports the failure instead of pretending the change applied.
  const applyOrReport = (changed: boolean) => {
    setAppearanceMessage(changed ? undefined : STORAGE_FAILURE_MESSAGE);
  };

  const onImportFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) return;
    void file.text().then(
      (source) => {
        const result = importUserTheme(source);
        setImportReport(result.report);
        if (result.theme !== undefined) applyOrReport(themeService.installUserTheme(result.theme));
      },
      () => {
        setAppearanceMessage("The theme file could not be read. Try again.");
      },
    );
  };

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

    const listeners = new AbortController();
    panel.addEventListener("keydown", onKeyDown, { signal: listeners.signal });
    return () => {
      listeners.abort();
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

      <fieldset className={styles.themes}>
        <legend>Theme</legend>
        <label className={styles.choice}>
          <input
            type="radio"
            name="theme"
            checked={appearance.theme === "rack"}
            onChange={() => {
              applyOrReport(themeService.setTheme("rack"));
            }}
          />
          <span>Rack</span>
        </label>
        {appearance.userTheme === null ? null : (
          <label className={styles.choice}>
            <input
              type="radio"
              name="theme"
              checked={appearance.theme === "user"}
              onChange={() => {
                applyOrReport(themeService.setTheme("user"));
              }}
            />
            <span>User theme: {appearance.userTheme.name}</span>
          </label>
        )}
      </fieldset>

      <label className={styles.contrast}>
        <input
          type="checkbox"
          checked={appearance.highContrast}
          onChange={(event) => {
            applyOrReport(themeService.setHighContrast(event.currentTarget.checked));
          }}
        />
        <span>High contrast</span>
      </label>

      <fieldset className={styles.userTheme}>
        <legend>User theme</legend>
        <label className={styles.importField}>
          <span>Import a user theme JSON file</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              onImportFile(event.currentTarget);
            }}
          />
        </label>
        <button
          type="button"
          className={styles.delete}
          disabled={appearance.userTheme === null}
          onClick={() => {
            setImportReport(undefined);
            applyOrReport(themeService.deleteUserTheme());
          }}
        >
          Delete user theme
        </button>
      </fieldset>

      <div className={styles.report} role="status" aria-live="polite">
        {appearanceMessage === undefined ? null : <p>{appearanceMessage}</p>}
        {importReport === undefined ? null : importReport.applied ? (
          <p>
            The theme {importReport.name} is installed and active.
            {importReport.ignoredTokens.length > 0
              ? ` Ignored unknown tokens: ${importReport.ignoredTokens.join(", ")}.`
              : null}
          </p>
        ) : (
          <>
            <p>The theme was rejected. The active theme did not change.</p>
            <ul className={styles.errors}>
              {importReport.errors.map((error) => (
                <li key={`${error.path} ${error.reason}`}>
                  {error.path}: {error.reason}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

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
