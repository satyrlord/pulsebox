import { createContext, useContext } from "react";
import { useStore } from "zustand";

import type { IdFactory } from "../../../contracts";
import type { AppState, AppStore, AppStoreDependencies, StudioView } from "./app-store";

interface AppContextValue {
  readonly store: AppStore;
  readonly dependencies: AppStoreDependencies;
}

const AppStoreContext = createContext<AppContextValue | undefined>(undefined);

export const AppStoreProvider = AppStoreContext.Provider;

export function useAppContext(): AppContextValue {
  const value = useContext(AppStoreContext);
  if (value === undefined) throw new Error("Pulsebox components require an app store provider.");
  return value;
}

/** Subscribes to exactly the slice the caller selects. */
export function useAppStore<Selected>(selector: (state: AppState) => Selected): Selected {
  return useStore(useAppContext().store, selector);
}

export function useDependencies(): AppStoreDependencies {
  return useAppContext().dependencies;
}

/**
 * Gesture-ID source: the factory the composition root injected. The UI layer
 * selects no browser implementation of its own, so a control always mints
 * gesture IDs from the one injected source and a test can make that source
 * deterministic.
 */
export function useIdFactory(): IdFactory {
  return useDependencies().idFactory;
}

export type { AppContextValue, StudioView };
