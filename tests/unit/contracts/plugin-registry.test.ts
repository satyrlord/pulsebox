import { describe, expect, it } from "vitest";

import {
  PluginRegistryValidationError,
  createPluginRegistry,
} from "../../../src/engine/registry/plugin-registry";
import { createInstrumentManifest, pluginId } from "./fixtures";

describe("plugin registry", () => {
  it("builds an immutable registry keyed by plugin ID", () => {
    const manifest = createInstrumentManifest();
    const factory = () => "engine";
    const registry = createPluginRegistry([{ manifest, factory }]);

    expect(registry.size).toBe(1);
    expect(registry.require(pluginId("bass-mono")).factory).toBe(factory);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.require(pluginId("bass-mono")).manifest)).toBe(true);
    expect(Object.isFrozen(manifest.parameters)).toBe(true);
  });

  it("rejects duplicate plugin IDs before activation", () => {
    const manifest = createInstrumentManifest();
    expect(() =>
      createPluginRegistry([
        { manifest, factory: "one" },
        { manifest: createInstrumentManifest(), factory: "two" },
      ]),
    ).toThrow(PluginRegistryValidationError);
  });

  it.each([undefined, null])("rejects a missing engine factory before activation", (factory) => {
    const manifest = createInstrumentManifest();
    expect(() => createPluginRegistry([{ manifest, factory: factory as never }])).toThrow(
      PluginRegistryValidationError,
    );
  });

  it("does not freeze entries when registry validation fails", () => {
    const manifest = {
      ...createInstrumentManifest(),
      pluginVersion: "invalid",
    };
    expect(() => createPluginRegistry([{ manifest, factory: "engine" }])).toThrow(
      PluginRegistryValidationError,
    );
    expect(Object.isFrozen(manifest)).toBe(false);
  });

  it("fails when a required plugin is absent", () => {
    const registry = createPluginRegistry<unknown>([]);
    expect(() => registry.require(pluginId("bass-mono"))).toThrow(/not registered/u);
  });

  // Section 6.1: registry startup fails for an in-plugin duplicate parameter
  // ID, duplicate meter ID, duplicate compact control position, or an
  // incompatible schema tuple. The manifest validator carries these checks and
  // the registry refuses any manifest that fails it.
  it.each([
    [
      "duplicate parameter ID",
      (manifest: ReturnType<typeof createInstrumentManifest>) => ({
        ...manifest,
        parameters: [...manifest.parameters, ...manifest.parameters],
      }),
    ],
    [
      "duplicate meter ID",
      (manifest: ReturnType<typeof createInstrumentManifest>) => ({
        ...manifest,
        meters: [...manifest.meters, ...manifest.meters],
      }),
    ],
    [
      "duplicate compact control position",
      (manifest: ReturnType<typeof createInstrumentManifest>) => ({
        ...manifest,
        ui: {
          ...manifest.ui,
          compactControls: [...manifest.ui.compactControls, ...manifest.ui.compactControls],
        },
      }),
    ],
    [
      "incompatible schema tuple",
      (manifest: ReturnType<typeof createInstrumentManifest>) => ({
        ...manifest,
        apiVersion: 2 as unknown as 1,
      }),
    ],
  ])("rejects a manifest with a %s before activation", (_name, mutate) => {
    const manifest = mutate(createInstrumentManifest());
    expect(() => createPluginRegistry([{ manifest, factory: "engine" }])).toThrow(
      PluginRegistryValidationError,
    );
  });

  it("rejects a manifest that mixes mapped and all-note voices", () => {
    const manifest = {
      ...createInstrumentManifest(),
      voices: [
        { id: "mapped", name: "Mapped voice", outputChannels: 2 as const, note: 36 },
        { id: "all-notes", name: "All-note voice", outputChannels: 2 as const },
      ],
    };

    expect(() => createPluginRegistry([{ manifest, factory: "engine" }])).toThrow(
      PluginRegistryValidationError,
    );
  });

  it("rejects a note-mapped manifest with an undeclared audition note", () => {
    const manifest = {
      ...createInstrumentManifest(),
      voices: [{ id: "mapped", name: "Mapped voice", outputChannels: 2 as const, note: 37 }],
      auditionNote: 36,
    };

    expect(() => createPluginRegistry([{ manifest, factory: "engine" }])).toThrow(
      PluginRegistryValidationError,
    );
  });
});
