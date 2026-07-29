/**
 * The central theme service, per docs/THEMING.md sections 6 and 9.
 *
 * This is the only writer of palette custom properties onto the theme host.
 * Applying a theme is one UI patch: it dispatches no project command, touches
 * no engine state, and never enters undo history.
 */

import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearanceEnvelope,
  resolvePalette,
  serializeAppearance,
  type PulseAppearance,
} from "./appearance";
import { OPTIONAL_PALETTE_TOKENS, REQUIRED_PALETTE_TOKENS, type PaletteToken } from "./tokens";
import type { CanonicalUserTheme } from "./user-theme";

const ALL_TOKENS: readonly PaletteToken[] = [
  ...REQUIRED_PALETTE_TOKENS,
  ...OPTIONAL_PALETTE_TOKENS,
];

export interface AppearanceStoragePort {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

/**
 * The surface the service needs from the theme host. Keeping this a port rather
 * than an `HTMLElement` lets the preference and palette logic be tested without
 * a DOM, and keeps the single writer rule explicit.
 */
export interface ThemeHostPort {
  readonly clearToken: (token: string) => void;
  readonly setState: (theme: string, highContrast: boolean) => void;
  readonly setToken: (token: string, value: string) => void;
}

export function elementThemeHost(element: HTMLElement): ThemeHostPort {
  return {
    clearToken: (token) => {
      element.style.removeProperty(token);
    },
    setState: (theme, highContrast) => {
      element.dataset.theme = theme;
      element.dataset.highContrast = String(highContrast);
    },
    setToken: (token, value) => {
      element.style.setProperty(token, value);
    },
  };
}

export type AppearanceChangeListener = (appearance: PulseAppearance) => void;

export interface ThemeServiceOptions {
  readonly host: ThemeHostPort;
  /** Reports corrupt stored preference data once per session. */
  readonly onCorruptPreference?: (() => void) | undefined;
  /** Reports that a preference could not be persisted, so it was not applied. */
  readonly onStorageFailure?: ((message: string) => void) | undefined;
  readonly storage: AppearanceStoragePort;
}

export interface PulseThemeService {
  readonly appearance: PulseAppearance;
  readonly applyCrossTabValue: (raw: string | null) => boolean;
  readonly deleteUserTheme: () => boolean;
  readonly installUserTheme: (userTheme: CanonicalUserTheme) => boolean;
  readonly setAppearance: (next: PulseAppearance) => boolean;
  readonly setHighContrast: (highContrast: boolean) => boolean;
  readonly setTheme: (theme: PulseAppearance["theme"]) => boolean;
  readonly start: () => void;
  readonly subscribe: (listener: AppearanceChangeListener) => () => void;
}

export function createPulseThemeService(options: ThemeServiceOptions): PulseThemeService {
  const listeners = new Set<AppearanceChangeListener>();
  let appearance: PulseAppearance = DEFAULT_APPEARANCE;
  let reportedCorruptPreference = false;

  function reportCorruptPreference(): void {
    if (reportedCorruptPreference) return;
    reportedCorruptPreference = true;
    options.onCorruptPreference?.();
  }

  /**
   * Built-in themes and the high-contrast overlay are stylesheet rules keyed on
   * the host's `data-theme` and `data-high-contrast` state, so the service only
   * sets that state for them. Inline properties are written exclusively for an
   * imported user theme, which has no stylesheet rule of its own. Painting a
   * built-in palette inline would shadow the stylesheet and make every later
   * theme change a no-op.
   */
  function paint(): void {
    if (appearance.theme === "user" && appearance.userTheme !== null) {
      // The overlay is applied here too: a stylesheet rule cannot outrank the
      // inline user palette, so high contrast has to be resolved before paint.
      const palette = resolvePalette(appearance);
      for (const token of ALL_TOKENS) options.host.setToken(token, palette[token]);
    } else {
      for (const token of ALL_TOKENS) options.host.clearToken(token);
    }
    options.host.setState(appearance.theme, appearance.highContrast);
  }

  /**
   * Commits a complete envelope, then updates the host. Appearance changes only
   * after `setItem` succeeds, so a storage failure leaves the current
   * appearance, stored preference, and focus unchanged.
   */
  function setAppearance(next: PulseAppearance): boolean {
    try {
      options.storage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearance(next));
    } catch {
      options.onStorageFailure?.(
        "The appearance preference was not changed because it could not be saved. Try again.",
      );
      return false;
    }
    appearance = next;
    paint();
    for (const listener of listeners) listener(next);
    return true;
  }

  return {
    get appearance() {
      return appearance;
    },
    /**
     * Reads the stored preference and paints the host. Missing or invalid data
     * resolves to `rack` with high contrast off and no user theme, and is
     * reported once per session without replacing the stored value.
     */
    start() {
      let stored: string | null;
      try {
        stored = options.storage.getItem(APPEARANCE_STORAGE_KEY);
      } catch {
        stored = null;
      }
      const parsed = parseAppearanceEnvelope(stored);
      if (parsed === undefined && stored !== null) reportCorruptPreference();
      appearance = parsed ?? DEFAULT_APPEARANCE;
      paint();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAppearance,
    setTheme(theme) {
      if (theme === "user" && appearance.userTheme === null) return false;
      return setAppearance({ ...appearance, theme });
    },
    setHighContrast(highContrast) {
      return setAppearance({ ...appearance, highContrast });
    },
    installUserTheme(userTheme) {
      return setAppearance({ ...appearance, theme: "user", userTheme });
    },
    /**
     * Deleting the installed user theme while it is active commits `rack` with
     * a null user theme in one envelope, then applies `rack`.
     */
    deleteUserTheme() {
      return setAppearance({
        highContrast: appearance.highContrast,
        theme: "rack",
        userTheme: null,
      });
    },
    /**
     * Applies a valid appearance envelope written by another tab as a UI-only
     * update. Invalid cross-tab data is ignored without changing appearance.
     */
    applyCrossTabValue(raw) {
      const parsed = parseAppearanceEnvelope(raw);
      if (parsed === undefined) {
        if (raw !== null) reportCorruptPreference();
        return false;
      }
      appearance = parsed;
      paint();
      for (const listener of listeners) listener(parsed);
      return true;
    },
  };
}
