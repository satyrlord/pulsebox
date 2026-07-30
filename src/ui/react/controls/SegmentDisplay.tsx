import { cx } from "../class-names";
import styles from "./SegmentDisplay.module.css";

export interface SegmentDisplayProps {
  /** Full accessible name for the readout. */
  readonly label: string;
  /** The main reading, drawn large in the LCD ink. */
  readonly primary: string;
  /** An optional supporting reading under the main one. */
  readonly secondary?: string | undefined;
  /** Test hook carried as `data-field` on the readout. */
  readonly fieldId?: string | undefined;
  /** Sizes and places the pane for its owner region. */
  readonly className?: string | undefined;
}

/**
 * The shared LCD readout, spec-003 section 10. A dark glass pane in a deep
 * recess showing one primary reading and an optional secondary reading. The
 * element is an `output`, so assistive technology reads it as a live result.
 */
export function SegmentDisplay(props: SegmentDisplayProps) {
  return (
    <output
      className={cx(styles.display, props.className)}
      data-component="segment-display"
      data-field={props.fieldId}
      aria-label={props.label}
    >
      <strong className={styles.primary}>{props.primary}</strong>
      {props.secondary === undefined ? null : (
        <span className={styles.secondary}>{props.secondary}</span>
      )}
    </output>
  );
}
