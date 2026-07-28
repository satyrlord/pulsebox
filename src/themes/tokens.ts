/**
 * Token vocabulary and built-in palette data for the theming contract in
 * docs/THEMING.md. This module is data only: it holds no DOM handle and runs in
 * both the browser and the unit-test environment.
 */

export const PULSE_THEME_IDS = ["rack", "mono", "cosmic", "analog", "rust"] as const;

export type PulseThemeId = (typeof PULSE_THEME_IDS)[number];

/** Theme IDs plus the installed-user-theme selector, per THEMING.md section 9. */
export const PULSE_APPEARANCE_SELECTIONS = [...PULSE_THEME_IDS, "user"] as const;

export type PulseAppearanceSelection = (typeof PULSE_APPEARANCE_SELECTIONS)[number];

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

const MONO_PALETTE: PulsePalette = {
  "--pulse-color-app": "#050505",
  "--pulse-color-surface-panel": "#111111",
  "--pulse-color-surface-control": "#202020",
  "--pulse-color-surface-inset": "#000000",
  "--pulse-color-text-primary": "#FFFFFF",
  "--pulse-color-text-secondary": "#C8C8C8",
  "--pulse-color-border-default": "#777777",
  "--pulse-color-border-strong": "#B8B8B8",
  "--pulse-color-accent": "#E6E6E6",
  "--pulse-color-on-accent": "#080808",
  "--pulse-color-focus-inner": "#FFFFFF",
  "--pulse-color-focus-outer": "#000000",
  "--pulse-color-control-track": "#6A6A6A",
  "--pulse-color-control-fill": "#FFFFFF",
  "--pulse-color-meter-low": "#D4D4D4",
  "--pulse-color-meter-mid": "#FFFFFF",
  "--pulse-color-meter-high": "#FFFFFF",
  "--pulse-color-status-danger": "#FFFFFF",
  "--pulse-color-status-warning": "#E8E8E8",
  "--pulse-color-status-success": "#D4D4D4",
  "--pulse-color-overlay": "#0B0B0B",
  "--pulse-color-text-muted": "#999999",
  "--pulse-color-selection": "#393939",
  "--pulse-color-control-thumb": "#F2F2F2",
  "--pulse-color-meter-track": "#292929",
  "--pulse-color-status-info": "#D6D6D6",
  "--pulse-color-disabled": "#858585",
  "--pulse-color-scrollbar-track": "#0C0C0C",
  "--pulse-color-scrollbar-thumb": "#777777",
  "--pulse-shadow-control": "none",
  "--pulse-shadow-panel": "none",
};

const COSMIC_PALETTE: PulsePalette = {
  "--pulse-color-app": "#070A18",
  "--pulse-color-surface-panel": "#11162A",
  "--pulse-color-surface-control": "#1D2642",
  "--pulse-color-surface-inset": "#050817",
  "--pulse-color-text-primary": "#F3F5FF",
  "--pulse-color-text-secondary": "#BCC6E8",
  "--pulse-color-border-default": "#64729D",
  "--pulse-color-border-strong": "#98A9D8",
  "--pulse-color-accent": "#66C7FF",
  "--pulse-color-on-accent": "#03101A",
  "--pulse-color-focus-inner": "#FFFFFF",
  "--pulse-color-focus-outer": "#000000",
  "--pulse-color-control-track": "#6A799F",
  "--pulse-color-control-fill": "#A8E9FF",
  "--pulse-color-meter-low": "#61D8B0",
  "--pulse-color-meter-mid": "#F2C85E",
  "--pulse-color-meter-high": "#FF7183",
  "--pulse-color-status-danger": "#FF8292",
  "--pulse-color-status-warning": "#F2C85E",
  "--pulse-color-status-success": "#61D8B0",
  "--pulse-color-overlay": "#0C1124",
  "--pulse-color-text-muted": "#929EC2",
  "--pulse-color-selection": "#173F61",
  "--pulse-color-control-thumb": "#DDE5FF",
  "--pulse-color-meter-track": "#202945",
  "--pulse-color-status-info": "#73B8FF",
  "--pulse-color-disabled": "#7F8CAF",
  "--pulse-color-scrollbar-track": "#0D1327",
  "--pulse-color-scrollbar-thumb": "#64729D",
  "--pulse-shadow-control": "0px 1px 4px 0px #00000099",
  "--pulse-shadow-panel": "0px 4px 14px 0px #000000A6",
};

