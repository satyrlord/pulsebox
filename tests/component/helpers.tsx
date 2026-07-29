import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

import { browserIdFactory, type ModuleInstanceId, type PluginId } from "../../src/contracts";
import { ACID_BASS_DEFAULT_PARAMETERS, ACID_BASS_MANIFEST } from "../../src/engine/public";
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

function parameterValues(
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

export const TEST_STEPS = Array.from({ length: 16 }, (_, index) => ({
  active: index % 4 === 0,
  note: 36,
  velocity: 0.8,
  accent: index === 0,
  slide: index === 5,
}));

export function createHarness(): Harness {
  const seed: ModuleSeed = {
    pluginId: ACID_BASS_MANIFEST.pluginId,
    parameters: parameterValues(ACID_BASS_DEFAULT_PARAMETERS),
    steps: TEST_STEPS,
  };

  const audio = {
    getPositionTicks: () => 0,
    pause: vi.fn(() => 0),
    play: vi.fn(() => Promise.resolve()),
    previewParameter: vi.fn(),
    startAudition: vi.fn(() => Promise.resolve()),
    stopAudition: vi.fn(),
    stop: vi.fn(),
    setSwing: vi.fn(),
  };

  const projects = {
    save: vi.fn(() => Promise.resolve()),
    list: vi.fn(() =>
      Promise.resolve([{ id: "stored-1", name: "Saved session", modifiedAt: "2026-07-28" }]),
    ),
    open: vi.fn(() => Promise.resolve()),
    exportPortable: vi.fn(() => new Uint8Array()),
    importPortable: vi.fn(() => Promise.resolve({ ok: true } as const)),
  };

  const domain = new PulseStore(
    createDefaultState(browserIdFactory, seed),
    browserIdFactory,
    seed,
    () => undefined,
    (_module, parameter, value) => {
      const descriptor = ACID_BASS_MANIFEST.parameters.find((one) => one.id === parameter);
      if (descriptor === undefined) return false;
      if (descriptor.valueType === "enum") {
        return typeof value === "string" && descriptor.enumValues?.includes(value) === true;
      }
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
    manifestFor: (pluginId: PluginId) =>
      pluginId === ACID_BASS_MANIFEST.pluginId ? ACID_BASS_MANIFEST : undefined,
    addablePluginIds: [ACID_BASS_MANIFEST.pluginId],
    auditionNoteFor: () => 36,
    visibleSlotCount: 3,
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
