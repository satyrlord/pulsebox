import type { PluginId } from "../../contracts/parameters";
import { validatePluginManifest, type PluginManifest } from "../../contracts/plugins";
import type { ValidationIssue } from "../../contracts/validation";

export interface PluginRegistryEntry<Factory> {
  readonly manifest: PluginManifest;
  readonly factory: Factory;
}

export class PluginRegistryValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(
      `Plugin registry validation failed with ${issues.length.toString()} issue${issues.length === 1 ? "" : "s"}.`,
    );
    this.name = "PluginRegistryValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): Readonly<T> {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

export class PluginRegistry<Factory> {
  readonly #entries: ReadonlyMap<PluginId, PluginRegistryEntry<Factory>>;

  constructor(entries: readonly PluginRegistryEntry<Factory>[]) {
    const issues: ValidationIssue[] = [];
    const seenIds = new Set<PluginId>();

    for (const [index, entry] of entries.entries()) {
      const validation = validatePluginManifest(entry.manifest);
      if (!validation.ok) {
        issues.push(
          ...validation.issues.map((issue) => ({
            path: `entries[${index.toString()}].manifest.${issue.path}`,
            message: issue.message,
          })),
        );
      }
      if (seenIds.has(entry.manifest.pluginId)) {
        issues.push({
          path: `entries[${index.toString()}].manifest.pluginId`,
          message: `Plugin ID ${entry.manifest.pluginId} is already registered.`,
        });
      } else {
        seenIds.add(entry.manifest.pluginId);
      }
      if (entry.factory === undefined || entry.factory === null) {
        issues.push({
          path: `entries[${index.toString()}].factory`,
          message: "Plugin entry requires an engine factory.",
        });
      }
    }

    if (issues.length > 0) {
      throw new PluginRegistryValidationError(issues);
    }
    const byId = new Map<PluginId, PluginRegistryEntry<Factory>>();
    for (const entry of entries) {
      const immutableEntry = Object.freeze({
        manifest: deepFreeze(entry.manifest),
        factory: entry.factory,
      });
      byId.set(entry.manifest.pluginId, immutableEntry);
    }
    this.#entries = byId;
    Object.freeze(this);
  }

  get size(): number {
    return this.#entries.size;
  }

  get(pluginId: PluginId): PluginRegistryEntry<Factory> | undefined {
    return this.#entries.get(pluginId);
  }

  require(pluginId: PluginId): PluginRegistryEntry<Factory> {
    const entry = this.#entries.get(pluginId);
    if (entry === undefined) {
      throw new Error(`Required plugin ${pluginId} is not registered.`);
    }
    return entry;
  }

  entries(): readonly (readonly [PluginId, PluginRegistryEntry<Factory>])[] {
    return Object.freeze([...this.#entries.entries()].map((entry) => Object.freeze(entry)));
  }
}

export function createPluginRegistry<Factory>(
  entries: readonly PluginRegistryEntry<Factory>[],
): PluginRegistry<Factory> {
  return new PluginRegistry(entries);
}
