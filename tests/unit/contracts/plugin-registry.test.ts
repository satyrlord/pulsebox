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
});
