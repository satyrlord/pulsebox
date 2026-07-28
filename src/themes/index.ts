export {
  APPEARANCE_ENVELOPE_VERSION,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearanceEnvelope,
  resolvePalette,
  serializeAppearance,
  type PulseAppearance,
} from "./appearance";
export {
  CONTRAST_MATRIX,
  contrastRatio,
  findContrastFailures,
  relativeLuminance,
  type ContrastFailure,
  type ContrastRule,
} from "./contrast";
export {
  isModuleAccentKey,
  MODULE_ACCENT_KEYS,
  MODULE_ACCENT_TOKENS,
  MODULE_ACCENTS,
  MODULE_IDENTITIES,
  moduleAccentFor,
  moduleIdentityForPluginId,
  type ModuleAccentKey,
  type ModuleAccentSet,
  type ModuleAccentToken,
  type ModuleIdentity,
} from "./module-accents";
export {
  elementThemeHost,
  PulseThemeService,
  type AppearanceChangeListener,
  type AppearanceStoragePort,
  type ThemeHostPort,
  type ThemeServiceOptions,
} from "./theme-service";
export {
  BUILT_IN_PALETTES,
  HIGH_CONTRAST_OVERLAY,
  isOptionalPaletteToken,
  isPaletteToken,
  isPulseThemeId,
  isRequiredPaletteToken,
  OPTIONAL_PALETTE_TOKENS,
  PULSE_APPEARANCE_SELECTIONS,
  PULSE_THEME_IDS,
  REQUIRED_PALETTE_TOKENS,
  SHADOW_TOKENS,
  type OptionalPaletteToken,
  type PaletteToken,
  type PulseAppearanceSelection,
  type PulsePalette,
  type PulseThemeId,
  type RequiredPaletteToken,
} from "./tokens";
export {
  importUserTheme,
  isCanonicalUserTheme,
  MAX_USER_THEME_BYTES,
  USER_THEME_FORMAT_VERSION,
  type CanonicalUserTheme,
  type UserThemeError,
  type UserThemeImportResult,
  type UserThemeReport,
} from "./user-theme";
export {
  findForbiddenConstruct,
  parseColor,
  parseShadow,
  type GrammarResult,
} from "./value-grammar";

/**
 * Applies an appearance to a host element without the full theme service. The
 * service is the only writer of palette properties; this helper sets the two
 * host state attributes that CSS selectors key on.
 */
export function applyPulseAppearance(
  host: HTMLElement,
  appearance: { readonly highContrast: boolean; readonly theme: string },
): void {
  host.dataset.theme = appearance.theme;
  host.dataset.highContrast = String(appearance.highContrast);
}
