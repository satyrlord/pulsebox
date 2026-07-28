/**
 * Appearance preference ownership, per docs/THEMING.md section 9.
 *
 * Appearance is one global local-storage preference owned solely by the UI
 * layer. Projects never carry a theme, and a theme change never dispatches a
 * project command or enters undo history.
 */

import {
  isCanonicalUserTheme,
  type CanonicalUserTheme,
} from "./user-theme";
import {
  BUILT_IN_PALETTES,
  HIGH_CONTRAST_OVERLAY,
  isPulseThemeId,
  type PulseAppearanceSelection,
  type PulsePalette,
} from "./tokens";

export const APPEARANCE_STORAGE_KEY = "pulsebox.ui.appearance.v1";
export const APPEARANCE_ENVELOPE_VERSION = 1;
const MAX_ENVELOPE_BYTES = 16_384;

export interface PulseAppearance {
  readonly highContrast: boolean;
  readonly theme: PulseAppearanceSelection;
  readonly userTheme: CanonicalUserTheme | null;
}

export const DEFAULT_APPEARANCE: PulseAppearance = {
  highContrast: false,
  theme: "rack",
  userTheme: null,
};

interface AppearanceEnvelope {
  readonly highContrast: boolean;
  readonly theme: PulseAppearanceSelection;
  readonly userTheme: CanonicalUserTheme | null;
  readonly version: number;
}

/**
 * Parses a stored envelope. Anything missing, malformed, or internally
 * inconsistent resolves to `undefined` so the caller can fall back to `rack`
 * and report corrupt data once.
 */
export function parseAppearanceEnvelope(raw: string | null): PulseAppearance | undefined {
  if (raw === null) return undefined;
  if (new TextEncoder().encode(raw).length > MAX_ENVELOPE_BYTES) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const candidate = parsed as Partial<AppearanceEnvelope>;
  if (candidate.version !== APPEARANCE_ENVELOPE_VERSION) return undefined;
  if (typeof candidate.highContrast !== "boolean") return undefined;
  const theme = candidate.theme;
  if (typeof theme !== "string") return undefined;

  const userTheme = candidate.userTheme;
  if (userTheme !== null && !isCanonicalUserTheme(userTheme)) return undefined;
  const resolvedUserTheme: CanonicalUserTheme | null = userTheme ?? null;

  if (theme === "user") {
    // Selecting `user` without a valid installed theme is inconsistent.
    if (resolvedUserTheme === null) return undefined;
    return { highContrast: candidate.highContrast, theme: "user", userTheme: resolvedUserTheme };
  }
  if (!isPulseThemeId(theme)) return undefined;
  return { highContrast: candidate.highContrast, theme, userTheme: resolvedUserTheme };
}

export function serializeAppearance(appearance: PulseAppearance): string {
  const envelope: AppearanceEnvelope = {
    version: APPEARANCE_ENVELOPE_VERSION,
    theme: appearance.theme,
    highContrast: appearance.highContrast,
    userTheme: appearance.userTheme,
  };
  return JSON.stringify(envelope);
}

/** Resolves the palette actually shown for an appearance selection. */
export function resolvePalette(appearance: PulseAppearance): PulsePalette {
  const base = appearance.theme === "user" && appearance.userTheme !== null
    ? appearance.userTheme.tokens
    : BUILT_IN_PALETTES[appearance.theme === "user" ? "rack" : appearance.theme];
  return appearance.highContrast ? { ...base, ...HIGH_CONTRAST_OVERLAY } : base;
}
