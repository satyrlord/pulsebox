import { createContext, useContext } from "react";
import { useStore } from "zustand";

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

export type { AppContextValue, StudioView };
