import { useCallback, useEffect, useRef, useState } from "react";

import { browserIdFactory, createGestureId, type GestureId } from "../../../contracts";

export interface RangeGestureOptions {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  /** Fires continuously during a gesture. Preview only: never enters history. */
  readonly onInput: (value: number) => void;
  /** Fires exactly once when a gesture ends, carrying one gesture ID. */
  readonly onCommit: (value: number, gestureId: GestureId) => void;
  /** Pointer travel in CSS pixels for the full range. */
  readonly dragRange?: number;
}

export interface RangeGestureHandles {
  /** Live value, which leads the committed value during a gesture. */
  readonly displayValue: number;
  readonly dragging: boolean;
  readonly adjusting: boolean;
  readonly onPointerDown: (event: React.PointerEvent) => void;
  readonly onPointerMove: (event: React.PointerEvent) => void;
  readonly onPointerUp: (event: React.PointerEvent) => void;
  readonly onPointerCancel: (event: React.PointerEvent) => void;
  readonly onKeyDown: (event: React.KeyboardEvent) => void;
  readonly onKeyUp: (event: React.KeyboardEvent) => void;
  readonly onBlur: () => void;
  readonly onDoubleClick: () => void;
  readonly setFromNumeric: (value: number) => void;
  /**
   * Ref callback that registers a non-passive wheel listener. React's synthetic
   * wheel handler is passive, so it cannot call `preventDefault`.
   */
  readonly wheelRef: (element: HTMLElement | null) => void;
}

const DEFAULT_DRAG_RANGE = 180;
const WHEEL_IDLE_MILLISECONDS = 250;
const LARGE_STEP_MULTIPLIER = 10;

const ADJUSTING_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function quantize(value: number, min: number, max: number, step: number): number {
  if (step <= 0) return clamp(value, min, max);
  const steps = Math.round((value - min) / step);
  // Re-derive from the minimum so repeated adjustment cannot accumulate error.
  const snapped = min + steps * step;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return clamp(Number(snapped.toFixed(decimals)), min, max);
}

/**
 * The shared interaction contract for every continuous control: pointer drag
 * with capture, wheel with a fine modifier, keyboard stepping, double-click
 * reset, and Escape to abandon a gesture. A continuous gesture emits many
 * previews and exactly one commit, which is what keeps one drag to one undo
 * entry.
 */
