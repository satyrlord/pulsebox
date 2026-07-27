export const PULSE_THEME_IDS = ["rack", "mono", "cosmic", "analog", "rust"] as const;

export type PulseThemeId = (typeof PULSE_THEME_IDS)[number];

export interface PulseAppearance {
  readonly highContrast: boolean;
  readonly theme: PulseThemeId;
}

export function applyPulseAppearance(host: HTMLElement, appearance: PulseAppearance): void {
  host.dataset.theme = appearance.theme;
  host.dataset.highContrast = String(appearance.highContrast);
}

export function isPulseThemeId(value: string): value is PulseThemeId {
  return PULSE_THEME_IDS.some((theme) => theme === value);
}
