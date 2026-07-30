import type { ReactNode } from "react";

import { cx } from "../class-names";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  /** Positions and tints the bubble for its owner control. */
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

/**
 * The shared adjustment tooltip, spec-003 section 22. An owner control renders
 * it only while a gesture is active. The bubble never takes the pointer, so it
 * cannot interrupt the gesture it reports.
 */
export function Tooltip(props: TooltipProps) {
  return (
    <output className={cx(styles.tooltip, props.className)} role="tooltip" data-component="tooltip">
      {props.children}
    </output>
  );
}
