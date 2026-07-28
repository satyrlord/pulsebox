import { describe, expect, it } from "vitest";

import { findContrastFailures } from "../../../src/themes/contrast";
import {
  BUILT_IN_PALETTES,
  HIGH_CONTRAST_OVERLAY,
  PULSE_THEME_IDS,
  type PulsePalette,
} from "../../../src/themes/tokens";

/**
 * THEMING.md section 4: "The built-in palette must pass the contrast matrix in
 * section 10 before it can ship."
 *
 * Imported user themes are already validated at the import boundary. Without
 * this suite the shipped palettes are the one path that reaches the theme host
 * unchecked, so a palette edit could ship a combination that the very same
 * values would be rejected for on import.
 */
describe("built-in palettes pass the shipping contrast matrix", () => {
  it.each(PULSE_THEME_IDS)("passes every section 10 pair for %s", (theme) => {
    const failures = findContrastFailures(BUILT_IN_PALETTES[theme]).map(
      (failure) =>
        `${failure.foreground} on ${failure.background}: ` +
        `${failure.ratio.toFixed(2)}:1 below ${String(failure.minimum)}:1`,
    );
    expect(failures).toEqual([]);
  });
});

/**
 * Section 5 makes high contrast an overlay applied over a theme, not a sixth
 * theme. Every layered result is a palette a user can actually be looking at,
 * so each one is validated in its own right.
 */
describe("the high-contrast overlay passes over every theme", () => {
  it.each(PULSE_THEME_IDS)("passes every section 10 pair for %s with high contrast", (theme) => {
    const layered: PulsePalette = {
      ...BUILT_IN_PALETTES[theme],
      ...HIGH_CONTRAST_OVERLAY,
    };
    const failures = findContrastFailures(layered).map(
      (failure) =>
        `${failure.foreground} on ${failure.background}: ` +
        `${failure.ratio.toFixed(2)}:1 below ${String(failure.minimum)}:1`,
    );
    expect(failures).toEqual([]);
  });
});
