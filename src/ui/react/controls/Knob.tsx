import { useCallback, useId, useMemo, useRef } from "react";

import type { GestureId } from "../../../contracts";
import { cx } from "../class-names";
import styles from "./Knob.module.css";
import { Tooltip } from "./Tooltip";
import { automationShortcut } from "./automation-shortcut";
import { useRangeGesture } from "./use-range-gesture";
import { ValuePopover } from "./ValuePopover";

export interface KnobProps {
  readonly controlId: string;
  readonly label: string;
  /** Short help text for the control and its related controls. */
  readonly description?: string | undefined;
  /**
   * Engraved caption when the accessible name is too long for the panel, as on
   * a mixer strip where the name must still say which channel it belongs to.
   */
  readonly caption?: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly unit?: string | undefined;
  readonly precision?: number;
  readonly formatValue?: (value: number) => number;
  readonly parseValue?: (value: number) => number;
  readonly displayMin?: number;
  readonly displayMax?: number;
  readonly displayStep?: number;
  readonly disabled?: boolean;
  readonly onInput: (value: number) => void;
  readonly onCommit: (value: number, gestureId: GestureId) => void;
  /** Arms this control as the active Piano Roll lane. */
  readonly onAutomate?: () => void;
}

/** Degrees of dial travel. A real panel knob does not turn a full circle. */
const SWEEP = 270;
const START_ANGLE = -135;
const RADIUS = 16;
const CENTRE = 22;
/** Engraved travel marks outside the value arc, as on a panel knob. */
const TICK_COUNT = 9;
const TICK_INNER = 18.5;
const TICK_OUTER = 20.5;

function polar(angleDegrees: number, radius: number): { x: number; y: number } {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return { x: CENTRE + radius * Math.cos(radians), y: CENTRE + radius * Math.sin(radians) };
}

/**
 * The tick ring is fixed geometry, so it is built once rather than on every
 * value change.
 */
const TICKS = Array.from({ length: TICK_COUNT }, (_, index) => {
  const angle = START_ANGLE + (index / (TICK_COUNT - 1)) * SWEEP;
  const inner = polar(angle, TICK_INNER);
  const outer = polar(angle, TICK_OUTER);
  return {
    key: index,
    x1: inner.x.toFixed(2),
    y1: inner.y.toFixed(2),
    x2: outer.x.toFixed(2),
    y2: outer.y.toFixed(2),
  };
});

