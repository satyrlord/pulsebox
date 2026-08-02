import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

import {
  browserIdFactory,
  type ModuleInstanceId,
  type PluginId,
  type PluginManifest,
} from "../../src/contracts";
import {
  BASS_MONO_DEFAULT_PARAMETERS,
  BASS_MONO_MANIFEST,
  DRUMLINE_SIX_DEFAULT_PARAMETERS,
  DRUMLINE_SIX_MANIFEST,
  playableNotesFor,
} from "../../src/engine/public";
import { createDefaultState, PulseStore, type ModuleSeed } from "../../src/state/public";
import {
  createAppStore,
  connectDomainStore,
  type AppStore,
  type AppStoreDependencies,
  type AudioControlPort,
} from "../../src/ui/react/store/app-store";
import { AppStoreProvider } from "../../src/ui/react/store/app-store-context";

export interface Harness {
  readonly store: AppStore;
  readonly domain: PulseStore;
  readonly audio: AudioControlPort & {
    readonly play: ReturnType<typeof vi.fn>;
    readonly pause: ReturnType<typeof vi.fn>;
    readonly stop: ReturnType<typeof vi.fn>;
    readonly previewParameter: ReturnType<typeof vi.fn>;
    readonly startAudition: ReturnType<typeof vi.fn>;
    readonly stopAudition: ReturnType<typeof vi.fn>;
  };
  readonly projects: {
    readonly save: ReturnType<typeof vi.fn>;
    readonly list: ReturnType<typeof vi.fn>;
    readonly open: ReturnType<typeof vi.fn>;
    readonly exportPortable: ReturnType<typeof vi.fn>;
    readonly importPortable: ReturnType<typeof vi.fn>;
  };
  readonly dependencies: AppStoreDependencies;
  readonly disconnect: () => void;
}

/** One extra module a test can add to the rack, with its manifest and seed. */
export interface HarnessModule {
  readonly seed: ModuleSeed;
  readonly manifest: PluginManifest;
}

export function parameterValues(
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, number | boolean | string>> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, number | boolean | string] =>
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean" ||
        typeof entry[1] === "string",
    ),
  );
}

/**
 * Step 8 sits above every drum roster, so a swap from the pitched Silver Serpent to
 * a drum machine has exactly one event with no voice on the target. That is
 * what the section 14 result panel counts.
 */
export const UNMAPPABLE_TEST_NOTE = 72;

export const TEST_STEPS = Array.from({ length: 16 }, (_, index) => ({
  active: index % 4 === 0,
  note: index === 8 ? UNMAPPABLE_TEST_NOTE : 36,
  velocity: 0.8,
  accent: index === 0,
  slide: index === 5,
}));

export function createHarness(
  options: { readonly extraModules?: readonly HarnessModule[] } = {},
): Harness {
  const extraModules = options.extraModules ?? [];
  const seed: ModuleSeed = {
    pluginId: BASS_MONO_MANIFEST.pluginId,
    parameters: parameterValues(BASS_MONO_DEFAULT_PARAMETERS),
    steps: TEST_STEPS,
  };
  const drumSeed: ModuleSeed = {
    pluginId: DRUMLINE_SIX_MANIFEST.pluginId,
    parameters: parameterValues(DRUMLINE_SIX_DEFAULT_PARAMETERS),
    steps: TEST_STEPS,
  };
  const seeds = new Map<PluginId, ModuleSeed>([
    [seed.pluginId, seed],
    [drumSeed.pluginId, drumSeed],
    ...extraModules.map((module) => [module.seed.pluginId, module.seed] as const),
  ]);
  const manifests = new Map<PluginId, PluginManifest>([
    [BASS_MONO_MANIFEST.pluginId, BASS_MONO_MANIFEST],
    [DRUMLINE_SIX_MANIFEST.pluginId, DRUMLINE_SIX_MANIFEST],
    ...extraModules.map((module) => [module.manifest.pluginId, module.manifest] as const),
  ]);

  const audio = {
    getPositionTicks: () => 0,
    pause: vi.fn(() => 0),
    play: vi.fn(() => Promise.resolve()),
    previewParameter: vi.fn(),
    previewTempo: vi.fn(),
    previewSwing: vi.fn(),
    previewHumanize: vi.fn(),
    startAudition: vi.fn(() => Promise.resolve()),
    stopAudition: vi.fn(),
    stop: vi.fn(),
    setSwing: vi.fn(),
    getMasterMeter: vi.fn(() => ({ left: 0, right: 0, mid: 0, side: 0, peak: false })),
    setMetronomeEnabled: vi.fn(),
    setPower: vi.fn(() => Promise.resolve()),
    setLaunchQuantization: vi.fn(),
  };

  const projects = {
    save: vi.fn(() => Promise.resolve()),
    list: vi.fn(() =>
      Promise.resolve([
        { id: "stored-1", name: "Saved session", modifiedAt: "2026-07-28", favorite: false },
      ]),
    ),
    open: vi.fn(() => Promise.resolve()),
    exportPortable: vi.fn(() => new Uint8Array()),
    importPortable: vi.fn(() => Promise.resolve({ ok: true } as const)),
  };

  const domain = new PulseStore(
    createDefaultState(browserIdFactory, seed),
    browserIdFactory,
    (pluginId) => seeds.get(pluginId),
    () => undefined,
    (module, parameter, value) => {
      const descriptor = manifests
        .get(module.pluginId)
        ?.parameters.find((one) => one.id === parameter);
      if (descriptor === undefined) return false;
      if (descriptor.valueType === "enum") {
        return typeof value === "string" && descriptor.enumValues?.includes(value) === true;
      }
      if (descriptor.valueType === "boolean") return typeof value === "boolean";
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= (descriptor.minimum ?? value) &&
        value <= (descriptor.maximum ?? value)
      );
    },
  );

  const dependencies: AppStoreDependencies = {
    store: domain,
    audio,
    manifestFor: (pluginId: PluginId) => manifests.get(pluginId),
    addablePluginIds: [
      BASS_MONO_MANIFEST.pluginId,
      DRUMLINE_SIX_MANIFEST.pluginId,
      ...extraModules.map((module) => module.manifest.pluginId),
    ],
    auditionNoteFor: () => 36,
    // The real roster lookup, so the section 14 result panel counts the events
    // a swap target genuinely cannot sound.
    playableNotesFor,
    visibleSlotCount: 8,
    projects,
  };

  const store = createAppStore(dependencies);
  const disconnect = connectDomainStore(store, domain);
  return { store, domain, audio, projects, dependencies, disconnect };
}

export function renderWithHarness(
  node: ReactNode,
  harness = createHarness(),
): RenderResult & {
  readonly harness: Harness;
} {
  const view = render(
    <AppStoreProvider value={{ store: harness.store, dependencies: harness.dependencies }}>
      {node}
    </AppStoreProvider>,
  );
  return Object.assign(view, { harness });
}

export function firstModuleId(harness: Harness): ModuleInstanceId {
  const id = Object.keys(harness.domain.getState().project.modules)[0];
  if (id === undefined) throw new Error("Expected a seeded module.");
  return id as ModuleInstanceId;
}
