import { useCallback, useEffect, useRef } from "react";

import { createGestureId, type GestureId } from "../../../contracts";
import { useIdFactory } from "../store/app-store-context";

export interface ContinuousGestureHandles {
  /**
   * The ID for the gesture in progress, creating one on first use. Every command
   * dispatched during one drag or key repeat carries the same ID, which is what
   * collapses the movement into a single undo entry.
   */
  readonly current: () => GestureId;
  /**
   * Ends the gesture in progress, if one exists. Wheel adjustment has no
   * release event, so a wheel listener calls this after an idle delay.
   */
  readonly end: () => void;
  /** Handlers to spread onto a native range input. */
  readonly handlers: {
    readonly onPointerDown: () => void;
    readonly onPointerUp: () => void;
    readonly onPointerCancel: () => void;
    readonly onKeyUp: () => void;
    readonly onBlur: () => void;
  };
}

/**
 * Gesture identity for a native range input.
 *
 * `useRangeGesture` owns this for the custom knob and fader, which render their
 * own surface. A native `<input type="range">` already handles pointer and
 * keyboard interaction and its own accessibility, so it only needs the gesture
 * boundary: without one, every intermediate value the browser emits during a
 * single drag becomes its own undo entry.
 *
 * Only gesture *ends* clear the ID. Key repeat during a held arrow key emits
 * many `keydown` events for one continuous adjustment, so the boundary is
 * `keyup`, and pointer-down starts a gesture rather than ending one.
 */
export function useContinuousGesture(): ContinuousGestureHandles {
  const idFactory = useIdFactory();
  const gestureId = useRef<GestureId | undefined>(undefined);

  const current = useCallback((): GestureId => {
    gestureId.current ??= createGestureId(idFactory);
    return gestureId.current;
  }, [idFactory]);

  const end = useCallback(() => {
    gestureId.current = undefined;
  }, []);

  const begin = useCallback(() => {
    gestureId.current = createGestureId(idFactory);
  }, [idFactory]);

  // A pointer released outside the control still ends the gesture, so the next
  // movement cannot be folded into the previous undo entry.
  useEffect(() => {
    const listeners = new AbortController();
    window.addEventListener("pointerup", end, { signal: listeners.signal });
    window.addEventListener("pointercancel", end, { signal: listeners.signal });
    window.addEventListener("blur", end, { signal: listeners.signal });
    return () => {
      listeners.abort();
      end();
    };
  }, [end]);

  return {
    current,
    end,
    handlers: {
      onPointerDown: begin,
      onPointerUp: end,
      onPointerCancel: end,
      onKeyUp: end,
      onBlur: end,
    },
  };
}
