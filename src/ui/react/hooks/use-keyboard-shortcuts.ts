import { useEffect } from "react";

import { useAppContext } from "../store/app-store-context";

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Application shortcuts. Registered once with a single listener that is removed
 * on unmount, so a StrictMode remount cannot double-fire a transport command.
 */
export function useKeyboardShortcuts(): void {
  const { store } = useAppContext();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = store.getState();

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "s") {
          event.preventDefault();
          void state.saveProject();
          return;
        }
        if (key === "z" || key === "y") {
          event.preventDefault();
          const redo = key === "y" || event.shiftKey;
          if (redo) state.redo();
          else state.undo();
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-action="toggle-editor"]')?.click();
        return;
      }

      // An open Settings page owns Escape: closing it must not also stop playback.
      if (event.key === "Escape" && state.settingsOpen) {
        event.preventDefault();
        state.setSettingsOpen(false);
        return;
      }

      if (isTextEntry(event.target)) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (state.project.transport.status === "playing") state.pause();
        else void state.play();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        state.stop();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [store]);
}
