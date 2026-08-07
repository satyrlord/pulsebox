import { forwardRef, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import {
  type GestureId,
  type ModuleInstanceId,
  type NoteEventId,
  type ParameterDescriptor,
  type ParameterValue,
  type PatternId,
} from "../../../contracts";
import {
  PATTERN_SCALES,
  PATTERN_TICKS_PER_STEP,
  type PatternEvent,
  type PatternPartState,
  type PatternScale,
} from "../../../state/public";
import { AuditionButton } from "../controls/AuditionButton";
import { useContinuousGesture } from "../controls/use-gesture-id";
import { WHEEL_IDLE_MILLISECONDS } from "../controls/use-range-gesture";
import { useAppStore, useDependencies } from "../store/app-store-context";
import { PatternTools } from "./PatternTools";
import styles from "./Shell.module.css";

function PatternNameField(props: {
  readonly name: string;
  readonly onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(props.name);
  const commit = () => {
    const name = draft.trim();
    if (name.length === 0) {
      setDraft(props.name);
      return;
    }
    if (name !== props.name) props.onCommit(name);
  };

  return (
    <label data-component="pattern-name-field">
      <span>Name</span>
      <input
        type="text"
        aria-label="Pattern name"
        maxLength={40}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") setDraft(props.name);
        }}
      />
    </label>
  );
}

