import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ModuleInstanceId } from "../../contracts";
import {
  APPEARANCE_STORAGE_KEY,
  createPulseThemeService,
  elementThemeHost,
  type PulseThemeService,
} from "../../themes";
import { PulseApp } from "./PulseApp";
import {
  DEFAULT_LIVE_KEY_MAP,
  validateLiveKeyMap,
  type LiveKeyMap,
} from "./hooks/live-key-map";
import { connectDomainStore, createAppStore, type AppStoreDependencies } from "./store/app-store";
import { AppStoreProvider } from "./store/app-store-context";

export interface PulseboxAppHandle {
  readonly dispose: () => void;
  readonly markAudioUnavailable: () => void;
  /** Shows the non-blocking project notice with its ARIA live announcement. */
  readonly reportProjectNotice: (message: string) => void;
  readonly reportAudioStatus: (
    status: "faulted" | "recovered" | "recovering",
    message?: string,
  ) => void;
  readonly reportAudioRuntimeState: (
    state: "locked" | "active" | "suspended" | "unavailable",
  ) => void;
  readonly reportMeter: (moduleId: ModuleInstanceId, level: number) => void;
  readonly themeService: PulseThemeService;
}

export interface MountOptions extends AppStoreDependencies {
  readonly host: HTMLElement;
}

/** Lightweight global UI preferences. Storage keys keep the pulse- prefix. */
const METRONOME_STORAGE_KEY = "pulse-metronome-enabled";
const LAUNCH_QUANTIZATION_STORAGE_KEY = "pulse-launch-quantization";
const LIVE_KEY_MAP_STORAGE_KEY = "pulse-live-key-map";
const LIVE_INPUT_QUANTIZE_STORAGE_KEY = "pulse-live-input-quantize";
const LIVE_COUNT_IN_STORAGE_KEY = "pulse-live-count-in-bars";
const GHOST_NOTES_STORAGE_KEY = "pulse-ghost-notes-enabled";

function readStoredPreference(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStoredPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A browser that blocks storage keeps the in-session preference only.
  }
}

function readLiveKeyMap(): LiveKeyMap {
  const source = readStoredPreference(LIVE_KEY_MAP_STORAGE_KEY);
  if (source === undefined) return DEFAULT_LIVE_KEY_MAP;
  try {
    const candidate: unknown = JSON.parse(source);
    if (!Array.isArray(candidate)) return DEFAULT_LIVE_KEY_MAP;
    const map = candidate as LiveKeyMap;
    return validateLiveKeyMap(map).valid ? map : DEFAULT_LIVE_KEY_MAP;
  } catch {
    return DEFAULT_LIVE_KEY_MAP;
  }
}

/**
 * The composition root calls this once. StrictMode stays on in development so a
 * double-invoked effect that leaked a listener, a frame loop, or an engine node
 * fails loudly here rather than as an audio dropout later.
 */
