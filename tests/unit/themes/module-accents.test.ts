import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACID_BASS_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import { contrastRatio } from "../../../src/themes/contrast";
import {
  MODULE_ACCENT_KEYS,
  MODULE_ACCENT_TOKENS,
  MODULE_ACCENTS,
  MODULE_IDENTITIES,
  moduleAccentFor,
  moduleIdentityForPluginId,
} from "../../../src/themes/module-accents";
import { BUILT_IN_PALETTES } from "../../../src/themes/tokens";

const HEX = /^#[0-9A-F]{6}$/;

/**
 * Parses the section 3.4 table straight out of THEMING.md. The document is the
 * contract, so the table is read rather than restated: a documentation edit
 * that drifts from the code fails here instead of shipping.
 */
function readAccentTable(): Map<string, readonly string[]> {
  const text = readFileSync(join(process.cwd(), "docs/THEMING.md"), "utf8");
  const rows = new Map<string, readonly string[]>();
  for (const match of text.matchAll(/^\|\s*`(BASS|SIX|BOOM|NINE|SEV|FIVE)`\s*\|([^\n]+)\|\s*$/gm)) {
    const key = match[1] ?? "";
    const values = (match[2] ?? "")
      .split("|")
      .map((cell) => cell.trim().replaceAll("`", ""))
      .filter((cell) => cell.length > 0);
    rows.set(key, values);
  }
  return rows;
}

describe("module accents match the theming contract", () => {
  const table = readAccentTable();

  it("documents all six modules in THEMING.md section 3.4", () => {
    expect([...table.keys()].sort()).toEqual([...MODULE_ACCENT_KEYS].sort());
  });

  it.each(MODULE_ACCENT_KEYS)("matches the documented accent row for %s", (key) => {
    const documented = table.get(key);
    const declared = MODULE_ACCENT_TOKENS.map((token) => MODULE_ACCENTS[key][token]);
    expect(documented).toEqual(declared);
  });

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

  it("matches the spec-001 section 2.2 name table", () => {
    const text = readFileSync(
      join(process.cwd(), "docs/specs/spec-001-product-and-design-foundations.md"),
      "utf8",
    );
    for (const identity of MODULE_IDENTITIES) {
      // The row binds full name, code ID, type, and short label together, so a
      // rename that touches only one column cannot pass.
      const row = new RegExp(
        `\\|\\s*${identity.productName}\\s*\\|\\s*\`${identity.pluginId}\`\\s*\\|\\s*${identity.type}\\s*\\|\\s*\`${identity.shortLabel}\``,
      );
      expect(row.test(text), `spec-001 must list ${identity.productName}`).toBe(true);
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
  it("gives Acid Bass the BASS accent set and identity", () => {
    const identity = moduleIdentityForPluginId(ACID_BASS_MANIFEST.pluginId);
    expect(identity?.productName).toBe(ACID_BASS_MANIFEST.productName);
    expect(identity?.shortLabel).toBe(ACID_BASS_MANIFEST.shortLabel);

    const accent = MODULE_ACCENTS.BASS;
    expect(ACID_BASS_MANIFEST.ui.moduleAccent).toEqual({
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
