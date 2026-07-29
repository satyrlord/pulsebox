import { cx } from "../class-names";
import styles from "./Toggle.module.css";

export interface ToggleProps {
  readonly label: string;
  readonly pressed: boolean;
  readonly onToggle: () => void;
  /** Short face text, e.g. "M" or "S". Falls back to the label. */
  readonly caption?: string;
  readonly tone?: "neutral" | "warn" | "accent";
  readonly disabled?: boolean;
}

/**
 * A latching button reporting state through `aria-pressed`. State is carried by
 * the pressed ring and caption weight as well as colour, so it never reads by
 * colour alone.
 */
export function Toggle({
  label,
  pressed,
  onToggle,
  caption,
  tone = "neutral",
  disabled = false,
}: ToggleProps) {
  return (
    <button
      type="button"
      className={cx(styles.toggle, styles[tone], pressed && styles.pressed)}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
    >
      <span aria-hidden="true">{caption ?? label}</span>
    </button>
  );
}
