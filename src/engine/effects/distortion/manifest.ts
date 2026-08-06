import { parsePluginId, type PluginId } from "../../../contracts/parameters";
import type { EffectPluginManifest } from "../../../contracts/plugins";

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("Distortion contains an invalid stable identifier.");
  return result.value;
}

export const DISTORTION_PLUGIN_ID: PluginId = required(parsePluginId("distortion"));

/**
 * The first effect slice is a fixed Drive-mode insert. Its selector is the
 * voice control, so it has no independent compact or detail controls yet.
 */
export const DISTORTION_MANIFEST = Object.freeze({
  manifestSchemaVersion: 1,
  pluginId: DISTORTION_PLUGIN_ID,
  kind: "effect",
  productName: "Distortion",
  shortLabel: "DIST",
  pluginVersion: "1.0.0",
  stateSchemaVersion: 1,
  apiVersion: 1,
  engineProtocolVersion: 1,
  parameters: [],
  meters: [],
  defaultState: {},
  ui: {
    moduleAccent: {
      accent: "#DC7A4B",
      accentMuted: "#6D3D26",
      led: "#FFAA79",
      controlRing: "#B85E35",
    },
    compactControls: [],
    detailedEditorSections: [],
  },
  automation: "none",
  cpuClass: "light",
  compatibility: { acceptedStateSchemaVersions: [1], migrations: [] },
  placements: ["voice-insert"],
  inputChannels: [1],
  outputChannels: [1],
  latency: { mode: "zero", frames: 0 },
  tail: { mode: "none", maximumMilliseconds: 0 },
  bypassTransitionMilliseconds: 4,
  wetDryLaw: "linear",
  safetyClampParameterIds: [],
  processorFactoryKey: "distortion-voice-insert",
  renderCapabilities: { live: true, offline: false },
} satisfies EffectPluginManifest);
