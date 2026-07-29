import styles from "./SegmentDisplay.module.css";

export interface SegmentDisplayProps {
  readonly label: string;
  readonly value: string;
  /** Pads with leading figure-space so the width never jitters. */
  readonly width?: number;
}

/**
 * A fixed-width numeric readout. The visible glyphs are decorative padding plus
 * the value; assistive technology reads the unpadded value from the label.
 */
export function SegmentDisplay({ label, value, width }: SegmentDisplayProps) {
  const padded = width === undefined ? value : value.padStart(width, "0");
  return (
    <div className={styles.display}>
      <span className={styles.label}>{label}</span>
      <output className={styles.value} aria-label={`${label} ${value}`}>
        {padded}
      </output>
    </div>
  );
}
