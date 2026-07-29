import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ModuleInstanceId } from "../../contracts";
import { APPEARANCE_STORAGE_KEY, elementThemeHost, PulseThemeService } from "../../themes";
import { PulseApp } from "./PulseApp";
import { connectDomainStore, createAppStore, type AppStoreDependencies } from "./store/app-store";
import { AppStoreProvider } from "./store/app-store-context";

export interface PulseboxAppHandle {
  readonly dispose: () => void;
  readonly markAudioUnavailable: () => void;
  readonly reportAudioStatus: (
    status: "faulted" | "recovered" | "recovering",
    message?: string,
  ) => void;
  readonly reportMeter: (moduleId: ModuleInstanceId, level: number) => void;
  readonly themeService: PulseThemeService;
}

export interface MountOptions extends AppStoreDependencies {
  readonly host: HTMLElement;
}

/**
 * The composition root calls this once. StrictMode stays on in development so a
 * double-invoked effect that leaked a listener, a frame loop, or an engine node
 * fails loudly here rather than as an audio dropout later.
 */
export function mountPulseboxApp(options: MountOptions): PulseboxAppHandle {
  const { host, ...dependencies } = options;

  const themeService = new PulseThemeService({
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
      disconnect();
      root?.unmount();
      root = undefined;
    },
    markAudioUnavailable: () => {
      appStore.getState().markAudioUnavailable();
    },
    reportAudioStatus: (status, message) => {
      appStore.getState().reportAudioStatus(status, message);
    },
    reportMeter: (moduleId, level) => {
      appStore.getState().setMeterLevel(moduleId, level);
    },
  };
}
