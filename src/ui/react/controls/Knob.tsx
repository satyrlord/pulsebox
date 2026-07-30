import { useId, useMemo } from "react";

import type { GestureId } from "../../../contracts";
import { cx } from "../class-names";
import styles from "./Knob.module.css";
import { useRangeGesture } from "./use-range-gesture";

export interface KnobProps {
  readonly controlId: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly unit?: string | undefined;
  readonly precision?: number;
  readonly disabled?: boolean;
  readonly onInput: (value: number) => void;
  readonly onCommit: (value: number, gestureId: GestureId) => void;
}

/** Degrees of dial travel. A real panel knob does not turn a full circle. */
const SWEEP = 270;
const START_ANGLE = -135;
const RADIUS = 16;
const CENTRE = 22;

function polar(angleDegrees: number, radius: number): { x: number; y: number } {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return { x: CENTRE + radius * Math.cos(radians), y: CENTRE + radius * Math.sin(radians) };
}

function arcPath(fromDegrees: number, toDegrees: number): string {
  const start = polar(fromDegrees, RADIUS);
  const end = polar(toDegrees, RADIUS);
  const large = Math.abs(toDegrees - fromDegrees) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function Knob(props: KnobProps) {
  const { controlId, label, min, max, step, defaultValue, unit, precision = 2, disabled } = props;
  const {
    displayValue,
    dragging,
    adjusting,
    wheelRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeyDown,
    onKeyUp,
    onBlur,
    onDoubleClick,
    setFromNumeric,
  } = useRangeGesture({
    value: props.value,
    min,
    max,
    step,
    defaultValue,
    onInput: props.onInput,
    onCommit: props.onCommit,
  });
  const readoutId = useId();

  const fraction = max === min ? 0 : (displayValue - min) / (max - min);
  const angle = START_ANGLE + fraction * SWEEP;
  const pointer = useMemo(() => polar(angle, RADIUS - 4), [angle]);
  const formatted = displayValue.toFixed(precision);

  return (
    <div className={styles.knob} data-parameter={controlId} data-component="knob">
      <div
        ref={wheelRef}
        role="slider"
        tabIndex={disabled === true ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={displayValue}
        aria-valuetext={unit === undefined ? formatted : `${formatted} ${unit}`}
        aria-describedby={readoutId}
        aria-disabled={disabled === true ? true : undefined}
        title={unit === undefined ? formatted : `${formatted} ${unit}`}
        className={cx(styles.dial, dragging && styles.dragging)}
        onPointerDown={disabled === true ? undefined : onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={disabled === true ? undefined : onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={onBlur}
        onDoubleClick={disabled === true ? undefined : onDoubleClick}
      >
        <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false" className={styles.dial}>
          <path className={styles.track} d={arcPath(START_ANGLE, START_ANGLE + SWEEP)} />
          {fraction > 0 ? <path className={styles.fill} d={arcPath(START_ANGLE, angle)} /> : null}
          <circle className={styles.cap} cx={CENTRE} cy={CENTRE} r={RADIUS - 5} />
          <line
            className={styles.pointer}
            x1={CENTRE}
            y1={CENTRE}
            x2={pointer.x.toFixed(2)}
            y2={pointer.y.toFixed(2)}
          />
        </svg>
      </div>
      <span className={styles.label}>{label}</span>
      {adjusting ? (
        <output className={styles.tooltip} role="tooltip">
          {unit === undefined ? formatted : `${formatted} ${unit}`}
        </output>
      ) : null}
      <input
        key={formatted}
        id={readoutId}
        className={styles.numeric}
        type="number"
        aria-label={`${label} value`}
        defaultValue={formatted}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        inputMode="decimal"
        onBlur={(event) => {
          setFromNumeric(event.currentTarget.valueAsNumber);
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
