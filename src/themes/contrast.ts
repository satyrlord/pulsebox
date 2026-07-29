/**
 * sRGB relative luminance and contrast ratio, and the semantic contrast matrix
 * from docs/THEMING.md section 10.
 *
 * The algorithm is the one defined by WCAG 2.2. Ratios are compared unrounded;
 * only reported values are rounded.
 */

import type { PaletteToken, PulsePalette } from "./tokens";

function channelLuminance(component: number): number {
  const normalized = component / 255;
  return normalized <= 0.040_45 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string): number {
  const hex = color.startsWith("#") ? color.slice(1) : color;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastRule {
  readonly backgrounds: readonly PaletteToken[];
  readonly foregrounds: readonly PaletteToken[];
  readonly minimum: number;
}

/** The exact matrix in THEMING.md section 10. */
export const CONTRAST_MATRIX: readonly ContrastRule[] = [
  {
    foregrounds: [
      "--pulse-color-text-primary",
      "--pulse-color-text-secondary",
      "--pulse-color-text-muted",
    ],
    backgrounds: [
      "--pulse-color-app",
      "--pulse-color-surface-panel",
      "--pulse-color-surface-control",
      "--pulse-color-surface-inset",
      "--pulse-color-overlay",
    ],
    minimum: 4.5,
  },
  {
    foregrounds: ["--pulse-color-on-accent"],
    backgrounds: ["--pulse-color-accent"],
    minimum: 4.5,
  },
  {
    foregrounds: ["--pulse-color-border-default"],
    backgrounds: ["--pulse-color-surface-panel", "--pulse-color-surface-control"],
    minimum: 3,
  },
  {
    foregrounds: ["--pulse-color-border-strong"],
    backgrounds: [
      "--pulse-color-surface-panel",
      "--pulse-color-surface-control",
      "--pulse-color-selection",
    ],
    minimum: 3,
  },
  {
    foregrounds: ["--pulse-color-control-track"],
    backgrounds: ["--pulse-color-surface-control"],
    minimum: 3,
  },
  {
    foregrounds: ["--pulse-color-control-fill", "--pulse-color-control-thumb"],
    backgrounds: ["--pulse-color-control-track"],
    minimum: 3,
  },
  {
    foregrounds: ["--pulse-color-meter-low", "--pulse-color-meter-mid", "--pulse-color-meter-high"],
    backgrounds: ["--pulse-color-meter-track"],
    minimum: 3,
  },
  {
    foregrounds: [
      "--pulse-color-status-danger",
      "--pulse-color-status-warning",
      "--pulse-color-status-success",
      "--pulse-color-status-info",
    ],
    backgrounds: ["--pulse-color-surface-panel", "--pulse-color-surface-inset"],
    minimum: 3,
  },
  {
    foregrounds: ["--pulse-color-scrollbar-thumb"],
    backgrounds: ["--pulse-color-scrollbar-track"],
    minimum: 3,
  },
  {
    foregrounds: ["--pulse-color-focus-inner"],
    backgrounds: ["--pulse-color-focus-outer"],
    minimum: 3,
  },
];

/** Backgrounds where at least one focus band must also reach 3:1. */
const FOCUS_BACKGROUNDS: readonly PaletteToken[] = [
  "--pulse-color-app",
  "--pulse-color-surface-panel",
  "--pulse-color-surface-control",
  "--pulse-color-surface-inset",
  "--pulse-color-overlay",
  "--pulse-color-accent",
];

export interface ContrastFailure {
  readonly background: PaletteToken;
  readonly foreground: PaletteToken;
  readonly minimum: number;
  readonly ratio: number;
}

/**
 * Returns every failing pair, not only the first, so an import report can list
 * all independently detectable errors.
 */
export function findContrastFailures(palette: PulsePalette): readonly ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  for (const rule of CONTRAST_MATRIX) {
    for (const foreground of rule.foregrounds) {
      for (const background of rule.backgrounds) {
        const ratio = contrastRatio(palette[foreground], palette[background]);
        if (ratio < rule.minimum) {
          failures.push({ background, foreground, minimum: rule.minimum, ratio });
        }
      }
    }
  }
  for (const background of FOCUS_BACKGROUNDS) {
    const inner = contrastRatio(palette["--pulse-color-focus-inner"], palette[background]);
    const outer = contrastRatio(palette["--pulse-color-focus-outer"], palette[background]);
    if (Math.max(inner, outer) < 3) {
      failures.push({
        background,
        foreground: "--pulse-color-focus-inner",
        minimum: 3,
        ratio: Math.max(inner, outer),
      });
    }
  }
  return failures;
}