function PatternInspector() {
  const patterns = useAppStore((state) => state.project.project.patterns);
  const activePatternId = useAppStore((state) => state.project.project.activePatternId);
  const launchQuantizationSteps = useAppStore((state) => state.launchQuantizationSteps);
  const selectPattern = useAppStore((state) => state.selectPattern);
  const clearPattern = useAppStore((state) => state.clearPattern);
  const renamePattern = useAppStore((state) => state.renamePattern);
  const newPatternVariation = useAppStore((state) => state.newPatternVariation);
  const addPattern = useAppStore((state) => state.addPattern);
  const duplicatePattern = useAppStore((state) => state.duplicatePattern);
  const deletePattern = useAppStore((state) => state.deletePattern);
  const reorderPattern = useAppStore((state) => state.reorderPattern);
  const setPatternColor = useAppStore((state) => state.setPatternColor);
  const setPatternDuration = useAppStore((state) => state.setPatternDuration);
  const setPatternScale = useAppStore((state) => state.setPatternScale);
  const setLaunchQuantization = useAppStore((state) => state.setLaunchQuantization);
  const index = patterns.findIndex((candidate) => candidate.id === activePatternId);
  const pattern = index < 0 ? undefined : patterns[index];
  const previous = index > 0 ? patterns[index - 1] : undefined;
  const next = index >= 0 && index < patterns.length - 1 ? patterns[index + 1] : undefined;

  const selectRelative = (offset: -1 | 1) => {
    const target = patterns[index + offset];
    if (target !== undefined) selectPattern(target.id);
  };

  return (
    <aside
      className={styles.patternInspector}
      data-component="pattern-inspector"
      aria-label="Pattern inspector"
    >
      <header className={styles.panelHeader}>
        <h2>Pattern</h2>
        <span className={styles.patternCount}>{`${String(Math.max(0, index + 1))}/${String(patterns.length)}`}</span>
      </header>
      <div className={styles.patternNavigation} aria-label="Pattern navigation">
        <button
          type="button"
          aria-label="Previous Pattern"
          disabled={previous === undefined}
          onClick={() => selectRelative(-1)}
        >
          Previous
        </button>
        <button
          type="button"
          aria-label="Next Pattern"
          disabled={next === undefined}
          onClick={() => selectRelative(1)}
        >
          Next
        </button>
      </div>
      <label>
        <span>Pattern</span>
        <select
          aria-label="Selected Pattern"
          value={activePatternId}
          onChange={(event) => {
            selectPattern(event.currentTarget.value as PatternId);
          }}
        >
          {patterns.map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </select>
      </label>
      <PatternNameField
        key={pattern?.id}
        name={pattern?.name ?? ""}
        onCommit={(name) => {
          if (pattern !== undefined) renamePattern(pattern.id, name);
        }}
      />
      <label>
        <span>Color</span>
        <input
          type="color"
          aria-label="Pattern color"
          value={pattern?.color ?? "#E6A23C"}
          disabled={pattern === undefined}
          onChange={(event) => {
            if (pattern !== undefined) setPatternColor(pattern.id, event.currentTarget.value);
          }}
        />
      </label>
      <label>
        <span>Duration in bars</span>
        <input
          type="number"
          aria-label="Pattern duration in bars"
          min={1}
          max={64}
          step={1}
          value={pattern?.durationBars ?? 1}
          disabled={pattern === undefined}
          onChange={(event) => {
            const durationBars = event.currentTarget.valueAsNumber;
            if (pattern !== undefined && Number.isSafeInteger(durationBars)) {
              setPatternDuration(pattern.id, durationBars);
            }
          }}
        />
      </label>
      <label>
        <span>Scale</span>
        <select
          aria-label="Pattern scale"
          value={pattern?.scale ?? "Chromatic"}
          disabled={pattern === undefined}
          onChange={(event) => {
            if (pattern !== undefined) {
              setPatternScale(pattern.id, event.currentTarget.value as PatternScale);
            }
          }}
        >
          {PATTERN_SCALES.map((scale) => (
            <option key={scale} value={scale}>
              {scale}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Launch quantization</span>
        <select
          aria-label="Pattern launch quantization"
          value={launchQuantizationSteps}
          onChange={(event) => setLaunchQuantization(Number(event.currentTarget.value))}
        >
          <option value={1}>1/16</option>
          <option value={4}>1 beat</option>
          <option value={16}>1 bar</option>
          <option value={32}>2 bars</option>
        </select>
      </label>
      <div className={styles.inspectorActions}>
        <button
          type="button"
          aria-label="Add Pattern"
          disabled={patterns.length >= 32}
          onClick={() => addPattern(undefined, pattern?.id)}
        >
          Add
        </button>
        <button
          type="button"
          aria-label="Duplicate Pattern"
          disabled={pattern === undefined || patterns.length >= 32}
          onClick={() => {
            if (pattern !== undefined) duplicatePattern(pattern.id);
          }}
        >
          Duplicate
        </button>
        <button
          type="button"
          aria-label="Delete Pattern"
          disabled={pattern === undefined || patterns.length <= 1}
          onClick={() => {
            if (pattern !== undefined) deletePattern(pattern.id);
          }}
        >
          Delete
        </button>
        <button
          type="button"
          aria-label="Clear the Pattern"
          title="Clear every step of the Pattern."
          onClick={() => {
            if (pattern !== undefined) clearPattern(pattern.id);
          }}
        >
          Clear
        </button>
        <button
          type="button"
          aria-label="New variation"
          title="Store a new seed. The same seed always replays the same variation."
          onClick={() => {
            if (pattern !== undefined) newPatternVariation(pattern.id);
          }}
        >
          Variation
        </button>
        <button
          type="button"
          aria-label="Move Pattern earlier"
          disabled={previous === undefined || pattern === undefined}
          onClick={() => {
            if (pattern !== undefined) reorderPattern(pattern.id, index > 1 ? patterns[index - 2]?.id : undefined);
          }}
        >
          Earlier
        </button>
        <button
          type="button"
          aria-label="Move Pattern later"
          disabled={next === undefined || pattern === undefined}
          onClick={() => {
            if (pattern !== undefined && next !== undefined) reorderPattern(pattern.id, next.id);
          }}
        >
          Later
        </button>
      </div>
      <PatternTools />
    </aside>
  );
}

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PIANO_PITCHES = Array.from({ length: 25 }, (_, index) => {
  const note = 60 - index;
  const name = PITCH_NAMES[note % 12] ?? "C";
  return { label: `${name}${String(Math.floor(note / 12) - 1)}`, note };
});

interface EditorRow {
  readonly label: string;
  readonly note: number;
  readonly tone: "natural" | "sharp" | "voice";
}

function AuditionKeys(props: {
  readonly label: string;
  readonly moduleId: ModuleInstanceId | undefined;
  readonly rows: readonly EditorRow[];
  readonly onStart: (moduleId: ModuleInstanceId, note: number) => void;
  readonly onStop: (moduleId: ModuleInstanceId) => void;
}) {
  return (
    <div className={styles.pianoKeybed} role="group" aria-label={props.label}>
      {props.rows.map((row) => {
        const toneClass =
          row.tone === "sharp"
            ? styles.sharpKey
            : row.tone === "voice"
              ? styles.voiceKey
              : styles.naturalKey;
        return (
          <AuditionButton
            key={`${row.label}-${String(row.note)}`}
            label={row.tone === "voice" ? `${row.label} voice` : `${row.label} piano key`}
            className={`${styles.pianoKey} ${toneClass}`}
            disabled={props.moduleId === undefined}
            onStart={() => {
              if (props.moduleId !== undefined) props.onStart(props.moduleId, row.note);
            }}
            onStop={() => {
              if (props.moduleId !== undefined) props.onStop(props.moduleId);
            }}
          >
            {row.tone === "sharp" ? null : <span>{row.label}</span>}
          </AuditionButton>
        );
      })}
    </div>
  );
}

/**
 * Swing and Humanize are musically useful mostly below 30 percent, so slider
 * travel is tapered: the first 30 percent of the value takes 60 percent of the
 * track at 0.5 percent per step. A smooth power taper was rejected because its
 * near-zero slope leaves keyboard steps below the whole-percent store
 * granularity, which reads as a dead control. The native input value is a track
 * position, 0 through 100. The dispatched project value is the tapered ratio,
 * quantized to whole percent.
 */
const TAPER_POSITION_MAX = 100;
const LOW_BAND_VALUE = 0.3;
const LOW_BAND_TRAVEL = 60;
const WHEEL_PERCENT = 2;

function taperValue(position: number): number {
  const value =
    position <= LOW_BAND_TRAVEL
      ? (position / LOW_BAND_TRAVEL) * LOW_BAND_VALUE
      : LOW_BAND_VALUE +
        ((position - LOW_BAND_TRAVEL) / (TAPER_POSITION_MAX - LOW_BAND_TRAVEL)) *
          (1 - LOW_BAND_VALUE);
  return Math.round(value * 100) / 100;
}

function taperPosition(value: number): number {
  const unit = Math.min(1, Math.max(0, value));
  const position =
    unit <= LOW_BAND_VALUE
      ? (unit / LOW_BAND_VALUE) * LOW_BAND_TRAVEL
      : LOW_BAND_TRAVEL +
        ((unit - LOW_BAND_VALUE) / (1 - LOW_BAND_VALUE)) * (TAPER_POSITION_MAX - LOW_BAND_TRAVEL);
  return Math.round(position);
}

function TimingSlider(props: {
  readonly label: string;
  readonly ariaLabel: string;
  readonly value: number;
  readonly onPreview: (value: number) => void;
  readonly onCommit: (value: number, gestureId: GestureId) => void;
}) {
  const gesture = useContinuousGesture();
  const [position, setPosition] = useState(() => taperPosition(props.value));
  const [trackedValue, setTrackedValue] = useState(props.value);
  const percent = Math.round(taperValue(position) * 100);
  const pointer = useRef<
    | {
        pointerId: number;
        startValue: number;
        value: number;
      }
    | undefined
  >(undefined);
  const keyboard = useRef<{ startValue: number; value: number } | undefined>(undefined);
  const wheel = useRef<{ startValue: number; value: number } | undefined>(undefined);

  // Several low positions round to one stored percent. Keep the finer user
  // position unless the store value no longer matches it. This runs during
  // render, which is the React pattern for state that follows a prop.
  if (props.value !== trackedValue) {
    setTrackedValue(props.value);
    if (Math.round(taperValue(position) * 100) !== Math.round(props.value * 100)) {
      setPosition(taperPosition(props.value));
    }
  }

  const live = useRef({ position, onPreview: props.onPreview, onCommit: props.onCommit, gesture });
  useEffect(() => {
    live.current = {
      position,
      onPreview: props.onPreview,
      onCommit: props.onCommit,
      gesture,
    };
  });

  const wheelIdle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wheelAbort = useRef<AbortController | undefined>(undefined);

  // The listener must be non-passive to call preventDefault, so React's
  // synthetic wheel handler cannot register it.
  const attachWheel = useCallback((element: HTMLInputElement | null) => {
    wheelAbort.current?.abort();
    wheelAbort.current = undefined;
    if (element === null) return;
    const listeners = new AbortController();
    element.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const current = live.current;
        const direction = event.deltaY > 0 ? -1 : 1;
        // The wheel steps in whole value percent, not track positions, so every
        // notch is an audible change at any point of the taper.
        const magnitude = event.shiftKey ? 1 : WHEEL_PERCENT;
        const percentNow = Math.round(taperValue(current.position) * 100);
        const nextPercent = Math.min(100, Math.max(0, percentNow + direction * magnitude));
        if (nextPercent !== percentNow) {
          wheel.current ??= { startValue: taperValue(current.position), value: taperValue(current.position) };
          const nextPosition = taperPosition(nextPercent / 100);
          live.current.position = nextPosition;
          setPosition(nextPosition);
          wheel.current.value = nextPercent / 100;
          current.onPreview(nextPercent / 100);
        }
        if (wheelIdle.current !== undefined) clearTimeout(wheelIdle.current);
        wheelIdle.current = setTimeout(() => {
          wheelIdle.current = undefined;
          const active = wheel.current;
          wheel.current = undefined;
          if (active !== undefined && active.value !== active.startValue) {
            live.current.onCommit(active.value, live.current.gesture.current());
          }
          live.current.gesture.end();
        }, WHEEL_IDLE_MILLISECONDS);
      },
      { passive: false, signal: listeners.signal },
    );
    wheelAbort.current = listeners;
  }, []);

  useEffect(
    () => () => {
      wheelAbort.current?.abort();
      wheelAbort.current = undefined;
      if (wheelIdle.current !== undefined) clearTimeout(wheelIdle.current);
      const active = pointer.current ?? keyboard.current ?? wheel.current;
      pointer.current = undefined;
      keyboard.current = undefined;
      wheel.current = undefined;
      if (active !== undefined && active.value !== active.startValue) {
        live.current.onCommit(active.value, live.current.gesture.current());
      }
      live.current.gesture.end();
    },
    [],
  );

  const endPointer = (pointerId: number, cancel: boolean) => {
    const active = pointer.current;
    if (active?.pointerId !== pointerId) return;
    pointer.current = undefined;
    if (cancel) {
      setPosition(taperPosition(active.startValue));
      props.onPreview(active.startValue);
    } else if (active.value !== active.startValue) {
      props.onCommit(active.value, gesture.current());
    }
    gesture.end();
  };

  const endKeyboard = () => {
    const active = keyboard.current;
    keyboard.current = undefined;
    if (active !== undefined && active.value !== active.startValue) {
      props.onCommit(active.value, gesture.current());
    }
    gesture.end();
  };

  const endWheel = () => {
    if (wheelIdle.current !== undefined) clearTimeout(wheelIdle.current);
    wheelIdle.current = undefined;
    const active = wheel.current;
    wheel.current = undefined;
    if (active !== undefined && active.value !== active.startValue) {
      props.onCommit(active.value, gesture.current());
    }
    gesture.end();
  };

  return (
    <label className={styles.timingSlider}>
      <span>{props.label}</span>
      <input
        ref={attachWheel}
        type="range"
        min={0}
        max={TAPER_POSITION_MAX}
        step={1}
        value={position}
        aria-label={props.ariaLabel}
        aria-valuetext={`${String(percent)} percent`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          pointer.current = {
            pointerId: event.pointerId,
            startValue: props.value,
            value: props.value,
          };
          gesture.handlers.onPointerDown();
          if (typeof event.currentTarget.setPointerCapture === "function") {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerUp={(event) => endPointer(event.pointerId, false)}
        onPointerCancel={(event) => endPointer(event.pointerId, true)}
        onKeyDown={(event) => {
          if (
            keyboard.current === undefined &&
            ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"].includes(
              event.key,
            )
          ) {
            const value = taperValue(live.current.position);
            keyboard.current = { startValue: value, value };
            gesture.current();
          }
        }}
        onKeyUp={() => endKeyboard()}
        onBlur={() => {
          const active = pointer.current;
          if (active !== undefined) endPointer(active.pointerId, false);
          else if (keyboard.current !== undefined) endKeyboard();
          else if (wheel.current !== undefined) endWheel();
          else gesture.handlers.onBlur();
        }}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          const value = taperValue(next);
          live.current.position = next;
          setPosition(next);
          const active = pointer.current;
          if (active === undefined && keyboard.current === undefined) {
            props.onCommit(value, gesture.current());
          }
          else {
            if (active !== undefined) active.value = value;
            if (keyboard.current !== undefined) keyboard.current.value = value;
            props.onPreview(value);
          }
        }}
      />
      <output>{`${String(percent)}%`}</output>
    </label>
  );
}

/**
 * The moving line over the note grid. Its own component, so the per-frame
 * position updates re-render two elements rather than the whole Piano Roll.
 */
function Playhead(props: { readonly pageStartStep: number; readonly cycleSteps: number }) {
  const positionTicks = useAppStore((state) => state.positionTicks);
  const cycleTicks = Math.max(1, props.cycleSteps) * PATTERN_TICKS_PER_STEP;
  const ticksInCycle = ((positionTicks % cycleTicks) + cycleTicks) % cycleTicks;
  const percent = ((ticksInCycle / PATTERN_TICKS_PER_STEP - props.pageStartStep) / VISIBLE_STEPS) * 100;
  return (
    <b
      className={styles.playhead}
      aria-hidden="true"
      style={{ transform: `translateX(${String(percent)}%)` }}
    />
  );
}

/**
 * One transparent seek target per step. Positioning the playhead while the
 * transport is not playing also moves the transport start marker, so Stop
 * returns to the chosen step.
 */
function SeekSteps(props: { readonly pageStartStep: number; readonly availableSteps: number }) {
  const playing = useAppStore((state) => state.project.transport.status === "playing");
  const seek = useAppStore((state) => state.seek);
  return (
    <div className={styles.seekSteps} role="group" aria-label="Start marker">
      {Array.from({ length: 16 }, (_, index) => (
        <button
          key={index}
          type="button"
          disabled={playing || index >= props.availableSteps}
          aria-label={`Set the start marker to step ${String(props.pageStartStep + index + 1)}`}
          onClick={() => {
            seek((props.pageStartStep + index) * PATTERN_TICKS_PER_STEP);
          }}
        >
          <span aria-hidden="true">{index % 4 === 0 ? index + 1 : ""}</span>
        </button>
      ))}
    </div>
  );
}

const STEP_TICKS = PATTERN_TICKS_PER_STEP;
const VISIBLE_STEPS = 16;
/** One Piano Roll grid row in CSS pixels. */
const ROLL_ROW_HEIGHT = 16;

interface EventDrag {
  readonly eventId: NoteEventId;
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly originRow: number;
  readonly originStep: number;
  readonly durationSteps: number;
  readonly mode: "move" | "resize-start" | "resize-end";
  readonly eventIds: readonly NoteEventId[];
  deltaSteps: number;
  deltaRows: number;
  clientDeltaX: number;
  clientDeltaY: number;
}

interface MarqueeDrag {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly originStep: number;
  readonly originRow: number;
  currentStep: number;
  currentRow: number;
  moved: boolean;
}

interface MarqueeBox {
  readonly step0: number;
  readonly row0: number;
  readonly step1: number;
  readonly row1: number;
}

function eventStep(event: PatternEvent): number {
  return Math.floor(event.positionTicks / STEP_TICKS);
}

function eventDurationSteps(event: PatternEvent): number {
  return Math.max(1, Math.round((event.durationTicks ?? STEP_TICKS) / STEP_TICKS));
}

type NoteProperty = "velocity" | "accent" | "slide" | "probability" | "microTimingTicks" | "flam" | "roll";

function notePropertyLabel(property: NoteProperty): string {
  switch (property) {
    case "microTimingTicks":
      return "Micro timing";
    case "flam":
      return "Flam";
    case "roll":
      return "Roll";
    case "velocity":
      return "Velocity";
    case "accent":
      return "Accent";
    case "slide":
      return "Slide";
    case "probability":
      return "Probability";
  }
}

function notePropertyRange(property: Exclude<NoteProperty, "accent" | "slide">) {
  switch (property) {
    case "velocity":
    case "probability":
      return { min: 0, max: 100, step: 1, factor: 100, unit: "percent" };
    case "microTimingTicks":
      return { min: -60, max: 60, step: 1, factor: 1, unit: "ticks" };
    case "flam":
      return { min: 0, max: 3, step: 1, factor: 1, unit: "attacks" };
    case "roll":
      return { min: 0, max: 7, step: 1, factor: 1, unit: "attacks" };
  }
}

function NotePropertyControl(props: {
  readonly event: PatternEvent;
  readonly label: string;
  readonly selected: boolean;
  readonly property: NoteProperty;
  readonly onSelect: () => void;
  readonly onCommit: (
    values: Partial<
      Pick<
        PatternEvent["data"],
        "velocity" | "accent" | "slide" | "probability" | "microTimingTicks" | "flam" | "roll"
      >
    >,
  ) => void;
}) {
  const property = props.property;
  const numericProperty =
    property === "accent" || property === "slide" ? "velocity" : property;
  const range = notePropertyRange(numericProperty);
  const committed = Math.round(props.event.data[numericProperty] * range.factor);
  const [draft, setDraft] = useState(committed);
  const [tracked, setTracked] = useState(committed);

  if (tracked !== committed) {
    setTracked(committed);
    setDraft(committed);
  }

  if (property === "accent" || property === "slide") {
    const current = props.event.data[property];
    return (
      <button
        className={styles.propertyToggle}
        type="button"
        aria-label={`${props.label} ${notePropertyLabel(property)}`}
        aria-pressed={current}
        data-selected={props.selected}
        onFocus={props.onSelect}
        onClick={() => props.onCommit(notePropertyUpdate(property, !current))}
      >
        {notePropertyLabel(property)}
      </button>
    );
  }

  const commit = () => {
    if (draft !== committed) {
      props.onCommit(notePropertyUpdate(property, draft / range.factor));
    }
  };
  const pointPosition = ((draft - range.min) / (range.max - range.min)) * 100;

  return (
    <span
      className={styles.pointControl}
      data-component="piano-roll-point-control"
      data-selected={props.selected}
      style={{ "--lane-position": `${String(pointPosition)}%` } as CSSProperties}
    >
      <input
        className={styles.pointInput}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={draft}
        aria-label={`${props.label} ${notePropertyLabel(property).toLowerCase()}`}
        aria-valuetext={`${String(draft)} ${range.unit}`}
        onFocus={props.onSelect}
        onPointerDown={props.onSelect}
        onChange={(event) => setDraft(event.currentTarget.valueAsNumber)}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </span>
  );
}

function AutomationStepControl(props: {
  readonly descriptor: ParameterDescriptor;
  readonly label: string;
  readonly value: ParameterValue;
  readonly hasStep: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onCommit: (value: ParameterValue) => void;
  readonly onErase: () => void;
}) {
  const { descriptor } = props;
  const initial = typeof props.value === "number" ? props.value : Number(descriptor.defaultValue);
  if (descriptor.valueType === "boolean") {
    return (
      <button
        type="button"
        className={styles.automationBoolean}
        aria-label={props.label}
        aria-pressed={props.value === true}
        data-selected={props.selected}
        onFocus={props.onSelect}
        onClick={() => props.onCommit(props.value !== true)}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onErase();
        }}
      >
        {props.value === true ? "On" : "Off"}
      </button>
    );
  }
  if (descriptor.valueType === "enum") {
    return (
      <select
        className={styles.automationSelect}
        aria-label={props.label}
        value={String(props.value)}
        data-selected={props.selected}
        onFocus={props.onSelect}
        onChange={(event) => props.onCommit(event.currentTarget.value)}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onErase();
        }}
      >
        {(descriptor.enumValues ?? []).map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className={styles.velocityControl}
      type="range"
      min={descriptor.minimum ?? 0}
      max={descriptor.maximum ?? 1}
      step={descriptor.step ?? (descriptor.valueType === "integer" ? 1 : 0.01)}
      defaultValue={initial}
      aria-label={props.label}
      aria-valuetext={String(initial)}
      data-automation-step={props.hasStep}
      data-selected={props.selected}
      onFocus={props.onSelect}
      onPointerDown={props.onSelect}
      onPointerUp={(event) => props.onCommit(event.currentTarget.valueAsNumber)}
      onKeyUp={(event) => props.onCommit(event.currentTarget.valueAsNumber)}
      onBlur={(event) => props.onCommit(event.currentTarget.valueAsNumber)}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onErase();
      }}
    />
  );
}

