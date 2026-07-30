import { useCallback, useEffect, useRef, useState } from "react";

import type { GestureId } from "../../../contracts";
import { cx } from "../class-names";
import { useRangeGesture } from "./use-range-gesture";
import styles from "./Fader.module.css";

export interface FaderProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly unit?: string;
  readonly precision?: number;
  readonly formatValue?: (value: number) => number;
  readonly parseValue?: (value: number) => number;
  readonly displayMin?: number;
  readonly displayMax?: number;
  readonly displayStep?: number;
  readonly disabled?: boolean;
  readonly onInput?: (value: number) => void;
  readonly onCommit: (value: number, gestureId: GestureId) => void;
}

/** The machined fader cap height in CSS pixels. */
const CAP_HEIGHT = 28;
/**
 * Pointer resolution floor, in CSS pixels for the full range. A mixer well is
 * shorter than this, so a raw one-to-one mapping would make a small drag cross
 * most of a 60 dB fader. The cap then leads the pointer inside a short well,
 * which is the correct trade: a level a user cannot set finely is worse than a
 * cap that travels faster than the hand.
 */
const MINIMUM_DRAG_RANGE = 120;

/**
 * A vertical fader. Shares the whole gesture contract with the knob — drag,
 * wheel, arrows, Home/End, double-click reset, Escape cancel, and one commit per
 * gesture — so both controls produce exactly one undo entry per movement.
 *
 * The control stretches to the height of its well. Fraction positions the
 * travel line and cap. Measured travel sets the pointer-drag resolution floor.
 */
export function Fader({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  unit,
  precision = 2,
  formatValue = (next) => next,
  parseValue = (next) => next,
  displayMin = min,
  displayMax = max,
  displayStep = step,
  disabled = false,
  onInput,
  onCommit,
}: FaderProps) {
  const [dragRange, setDragRange] = useState(120);
  const {
    displayValue,
    dragging,
    adjusting,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeyDown,
    onKeyUp,
    onBlur,
    onDoubleClick,
    setFromNumeric,
    wheelRef,
  } = useRangeGesture({
    value,
    min,
    max,
    step,
    defaultValue,
    onInput: onInput ?? (() => undefined),
    onCommit,
    dragRange,
  });

  // The surface is measured so a taller well lengthens the drag rather than
  // making the pointer outrun the cap. A well shorter than the resolution floor
  // keeps the floor. The observer disconnects with the control, leaving no live
  // resource behind.
  const observerRef = useRef<ResizeObserver | undefined>(undefined);
  useEffect(() => () => observerRef.current?.disconnect(), []);
  const surfaceRef = useCallback(
    (element: HTMLElement | null) => {
      wheelRef(disabled ? null : element);
      observerRef.current?.disconnect();
      observerRef.current = undefined;
      if (element === null) return;
      const observer = new ResizeObserver((entries) => {
        const measured = entries[0]?.contentRect.height ?? 0;
        setDragRange(Math.max(MINIMUM_DRAG_RANGE, Math.round(measured - CAP_HEIGHT)));
      });
      observer.observe(element);
      observerRef.current = observer;
    },
    [disabled, wheelRef],
  );

  const fraction = max === min ? 0 : (displayValue - min) / (max - min);
  const formatted = formatValue(displayValue).toFixed(precision);
  const text = `${formatted}${unit === undefined ? "" : ` ${unit}`}`;
  const capOffset = `calc(${fraction.toFixed(4)} * (100% - ${String(CAP_HEIGHT)}px))`;

  return (
    <div className={styles.fader} data-component="fader" data-disabled={disabled}>
      <div
        ref={surfaceRef}
        className={cx(styles.surface, dragging && styles.dragging)}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={displayValue}
        aria-valuetext={text}
        aria-orientation="vertical"
        aria-disabled={disabled ? true : undefined}
        title={text}
        onPointerDown={disabled ? undefined : onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={disabled ? undefined : onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={onBlur}
        onDoubleClick={disabled ? undefined : onDoubleClick}
      >
        {/* The well behind the fader is the surface. The control carries only
            the recessed travel line, the lit travelled range, and the cap. */}
        <span className={styles.track} data-part="track" aria-hidden="true" />
        <span
          className={styles.fill}
          aria-hidden="true"
          style={{ blockSize: `calc(${capOffset} + ${String(CAP_HEIGHT / 2 - 4)}px)` }}
        />
        <span className={styles.cap} aria-hidden="true" style={{ insetBlockEnd: capOffset }}>
          <span className={styles.capGroove} />
        </span>
      </div>
      <span className={styles.label}>{label}</span>
      {adjusting ? (
        <output className={styles.tooltip} role="tooltip">
          {text}
        </output>
      ) : null}
      <input
        key={formatted}
        className={styles.readout}
        type="number"
        aria-label={`${label} value`}
        defaultValue={formatted}
        min={displayMin}
        max={displayMax}
        step={displayStep}
        disabled={disabled}
        inputMode="decimal"
        onBlur={(event) => {
          setFromNumeric(parseValue(event.currentTarget.valueAsNumber));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.value = formatted;
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
