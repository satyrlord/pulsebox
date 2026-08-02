/**
 * Module-scoped accent tokens, per docs/THEMING.md section 3.4 and the
 * instrument table in spec-001 section 2.2.
 *
 * This module is data only and is keyed by the approved short labels, never by
 * plugin IDs: a manifest declares its own accent and identity, and this table
 * is the normative section 3.4 palette those manifests are checked against.
 * The approved per-plugin identity table lives with the identity tests under
 * `tests/unit/approved-module-identities.ts`.
 *
 * Accents identify a module. They never fill a whole faceplate, and they are
 * never the only identity cue: section 3.4 requires text, position, shape, or
 * iconography alongside the color, which the short label carries.
 */

/** The six MVP instrument short labels, in rack order. */
export const MODULE_ACCENT_KEYS = ["ACID", "SNAP", "BOOM", "MESH", "BITS", "PERC"] as const;

export type ModuleAccentKey = (typeof MODULE_ACCENT_KEYS)[number];

export const MODULE_ACCENT_TOKENS = [
  "--module-accent",
  "--module-accent-muted",
  "--module-led",
  "--module-control-ring",
] as const;

export type ModuleAccentToken = (typeof MODULE_ACCENT_TOKENS)[number];

export type ModuleAccentSet = Readonly<Record<ModuleAccentToken, string>>;

/**
 * The exact section 3.4 table. Values are opaque uppercase six-digit sRGB hex,
 * matching the `moduleAccent` grammar the plugin manifest validator enforces.
 */
export const MODULE_ACCENTS: Readonly<Record<ModuleAccentKey, ModuleAccentSet>> = {
  ACID: {
    "--module-accent": "#F2D530",
    "--module-accent-muted": "#6E6118",
    "--module-led": "#FFE95E",
    "--module-control-ring": "#C7A81F",
  },
  SNAP: {
    "--module-accent": "#6FDE76",
    "--module-accent-muted": "#33663A",
    "--module-led": "#98F19E",
    "--module-control-ring": "#4FB558",
  },
  BOOM: {
    "--module-accent": "#FF6B5F",
    "--module-accent-muted": "#763B37",
    "--module-led": "#FF9188",
    "--module-control-ring": "#D84E45",
  },
  MESH: {
    "--module-accent": "#B890FF",
    "--module-accent-muted": "#594776",
    "--module-led": "#CEB2FF",
    "--module-control-ring": "#9670D8",
  },
  BITS: {
    "--module-accent": "#A9C7E8",
    "--module-accent-muted": "#4E5D70",
    "--module-led": "#CFE3F6",
    "--module-control-ring": "#86A6C8",
  },
  PERC: {
    "--module-accent": "#4ADFC7",
    "--module-accent-muted": "#2B6D63",
    "--module-led": "#7FF2DF",
    "--module-control-ring": "#32B8A3",
  },
};

export function isModuleAccentKey(value: string): value is ModuleAccentKey {
  return MODULE_ACCENT_KEYS.some((key) => key === value);
}

export function moduleAccentFor(shortLabel: string): ModuleAccentSet | undefined {
  return isModuleAccentKey(shortLabel) ? MODULE_ACCENTS[shortLabel] : undefined;
}
