import { useEffect, useRef } from "react";

import styles from "./LevelMeter.module.css";

export interface LevelMeterProps {
  readonly label: string;
  /** Latest peak from the audio thread, 0 to 1. */
  readonly level: number;
  readonly width?: number;
  readonly height?: number;
  readonly orientation?: "vertical" | "horizontal";
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
  const { label, level, width = 8, height = 64, orientation = "vertical" } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetLevel = useRef(0);
  const wakeRef = useRef<(() => void) | undefined>(undefined);
  const clamped = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;

  // The animation loop reads the latest level without re-rendering, which is
  // the whole point of drawing meters on a canvas rather than in the DOM. It
  // parks itself once the display reaches zero, so a stopped transport costs no
  // frames; a new level restarts it.
  useEffect(() => {
    targetLevel.current = clamped;
    if (clamped > 0) wakeRef.current?.();
  }, [clamped]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    let frame = 0;
    let previous = 0;
    let bar = 0;
    let peak = 0;
    let running = true;
    let idle = false;

    // Resolving custom properties forces a style recalculation, so the theme
    // colours are read once and refreshed only when the theme actually changes
    // rather than on every one of sixty frames a second.
    let palette = {
      track: "#20262b",
      low: "#62d28a",
      mid: "#f2c14e",
      high: "#ff7667",
      peak: "#ffffff",
    };
    let levelFill: CanvasGradient;
    const readPalette = () => {
      const style = getComputedStyle(canvas);
      palette = {
        track: style.getPropertyValue("--pulse-color-meter-track").trim() || "#20262b",
        low: style.getPropertyValue("--pulse-color-meter-low").trim() || "#62d28a",
        mid: style.getPropertyValue("--pulse-color-meter-mid").trim() || "#f2c14e",
        high: style.getPropertyValue("--pulse-color-meter-high").trim() || "#ff7667",
        peak: style.getPropertyValue("--pulse-color-text-primary").trim() || "#ffffff",
      };
      levelFill =
        orientation === "horizontal"
          ? context.createLinearGradient(0, 0, canvas.width, 0)
          : context.createLinearGradient(0, canvas.height, 0, 0);
      levelFill.addColorStop(0, palette.low);
      levelFill.addColorStop(0.72, palette.low);
      levelFill.addColorStop(0.86, palette.mid);
      levelFill.addColorStop(1, palette.high);
    };
    readPalette();

    // The theme service swaps tokens on the document element, so observing its
    // attributes is what tells the meter its colours are stale.
    const themeObserver = new MutationObserver(readPalette);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class", "style", "data-theme", "data-contrast"],
    });

    const draw = (timestamp: number) => {
      if (!running) return;
      const elapsed = previous === 0 ? 0 : (timestamp - previous) / 1_000;
      previous = timestamp;

      const target = targetLevel.current;
      bar = target >= bar ? target : Math.max(target, bar - BAR_RELEASE_PER_SECOND * elapsed);
      peak = bar >= peak ? bar : Math.max(bar, peak - PEAK_RELEASE_PER_SECOND * elapsed);

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = palette.track;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.fillStyle = levelFill;
      if (orientation === "horizontal") {
        const barWidth = Math.round(canvas.width * bar);
        context.fillRect(0, 0, barWidth, canvas.height);
      } else {
        const barHeight = Math.round(canvas.height * bar);
        context.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);
      }

      if (peak > 0) {
        context.fillStyle = palette.peak;
        if (orientation === "horizontal") {
          const peakX = Math.round(canvas.width * peak);
          context.fillRect(Math.max(0, peakX - 1), 0, 2, canvas.height);
        } else {
          const peakY = Math.round(canvas.height * (1 - peak));
          context.fillRect(0, Math.max(0, peakY - 1), canvas.width, 2);
        }
      }

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
    wakeRef.current = wake;
    frame = requestAnimationFrame(draw);

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
      previous = 0;
      idle = false;
      frame = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      wakeRef.current = undefined;
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [height, orientation, width]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.meter}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(clamped.toFixed(2))}
      data-component="level-meter"
      data-orientation={orientation}
      style={{ width: `${String(width)}px`, height: `${String(height)}px` }}
    />
  );
}
