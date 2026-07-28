/**
 * Module-scoped accent tokens, per docs/THEMING.md section 3.4 and the
 * instrument table in spec-001 section 2.2.
 *
 * This module is data only. It holds no DOM handle and names no plugin
 * behavior, so it stays outside the plugin-branching rule: a manifest declares
 * its own accent, and this table is the normative source those manifests are
 * checked against.
 *
 * Accents identify a module. They never fill a whole faceplate, and they are
 * never the only identity cue: section 3.4 requires text, position, shape, or
 * iconography alongside the color, which `MODULE_IDENTITY` carries as the
 * short label.
 */

/** The six MVP instrument short labels, in rack order. */
export const MODULE_ACCENT_KEYS = ["BASS", "SIX", "BOOM", "NINE", "SEV", "FIVE"] as const;

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
  BASS: {
    "--module-accent": "#9BE564",
    "--module-accent-muted": "#496B36",
    "--module-led": "#B8FF7A",
    "--module-control-ring": "#79B84D",
  },
  SIX: {
    "--module-accent": "#FFB44A",
    "--module-accent-muted": "#76552A",
    "--module-led": "#FFD078",
    "--module-control-ring": "#D98E2F",
  },
  BOOM: {
    "--module-accent": "#FF6B5F",
    "--module-accent-muted": "#763B37",
    "--module-led": "#FF9188",
    "--module-control-ring": "#D84E45",
  },
  NINE: {
    "--module-accent": "#B890FF",
    "--module-accent-muted": "#594776",
    "--module-led": "#CEB2FF",
    "--module-control-ring": "#9670D8",
  },
  SEV: {
    "--module-accent": "#5AAEFF",
    "--module-accent-muted": "#315979",
    "--module-led": "#86C5FF",
    "--module-control-ring": "#3E8ED8",
  },
  FIVE: {
    "--module-accent": "#4ADFC7",
    "--module-accent-muted": "#2B6D63",
    "--module-led": "#7FF2DF",
    "--module-control-ring": "#32B8A3",
  },
};

export interface ModuleIdentity {
  /** Stable engine plugin ID. Not a visible product name. */
  readonly pluginId: string;
  /** Approved full name from spec-001 section 2.2. */
  readonly productName: string;
  /** Approved uppercase short label, at most four characters. */
  readonly shortLabel: ModuleAccentKey;
  /** Approved type description. */
  readonly type: string;
  /** Plain-language accent name, for documentation and accessible text. */
  readonly accentName: string;
}

/**
 * The complete approved instrument vocabulary. Spec-001 section 2.2 forbids
 * inventing any additional visible name for these six instruments, so this
 * table is the only place a visible instrument name is introduced.
 */
export const MODULE_IDENTITIES: readonly ModuleIdentity[] = Object.freeze([
  {
    pluginId: "bass-mono",
    productName: "Acid Bass",
    shortLabel: "BASS",
    type: "Monophonic analog-style bass synth",
    accentName: "acid green",
  },
  {
    pluginId: "drum-analog-small",
    productName: "Drumline Six",
    shortLabel: "SIX",
    type: "Small analog-style drum machine",
    accentName: "amber orange",
  },
  {
    pluginId: "drum-analog-large",
    productName: "Boom Eight",
    shortLabel: "BOOM",
    type: "Large analog-style drum machine",
    accentName: "warm red",
  },
  {
    pluginId: "drum-hybrid",
    productName: "Hybrid Nine",
    shortLabel: "NINE",
    type: "Analog and sample hybrid machine",
    accentName: "violet",
  },
  {
    pluginId: "drum-digital-a",
    productName: "Digit Seven",
    shortLabel: "SEV",
    type: "Digital drum machine",
    accentName: "electric blue",
  },
  {
    pluginId: "drum-digital-b",
    productName: "Digit Five",
    shortLabel: "FIVE",
    type: "Digital drum machine with percussion",
    accentName: "turquoise",
  },
]);

export function isModuleAccentKey(value: string): value is ModuleAccentKey {
  return MODULE_ACCENT_KEYS.some((key) => key === value);
}

export function moduleAccentFor(shortLabel: string): ModuleAccentSet | undefined {
  return isModuleAccentKey(shortLabel) ? MODULE_ACCENTS[shortLabel] : undefined;
}

export function moduleIdentityForPluginId(pluginId: string): ModuleIdentity | undefined {
  return MODULE_IDENTITIES.find((identity) => identity.pluginId === pluginId);
}