const ANALOG_PALETTE: PulsePalette = {
  "--pulse-color-app": "#171512",
  "--pulse-color-surface-panel": "#26221D",
  "--pulse-color-surface-control": "#39332C",
  "--pulse-color-surface-inset": "#100F0D",
  "--pulse-color-text-primary": "#FFF9ED",
  "--pulse-color-text-secondary": "#D0C5B6",
  "--pulse-color-border-default": "#867C70",
  "--pulse-color-border-strong": "#B8AB9B",
  "--pulse-color-accent": "#F0B65B",
  "--pulse-color-on-accent": "#1A1003",
  "--pulse-color-focus-inner": "#FFFFFF",
  "--pulse-color-focus-outer": "#000000",
  "--pulse-color-control-track": "#867C70",
  "--pulse-color-control-fill": "#FFE0A3",
  "--pulse-color-meter-low": "#86C878",
  "--pulse-color-meter-mid": "#EDBC58",
  "--pulse-color-meter-high": "#F47762",
  "--pulse-color-status-danger": "#F48170",
  "--pulse-color-status-warning": "#EDBC58",
  "--pulse-color-status-success": "#86C878",
  "--pulse-color-overlay": "#201D19",
  "--pulse-color-text-muted": "#AAA095",
  "--pulse-color-selection": "#5B431D",
  "--pulse-color-control-thumb": "#E8DED2",
  "--pulse-color-meter-track": "#40392F",
  "--pulse-color-status-info": "#81BDE8",
  "--pulse-color-disabled": "#92887C",
  "--pulse-color-scrollbar-track": "#211E1A",
  "--pulse-color-scrollbar-thumb": "#867C70",
  "--pulse-shadow-control": "0px 1px 3px 0px #00000080",
  "--pulse-shadow-panel": "0px 4px 12px 0px #0000008C",
};

const RUST_PALETTE: PulsePalette = {
  "--pulse-color-app": "#130D0A",
  "--pulse-color-surface-panel": "#251813",
  "--pulse-color-surface-control": "#38231B",
  "--pulse-color-surface-inset": "#0D0907",
  "--pulse-color-text-primary": "#FFF4E8",
  "--pulse-color-text-secondary": "#D8BFAF",
  "--pulse-color-border-default": "#8D6B58",
  "--pulse-color-border-strong": "#C49378",
  "--pulse-color-accent": "#E58A55",
  "--pulse-color-on-accent": "#190A03",
  "--pulse-color-focus-inner": "#FFFFFF",
  "--pulse-color-focus-outer": "#000000",
  "--pulse-color-control-track": "#8D6B58",
  "--pulse-color-control-fill": "#FFC8A5",
  "--pulse-color-meter-low": "#8DCE75",
  "--pulse-color-meter-mid": "#F0B956",
  "--pulse-color-meter-high": "#FF755B",
  "--pulse-color-status-danger": "#FF826B",
  "--pulse-color-status-warning": "#F0B956",
  "--pulse-color-status-success": "#8DCE75",
  "--pulse-color-overlay": "#1C120E",
  "--pulse-color-text-muted": "#A98E7E",
  "--pulse-color-selection": "#62331E",
  "--pulse-color-control-thumb": "#E6C9B9",
  "--pulse-color-meter-track": "#40291F",
  "--pulse-color-status-info": "#78BCE7",
  "--pulse-color-disabled": "#9B7A68",
  "--pulse-color-scrollbar-track": "#1D120E",
  "--pulse-color-scrollbar-thumb": "#8D6B58",
  "--pulse-shadow-control": "0px 1px 3px 0px #00000099",
  "--pulse-shadow-panel": "0px 4px 12px 0px #000000A6",
};

export const BUILT_IN_PALETTES: Readonly<Record<PulseThemeId, PulsePalette>> = {
  rack: RACK_PALETTE,
  mono: MONO_PALETTE,
  cosmic: COSMIC_PALETTE,
  analog: ANALOG_PALETTE,
  rust: RUST_PALETTE,
};

/**
 * High contrast is an overlay applied after import validation, not a sixth
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

export function isRequiredPaletteToken(value: string): value is RequiredPaletteToken {
  return REQUIRED_PALETTE_TOKENS.some((token) => token === value);
}

export function isOptionalPaletteToken(value: string): value is OptionalPaletteToken {
  return OPTIONAL_PALETTE_TOKENS.some((token) => token === value);
}

export function isPaletteToken(value: string): value is PaletteToken {
  return isRequiredPaletteToken(value) || isOptionalPaletteToken(value);
}
