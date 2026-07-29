import { useCallback, useEffect, useRef, useState } from "react";

export interface AuditionButtonProps {
  readonly label: string;
  readonly className?: string | undefined;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

/** Momentary press-and-hold control shared by pointer and keyboard input. */
export function AuditionButton({ label, className, onStart, onStop }: AuditionButtonProps) {
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

  return (
    <button
      type="button"
      className={className}
      aria-label={`${label} audition`}
      data-active={active}
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
      Audition
    </button>
  );
}