function notePropertyUpdate(
  property: NoteProperty,
  value: boolean | number,
): Partial<
  Pick<
    PatternEvent["data"],
    "velocity" | "accent" | "slide" | "probability" | "microTimingTicks" | "flam" | "roll"
  >
> {
  switch (property) {
    case "accent":
      return { accent: Boolean(value) };
    case "slide":
      return { slide: Boolean(value) };
    case "velocity":
      return { velocity: Number(value) };
    case "probability":
      return { probability: Number(value) };
    case "microTimingTicks":
      return { microTimingTicks: Number(value) };
    case "flam":
      return { flam: Number(value) };
    case "roll":
      return { roll: Number(value) };
  }
}

function PianoRoll() {
  const { auditionNoteFor, manifestFor } = useDependencies();
  const modules = useAppStore((state) => state.project.project.modules);
  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const activePatternId = useAppStore((state) => state.project.project.activePatternId);
  const patterns = useAppStore((state) => state.project.project.patterns);
  const swing = useAppStore((state) => state.project.project.swing);
  const selectModule = useAppStore((state) => state.selectModule);
  const setSwing = useAppStore((state) => state.setSwing);
  const previewSwing = useAppStore((state) => state.previewSwing);
  const setHumanize = useAppStore((state) => state.setHumanize);
  const previewHumanize = useAppStore((state) => state.previewHumanize);
  const startAudition = useAppStore((state) => state.startAudition);
  const stopAudition = useAppStore((state) => state.stopAudition);
  const pianoRollSelection = useAppStore((state) => state.project.ui.pianoRollSelection);
  const selectPianoRollEvents = useAppStore((state) => state.selectPianoRollEvents);
  const pianoRollParameter = useAppStore((state) => state.project.ui.pianoRollParameter);
  const setPianoRollParameter = useAppStore((state) => state.setPianoRollParameter);
  const editPatternEvents = useAppStore((state) => state.editPatternEvents);
  const automationLanes = useAppStore((state) => state.project.project.automationLanes);
  const setAutomationLaneSteps = useAppStore((state) => state.setAutomationLaneSteps);
  const pattern = patterns.find((candidate) => candidate.id === activePatternId);
  const humanize = pattern?.humanize ?? 0;
  const module = selectedModuleId === undefined ? undefined : modules[selectedModuleId];
  const manifest = module === undefined ? undefined : manifestFor(module.pluginId);
  const pitched =
    manifest?.kind === "instrument" && manifest.acceptedEvents.some((event) => event.id === "note");
  const editorRows: readonly EditorRow[] =
    manifest?.kind === "instrument" && !pitched
      ? manifest.voices.map((voice) => ({
          label: voice.name,
          note: auditionNoteFor(manifest.pluginId, voice.id),
          tone: "voice" as const,
        }))
      : PIANO_PITCHES.map((pitch) => ({
          ...pitch,
          tone: pitch.label.includes("#") ? ("sharp" as const) : ("natural" as const),
        }));
  const part: PatternPartState | undefined =
    module === undefined || pattern === undefined ? undefined : pattern.parts[module.id];
  const events = part?.events ?? [];
  const patternName = pattern?.name ?? "Pattern";
  const moduleName = manifest?.productName ?? "No module";
  const cycleSteps = Math.max(1, part?.length ?? VISIBLE_STEPS);
  const pageCount = Math.max(1, Math.ceil(cycleSteps / VISIBLE_STEPS));
  const [pageIndexState, setPageIndex] = useState(0);
  const [followPages, setFollowPages] = useState(true);
  const [pageLocked, setPageLocked] = useState(false);
  const [selectedAutomationTick, setSelectedAutomationTick] = useState<number | undefined>(undefined);
  const ghostNotesEnabled = useAppStore((state) => state.ghostNotesEnabled);
  const positionTicks = useAppStore((state) => state.positionTicks);
  const [keyboardCell, setKeyboardCell] = useState({ step: 0, row: 0 });
  const [dragPreview, setDragPreview] = useState<EventDrag | undefined>(undefined);
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | undefined>(undefined);
  const drag = useRef<EventDrag | undefined>(undefined);
  const marquee = useRef<MarqueeDrag | undefined>(undefined);
  const eventClipboard = useRef<readonly PatternEvent[]>([]);
  const paintGesture = useContinuousGesture();
  const noteProperties: readonly NoteProperty[] = pitched
    ? ["velocity", "accent", "slide", "probability", "microTimingTicks", "flam", "roll"]
    : ["velocity", "accent", "probability", "microTimingTicks", "flam", "roll"];
  const automatableParameters = manifest?.parameters.filter((parameter) => parameter.automation === "step") ?? [];

  const followedPageIndex = Math.floor(
    (((positionTicks % (cycleSteps * STEP_TICKS)) + cycleSteps * STEP_TICKS) %
      (cycleSteps * STEP_TICKS)) /
      STEP_TICKS /
      VISIBLE_STEPS,
  );
  const pageIndex = followPages && !pageLocked
    ? followedPageIndex
    : Math.min(pageIndexState, pageCount - 1);
  const pageStartStep = pageIndex * VISIBLE_STEPS;
  const visiblePageSteps = Math.max(1, Math.min(VISIBLE_STEPS, cycleSteps - pageStartStep));
  const visibleKeyboardCell = {
    step: Math.min(visiblePageSteps - 1, keyboardCell.step),
    row: Math.min(Math.max(0, editorRows.length - 1), keyboardCell.row),
  };
  const activeSelectedAutomationTick =
    selectedAutomationTick !== undefined && selectedAutomationTick < cycleSteps * STEP_TICKS
      ? selectedAutomationTick
      : undefined;
  const parameterIsAvailable =
    noteProperties.includes(pianoRollParameter as NoteProperty) ||
    automatableParameters.some((parameter) => parameter.id === pianoRollParameter);
  const activePianoRollParameter = parameterIsAvailable ? pianoRollParameter : "velocity";

  const selectedEventIds =
    pianoRollSelection !== undefined &&
    pianoRollSelection.moduleId === selectedModuleId &&
    pianoRollSelection.patternId === activePatternId
      ? pianoRollSelection.eventIds
      : [];

  const visibleEvents = events.filter((event) => {
    const step = eventStep(event);
    return (
      step >= pageStartStep &&
      step < pageStartStep + VISIBLE_STEPS &&
      editorRows.some((row) => row.note === event.data.note)
    );
  });
  const ghostEvents =
    !ghostNotesEnabled || pattern === undefined
      ? []
      : Object.entries(pattern.parts).flatMap(([moduleId, otherPart]) =>
          moduleId === selectedModuleId
            ? []
            : otherPart.events.filter((event) => {
                const step = eventStep(event);
                return (
                  step >= pageStartStep &&
                  step < pageStartStep + VISIBLE_STEPS &&
                  editorRows.some((row) => row.note === event.data.note)
                );
              }),
        );
  const selectedNoteProperty = noteProperties.find(
    (property) => property === activePianoRollParameter,
  );
  const selectedAutomationParameter = automatableParameters.find(
    (parameter) => parameter.id === activePianoRollParameter,
  );
  const automationLane =
    selectedAutomationParameter === undefined || selectedModuleId === undefined || pattern === undefined
      ? undefined
      : Object.values(automationLanes).find(
          (lane) =>
            lane.patternId === pattern.id &&
            lane.targetId === selectedModuleId &&
            lane.parameterId === selectedAutomationParameter.id,
        );
  const automationSteps = automationLane?.steps ?? [];
  const activeLaneLabel =
    selectedNoteProperty === undefined
      ? selectedAutomationParameter?.name ?? "Velocity"
      : notePropertyLabel(selectedNoteProperty);

  const labelFor = (event: PatternEvent) => {
    const row = editorRows.find((one) => one.note === event.data.note);
    const kind = event.type === "note" ? "note" : "trigger";
    const duration = eventDurationSteps(event);
    const durationText = event.type === "note" ? `, ${String(duration)} step duration` : "";
    const selectedText = selectedEventIds.includes(event.id) ? ", selected" : "";
    return `${row?.label ?? `Note ${String(event.data.note)}`} ${kind}, step ${String(eventStep(event) + 1)}, ${String(Math.round(event.data.velocity * 100))} percent velocity${durationText}${selectedText}`;
  };

  const selectEvents = (eventIds: readonly NoteEventId[]) => {
    if (selectedModuleId !== undefined) {
      selectPianoRollEvents(selectedModuleId, activePatternId, eventIds);
    }
  };

  const edit = (change: Parameters<typeof editPatternEvents>[2], gestureId?: GestureId) => {
    if (selectedModuleId === undefined) return;
    editPatternEvents(selectedModuleId, activePatternId, change, gestureId);
  };

  const setAutomationStep = (step: number, value: ParameterValue | undefined) => {
    if (selectedModuleId === undefined || selectedAutomationParameter === undefined || pattern === undefined) return;
    const tick = (pageStartStep + step) * STEP_TICKS;
    const withoutCurrent = automationSteps.filter((candidate) => candidate.tick !== tick);
    setAutomationLaneSteps(
      selectedModuleId,
      pattern.id,
      selectedAutomationParameter.id,
      value === undefined ? withoutCurrent : [...withoutCurrent, { tick, value }],
    );
  };

  const moveSelectedAutomationStep = (deltaSteps: number) => {
    if (
      selectedAutomationParameter === undefined ||
      activeSelectedAutomationTick === undefined ||
      selectedModuleId === undefined
    ) {
      return;
    }
    const source = automationSteps.find((candidate) => candidate.tick === activeSelectedAutomationTick);
    const targetTick = activeSelectedAutomationTick + deltaSteps * STEP_TICKS;
    if (
      source === undefined ||
      targetTick < 0 ||
      targetTick >= cycleSteps * STEP_TICKS ||
      automationSteps.some((candidate) => candidate.tick === targetTick)
    ) {
      return;
    }
    setAutomationLaneSteps(
      selectedModuleId,
      activePatternId,
      selectedAutomationParameter.id,
      automationSteps.map((candidate) =>
        candidate.tick === activeSelectedAutomationTick ? { ...candidate, tick: targetTick } : candidate,
      ),
    );
    setSelectedAutomationTick(targetTick);
  };

  const scaleSelectedAutomationStep = (amount: number) => {
    if (
      selectedAutomationParameter === undefined ||
      activeSelectedAutomationTick === undefined ||
      selectedModuleId === undefined
    ) {
      return;
    }
    const source = automationSteps.find((candidate) => candidate.tick === activeSelectedAutomationTick);
    if (source === undefined || typeof source.value !== "number") return;
    const minimum = selectedAutomationParameter.minimum ?? 0;
    const maximum = selectedAutomationParameter.maximum ?? 1;
    const value = Math.min(maximum, Math.max(minimum, source.value + amount));
    setAutomationLaneSteps(
      selectedModuleId,
      activePatternId,
      selectedAutomationParameter.id,
      automationSteps.map((candidate) =>
        candidate.tick === activeSelectedAutomationTick ? { ...candidate, value } : candidate,
      ),
    );
  };

  const selectOne = (eventId: NoteEventId, additive: boolean) => {
    if (!additive) {
      selectEvents([eventId]);
      return;
    }
    selectEvents(
      selectedEventIds.includes(eventId)
        ? selectedEventIds.filter((one) => one !== eventId)
        : [...selectedEventIds, eventId],
    );
  };

  const createAt = (step: number, rowIndex: number, gestureId?: GestureId) => {
    const row = editorRows[rowIndex];
    if (
      row === undefined ||
      selectedModuleId === undefined ||
      pageStartStep + step >= cycleSteps
    ) {
      return;
    }
    const data = { note: row.note, velocity: 0.8, accent: false, slide: false };
    if (pitched) {
      edit(
        {
          type: "create",
          event: {
            type: "note",
            positionTicks: (pageStartStep + step) * STEP_TICKS,
            durationTicks: STEP_TICKS,
            data,
          },
        },
        gestureId,
      );
      return;
    }
    edit(
      {
        type: "create",
        event: { type: "trigger", positionTicks: (pageStartStep + step) * STEP_TICKS, data },
      },
      gestureId,
    );
  };

  const createAtReplacing = (step: number, rowIndex: number) => {
    const row = editorRows[rowIndex];
    if (
      row === undefined ||
      selectedModuleId === undefined ||
      pageStartStep + step >= cycleSteps
    ) {
      return;
    }
    const columnStartStep = pageStartStep + step;
    const gestureId = paintGesture.current();
    const replacedIds = events
      .filter((event) => {
        if (pitched) {
          const start = eventStep(event);
          const end = start + eventDurationSteps(event) - 1;
          return start <= columnStartStep && end >= columnStartStep;
        }
        return (
          eventStep(event) === columnStartStep &&
          editorRows.findIndex((one) => one.note === event.data.note) === rowIndex
        );
      })
      .map((event) => event.id);
    if (replacedIds.length > 0) {
      edit({ type: "delete", eventIds: replacedIds }, gestureId);
    }
    const data = { note: row.note, velocity: 0.8, accent: false, slide: false };
    if (pitched) {
      edit(
        {
          type: "create",
          event: {
            type: "note",
            positionTicks: columnStartStep * STEP_TICKS,
            durationTicks: STEP_TICKS,
            data,
          },
        },
        gestureId,
      );
    } else {
      edit(
        {
          type: "create",
          event: { type: "trigger", positionTicks: columnStartStep * STEP_TICKS, data },
        },
        gestureId,
      );
    }
    paintGesture.end();
  };

  const replacementIdsForMove = (
    movedIds: readonly NoteEventId[],
    deltaSteps: number,
    deltaRows: number,
  ): readonly NoteEventId[] => {
    const moved = new Set(movedIds);
    const targets: NoteEventId[] = [];
    for (const event of events) {
      if (moved.has(event.id)) continue;
      const start = eventStep(event);
      const end = start + eventDurationSteps(event) - 1;
      const row = editorRows.findIndex((one) => one.note === event.data.note);
      const hit = events.some((movedEvent) => {
        if (!moved.has(movedEvent.id)) return false;
        const destStart = eventStep(movedEvent) + deltaSteps;
        const destEnd = destStart + eventDurationSteps(movedEvent) - 1;
        if (pitched) return start <= destEnd && end >= destStart;
        const destRow =
          editorRows.findIndex((one) => one.note === movedEvent.data.note) + deltaRows;
        return start === destStart && row === destRow;
      });
      if (hit) targets.push(event.id);
    }
    return targets;
  };

  const cellFromPointer = (
    element: HTMLElement,
    clientX: number,
    clientY: number,
    availableSteps = VISIBLE_STEPS,
  ) => {
    const bounds = element.getBoundingClientRect();
    const step = Math.min(
      availableSteps - 1,
      Math.max(0, Math.floor(((clientX - bounds.left) / bounds.width) * VISIBLE_STEPS)),
    );
    const row = Math.min(
      editorRows.length - 1,
      Math.max(0, Math.floor((clientY - bounds.top) / ROLL_ROW_HEIGHT)),
    );
    return { step, row };
  };

  const deleteSelection = (fallbackId?: NoteEventId) => {
    const eventIds =
      fallbackId !== undefined && !selectedEventIds.includes(fallbackId)
        ? [fallbackId]
        : selectedEventIds;
    if (eventIds.length === 0) return;
    selectEvents([]);
    edit({ type: "delete", eventIds });
  };

  const copySelection = (fallbackId?: NoteEventId) => {
    const eventIds =
      fallbackId !== undefined && !selectedEventIds.includes(fallbackId)
        ? [fallbackId]
        : selectedEventIds;
    eventClipboard.current = events.filter((event) => eventIds.includes(event.id));
  };

  const pasteSelection = () => {
    const copied = eventClipboard.current;
    if (copied.length === 0) return;
    const firstStep = Math.min(...copied.map(eventStep));
    const destinationStep = pageStartStep;
    const gestureId = paintGesture.current();
    for (const source of copied) {
      const positionTicks = source.positionTicks + (destinationStep - firstStep) * STEP_TICKS;
      const endStep = Math.floor(positionTicks / STEP_TICKS) + eventDurationSteps(source);
      if (positionTicks < 0 || endStep > cycleSteps) continue;
      if (source.type === "note") {
        edit(
          {
            type: "create",
            event: {
              type: "note",
              positionTicks,
              durationTicks: source.durationTicks,
              data: source.data,
            },
          },
          gestureId,
        );
      } else {
        edit(
          { type: "create", event: { type: "trigger", positionTicks, data: source.data } },
          gestureId,
        );
      }
    }
    paintGesture.end();
  };

  const moveSelection = (event: PatternEvent, deltaSteps: number, deltaRows: number) => {
    const rowIndex = editorRows.findIndex((row) => row.note === event.data.note);
    const nextRow = editorRows[rowIndex + deltaRows];
    if (nextRow === undefined) return;
    const currentStep = eventStep(event);
    const duration = eventDurationSteps(event);
    if (currentStep + deltaSteps < 0 || currentStep + deltaSteps + duration > cycleSteps) return;
    const eventIds = selectedEventIds.includes(event.id) ? selectedEventIds : [event.id];
    edit({
      type: "move",
      eventIds,
      deltaTicks: deltaSteps * STEP_TICKS,
      deltaNote: nextRow.note - event.data.note,
    });
  };

  const onEventKeyDown = (event: React.KeyboardEvent, item: PatternEvent) => {
    const selected = selectedEventIds.includes(item.id) ? selectedEventIds : [item.id];
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      event.stopPropagation();
      selectEvents(visibleEvents.map((one) => one.id));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      event.stopPropagation();
      copySelection(item.id);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      event.stopPropagation();
      pasteSelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      event.stopPropagation();
      edit({ type: "duplicate", eventIds: selected });
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      deleteSelection(item.id);
      return;
    }
    const arrows = ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"];
    if (!arrows.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey && item.type === "note" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const direction = event.key === "ArrowRight" ? 1 : -1;
      if (event.altKey) {
        const positionStep = eventStep(item) + direction;
        const durationSteps = eventDurationSteps(item) - direction;
        if (positionStep >= 0 && durationSteps >= 1) {
          edit({
            type: "resize",
            eventId: item.id,
          positionTicks: positionStep * STEP_TICKS,
            durationTicks: durationSteps * STEP_TICKS,
          });
        }
        return;
      }
      const durationSteps = eventDurationSteps(item) + direction;
      if (durationSteps >= 1 && eventStep(item) + durationSteps <= cycleSteps) {
        edit({ type: "resize", eventId: item.id, durationTicks: durationSteps * STEP_TICKS });
      }
      return;
    }
    moveSelection(
      item,
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0,
      event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0,
    );
  };

  const updateDragState = (
    state: EventDrag,
    target: HTMLElement,
    clientX: number,
    clientY: number,
  ) => {
    const grid = target.closest('[data-component="piano-roll-grid"]');
    if (!(grid instanceof HTMLElement)) return;
    const width = grid.getBoundingClientRect().width / VISIBLE_STEPS;
    state.clientDeltaX = clientX - state.originX;
    state.clientDeltaY = clientY - state.originY;
    state.deltaSteps = Math.round(state.clientDeltaX / width);
    state.deltaRows = state.mode === "move" ? Math.round(state.clientDeltaY / ROLL_ROW_HEIGHT) : 0;
    if (state.mode === "move") {
      state.deltaSteps = Math.min(
        cycleSteps - state.originStep - state.durationSteps,
        Math.max(-state.originStep, state.deltaSteps),
      );
      state.deltaRows = Math.min(
        editorRows.length - state.originRow - 1,
        Math.max(-state.originRow, state.deltaRows),
      );
    } else if (state.mode === "resize-end") {
      state.deltaSteps = Math.min(
        cycleSteps - state.originStep - state.durationSteps,
        Math.max(1 - state.durationSteps, state.deltaSteps),
      );
    } else {
      state.deltaSteps = Math.min(
        state.durationSteps - 1,
        Math.max(-state.originStep, state.deltaSteps),
      );
    }
    state.clientDeltaX = state.deltaSteps * width;
    state.clientDeltaY = state.deltaRows * ROLL_ROW_HEIGHT;
  };

  const startEventDrag = (event: React.PointerEvent<HTMLButtonElement>, item: PatternEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const targetEdge = target.closest<HTMLElement>("[data-edge]")?.dataset.edge;
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const edge =
      targetEdge ??
      (localX >= bounds.width - 10 ? "end" : localX <= 10 ? "start" : undefined);
    const mode =
      item.type === "trigger"
        ? "move"
        : edge === "start"
          ? "resize-start"
          : edge === "end"
            ? "resize-end"
            : "move";
    const originRow = editorRows.findIndex((row) => row.note === item.data.note);
    const eventIds = selectedEventIds.includes(item.id) ? selectedEventIds : [item.id];
    if (!selectedEventIds.includes(item.id)) selectEvents(eventIds);
    const state: EventDrag = {
      eventId: item.id,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      originRow,
      originStep: eventStep(item),
      durationSteps: eventDurationSteps(item),
      mode,
      eventIds,
      deltaSteps: 0,
      deltaRows: 0,
      clientDeltaX: 0,
      clientDeltaY: 0,
    };
    drag.current = state;
    setDragPreview({ ...state });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateEventDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (state?.pointerId !== event.pointerId) return;
    updateDragState(state, event.currentTarget, event.clientX, event.clientY);
    setDragPreview({ ...state });
  };

  const finishEventDrag = (event: React.PointerEvent<HTMLButtonElement>, cancel: boolean) => {
    const state = drag.current;
    if (state?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    updateDragState(state, event.currentTarget, event.clientX, event.clientY);
    setDragPreview(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (cancel || (state.deltaSteps === 0 && state.deltaRows === 0)) return;
    const item = events.find((one) => one.id === state.eventId);
    if (item === undefined) return;
    if (state.mode === "resize-end") {
      edit({
        type: "resize",
        eventId: state.eventId,
        durationTicks: (state.durationSteps + state.deltaSteps) * STEP_TICKS,
      });
      return;
    }
    if (state.mode === "resize-start") {
      edit({
        type: "resize",
        eventId: state.eventId,
        positionTicks: (state.originStep + state.deltaSteps) * STEP_TICKS,
        durationTicks: (state.durationSteps - state.deltaSteps) * STEP_TICKS,
      });
      return;
    }
    const nextRow = editorRows[state.originRow + state.deltaRows];
    if (nextRow === undefined) return;
    const gestureId = paintGesture.current();
    const replacedIds = replacementIdsForMove(
      state.eventIds,
      state.deltaSteps,
      state.deltaRows,
    );
    if (replacedIds.length > 0) {
      edit({ type: "delete", eventIds: replacedIds }, gestureId);
    }
    edit(
      {
        type: "move",
        eventIds: state.eventIds,
        deltaTicks: state.deltaSteps * STEP_TICKS,
        deltaNote: nextRow.note - item.data.note,
      },
      gestureId,
    );
    paintGesture.end();
  };

  return (
    <section className={styles.pianoRoll} data-component="piano-roll" aria-label="Piano Roll">
      <header className={styles.rollTools}>
        <span className={styles.gridReadout}>1/16</span>
        <div className={styles.pageControls} role="group" aria-label="Pattern pages">
          <button
            type="button"
            aria-label="Previous Pattern page"
            disabled={pageIndex === 0}
            onClick={() => {
              setFollowPages(false);
              setPageIndex(Math.max(0, pageIndex - 1));
            }}
          >
            Page -
          </button>
          <output aria-label={`Pattern page ${String(pageIndex + 1)} of ${String(pageCount)}`}>
            {`${String(pageIndex + 1)}/${String(pageCount)}`}
          </output>
          <button
            type="button"
            aria-label="Next Pattern page"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => {
              setFollowPages(false);
              setPageIndex(Math.min(pageCount - 1, pageIndex + 1));
            }}
          >
            Page +
          </button>
          <button
            type="button"
            className={styles.pageToggle}
            aria-pressed={followPages}
            aria-label="Follow the playhead"
            title="Follow the playhead. The page advances during playback."
            onClick={() => setFollowPages((current) => !current)}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 12.5h11" />
              <path d="M8 3v9.5" />
              <path d="M4.5 5.8 8 3l3.5 2.8" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.pageToggle}
            aria-pressed={pageLocked}
            aria-label={pageLocked ? "Unlock the viewed page" : "Lock the viewed page"}
            title={
              pageLocked
                ? "Unlock the viewed page during playback."
                : "Lock the viewed page during playback."
            }
            onClick={() => setPageLocked((current) => !current)}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3.5" y="7" width="9" height="7" rx="1.2" />
              {pageLocked ? (
                <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
              ) : (
                <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0" />
              )}
            </svg>
          </button>
        </div>
        <label className={styles.parameterSelector}>
          <span>Parameter</span>
          <select
            aria-label="Piano Roll parameter"
            value={activePianoRollParameter}
            onChange={(event) => setPianoRollParameter(event.currentTarget.value)}
          >
            <optgroup label="Note properties">
              {noteProperties.map((property) => (
                <option key={property} value={property}>
                  {notePropertyLabel(property)}
                </option>
              ))}
            </optgroup>
            {automatableParameters.length > 0 ? (
              <optgroup label="Automatable parameters">
                {automatableParameters.map((parameter) => (
                  <option key={parameter.id} value={parameter.id}>
                    {parameter.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <TimingSlider
          label="Swing"
          ariaLabel="Project Swing"
          value={swing}
          onPreview={previewSwing}
          onCommit={setSwing}
        />
        <TimingSlider
          label="Humanize"
          ariaLabel="Pattern Humanize"
          value={humanize}
          onPreview={(value) => {
            previewHumanize(activePatternId, value);
          }}
          onCommit={(value, gestureId) => {
            setHumanize(activePatternId, value, gestureId);
          }}
        />
        <label className={styles.moduleSelector}>
          <span>Module</span>
          <select
            aria-label="Piano Roll module"
            value={selectedModuleId ?? ""}
            onChange={(event) => {
              selectModule(
                (event.currentTarget.value || undefined) as ModuleInstanceId | undefined,
              );
            }}
          >
            {Object.values(modules).map((one) => (
              <option key={one.id} value={one.id}>
                {manifestFor(one.pluginId)?.productName ?? "Module"}
              </option>
            ))}
          </select>
        </label>
        <span
          className={styles.rollContext}
          aria-label={`Editing ${moduleName}, Pattern ${patternName}`}
          title={`${moduleName} — ${patternName}`}
        >
          {patternName}
        </span>
      </header>
      <div
        className={styles.rollBody}
        data-component="piano-roll-scroll"
        style={
          {
            "--editor-content-height": `${String(editorRows.length * ROLL_ROW_HEIGHT)}px`,
            "--editor-row-count": editorRows.length,
          } as CSSProperties
        }
      >
        <span className={styles.timelineLabel} aria-hidden="true">
          Step
        </span>
        <SeekSteps pageStartStep={pageStartStep} availableSteps={visiblePageSteps} />
        <AuditionKeys
          label={pitched || manifest === undefined ? "Piano keyboard" : "Drum voices"}
          moduleId={module?.id}
          rows={editorRows}
          onStart={startAudition}
          onStop={stopAudition}
        />
        <div
          className={styles.noteGrid}
          data-component="piano-roll-grid"
          role="group"
          aria-label={`${moduleName} events in ${patternName}. ${String(visibleEvents.length)} events.`}
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0 || event.target !== event.currentTarget) return;
            const rawCell = cellFromPointer(event.currentTarget, event.clientX, event.clientY);
            if (rawCell.step >= visiblePageSteps) return;
            const cell = rawCell;
            setKeyboardCell(cell);
            marquee.current = {
              pointerId: event.pointerId,
              originX: event.clientX,
              originY: event.clientY,
              originStep: cell.step,
              originRow: cell.row,
              currentStep: cell.step,
              currentRow: cell.row,
              moved: false,
            };
            setMarqueeBox({
              step0: cell.step,
              row0: cell.row,
              step1: cell.step,
              row1: cell.row,
            });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = marquee.current;
            if (active?.pointerId !== event.pointerId) return;
            if (
              !active.moved &&
              Math.abs(event.clientX - active.originX) < 4 &&
              Math.abs(event.clientY - active.originY) < 4
            ) {
              return;
            }
            active.moved = true;
            const cell = cellFromPointer(
              event.currentTarget,
              event.clientX,
              event.clientY,
              visiblePageSteps,
            );
            active.currentStep = cell.step;
            active.currentRow = cell.row;
            setMarqueeBox({
              step0: active.originStep,
              row0: active.originRow,
              step1: cell.step,
              row1: cell.row,
            });
          }}
          onPointerUp={(event) => {
            const active = marquee.current;
            if (active?.pointerId !== event.pointerId) return;
            marquee.current = undefined;
            setMarqueeBox(undefined);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            if (!active.moved) return;
            const minStep = Math.min(active.originStep, active.currentStep);
            const maxStep = Math.max(active.originStep, active.currentStep);
            const minRow = Math.min(active.originRow, active.currentRow);
            const maxRow = Math.max(active.originRow, active.currentRow);
            const additive = event.shiftKey;
            const next = new Set(additive ? selectedEventIds : []);
            for (const candidate of visibleEvents) {
              const step = eventStep(candidate) - pageStartStep;
              const row = editorRows.findIndex((one) => one.note === candidate.data.note);
              if (row < minRow || row > maxRow || step < minStep || step > maxStep) continue;
              next.add(candidate.id);
            }
            selectEvents([...next]);
          }}
          onPointerCancel={() => {
            marquee.current = undefined;
            setMarqueeBox(undefined);
          }}
          onLostPointerCapture={() => {
            marquee.current = undefined;
            setMarqueeBox(undefined);
          }}
          onDoubleClick={(event) => {
            if (event.button !== 0 || event.target !== event.currentTarget) return;
            const cell = cellFromPointer(event.currentTarget, event.clientX, event.clientY);
            if (cell.step >= visiblePageSteps) return;
            createAtReplacing(cell.step, cell.row);
          }}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
              event.preventDefault();
              selectEvents(visibleEvents.map((one) => one.id));
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
              event.preventDefault();
              copySelection();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
              event.preventDefault();
              pasteSelection();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
              if (selectedEventIds.length === 0) return;
              event.preventDefault();
              edit({ type: "duplicate", eventIds: selectedEventIds });
              return;
            }
            if (event.key === "Delete" || event.key === "Backspace") {
              event.preventDefault();
              deleteSelection();
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              createAt(visibleKeyboardCell.step, visibleKeyboardCell.row);
              return;
            }
            if (!["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)) return;
            event.preventDefault();
            setKeyboardCell((current) => ({
              step: Math.min(
                visiblePageSteps - 1,
                Math.max(0, current.step + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0)),
              ),
              row: Math.min(
                editorRows.length - 1,
                Math.max(0, current.row + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0)),
              ),
            }));
          }}
        >
          <div className={styles.pitchRows} aria-hidden="true">
            {editorRows.map((row) => (
              <span key={`${row.label}-${String(row.note)}`} data-sharp={row.tone === "sharp"} />
            ))}
          </div>
          {Array.from({ length: VISIBLE_STEPS - visiblePageSteps }, (_, index) => (
            <span
              key={`outside-${String(index)}`}
              className={styles.unavailableGridStep}
              aria-hidden="true"
              style={{
                gridColumn: visiblePageSteps + index + 1,
                gridRow: `1 / span ${String(editorRows.length)}`,
              }}
            />
          ))}
          <span
            className={styles.gridCursor}
            aria-hidden="true"
            style={{
              gridColumn: visibleKeyboardCell.step + 1,
              gridRow: visibleKeyboardCell.row + 1,
            }}
          />
          {marqueeBox === undefined ? null : (
            <span
              className={styles.marqueeSelection}
              aria-hidden="true"
              style={{
                gridColumn: `${String(Math.min(marqueeBox.step0, marqueeBox.step1) + 1)} / span ${String(
                  Math.abs(marqueeBox.step1 - marqueeBox.step0) + 1,
                )}`,
                gridRow: `${String(Math.min(marqueeBox.row0, marqueeBox.row1) + 1)} / span ${String(
                  Math.abs(marqueeBox.row1 - marqueeBox.row0) + 1,
                )}`,
              }}
            />
          )}
          {visibleEvents.map((item) => {
            const row = editorRows.findIndex((one) => one.note === item.data.note);
            const preview = dragPreview?.eventIds.includes(item.id) === true ? dragPreview : undefined;
            const selected = selectedEventIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={styles.pianoRollEvent}
                data-component="piano-roll-event"
                data-event-type={item.type}
                data-selected={selected}
                aria-label={labelFor(item)}
                aria-pressed={selected}
                style={
                  {
                    gridColumn: `${String(eventStep(item) - pageStartStep + 1)} / span ${String(
                      Math.min(eventDurationSteps(item), pageStartStep + VISIBLE_STEPS - eventStep(item)),
                    )}`,
                    gridRow: row + 1,
                    "--event-drag-x": `${String(
                      preview?.mode === "move" || preview?.mode === "resize-start"
                        ? preview.clientDeltaX
                        : 0,
                    )}px`,
                    "--event-drag-y": `${String(preview?.mode === "move" ? preview.clientDeltaY : 0)}px`,
                    "--event-resize-x": `${String(
                      preview?.mode === "resize-end"
                        ? preview.clientDeltaX
                        : preview?.mode === "resize-start"
                          ? -preview.clientDeltaX
                          : 0,
                    )}px`,
                  } as CSSProperties
                }
                onClick={(event) => selectOne(item.id, event.ctrlKey || event.metaKey)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  deleteSelection(item.id);
                }}
                onKeyDown={(event) => onEventKeyDown(event, item)}
                onPointerDown={(event) => startEventDrag(event, item)}
                onPointerMove={updateEventDrag}
                onPointerUp={(event) => finishEventDrag(event, false)}
                onPointerCancel={(event) => finishEventDrag(event, true)}
              >
                {item.type === "note" ? <i data-edge="start" aria-hidden="true" /> : null}
                <span aria-hidden="true">{item.type === "note" ? "" : editorRows[row]?.label}</span>
                {item.type === "note" ? <i data-edge="end" aria-hidden="true" /> : null}
              </button>
            );
          })}
          {ghostEvents.map((item) => {
            const row = editorRows.findIndex((one) => one.note === item.data.note);
            return (
              <span
                key={`ghost-${item.id}`}
                className={styles.ghostEvent}
                data-component="piano-roll-ghost-event"
                aria-hidden="true"
                style={{
                  gridColumn: `${String(eventStep(item) - pageStartStep + 1)} / span ${String(
                    Math.min(eventDurationSteps(item), pageStartStep + VISIBLE_STEPS - eventStep(item)),
                  )}`,
                  gridRow: row + 1,
                }}
              />
            );
          })}
          <Playhead pageStartStep={pageStartStep} cycleSteps={cycleSteps} />
        </div>
      </div>
      <footer
        className={styles.velocityLane}
        data-lane-kind={
          selectedNoteProperty === "accent" || selectedNoteProperty === "slide"
            ? "toggle"
            : selectedNoteProperty === undefined
              ? "automation"
              : "point"
        }
      >
        <span>{activeLaneLabel}</span>
        <div
          className={styles.laneGrid}
          data-component="piano-roll-parameter-lane"
          role="group"
          aria-label={`${activeLaneLabel} lane`}
        >
          {Array.from({ length: VISIBLE_STEPS }, (_, step) => (
            <div className={styles.velocityStep} key={step}>
              {step >= visiblePageSteps ? (
                <output className={styles.unavailableStep}>Outside cycle</output>
              ) : selectedNoteProperty === undefined ? (
                selectedAutomationParameter === undefined ? (
                  <output className={styles.emptyAutomationLane}>No editable lane</output>
                ) : (
                  <AutomationStepControl
                    key={`${selectedAutomationParameter.id}-${String(pageStartStep + step)}-${String(
                      automationSteps.find(
                        (candidate) => candidate.tick === (pageStartStep + step) * STEP_TICKS,
                      )?.value ?? "default",
                    )}`}
                    descriptor={selectedAutomationParameter}
                    label={`${selectedAutomationParameter.name}, step ${String(pageStartStep + step + 1)}`}
                    value={
                      automationSteps.find((candidate) => candidate.tick === (pageStartStep + step) * STEP_TICKS)
                        ?.value ??
                      module?.parameters[selectedAutomationParameter.id] ??
                      selectedAutomationParameter.defaultValue
                    }
                    hasStep={automationSteps.some(
                      (candidate) => candidate.tick === (pageStartStep + step) * STEP_TICKS,
                    )}
                    selected={activeSelectedAutomationTick === (pageStartStep + step) * STEP_TICKS}
                    onSelect={() => setSelectedAutomationTick((pageStartStep + step) * STEP_TICKS)}
                    onCommit={(value) => setAutomationStep(step, value)}
                    onErase={() => setAutomationStep(step, undefined)}
                  />
                )
              ) : (
                visibleEvents
                  .filter((item) => eventStep(item) === pageStartStep + step)
                  .map((item) => (
                  <NotePropertyControl
                    key={item.id}
                    event={item}
                    label={labelFor(item)}
                    selected={selectedEventIds.includes(item.id)}
                    property={selectedNoteProperty}
                    onSelect={() => selectEvents([item.id])}
                    onCommit={(values) => {
                      edit({ type: "properties", eventIds: [item.id], values });
                    }}
                  />
                  ))
              )}
            </div>
          ))}
        </div>
        {selectedAutomationParameter !== undefined ? (
          <div className={styles.automationActions} aria-label="Automation step actions">
            <button
              type="button"
              disabled={activeSelectedAutomationTick === undefined}
              onClick={() => moveSelectedAutomationStep(-1)}
            >
              Move left
            </button>
            <button
              type="button"
              disabled={activeSelectedAutomationTick === undefined}
              onClick={() => moveSelectedAutomationStep(1)}
            >
              Move right
            </button>
            <button
              type="button"
              disabled={activeSelectedAutomationTick === undefined}
              onClick={() => scaleSelectedAutomationStep(-(selectedAutomationParameter.step ?? 0.01))}
            >
              Scale down
            </button>
            <button
              type="button"
              disabled={activeSelectedAutomationTick === undefined}
              onClick={() => scaleSelectedAutomationStep(selectedAutomationParameter.step ?? 0.01)}
            >
              Scale up
            </button>
            <button
              type="button"
              disabled={activeSelectedAutomationTick === undefined}
              onClick={() => {
                if (activeSelectedAutomationTick === undefined || selectedModuleId === undefined) return;
                setAutomationLaneSteps(
                  selectedModuleId,
                  activePatternId,
                  selectedAutomationParameter.id,
                  automationSteps.filter((candidate) => candidate.tick !== activeSelectedAutomationTick),
                );
                setSelectedAutomationTick(undefined);
              }}
            >
              Erase step
            </button>
          </div>
        ) : null}
      </footer>
    </section>
  );
}

