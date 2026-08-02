import { describe, expect, it } from "vitest";

import { BASS_MONO_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import { contrastRatio } from "../../../src/themes/contrast";
import {
  MODULE_ACCENT_KEYS,
  MODULE_ACCENT_TOKENS,
  MODULE_ACCENTS,
  moduleAccentFor,
} from "../../../src/themes/module-accents";
import { BUILT_IN_PALETTES } from "../../../src/themes/tokens";
import { MODULE_IDENTITIES, moduleIdentityForPluginId } from "../approved-module-identities";

const HEX = /^#[0-9A-F]{6}$/;

describe("module accent declarations", () => {
  it.each(MODULE_ACCENT_KEYS)("uses opaque uppercase six-digit hex for %s", (key) => {
    for (const token of MODULE_ACCENT_TOKENS) {
      expect(MODULE_ACCENTS[key][token], `${key} ${token}`).toMatch(HEX);
    }
  });

  it("gives every module a distinct accent so identity never collides", () => {
    const accents = MODULE_ACCENT_KEYS.map((key) => MODULE_ACCENTS[key]["--module-accent"]);
    expect(new Set(accents).size).toBe(accents.length);
  });
});

describe("instrument identity vocabulary", () => {
  it("declares exactly the six approved instruments", () => {
    expect(MODULE_IDENTITIES).toHaveLength(6);
    expect(MODULE_IDENTITIES.map((identity) => identity.shortLabel)).toEqual([
      ...MODULE_ACCENT_KEYS,
    ]);
  });

  it("keeps short labels uppercase and at most four characters", () => {
    for (const identity of MODULE_IDENTITIES) {
      expect(identity.shortLabel).toBe(identity.shortLabel.toUpperCase());
      expect(identity.shortLabel.length).toBeLessThanOrEqual(4);
    }
  });

  it("resolves an accent for every declared instrument", () => {
    for (const identity of MODULE_IDENTITIES) {
      expect(moduleAccentFor(identity.shortLabel)).toBeDefined();
      expect(moduleIdentityForPluginId(identity.pluginId)).toEqual(identity);
    }
  });

  it("ignores an unknown short label rather than inventing an accent", () => {
    expect(moduleAccentFor("NOPE")).toBeUndefined();
    expect(moduleIdentityForPluginId("not-a-plugin")).toBeUndefined();
  });
});

describe("shipped manifests carry their approved accent", () => {
  it("gives Silver Serpent the ACID accent set and identity", () => {
    const identity = moduleIdentityForPluginId(BASS_MONO_MANIFEST.pluginId);
    expect(identity?.productName).toBe(BASS_MONO_MANIFEST.productName);
    expect(identity?.shortLabel).toBe(BASS_MONO_MANIFEST.shortLabel);

    const accent = MODULE_ACCENTS.ACID;
    expect(BASS_MONO_MANIFEST.ui.moduleAccent).toEqual({
      accent: accent["--module-accent"],
      accentMuted: accent["--module-accent-muted"],
      led: accent["--module-led"],
      controlRing: accent["--module-control-ring"],
    });
  });
});

/**
 * Section 3.4 lets accents identify a module but never rely on color alone, and
 * section 10 requires essential non-text UI to reach 3:1. A lit LED or accent
 * trim sits on a panel or inset surface in every theme, so each accent has to
 * survive every built-in background rather than only the default one.
 */
describe("module accents stay visible in every built-in theme", () => {
  const surfaces = ["--pulse-color-surface-panel", "--pulse-color-surface-inset"] as const;

  it.each(MODULE_ACCENT_KEYS)("keeps the %s accent and LED at 3:1 on every surface", (key) => {
    const failures: string[] = [];
    for (const [theme, palette] of Object.entries(BUILT_IN_PALETTES)) {
      for (const token of ["--module-accent", "--module-led"] as const) {
        for (const surface of surfaces) {
          const ratio = contrastRatio(MODULE_ACCENTS[key][token], palette[surface]);
          if (ratio < 3) {
            failures.push(`${theme} ${token} on ${surface}: ${ratio.toFixed(2)}:1`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