export function useRangeGesture(options: RangeGestureOptions): RangeGestureHandles {
  const { value, min, max, step, defaultValue, onInput, onCommit } = options;
  const dragRange = options.dragRange ?? DEFAULT_DRAG_RANGE;

  const [displayValue, setDisplayValue] = useState(value);
  const [dragging, setDragging] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const live = useRef(value);
  const beforeGesture = useRef(value);
  const gestureId = useRef<GestureId | undefined>(undefined);
  const pointerId = useRef<number | undefined>(undefined);
  const pointerOrigin = useRef(0);
  const pointerBase = useRef(value);
  const keyboardKey = useRef<string | undefined>(undefined);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ min, max, step, onInput, onCommit });

  useEffect(() => {
    latest.current = { min, max, step, onInput, onCommit };
  });

  // While a gesture is running the control is authoritative, so an incoming
  // committed value must not fight the user's own drag.
  useEffect(() => {
    if (gestureId.current !== undefined) return;
    live.current = value;
    setDisplayValue(value);
  }, [value]);

  const beginGesture = useCallback(() => {
    if (gestureId.current !== undefined) return;
    gestureId.current = createGestureId(browserIdFactory);
    beforeGesture.current = live.current;
    setAdjusting(true);
  }, []);

  const emitInput = useCallback((next: number) => {
    const { min: low, max: high, step: increment, onInput: input } = latest.current;
    const quantized = quantize(next, low, high, increment);
    if (quantized === live.current) return false;
    live.current = quantized;
    setDisplayValue(quantized);
    input(quantized);
    return true;
  }, []);

  const endGesture = useCallback((commit: boolean) => {
    const id = gestureId.current;
    gestureId.current = undefined;
    if (id === undefined) return;
    setAdjusting(false);
    if (commit) {
      // A gesture that moved nothing — a keypress at the limit, a drag that
      // returned to where it started — must not create an undo entry.
      if (live.current !== beforeGesture.current) latest.current.onCommit(live.current, id);
      return;
    }
    // Abandoned: restore the pre-gesture value and tell the engine.
    const restored = beforeGesture.current;
    live.current = restored;
    setDisplayValue(restored);
    latest.current.onInput(restored);
  }, []);

  const cancelWheelTimer = useCallback(() => {
    if (wheelTimer.current === undefined) return;
    clearTimeout(wheelTimer.current);
    wheelTimer.current = undefined;
  }, []);

  const commitActiveGesture = useCallback(() => {
    if (gestureId.current === undefined) return;
    cancelWheelTimer();
    pointerId.current = undefined;
    keyboardKey.current = undefined;
    setDragging(false);
    endGesture(true);
  }, [cancelWheelTimer, endGesture]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerId.current = event.pointerId;
      pointerOrigin.current = event.clientY;
      pointerBase.current = live.current;
      beginGesture();
      setDragging(true);
    },
    [beginGesture],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (pointerId.current !== event.pointerId) return;
      const { min: low, max: high } = latest.current;
      // Upward drag raises the value, which is what a physical knob does.
      const travel = pointerOrigin.current - event.clientY;
      const span = high - low;
      const fine = event.shiftKey ? 0.25 : 1;
      emitInput(pointerBase.current + (travel / dragRange) * span * fine);
    },
    [dragRange, emitInput],
  );

  const finishPointer = useCallback(
    (event: React.PointerEvent) => {
      if (pointerId.current !== event.pointerId) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      pointerId.current = undefined;
      setDragging(false);
      if (keyboardKey.current === undefined && wheelTimer.current === undefined) endGesture(true);
    },
    [endGesture],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (gestureId.current === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        cancelWheelTimer();
        keyboardKey.current = undefined;
        pointerId.current = undefined;
        setDragging(false);
        endGesture(false);
        return;
      }
      if (!ADJUSTING_KEYS.has(event.key)) return;
      event.preventDefault();

      const { min: low, max: high, step: increment } = latest.current;
      const large = increment * LARGE_STEP_MULTIPLIER;
      const current = live.current;
      let next = current;
      if (event.key === "ArrowUp" || event.key === "ArrowRight") next = current + increment;
      if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = current - increment;
      if (event.key === "PageUp") next = current + large;
      if (event.key === "PageDown") next = current - large;
      if (event.key === "Home") next = low;
      if (event.key === "End") next = high;

      keyboardKey.current = event.key;
      beginGesture();
      emitInput(next);
    },
    [beginGesture, cancelWheelTimer, emitInput, endGesture],
  );

  const onKeyUp = useCallback(
    (event: React.KeyboardEvent) => {
      if (keyboardKey.current !== event.key) return;
      keyboardKey.current = undefined;
      // Key repeat is one gesture, so the commit waits for release.
      if (pointerId.current === undefined && wheelTimer.current === undefined) endGesture(true);
    },
    [endGesture],
  );

  const onBlur = useCallback(() => {
    commitActiveGesture();
  }, [commitActiveGesture]);

  const onDoubleClick = useCallback(() => {
    beginGesture();
    emitInput(defaultValue);
    endGesture(true);
  }, [beginGesture, defaultValue, emitInput, endGesture]);

  const setFromNumeric = useCallback(
    (next: number) => {
      if (!Number.isFinite(next)) return;
      beginGesture();
      emitInput(next);
      endGesture(true);
    },
    [beginGesture, emitInput, endGesture],
  );

  // Wheel is registered natively so it can be non-passive and call
  // preventDefault, which React's synthetic handler cannot do.
  const wheelAbort = useRef<AbortController | undefined>(undefined);

  const attachWheel = useCallback(
    (element: HTMLElement | null) => {
      wheelAbort.current?.abort();
      wheelAbort.current = undefined;
      if (element === null) return;
      const listeners = new AbortController();
      const handler = (event: WheelEvent) => {
        event.preventDefault();
        const { step: increment } = latest.current;
        const magnitude = event.shiftKey ? increment : increment * LARGE_STEP_MULTIPLIER;
        const direction = event.deltaY > 0 ? -1 : 1;
        beginGesture();
        emitInput(live.current + direction * magnitude);
        cancelWheelTimer();
        wheelTimer.current = setTimeout(() => {
          wheelTimer.current = undefined;
          if (pointerId.current === undefined && keyboardKey.current === undefined) {
            endGesture(true);
          }
        }, WHEEL_IDLE_MILLISECONDS);
      };
      element.addEventListener("wheel", handler, { passive: false, signal: listeners.signal });
      wheelAbort.current = listeners;
    },
    [beginGesture, cancelWheelTimer, emitInput, endGesture],
  );

  useEffect(() => {
    const listeners = new AbortController();
    window.addEventListener("blur", commitActiveGesture, { signal: listeners.signal });
    return () => {
      listeners.abort();
      cancelWheelTimer();
      wheelAbort.current?.abort();
      wheelAbort.current = undefined;
      // A control may disconnect while a preview is active, for example when a
      // responsive layout replaces the editor. Commit that last valid value so
      // project state and the audio preview cannot diverge.
      pointerId.current = undefined;
      keyboardKey.current = undefined;
      endGesture(true);
    };
  }, [cancelWheelTimer, commitActiveGesture, endGesture]);

  return {
    displayValue,
    dragging,
    adjusting,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishPointer,
    onPointerCancel: finishPointer,
    onKeyDown,
    onKeyUp,
    onBlur,
    onDoubleClick,
    setFromNumeric,
    wheelRef: attachWheel,
  };
}
