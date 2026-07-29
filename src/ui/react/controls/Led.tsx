import styles from "./Led.module.css";

export interface LedProps {
  readonly label: string;
  readonly lit: boolean;
  /**
   * Set when the LED sits inside an already-labelled control, so it does not
   * append its own text to that control's accessible name.
   */
  readonly decorative?: boolean;
}

/**
 * Output-only indicator. It is not focusable and never carries meaning by colour
 * alone: the accessible name states the state in words.
 */
export function Led(props: LedProps) {
  if (props.decorative === true) {
    return <span className={styles.led} data-lit={props.lit} data-component="led" aria-hidden />;
  }
  return (
    <span
      className={styles.led}
      data-lit={props.lit}
      data-component="led"
      role="img"
      aria-label={`${props.label}: ${props.lit ? "active" : "idle"}`}
    />
  );
}