type PlaylistIconKind = "pattern" | "song" | "earlier" | "later" | "duplicate" | "remove" | "add";

function PlaylistIcon(props: { readonly kind: PlaylistIconKind }) {
  if (props.kind === "pattern") {
    return (
      <svg className={styles.playlistIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="4.5" height="4.5" rx="0.75" fill="currentColor" />
        <rect x="9.5" y="2" width="4.5" height="4.5" rx="0.75" fill="currentColor" />
        <rect x="2" y="9.5" width="4.5" height="4.5" rx="0.75" fill="currentColor" />
        <rect x="9.5" y="9.5" width="4.5" height="4.5" rx="0.75" fill="currentColor" />
      </svg>
    );
  }
  if (props.kind === "song") {
    return (
      <svg className={styles.playlistIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M10.5 3v7.1a2.2 2.2 0 1 1-1-1.9V5l4.5-1.2v5.3a2.2 2.2 0 1 1-1-1.9V2z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </svg>
    );
  }
  if (props.kind === "earlier" || props.kind === "later") {
    const path = props.kind === "earlier" ? "M8 12V4m-3 3 3-3 3 3" : "M8 4v8m-3-3 3 3 3-3";
    return (
      <svg className={styles.playlistIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (props.kind === "duplicate") {
    return (
      <svg className={styles.playlistIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="5.5" y="2.5" width="7.5" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M10 5.5H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3h5.4a1.3 1.3 0 0 0 1.3-1.3V6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (props.kind === "remove") {
    return (
      <svg className={styles.playlistIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M3.5 4.5h9m-6.5-2h5l.7 2H4.8zm.2 2v7.2c0 .4.3.8.8.8h4c.4 0 .8-.3.8-.8v-7.2m-3.5 2v4m2-4v4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg className={styles.playlistIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlaylistSummary() {
  const patterns = useAppStore((state) => state.project.project.patterns);
  const song = useAppStore((state) => state.project.project.song);
  const activePatternId = useAppStore((state) => state.project.project.activePatternId);
  const selectPattern = useAppStore((state) => state.selectPattern);
  const toggleSongMode = useAppStore((state) => state.toggleSongMode);
  const addSongPlacement = useAppStore((state) => state.addSongPlacement);
  const removeSongPlacement = useAppStore((state) => state.removeSongPlacement);
  const setSongPlacementRepeats = useAppStore((state) => state.setSongPlacementRepeats);
  const reorderSongPlacement = useAppStore((state) => state.reorderSongPlacement);
  const duplicateSongPlacement = useAppStore((state) => state.duplicateSongPlacement);
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const playbackMode = song.enabled ? "Song" : "Pattern";
  const nextPlaybackMode = song.enabled ? "Pattern" : "Song";

  return (
    <aside className={styles.playlist} data-component="playlist-summary" aria-label="Playlist">
      <header className={styles.panelHeader}>
        <h2>Playlist</h2>
        <button
          type="button"
          className={styles.songModeToggle}
          aria-label={`${playbackMode} playback mode`}
          title={`Playlist playback mode: ${playbackMode}. Click to switch to ${nextPlaybackMode}.`}
          aria-pressed={song.enabled}
          onClick={toggleSongMode}
        >
          <PlaylistIcon kind={song.enabled ? "song" : "pattern"} />
        </button>
      </header>
      <ol>
        {song.placements.length === 0 ? (
          <li className={styles.emptyPlaylist}>The Playlist is empty.</li>
        ) : (
          song.placements.map((placement, index) => (
            <li key={placement.id}>
              <button
                type="button"
                aria-pressed={placement.patternId === activePatternId}
                onClick={() => {
                  selectPattern(placement.patternId);
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{patternById.get(placement.patternId)?.name ?? "Missing Pattern"}</strong>
                <small>{`${String(placement.repeatCount)}×`}</small>
              </button>
              <label className={styles.playlistRepeats}>
                <span>Repeats</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  aria-label={`Playlist row ${String(index + 1)} repeat count`}
                  value={placement.repeatCount}
                  onChange={(event) => {
                    const repeatCount = event.currentTarget.valueAsNumber;
                    if (Number.isSafeInteger(repeatCount)) {
                      setSongPlacementRepeats(placement.id, repeatCount);
                    }
                  }}
                />
              </label>
              <button
                type="button"
                aria-label={`Move Playlist row ${String(index + 1)} earlier`}
                title={`Move Playlist row ${String(index + 1)} earlier.`}
                className={styles.playlistAction}
                disabled={index === 0}
                onClick={() => reorderSongPlacement(placement.id, index > 1 ? song.placements[index - 2]?.id : undefined)}
              >
                <PlaylistIcon kind="earlier" />
              </button>
              <button
                type="button"
                aria-label={`Move Playlist row ${String(index + 1)} later`}
                title={`Move Playlist row ${String(index + 1)} later.`}
                className={styles.playlistAction}
                disabled={index >= song.placements.length - 1}
                onClick={() => reorderSongPlacement(placement.id, song.placements[index + 1]?.id)}
              >
                <PlaylistIcon kind="later" />
              </button>
              <button
                type="button"
                aria-label={`Duplicate Playlist row ${String(index + 1)}`}
                title={`Duplicate Playlist row ${String(index + 1)}.`}
                className={styles.playlistAction}
                onClick={() => duplicateSongPlacement(placement.id)}
              >
                <PlaylistIcon kind="duplicate" />
              </button>
              <button
                type="button"
                aria-label={`Remove Playlist row ${String(index + 1)}`}
                title={`Remove Playlist row ${String(index + 1)}.`}
                className={styles.playlistAction}
                onClick={() => {
                  removeSongPlacement(placement.id);
                }}
              >
                <PlaylistIcon kind="remove" />
              </button>
            </li>
          ))
        )}
      </ol>
      <button
        type="button"
        className={styles.addPattern}
        aria-label="Add selected Pattern"
        title="Add the selected Pattern to the Playlist."
        onClick={() => {
          addSongPlacement(activePatternId);
        }}
      >
        <PlaylistIcon kind="add" />
      </button>
    </aside>
  );
}

export const EditorWorkspace = forwardRef<HTMLDivElement>(function EditorWorkspace(_, ref) {
  return (
    <div ref={ref} className={styles.editorWorkspace} data-component="editor-workspace">
      <PatternInspector />
      <PianoRoll />
      <PlaylistSummary />
    </div>
  );
});
