import { describe, expect, it } from "vitest";

import type { InstrumentPluginManifest } from "../../../src/contracts/plugins";
import { ACID_BASS_MANIFEST } from "../../../src/engine/modules/bass-mono/manifest";
import { BOOM_EIGHT_MANIFEST } from "../../../src/engine/modules/boom-eight/manifest";
import { DIGIT_FIVE_MANIFEST } from "../../../src/engine/modules/digit-five/manifest";
import { DIGIT_SEVEN_MANIFEST } from "../../../src/engine/modules/digit-seven/manifest";
import { DRUMLINE_SIX_MANIFEST } from "../../../src/engine/modules/drumline-six/manifest";
import { HYBRID_NINE_MANIFEST } from "../../../src/engine/modules/hybrid-nine/manifest";
import {
  MODULE_ACCENTS,
  MODULE_IDENTITIES,
  isModuleAccentKey,
} from "../../../src/themes/module-accents";

/**
 * Every shipped instrument manifest, in the rack order of spec-001 section 2.2.
 *
 * The identity table in `src/themes/module-accents.ts` is the normative source
 * for the visible name, the short label, and the accent of each instrument.
 * A manifest that drifts from it reintroduces an unapproved visible product
 * name, which section 2.3 forbids, so the two are compared here rather than
 * trusted to review.
 */
const MANIFESTS: readonly InstrumentPluginManifest[] = [
  ACID_BASS_MANIFEST,
  DRUMLINE_SIX_MANIFEST,
  BOOM_EIGHT_MANIFEST,
  HYBRID_NINE_MANIFEST,
  DIGIT_SEVEN_MANIFEST,
  DIGIT_FIVE_MANIFEST,
];

describe("instrument manifests match the approved identity table", () => {
  it("ships exactly the six approved MVP instruments", () => {
    expect(MANIFESTS.map((manifest) => manifest.pluginId)).toEqual(
      MODULE_IDENTITIES.map((identity) => identity.pluginId),
    );
  });

  it.each(MODULE_IDENTITIES)("matches the approved identity for $productName", (identity) => {
    const manifest = MANIFESTS.find((candidate) => candidate.pluginId === identity.pluginId);
    expect(manifest, `no manifest declares ${identity.pluginId}`).toBeDefined();
    expect(manifest?.productName).toBe(identity.productName);
    expect(manifest?.shortLabel).toBe(identity.shortLabel);
  });

  it.each(MODULE_IDENTITIES)("matches the section 3.4 accent row for $shortLabel", (identity) => {
    const manifest = MANIFESTS.find((candidate) => candidate.pluginId === identity.pluginId);
    const accents = MODULE_ACCENTS[identity.shortLabel];
    expect(manifest?.ui.moduleAccent).toEqual({
      accent: accents["--module-accent"],
      accentMuted: accents["--module-accent-muted"],
      led: accents["--module-led"],
      controlRing: accents["--module-control-ring"],
    });
  });

  it("keeps every short label uppercase and at most four characters", () => {
    for (const manifest of MANIFESTS) {
      const label = manifest.shortLabel ?? "";
      expect(label, manifest.productName).toMatch(/^[A-Z]{1,4}$/u);
      expect(isModuleAccentKey(label), `${label} is not an approved short label`).toBe(true);
    }
  });

  it("gives every instrument a distinct plugin ID and a distinct processor key", () => {
    const pluginIds = MANIFESTS.map((manifest) => manifest.pluginId);
    const processorKeys = MANIFESTS.map((manifest) => manifest.processorFactoryKey);
    expect(new Set(pluginIds).size).toBe(pluginIds.length);
    expect(new Set(processorKeys).size).toBe(processorKeys.length);
  });

  /**
   * A manifest is data the registry freezes and the project format serializes.
   * Declaring a parameter twice would make the serialized record ambiguous, and
   * the last writer would silently win.
   */
  it("declares each parameter ID once per instrument", () => {
    for (const manifest of MANIFESTS) {
      const ids = manifest.parameters.map((parameter) => parameter.id);
      expect(new Set(ids).size, manifest.productName).toBe(ids.length);
    }
  });

  it("gives every parameter a default inside its own declared range", () => {
    for (const manifest of MANIFESTS) {
      for (const parameter of manifest.parameters) {
        if (parameter.valueType !== "float" && parameter.valueType !== "integer") continue;
        const label = `${manifest.productName} ${parameter.id}`;
        expect(parameter.defaultValue, label).toBeGreaterThanOrEqual(
          parameter.minimum ?? -Infinity,
        );
        expect(parameter.defaultValue, label).toBeLessThanOrEqual(parameter.maximum ?? Infinity);
      }
    }
  });
});
