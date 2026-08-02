/**
 * The complete approved instrument vocabulary from spec-001 section 2.2, held
 * as test evidence. Spec-001 forbids inventing any additional visible name for
 * the six instruments, so the identity tests compare every shipped manifest
 * against this table rather than trusting review.
 *
 * This table lives in the test tree on purpose: shipped code reads identity
 * from each plugin manifest, and no shipped table outside a plugin folder may
 * be keyed by plugin IDs (section 6.5).
 */

import type { ModuleAccentKey } from "../../src/themes/module-accents";

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

export const MODULE_IDENTITIES: readonly ModuleIdentity[] = Object.freeze([
  {
    pluginId: "bass-mono",
    productName: "Silver Serpent",
    shortLabel: "ACID",
    type: "Monophonic analog-style bass synth",
    accentName: "acid yellow",
  },
  {
    pluginId: "drum-analog-small",
    productName: "Tin Soldier",
    shortLabel: "SNAP",
    type: "Small analog-style drum machine",
    accentName: "soldier green",
  },
  {
    pluginId: "drum-analog-large",
    productName: "Soft Thunder",
    shortLabel: "BOOM",
    type: "Large analog-style drum machine",
    accentName: "warm red",
  },
  {
    pluginId: "drum-hybrid",
    productName: "Twin Engine",
    shortLabel: "MESH",
    type: "Analog and sample hybrid machine",
    accentName: "violet",
  },
  {
    pluginId: "drum-digital-a",
    productName: "Gray Ghost",
    shortLabel: "BITS",
    type: "Digital drum machine",
    accentName: "ghost blue",
  },
  {
    pluginId: "drum-digital-b",
    productName: "Dusty Mosaic",
    shortLabel: "PERC",
    type: "Digital drum machine with percussion",
    accentName: "turquoise",
  },
]);

export function moduleIdentityForPluginId(pluginId: string): ModuleIdentity | undefined {
  return MODULE_IDENTITIES.find((identity) => identity.pluginId === pluginId);
}