export function mountPulseboxApp(options: MountOptions): PulseboxAppHandle {
  const { host, ...injected } = options;

  const storedLaunchQuantization = Number(readStoredPreference(LAUNCH_QUANTIZATION_STORAGE_KEY));
  const storedCountIn = Number(readStoredPreference(LIVE_COUNT_IN_STORAGE_KEY));
  const storedQuantizeMode = readStoredPreference(LIVE_INPUT_QUANTIZE_STORAGE_KEY);
  const dependencies: AppStoreDependencies = {
    ...injected,
    preferences: {
      metronomeEnabled: readStoredPreference(METRONOME_STORAGE_KEY) === "true",
      ...(Number.isSafeInteger(storedLaunchQuantization) && storedLaunchQuantization >= 1
        ? { launchQuantizationSteps: storedLaunchQuantization }
        : {}),
      liveKeyMap: readLiveKeyMap(),
      ...(storedQuantizeMode === "input" || storedQuantizeMode === "after" || storedQuantizeMode === "off"
        ? { liveInputQuantizeMode: storedQuantizeMode }
        : {}),
      ...(Number.isSafeInteger(storedCountIn) && storedCountIn >= 0 && storedCountIn <= 4
        ? { liveCountInBars: storedCountIn }
        : {}),
      ghostNotesEnabled: readStoredPreference(GHOST_NOTES_STORAGE_KEY) !== "false",
      onMetronomeChange: (enabled) => {
        writeStoredPreference(METRONOME_STORAGE_KEY, String(enabled));
      },
      onLaunchQuantizationChange: (steps) => {
        writeStoredPreference(LAUNCH_QUANTIZATION_STORAGE_KEY, String(steps));
      },
      onLiveKeyMapChange: (map) => {
        writeStoredPreference(LIVE_KEY_MAP_STORAGE_KEY, JSON.stringify(map));
      },
      onLiveInputQuantizeModeChange: (mode) => {
        writeStoredPreference(LIVE_INPUT_QUANTIZE_STORAGE_KEY, mode);
      },
      onLiveCountInBarsChange: (bars) => {
        writeStoredPreference(LIVE_COUNT_IN_STORAGE_KEY, String(bars));
      },
      onGhostNotesEnabledChange: (enabled) => {
        writeStoredPreference(GHOST_NOTES_STORAGE_KEY, String(enabled));
      },
    },
  };

  const themeService = createPulseThemeService({
    host: elementThemeHost(document.documentElement),
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => {
        window.localStorage.setItem(key, value);
      },
    },
  });

  // Reads the stored preference and paints the host before the first render, so
  // the shell never flashes the default palette.
  themeService.start();

  const appStore = createAppStore(dependencies);
  const disconnect = connectDomainStore(appStore, dependencies.store);

  const onStorage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_STORAGE_KEY) themeService.applyCrossTabValue(event.newValue);
  };
  window.addEventListener("storage", onStorage);

  /*
   * Meter frames arrive per module at about 30 Hz, so a full rack posts a few
   * hundred a second. Committing each one separately runs every selector in the
   * tree that many times, and that main-thread work is what makes the scheduler
   * tick land late. Coalescing a frame's levels into one commit per animation
   * frame keeps the meters at display rate and takes the load off the tick.
   * When the tab is hidden the callback stops firing, which is the wanted
   * behavior: no meter repaint is needed and the pending levels are replaced by
   * fresher ones on the next visible frame.
   */
  let pendingMeters: Record<string, number> | undefined;
  let meterFrame: number | undefined;
  const flushMeters = () => {
    meterFrame = undefined;
    const levels = pendingMeters;
    pendingMeters = undefined;
    if (levels !== undefined) appStore.getState().setMeterLevels(levels);
  };

  let root: Root | undefined = createRoot(host);
  root.render(
    <StrictMode>
      <AppStoreProvider value={{ store: appStore, dependencies }}>
        <PulseApp themeService={themeService} />
      </AppStoreProvider>
    </StrictMode>,
  );

  return {
    themeService,
    dispose: () => {
      window.removeEventListener("storage", onStorage);
      if (meterFrame !== undefined) cancelAnimationFrame(meterFrame);
      meterFrame = undefined;
      pendingMeters = undefined;
      disconnect();
      root?.unmount();
      root = undefined;
    },
    markAudioUnavailable: () => {
      appStore.getState().markAudioUnavailable();
    },
    reportProjectNotice: (message) => {
      appStore.getState().setProjectMessage(message);
    },
    reportAudioStatus: (status, message) => {
      appStore.getState().reportAudioStatus(status, message);
    },
    reportAudioRuntimeState: (state) => {
      appStore.getState().reportAudioRuntimeState(state);
    },
    reportMeter: (moduleId, level) => {
      pendingMeters = { ...pendingMeters, [moduleId]: level };
      meterFrame ??= requestAnimationFrame(flushMeters);
    },
  };
}
