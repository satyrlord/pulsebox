import { cx } from "../class-names";
import styles from "./ActivityIndicator.module.css";

interface ActivityStep {
  readonly active: boolean;
}

export interface ActivityIndicatorProps {
  readonly label: string;
  readonly steps: readonly ActivityStep[];
  readonly playingStep: number | undefined;
}

/** A passive play-position display. It deliberately exposes no input handlers. */
export function ActivityIndicator({ label, steps, playingStep }: ActivityIndicatorProps) {
  const position =
    playingStep !== undefined && playingStep >= 0 && playingStep < steps.length
      ? playingStep
      : undefined;
  const producing = position === undefined ? false : steps[position]?.active === true;
  const status =
    position === undefined
      ? `${label}: stopped`
      : `${label}: position ${String(position + 1)}, ${producing ? "event" : "rest"}`;

  return (
    <div
      className={styles.indicator}
      role="img"
      aria-label={status}
      data-component="activity-indicator"
    >
      {steps.map((_, index) => (
        <span
          key={index}
          className={cx(
            styles.cell,
            index === position && styles.current,
            index === position && producing && styles.producing,
          )}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
