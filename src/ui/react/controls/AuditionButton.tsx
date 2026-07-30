import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface AuditionButtonProps {
  readonly label: string;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

/** Momentary press-and-hold control shared by pointer and keyboard input. */
export function AuditionButton({
  label,
  className,
  children,
  disabled = false,
  onStart,
  onStop,
}: AuditionButtonProps) {
  const held = useRef(false);
  const [active, setActive] = useState(false);

  const start = useCallback(() => {
    if (held.current) return;
    held.current = true;
    setActive(true);
    onStart();
  }, [onStart]);

  const stop = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    setActive(false);
    onStop();
  }, [onStop]);

  useEffect(() => {
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("blur", stop);
      stop();
    };
  }, [stop]);

  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  return (
    <button
      type="button"
      className={className}
      aria-label={`${label} audition`}
      data-active={active}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const target = event.currentTarget as unknown as {
          setPointerCapture?: (pointerId: number) => void;
        };
        target.setPointerCapture?.(event.pointerId);
        start();
      }}
      onPointerUp={(event) => {
        const target = event.currentTarget as unknown as {
          hasPointerCapture?: (pointerId: number) => boolean;
          releasePointerCapture?: (pointerId: number) => void;
        };
        if (target.hasPointerCapture?.(event.pointerId)) {
          target.releasePointerCapture?.(event.pointerId);
        }
        stop();
      }}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        stop();
      }}
      onBlur={stop}
    >
      {/* The engraved pad is short so the faceplate stays dense. The visible
          word is still contained in the accessible name above. */}
      {children === undefined ? "Aud" : children}
    </button>
  );
}
