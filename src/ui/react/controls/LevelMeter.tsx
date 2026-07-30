import { useEffect, useRef } from "react";

import styles from "./LevelMeter.module.css";

export interface LevelMeterProps {
  readonly label: string;
  /** Latest peak from the audio thread, 0 to 1. */
  readonly level: number;
  readonly width?: number;
  readonly height?: number;
  readonly orientation?: "vertical" | "horizontal";
  readonly hiddenFromAssistiveTechnology?: boolean;
  /**
   * Fill the block size the layout grants instead of the fixed height, resizing
   * the backing bitmap to match, so the ladder spans a fluid channel well.
   */
  readonly stretch?: boolean;
  /**
   * The source can never report a level, as on an empty channel. The ladder
   * still draws its unlit cells, so the strip keeps its silhouette, but it
   * takes no frame loop and no theme or size observer.
   */
  readonly inert?: boolean;
}

/** Peak hold, then release, in level units per second. */
const PEAK_RELEASE_PER_SECOND = 0.55;
const BAR_RELEASE_PER_SECOND = 2.4;

/**
 * The one place Canvas earns its place: a per-frame bar that would otherwise
 * churn the DOM 60 times a second. React renders the element once and never
 * re-renders for level changes; the animation loop owns the pixels.
 */
export function LevelMeter(props: LevelMeterProps) {
  const {
    label,
    level,
    width = 8,
    height = 64,
    orientation = "vertical",
    stretch = false,
    hiddenFromAssistiveTechnology = false,
    inert = false,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetLevel = useRef(0);
  const wakeRef = useRef<(() => void) | undefined>(undefined);
  const clamped = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;

  // The animation loop reads the latest level without re-rendering, which is
  // the whole point of drawing meters on a canvas rather than in the DOM. It
  // parks itself once the display reaches zero, so a stopped transport costs no
  // frames; a new level restarts it.
  useEffect(() => {
    if (inert) return;
    targetLevel.current = clamped;
    if (clamped > 0) wakeRef.current?.();
  }, [clamped, inert]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;

    const ratio = window.devicePixelRatio || 1;
    const setBackingSize = (cssWidth: number, cssHeight: number): boolean => {
      const backingWidth = Math.max(1, Math.round(cssWidth * ratio));
      const backingHeight = Math.max(1, Math.round(cssHeight * ratio));
      if (canvas.width === backingWidth && canvas.height === backingHeight) return false;
      canvas.width = backingWidth;
      canvas.height = backingHeight;
      return true;
    };
    setBackingSize(width, height);

    let frame = 0;
    let previous = 0;
    let bar = 0;
    let peak = 0;
    let running = true;
    let idle = false;

    // Resolving custom properties forces a style recalculation, so the theme
    // colors are read once and refreshed only when the theme actually changes
    // rather than on every one of sixty frames a second.
    let palette = {
      track: "#20262b",
      low: "#62d28a",
      mid: "#f2c14e",
      high: "#ff7667",
      top: "#ff8178",
      peak: "#ffffff",
    };
    const readPalette = () => {
      const style = getComputedStyle(canvas);
      palette = {
        track: style.getPropertyValue("--pulse-color-meter-track").trim() || "#20262b",
        low: style.getPropertyValue("--pulse-color-meter-low").trim() || "#62d28a",
        mid: style.getPropertyValue("--pulse-color-meter-mid").trim() || "#f2c14e",
        high: style.getPropertyValue("--pulse-color-meter-high").trim() || "#ff7667",
        top: style.getPropertyValue("--pulse-color-status-danger").trim() || "#ff8178",
        peak: style.getPropertyValue("--pulse-color-text-primary").trim() || "#ffffff",
      };
    };
    readPalette();

    /* Low fills most of the ladder. Mid, high, and danger occupy the last cells. */
    const cellColor = (fractionOfLadder: number): string =>
      fractionOfLadder < 0.78
        ? palette.low
        : fractionOfLadder < 0.9
          ? palette.mid
          : fractionOfLadder < 0.96
            ? palette.high
            : palette.top;

    const draw = (timestamp: number) => {
      if (!running) return;
      const elapsed = previous === 0 ? 0 : (timestamp - previous) / 1_000;
      previous = timestamp;

      const target = targetLevel.current;
      bar = target >= bar ? target : Math.max(target, bar - BAR_RELEASE_PER_SECOND * elapsed);
      peak = bar >= peak ? bar : Math.max(bar, peak - PEAK_RELEASE_PER_SECOND * elapsed);

      /* Cells are laid out in CSS pixels; the transform maps them onto the
         high-DPI backing store, so a 2px cell stays a 2px cell. */
      const cssWidth = canvas.width / ratio;
      const cssHeight = canvas.height / ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);

      if (orientation === "horizontal") {
        /* Horizontal ladders use 4px cells on a 6px pitch. */
        const segments = Math.floor(cssWidth / 6);
        const lit = Math.round(segments * bar);
        const held = Math.min(segments - 1, Math.round(segments * peak) - 1);
        for (let index = 0; index < segments; index += 1) {
          const on = index < lit;
          const color = cellColor(index / segments);
          context.shadowBlur = on ? 4 : 0;
          context.shadowColor = on ? color : "transparent";
          context.fillStyle = on ? color : palette.track;
          context.fillRect(index * 6 + 1, 2, 4, Math.max(1, cssHeight - 4));
        }
        if (held > lit - 1 && held >= 0) {
          context.shadowBlur = 0;
          context.shadowColor = "transparent";
          context.fillStyle = palette.peak;
          context.fillRect(held * 6 + 1, 2, 4, Math.max(1, cssHeight - 4));
        }
      } else {
        /* Vertical ladders use fine 2px cells on a 3px pitch. The lit column
           and the unlit ladder share the bottom baseline. */
        const padTop = 2;
        const padBottom = 2;
        const segments = Math.floor((cssHeight - padTop - padBottom) / 3);
        const lit = Math.round(segments * bar);
        const held = Math.min(segments - 1, Math.round(segments * peak) - 1);
        const segmentY = (index: number) => cssHeight - padBottom - (index + 1) * 3 + 1;
        context.shadowBlur = 0;
        context.shadowColor = "transparent";
        context.fillStyle = palette.track;
        for (let index = lit; index < segments; index += 1) {
          context.fillRect(1, segmentY(index), cssWidth - 2, 2);
        }
        for (let index = 0; index < lit; index += 1) {
          const color = cellColor(index / segments);
          context.shadowBlur = 4;
          context.shadowColor = color;
          context.fillStyle = color;
          context.fillRect(1, segmentY(index), cssWidth - 2, 2);
        }
        if (held > lit - 1 && held >= 0) {
          context.shadowBlur = 0;
          context.shadowColor = "transparent";
          context.fillStyle = palette.peak;
          context.fillRect(1, segmentY(held), cssWidth - 2, 2);
        }
      }
      context.shadowBlur = 0;
      context.shadowColor = "transparent";

      // Nothing left to animate once the bar and its peak have both settled at
      // the current level. The next level change restarts the loop.
      if (bar <= 0 && peak <= 0 && target <= 0) {
        frame = 0;
        idle = true;
        return;
      }
      frame = requestAnimationFrame(draw);
    };

    const wake = () => {
      if (!running || !idle || document.hidden) return;
      idle = false;
      previous = 0;
      frame = requestAnimationFrame(draw);
    };
    /* Repaint the unlit ladder against the current backing size and palette.
       `draw` parks itself at zero level, so this is one frame, not a loop. */
    const repaint = () => {
      previous = 0;
      idle = false;
      frame = requestAnimationFrame(draw);
    };

    // A stretched ladder follows its well: the observer resizes the backing
    // bitmap and repaints once, so a parked meter does not stay blank after a
    // layout change. It is disconnected with the component below.
    let sizeObserver: ResizeObserver | undefined;
    if (stretch) {
      sizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect === undefined) return;
        if (!setBackingSize(rect.width, rect.height)) return;
        readPalette();
        repaint();
      });
      sizeObserver.observe(canvas);
    }

    // An inert meter reports no level, so it needs no wake path, no theme
    // observer, and no visibility handling. It paints its unlit ladder once and
    // repaints only when its well resizes. Eight empty channels would otherwise
    // each hold a document-level observer for a canvas that never changes.
    if (inert) {
      repaint();
      return () => {
        running = false;
        cancelAnimationFrame(frame);
        sizeObserver?.disconnect();
      };
    }

    wakeRef.current = wake;
    frame = requestAnimationFrame(draw);

    // The theme host changes attributes and inline tokens. Repaint an idle
    // meter immediately so the canvas matches the new resolved palette.
    const themeObserver = new MutationObserver(() => {
      readPalette();
      wake();
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class", "style", "data-theme", "data-high-contrast"],
    });

    // Pausing while hidden keeps a background tab off the main thread. Both this
    // and the frame request are torn down below, so StrictMode's second mount
    // cannot leave a duplicate loop running.
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
        return;
      }
      repaint();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      wakeRef.current = undefined;
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      sizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [height, inert, orientation, stretch, width]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.meter}
      role={hiddenFromAssistiveTechnology ? undefined : "meter"}
      aria-hidden={hiddenFromAssistiveTechnology ? true : undefined}
      aria-label={hiddenFromAssistiveTechnology ? undefined : label}
      aria-valuemin={hiddenFromAssistiveTechnology ? undefined : 0}
      aria-valuemax={hiddenFromAssistiveTechnology ? undefined : 1}
      aria-valuenow={hiddenFromAssistiveTechnology ? undefined : Number(clamped.toFixed(2))}
      data-component="level-meter"
      data-orientation={orientation}
      style={{ width: `${String(width)}px`, height: stretch ? "100%" : `${String(height)}px` }}
    />
  );
}
