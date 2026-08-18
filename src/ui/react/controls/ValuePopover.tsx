export interface ValuePopoverProps {
  readonly id?: string | undefined;
  /** Full accessible name for the entry field. */
  readonly label: string;
  /** The formatted committed value the field shows and restores on Escape. */
  readonly value: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly disabled?: boolean | undefined;
  /** Visual treatment comes from the owner: a knob chip or a fader readout. */
  readonly className?: string | undefined;
  readonly onCommit: (value: number) => void;
}

/**
 * Shared direct numeric entry for a continuous control, spec-003 section 22.
 * The field commits on Enter or blur, so a multi-digit value creates one edit.
 * Escape restores the committed value without an edit. The `key` remount clears
 * stale draft text whenever the committed value changes.
 */
export function ValuePopover(props: ValuePopoverProps) {
  const { value, onCommit } = props;
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);

  // External state changes, including Undo and Redo, must update the numeric
  // control. Keep a focused draft intact so a preview does not overwrite input.
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  return (
    <input
      id={props.id}
      data-component="value-popover"
      className={props.className}
      type="number"
      aria-label={props.label}
      value={draft}
      min={props.min}
      max={props.max}
      step={props.step}
      disabled={props.disabled}
      inputMode="decimal"
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(event) => {
        setDraft(event.currentTarget.value);
      }}
      onBlur={(event) => {
        editing.current = false;
        const next = event.currentTarget.valueAsNumber;
        if (Number.isFinite(next)) onCommit(next);
        else setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
import { useEffect, useRef, useState } from "react";
