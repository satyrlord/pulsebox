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
  return (
    <input
      key={value}
      id={props.id}
      data-component="value-popover"
      className={props.className}
      type="number"
      aria-label={props.label}
      defaultValue={value}
      min={props.min}
      max={props.max}
      step={props.step}
      disabled={props.disabled}
      inputMode="decimal"
      onBlur={(event) => {
        onCommit(event.currentTarget.valueAsNumber);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.value = value;
          event.currentTarget.blur();
        }
      }}
    />
  );
}
