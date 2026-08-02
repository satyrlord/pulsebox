import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { cx } from "../class-names";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  /**
   * The control the bubble reports on. The bubble centres over this element's
   * top edge, so it tracks a fader cap or a dial wherever the layout puts it.
   */
  readonly anchorRef: RefObject<HTMLElement | null>;
  /** Tints the bubble for its owner control. */
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

/** Clearance between the anchor's top edge and the bottom of the bubble. */
const OFFSET = 6;
/** Keeps the bubble off the viewport edges when a control sits near one. */
const MARGIN = 4;

/**
 * The shared adjustment tooltip, spec-003 section 22. An owner control renders
 * it only while a gesture is active. The bubble never takes the pointer, so it
 * cannot interrupt the gesture it reports.
 *
 * It is positioned against the viewport rather than against the owner's box.
 * The rack module packs its controls into horizontal scrollers, and CSS
 * resolves `overflow-y: visible` back to `auto` whenever the other axis
 * scrolls, so a bubble laid out inside that box would be cut off at the panel
 * edge however it were stacked. Fixed positioning takes it out of every
 * clipping ancestor, which is the same escape the popup menu makes.
 */
export function Tooltip(props: TooltipProps) {
  const { anchorRef } = props;
  const bubbleRef = useRef<HTMLOutputElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // The bubble is measured after paint because its width follows the value text.
  // Re-measuring on content change keeps it centred as the reading grows.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (anchor === null || bubble === null) return;

    const update = () => {
      const box = anchor.getBoundingClientRect();
      const self = bubble.getBoundingClientRect();
      const left = Math.min(
        Math.max(MARGIN, box.left + box.width / 2 - self.width / 2),
        Math.max(MARGIN, window.innerWidth - self.width - MARGIN),
      );
      // Near the top of the viewport the bubble flips below the control rather
      // than sliding under the window edge where it would be unreadable.
      const above = box.top - self.height - OFFSET;
      const top = above < MARGIN ? box.bottom + OFFSET : above;
      setPosition({ left, top });
    };

    update();
    // Capture phase: the rack and the module scrollers scroll, not the window.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, props.children]);

  return (
    <output
      ref={bubbleRef}
      className={cx(styles.tooltip, props.className)}
      role="tooltip"
      data-component="tooltip"
      // Hidden until measured, so the bubble never flashes at the origin.
      style={
        position === null
          ? { visibility: "hidden" }
          : { left: `${String(position.left)}px`, top: `${String(position.top)}px` }
      }
    >
      {props.children}
    </output>
  );
}