function arcPath(fromDegrees: number, toDegrees: number): string {
  const start = polar(fromDegrees, RADIUS);
  const end = polar(toDegrees, RADIUS);
  const large = Math.abs(toDegrees - fromDegrees) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function Knob(props: KnobProps) {
  const {
    controlId,
    label,
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
    disabled,
  } = props;
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
  const automation = automationShortcut(props.onAutomate);
  /** Scoped so several knobs on one plate cannot share a paint server. */
  const domeId = useId();

  // The dial is both the wheel target and the tooltip anchor. `wheelRef` is a
  // callback ref, so the element is captured here as well rather than replacing
  // it.
  const dialRef = useRef<HTMLDivElement | null>(null);
  const setDial = useCallback(
    (element: HTMLDivElement | null) => {
      dialRef.current = element;
      if (disabled !== true) wheelRef(element);
    },
    [wheelRef, disabled],
  );

  const fraction = max === min ? 0 : (displayValue - min) / (max - min);
  const angle = START_ANGLE + fraction * SWEEP;
  const pointer = useMemo(() => ({ from: polar(angle, 3), to: polar(angle, RADIUS - 4) }), [angle]);
  const formatted = formatValue(displayValue).toFixed(precision);
  const text = unit === undefined ? formatted : `${formatted} ${unit}`;
  const title = props.description === undefined ? text : `${text}. ${props.description}`;

  // The default marker sits with the tick ring, spec-003 section 22.1, so the
  // double-click reset target is visible before the first adjustment.
  const defaultFraction = max === min ? 0 : (defaultValue - min) / (max - min);
  const defaultAngle = START_ANGLE + defaultFraction * SWEEP;
  const defaultMark = useMemo(
    () => ({ from: polar(defaultAngle, TICK_INNER - 1.5), to: polar(defaultAngle, TICK_OUTER + 1) }),
    [defaultAngle],
  );

  return (
    <div
      className={styles.knob}
      data-parameter={controlId}
      data-component="knob"
      data-adjusting={adjusting}
      data-disabled={disabled === true ? true : undefined}
    >
      <div
        ref={setDial}
        role="slider"
        tabIndex={disabled === true ? -1 : 0}
        aria-label={label}
        aria-valuemin={displayMin}
        aria-valuemax={displayMax}
        aria-valuenow={formatValue(displayValue)}
        aria-valuetext={text}
        aria-description={props.description}
        aria-disabled={disabled === true ? true : undefined}
        aria-keyshortcuts={automation.ariaKeyShortcuts}
        title={title}
        className={cx(styles.dial, dragging && styles.dragging)}
        onPointerDown={disabled === true ? undefined : onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={
          disabled === true
            ? undefined
            : (event) => {
                if (automation.onKeyDown(event)) return;
                onKeyDown(event);
              }
        }
        onContextMenu={props.onAutomate === undefined ? undefined : automation.onContextMenu}
        onKeyUp={onKeyUp}
        onBlur={onBlur}
        onDoubleClick={disabled === true ? undefined : onDoubleClick}
      >
        <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false" className={styles.face}>
          <g className={styles.ticks}>
            {TICKS.map((tick) => (
              <line key={tick.key} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} />
            ))}
          </g>
          <line
            className={styles.defaultMark}
            data-part="default-marker"
            x1={defaultMark.from.x.toFixed(2)}
            y1={defaultMark.from.y.toFixed(2)}
            x2={defaultMark.to.x.toFixed(2)}
            y2={defaultMark.to.y.toFixed(2)}
          />
          <path className={styles.track} d={arcPath(START_ANGLE, START_ANGLE + SWEEP)} />
          {fraction > 0 ? (
            <path className={styles.fill} data-part="value" d={arcPath(START_ANGLE, angle)} />
          ) : null}
          {/* The inner cap face. It carries contract surface and border tokens,
              which is what lets the high-contrast overlay reach the control
              rather than stopping at the page behind it. It stays the first
              circle in the SVG: the theme checks sample it by position. */}
          <circle className={styles.cap} cx={CENTRE} cy={CENTRE} r={9.5} />
          <defs>
            <radialGradient id={domeId} cx="38%" cy="30%" r="78%">
              <stop
                offset="0%"
                stopColor="var(--pulse-color-text-primary, #f3f5f6)"
                stopOpacity="0.16"
              />
              <stop
                offset="34%"
                stopColor="var(--pulse-color-text-primary, #f3f5f6)"
                stopOpacity="0.03"
              />
              <stop
                offset="72%"
                stopColor="var(--pulse-color-surface-inset, #080a0c)"
                stopOpacity="0.2"
              />
              <stop
                offset="100%"
                stopColor="var(--pulse-color-surface-inset, #080a0c)"
                stopOpacity="0.45"
              />
            </radialGradient>
          </defs>
          <circle
            className={styles.capShade}
            cx={CENTRE}
            cy={CENTRE}
            r={9.5}
            fill={`url(#${domeId})`}
          />
          <line
            className={styles.pointer}
            x1={pointer.from.x.toFixed(2)}
            y1={pointer.from.y.toFixed(2)}
            x2={pointer.to.x.toFixed(2)}
            y2={pointer.to.y.toFixed(2)}
          />
        </svg>
      </div>
      <span className={styles.label}>{props.caption ?? label}</span>
      {adjusting ? (
        <Tooltip anchorRef={dialRef} className={styles.tooltip}>
          {text}
        </Tooltip>
      ) : null}
      {/*
       * Direct numeric entry, spec-003 section 22.1. The field is revealed by
       * keyboard focus rather than by hover: the browser's own `title` tooltip
       * on the dial already reports the value under the pointer, and a second
       * floating chip only competed with it.
       */}
      <div className={styles.value}>
        <ValuePopover
          id={readoutId}
          label={`${label} value`}
          value={formatted}
          min={displayMin}
          max={displayMax}
          step={displayStep}
          disabled={disabled}
          onCommit={(next) => {
            setFromNumeric(parseValue(next));
          }}
        />
      </div>
    </div>
  );
}
