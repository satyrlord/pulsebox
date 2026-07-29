/**
 * Token vocabulary and built-in palette data for the theming contract in
 * docs/THEMING.md. This module is data only: it holds no DOM handle and runs in
 * both the browser and the unit-test environment.
 */

export const PULSE_THEME_IDS = ["rack"] as const;

export type PulseThemeId = (typeof PULSE_THEME_IDS)[number];

/** Theme IDs plus the installed-user-theme selector, per THEMING.md section 9. */
export type PulseAppearanceSelection = PulseThemeId | "user";

/**
 * Required palette tokens. THEMING.md section 3.1 makes this exact list the
 * complete required user-theme allowlist, so order and membership are contract.
 */
export const REQUIRED_PALETTE_TOKENS = [
  "--pulse-color-app",
  "--pulse-color-surface-panel",
  "--pulse-color-surface-control",
  "--pulse-color-surface-inset",
  "--pulse-color-text-primary",
  "--pulse-color-text-secondary",
  "--pulse-color-border-default",
  "--pulse-color-border-strong",
  "--pulse-color-accent",
  "--pulse-color-on-accent",
  "--pulse-color-focus-inner",
  "--pulse-color-focus-outer",
  "--pulse-color-control-track",
  "--pulse-color-control-fill",
  "--pulse-color-meter-low",
  "--pulse-color-meter-mid",
  "--pulse-color-meter-high",
  "--pulse-color-status-danger",
  "--pulse-color-status-warning",
  "--pulse-color-status-success",
] as const;

export type RequiredPaletteToken = (typeof REQUIRED_PALETTE_TOKENS)[number];

/** Optional palette tokens. Omitted values resolve from `rack`. */
export const OPTIONAL_PALETTE_TOKENS = [
  "--pulse-color-overlay",
  "--pulse-color-text-muted",
  "--pulse-color-selection",
  "--pulse-color-control-thumb",
  "--pulse-color-meter-track",
  "--pulse-color-status-info",
  "--pulse-color-disabled",
  "--pulse-color-scrollbar-track",
  "--pulse-color-scrollbar-thumb",
  "--pulse-shadow-control",
  "--pulse-shadow-panel",
] as const;

export type OptionalPaletteToken = (typeof OPTIONAL_PALETTE_TOKENS)[number];

export type PaletteToken = OptionalPaletteToken | RequiredPaletteToken;

/** Shadow tokens use the section 8.5 grammar; every other token is a color. */
export const SHADOW_TOKENS: readonly PaletteToken[] = [
  "--pulse-shadow-control",
  "--pulse-shadow-panel",
];

export type PulsePalette = Readonly<Record<PaletteToken, string>>;

const RACK_PALETTE: PulsePalette = {
  "--pulse-color-app": "#0B0D0F",
  "--pulse-color-surface-panel": "#15191D",
  "--pulse-color-surface-control": "#242A30",
  "--pulse-color-surface-inset": "#080A0C",
  "--pulse-color-text-primary": "#F3F5F6",
  "--pulse-color-text-secondary": "#BAC2C8",
  "--pulse-color-border-default": "#6D7881",
  "--pulse-color-border-strong": "#AAB4BC",
  "--pulse-color-accent": "#7ED9A3",
  "--pulse-color-on-accent": "#07110B",
  "--pulse-color-focus-inner": "#FFFFFF",
  "--pulse-color-focus-outer": "#000000",
  "--pulse-color-control-track": "#6F7B84",
  "--pulse-color-control-fill": "#B0F2CA",
  "--pulse-color-meter-low": "#62D28A",
  "--pulse-color-meter-mid": "#F2C14E",
  "--pulse-color-meter-high": "#FF7667",
  "--pulse-color-status-danger": "#FF8178",
  "--pulse-color-status-warning": "#F2C14E",
  "--pulse-color-status-success": "#62D28A",
  "--pulse-color-overlay": "#101317",
  "--pulse-color-text-muted": "#919BA3",
  "--pulse-color-selection": "#244D38",
  "--pulse-color-control-thumb": "#E1E6E9",
  "--pulse-color-meter-track": "#20262B",
  "--pulse-color-status-info": "#6BB8FF",
  "--pulse-color-disabled": "#7B858D",
  "--pulse-color-scrollbar-track": "#111519",
  "--pulse-color-scrollbar-thumb": "#6D7881",
  "--pulse-shadow-control": "0px 1px 3px 0px #00000080",
  "--pulse-shadow-panel": "0px 4px 12px 0px #00000099",
};

export const BUILT_IN_PALETTES: Readonly<Record<PulseThemeId, PulsePalette>> = {
  rack: RACK_PALETTE,
};

/**
 * High contrast is an overlay applied after import validation, not a separate
 * theme. It replaces every palette token listed in THEMING.md section 5.
 */
export const HIGH_CONTRAST_OVERLAY: PulsePalette = {
  "--pulse-color-app": "#000000",
  "--pulse-color-surface-panel": "#000000",
  "--pulse-color-surface-control": "#111111",
  "--pulse-color-surface-inset": "#000000",
  "--pulse-color-overlay": "#000000",
  "--pulse-color-text-primary": "#FFFFFF",
  "--pulse-color-text-secondary": "#FFFFFF",
  "--pulse-color-text-muted": "#D6D6D6",
  "--pulse-color-selection": "#005A66",
  "--pulse-color-border-default": "#FFFFFF",
  "--pulse-color-border-strong": "#FFFFFF",
  "--pulse-color-accent": "#00E5FF",
  "--pulse-color-on-accent": "#000000",
  "--pulse-color-focus-inner": "#FFFF00",
  "--pulse-color-focus-outer": "#000000",
  "--pulse-color-control-track": "#6A6A6A",
  "--pulse-color-control-fill": "#00E5FF",
  "--pulse-color-control-thumb": "#FFFFFF",
  "--pulse-color-meter-track": "#262626",
  "--pulse-color-meter-low": "#00FF80",
  "--pulse-color-meter-mid": "#FFFF00",
  "--pulse-color-meter-high": "#FF5C5C",
  "--pulse-color-status-danger": "#FF6B6B",
  "--pulse-color-status-warning": "#FFFF00",
  "--pulse-color-status-success": "#00FF80",
  "--pulse-color-status-info": "#66CCFF",
  "--pulse-color-disabled": "#B8B8B8",
  "--pulse-color-scrollbar-track": "#000000",
  "--pulse-color-scrollbar-thumb": "#FFFFFF",
  "--pulse-shadow-control": "none",
  "--pulse-shadow-panel": "none",
};

export function isPulseThemeId(value: string): value is PulseThemeId {
  return PULSE_THEME_IDS.some((theme) => theme === value);
}

function isRequiredPaletteToken(value: string): value is RequiredPaletteToken {
  return REQUIRED_PALETTE_TOKENS.some((token) => token === value);
}

function isOptionalPaletteToken(value: string): value is OptionalPaletteToken {
  return OPTIONAL_PALETTE_TOKENS.some((token) => token === value);
}

export function isPaletteToken(value: string): value is PaletteToken {
  return isRequiredPaletteToken(value) || isOptionalPaletteToken(value);
}
