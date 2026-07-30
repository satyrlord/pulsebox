import { useId } from "react";

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

const TRACK_HEIGHT = 120;
const CAP_HEIGHT = 18;

/**
 * A vertical fader. Shares the whole gesture contract with the knob — drag,
 * wheel, arrows, Home/End, double-click reset, Escape cancel, and one commit per
 * gesture — so both controls produce exactly one undo entry per movement.
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
    dragRange: TRACK_HEIGHT,
  });
  /** Scoped so several faders in one strip cannot share a paint server. */
  const capGradientId = useId();

  const fraction = max === min ? 0 : (displayValue - min) / (max - min);
  const travel = TRACK_HEIGHT - CAP_HEIGHT;
  const capY = travel - fraction * travel;
  const formatted = formatValue(displayValue).toFixed(precision);
  const text = `${formatted}${unit === undefined ? "" : ` ${unit}`}`;

  return (
    <div className={styles.fader} data-component="fader" data-disabled={disabled}>
      <div
        ref={wheelRef}
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
        <svg
          viewBox={`0 0 32 ${String(TRACK_HEIGHT)}`}
          width={32}
          height={TRACK_HEIGHT}
          aria-hidden="true"
          focusable="false"
        >
          {/* The machined silver block is the strongest highlight on the strip,
              so its shading is a real paint server rather than a flat fill. */}
          <defs>
            <linearGradient id={capGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cap-hi)" />
              <stop offset="22%" stopColor="var(--cap-hi)" />
              <stop offset="58%" stopColor="var(--cap-lo)" />
              <stop offset="100%" stopColor="var(--metal-cap-bot)" />
            </linearGradient>
          </defs>
          <rect className={styles.slot} x={14} y={2} width={4} height={TRACK_HEIGHT - 4} rx={2} />
          <rect
            className={styles.filled}
            x={14}
            y={capY + CAP_HEIGHT / 2}
            width={4}
            height={Math.max(0, TRACK_HEIGHT - 2 - (capY + CAP_HEIGHT / 2))}
            rx={2}
          />
          <g transform={`translate(0 ${String(capY)})`}>
            <rect
              className={styles.cap}
              x={4}
              y={0}
              width={24}
              height={CAP_HEIGHT}
              rx={2.5}
              fill={`url(#${capGradientId})`}
            />
            <rect
              className={styles.capGroove}
              x={5}
              y={CAP_HEIGHT / 2 - 2}
              width={22}
              height={4}
              rx={1}
            />
            <line
              className={styles.capLine}
              x1={7}
              y1={CAP_HEIGHT / 2}
              x2={25}
              y2={CAP_HEIGHT / 2}
            />
          </g>
        </svg>
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
