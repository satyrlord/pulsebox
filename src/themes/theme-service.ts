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

export class PulseThemeService {
  readonly #host: ThemeHostPort;
  readonly #listeners = new Set<AppearanceChangeListener>();
  readonly #onCorruptPreference: (() => void) | undefined;
  readonly #onStorageFailure: ((message: string) => void) | undefined;
  readonly #storage: AppearanceStoragePort;
  #appearance: PulseAppearance = DEFAULT_APPEARANCE;
  #reportedCorruptPreference = false;

  constructor(options: ThemeServiceOptions) {
    this.#host = options.host;
    this.#onCorruptPreference = options.onCorruptPreference;
    this.#onStorageFailure = options.onStorageFailure;
    this.#storage = options.storage;
  }

  get appearance(): PulseAppearance {
    return this.#appearance;
  }

  /**
   * Reads the stored preference and paints the host. Missing or invalid data
   * resolves to `rack` with high contrast off and no user theme, and is
   * reported once per session without replacing the stored value.
   */
  start(): void {
    let stored: string | null;
    try {
      stored = this.#storage.getItem(APPEARANCE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    const parsed = parseAppearanceEnvelope(stored);
    if (parsed === undefined && stored !== null) this.#reportCorruptPreference();
    this.#appearance = parsed ?? DEFAULT_APPEARANCE;
    this.#paint();
  }

  subscribe(listener: AppearanceChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Commits a complete envelope, then updates the host. Appearance changes only
   * after `setItem` succeeds, so a storage failure leaves the current
   * appearance, stored preference, and focus unchanged.
   */
  setAppearance(next: PulseAppearance): boolean {
    try {
      this.#storage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearance(next));
    } catch {
      this.#onStorageFailure?.(
        "The appearance preference was not changed because it could not be saved. Try again.",
      );
      return false;
    }
    this.#appearance = next;
    this.#paint();
    for (const listener of this.#listeners) listener(next);
    return true;
  }

  setTheme(theme: PulseAppearance["theme"]): boolean {
    if (theme === "user" && this.#appearance.userTheme === null) return false;
    return this.setAppearance({ ...this.#appearance, theme });
  }

  setHighContrast(highContrast: boolean): boolean {
    return this.setAppearance({ ...this.#appearance, highContrast });
  }

  installUserTheme(userTheme: CanonicalUserTheme): boolean {
    return this.setAppearance({ ...this.#appearance, theme: "user", userTheme });
  }

  /**
   * Deleting the installed user theme while it is active commits `rack` with a
   * null user theme in one envelope, then applies `rack`.
   */
  deleteUserTheme(): boolean {
    return this.setAppearance({
      highContrast: this.#appearance.highContrast,
      theme: "rack",
      userTheme: null,
    });
  }

  /**
   * Applies a valid appearance envelope written by another tab as a UI-only
   * update. Invalid cross-tab data is ignored without changing appearance.
   */
  applyCrossTabValue(raw: string | null): boolean {
    const parsed = parseAppearanceEnvelope(raw);
    if (parsed === undefined) {
      if (raw !== null) this.#reportCorruptPreference();
      return false;
    }
    this.#appearance = parsed;
    this.#paint();
    for (const listener of this.#listeners) listener(parsed);
    return true;
  }

  #reportCorruptPreference(): void {
    if (this.#reportedCorruptPreference) return;
    this.#reportedCorruptPreference = true;
    this.#onCorruptPreference?.();
  }

  /**
   * Built-in themes and the high-contrast overlay are stylesheet rules keyed on
   * the host's `data-theme` and `data-high-contrast` state, so the service only
   * sets that state for them. Inline properties are written exclusively for an
   * imported user theme, which has no stylesheet rule of its own. Painting a
   * built-in palette inline would shadow the stylesheet and make every later
   * theme change a no-op.
   */
  #paint(): void {
    if (this.#appearance.theme === "user" && this.#appearance.userTheme !== null) {
      // The overlay is applied here too: a stylesheet rule cannot outrank the
      // inline user palette, so high contrast has to be resolved before paint.
      const palette = resolvePalette(this.#appearance);
      for (const token of ALL_TOKENS) this.#host.setToken(token, palette[token]);
    } else {
      for (const token of ALL_TOKENS) this.#host.clearToken(token);
    }
    this.#host.setState(this.#appearance.theme, this.#appearance.highContrast);
  }
}
