import { useEffect } from "react";

import { createGestureId, type GestureId, type ModuleInstanceId } from "../../../contracts";
import { semitoneOffsetForLiveKeyEvent } from "./live-key-map";
import { useAppContext } from "../store/app-store-context";

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export interface KeyboardShortcutOptions {
  /** Collapses or expands the lower editor, matching the workspace-bar button. */
  readonly toggleEditor: () => void;
}

/**
 * Application shortcuts. Registered as one listener that is removed on unmount,
 * so a StrictMode remount cannot double-fire a transport command.
 */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions): void {
  const { store, dependencies } = useAppContext();
  const { toggleEditor } = options;

  useEffect(() => {
    interface HeldLiveNote {
      readonly moduleId: ModuleInstanceId;
      readonly note: number;
      readonly startedAtTicks: number;
      readonly record: boolean;
      readonly gestureId: GestureId | undefined;
    }
    const held = new Map<string, HeldLiveNote>();
    let activeTakeGesture: GestureId | undefined;
    let endTakeTimer: ReturnType<typeof setTimeout> | undefined;

    const finishTakeWhenIdle = () => {
      if (held.size > 0) return;
      if (endTakeTimer !== undefined) clearTimeout(endTakeTimer);
      endTakeTimer = setTimeout(() => {
        activeTakeGesture = undefined;
        endTakeTimer = undefined;
      }, 180);
    };

    const liveNoteFor = (state: ReturnType<typeof store.getState>, offset: number): {
      readonly moduleId: ModuleInstanceId;
      readonly note: number;
    } | undefined => {
      const moduleId = state.project.ui.selectedModuleId;
      if (moduleId === undefined) return undefined;
      const module = state.project.project.modules[moduleId];
      if (module === undefined) return undefined;
      const manifest = dependencies.manifestFor(module.pluginId);
      const pitched =
        manifest?.kind === "instrument" && manifest.acceptedEvents.some((event) => event.id === "note");
      if (pitched) return { moduleId, note: 48 + offset };
      const voice = manifest?.kind === "instrument" ? manifest.voices[offset % manifest.voices.length] : undefined;
      return {
        moduleId,
        note: dependencies.auditionNoteFor(module.pluginId, voice?.id),
      };
    };

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
        toggleEditor();
        return;
      }

      // An open Settings page owns Escape: closing it must not also stop playback.
      if (event.key === "Escape" && state.settingsOpen) {
        event.preventDefault();
        state.setSettingsOpen(false);
        return;
      }

      if (isTextEntry(event.target)) return;

      const semitoneOffset = semitoneOffsetForLiveKeyEvent(event, state.liveKeyMap);
      if (
        semitoneOffset !== null &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat
      ) {
        const live = liveNoteFor(state, semitoneOffset);
        if (live !== undefined) {
          event.preventDefault();
          if (endTakeTimer !== undefined) {
            clearTimeout(endTakeTimer);
            endTakeTimer = undefined;
          }
          const record = state.project.transport.recordArmed;
          activeTakeGesture ??= record ? createGestureId(dependencies.idFactory) : undefined;
          held.set(event.code, {
            ...live,
            startedAtTicks: state.positionTicks,
            record,
            gestureId: activeTakeGesture,
          });
          state.startAudition(live.moduleId, live.note);
          return;
        }
      }

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

    const finalizeCaptured = (
      captured: HeldLiveNote,
      endedAtTicks: number,
    ) => {
      const state = store.getState();
      state.stopAudition(captured.moduleId);
      if (captured.record && captured.gestureId !== undefined) {
        state.recordLivePatternEvent(
          captured.moduleId,
          captured.note,
          captured.startedAtTicks,
          endedAtTicks,
          captured.gestureId,
        );
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const captured = held.get(event.code);
      if (captured === undefined) return;
      held.delete(event.code);
      event.preventDefault();
      finalizeCaptured(captured, store.getState().positionTicks);
      finishTakeWhenIdle();
    };

    const onBlur = () => {
      const endedAtTicks = store.getState().positionTicks;
      for (const captured of held.values()) finalizeCaptured(captured, endedAtTicks);
      held.clear();
      finishTakeWhenIdle();
    };

    const listeners = new AbortController();
    window.addEventListener("keydown", onKeyDown, { signal: listeners.signal });
    window.addEventListener("keyup", onKeyUp, { signal: listeners.signal });
    window.addEventListener("blur", onBlur, { signal: listeners.signal });
    return () => {
      listeners.abort();
      const endedAtTicks = store.getState().positionTicks;
      for (const captured of held.values()) finalizeCaptured(captured, endedAtTicks);
      held.clear();
      if (endTakeTimer !== undefined) clearTimeout(endTakeTimer);
      activeTakeGesture = undefined;
    };
  }, [dependencies, store, toggleEditor]);
}
