import { forwardRef, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import type { GestureId, ModuleInstanceId } from "../../../contracts";
import { AuditionButton } from "../controls/AuditionButton";
import { useContinuousGesture } from "../controls/use-gesture-id";
import { WHEEL_IDLE_MILLISECONDS } from "../controls/use-range-gesture";
import { useAppStore, useDependencies } from "../store/app-store-context";
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
  const activePatternIndex = useAppStore((state) => state.project.project.activePatternIndex);
  const selectPattern = useAppStore((state) => state.selectPattern);
  const clearPattern = useAppStore((state) => state.clearPattern);
  const copyPattern = useAppStore((state) => state.copyPattern);
  const renamePattern = useAppStore((state) => state.renamePattern);
  const pattern = patterns[activePatternIndex];

  return (
    <aside
      className={styles.patternInspector}
      data-component="pattern-inspector"
      aria-label="Pattern inspector"
    >
      <header className={styles.panelHeader}>
        <h2>Pattern</h2>
      </header>
      <label>
        <span>Pattern</span>
        <select
          aria-label="Selected Pattern"
          value={activePatternIndex}
          onChange={(event) => {
            selectPattern(Number(event.currentTarget.value));
          }}
        >
          {patterns.map((one, index) => (
            <option key={one.id} value={index}>
              {one.name}
            </option>
          ))}
        </select>
      </label>
      <PatternNameField
        key={pattern?.id}
        name={pattern?.name ?? ""}
        onCommit={(name) => renamePattern(activePatternIndex, name)}
      />
      <dl>
        <div>
          <dt>Duration</dt>
          <dd>{pattern === undefined ? "Unknown" : `${String(pattern.length)} steps`}</dd>
        </div>
      </dl>
      <div className={styles.inspectorActions}>
        <button
          type="button"
          aria-label="Copy the Pattern to the next slot"
          title="Copy the Pattern to the next slot."
          onClick={() => {
            copyPattern(activePatternIndex, (activePatternIndex + 1) % patterns.length);
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <rect
              x="2"
              y="3.5"
              width="7"
              height="9"
              rx="1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M10.5 8H14m-2-2.5L14.5 8 12 10.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Clear the Pattern"
          title="Clear every step of the Pattern."
          onClick={() => {
            clearPattern(activePatternIndex);
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              d="m4 4 8 8m0-8-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </aside>
  );
}

const PIANO_PITCHES = [
  { label: "C4", note: 60 },
  { label: "B3", note: 59 },
  { label: "A#3", note: 58 },
  { label: "A3", note: 57 },
  { label: "G#3", note: 56 },
  { label: "G3", note: 55 },
  { label: "F#3", note: 54 },
  { label: "F3", note: 53 },
  { label: "E3", note: 52 },
  { label: "D#3", note: 51 },
  { label: "D3", note: 50 },
  { label: "C#3", note: 49 },
  { label: "C3", note: 48 },
] as const;

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

const PATTERN_TICKS = 16 * 240;

/**
 * The moving line over the note grid. Its own component, so the per-frame
 * position updates re-render two elements rather than the whole Piano Roll.
 */
function Playhead() {
  const positionTicks = useAppStore((state) => state.positionTicks);
  const ticksInPattern = ((positionTicks % PATTERN_TICKS) + PATTERN_TICKS) % PATTERN_TICKS;
  const percent = (ticksInPattern / PATTERN_TICKS) * 100;
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
function SeekSteps() {
  const playing = useAppStore((state) => state.project.transport.status === "playing");
  const seek = useAppStore((state) => state.seek);
  return (
    <div className={styles.seekSteps} role="group" aria-label="Start marker">
      {Array.from({ length: 16 }, (_, index) => (
        <button
          key={index}
          type="button"
          disabled={playing}
          aria-label={`Set the start marker to step ${String(index + 1)}`}
          onClick={() => {
            seek(index * 240);
          }}
        />
      ))}
    </div>
  );
}

function PianoRoll() {
  const { auditionNoteFor, manifestFor } = useDependencies();
  const modules = useAppStore((state) => state.project.project.modules);
  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const activePatternIndex = useAppStore((state) => state.project.project.activePatternIndex);
  const patterns = useAppStore((state) => state.project.project.patterns);
  const swing = useAppStore((state) => state.project.project.swing);
  const selectModule = useAppStore((state) => state.selectModule);
  const setSwing = useAppStore((state) => state.setSwing);
  const previewSwing = useAppStore((state) => state.previewSwing);
  const setHumanize = useAppStore((state) => state.setHumanize);
  const previewHumanize = useAppStore((state) => state.previewHumanize);
  const newPatternVariation = useAppStore((state) => state.newPatternVariation);
  const startAudition = useAppStore((state) => state.startAudition);
  const stopAudition = useAppStore((state) => state.stopAudition);
  const humanize = patterns[activePatternIndex]?.humanize ?? 0;
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
  const steps = module?.parts[activePatternIndex] ?? [];
  const activeSteps = steps.flatMap((step, index) => (step.active ? [index + 1] : []));

  return (
    <section className={styles.pianoRoll} data-component="piano-roll" aria-label="Piano Roll">
      <header className={styles.rollTools}>
        <span className={styles.gridReadout}>1/16</span>
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
            previewHumanize(activePatternIndex, value);
          }}
          onCommit={(value, gestureId) => {
            setHumanize(activePatternIndex, value, gestureId);
          }}
        />
        <button
          type="button"
          className={styles.variationButton}
          title="Store a new seed. The same seed always replays the same variation."
          onClick={() => {
            newPatternVariation(activePatternIndex);
          }}
        >
          New variation
        </button>
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
        <span className={styles.rollContext}>
          {`${manifest?.productName ?? "No module"} — ${patterns[activePatternIndex]?.name ?? "Pattern"}`}
        </span>
      </header>
      <div
        className={styles.rollBody}
        data-component="piano-roll-scroll"
        style={
          {
            "--editor-content-height": `${String(editorRows.length * 24)}px`,
            "--editor-row-count": editorRows.length,
          } as CSSProperties
        }
      >
        <AuditionKeys
          label={pitched || manifest === undefined ? "Piano keyboard" : "Drum voices"}
          moduleId={module?.id}
          rows={editorRows}
          onStart={startAudition}
          onStop={stopAudition}
        />
        <div className={styles.noteGrid}>
          <div
            className={styles.noteLayers}
            role="img"
            aria-label={
              activeSteps.length === 0
                ? "The selected Pattern has no active steps."
                : `Active steps: ${activeSteps.join(", ")}.`
            }
          >
            <div className={styles.pitchRows} aria-hidden="true">
              {editorRows.map((row) => (
                <span key={`${row.label}-${String(row.note)}`} data-sharp={row.tone === "sharp"} />
              ))}
            </div>
            <div className={styles.stepNotes} aria-hidden="true">
              {Array.from({ length: 16 }, (_, index) => (
                <i key={index} data-active={steps[index]?.active === true} />
              ))}
            </div>
          </div>
          <SeekSteps />
          <Playhead />
        </div>
      </div>
      <footer className={styles.velocityLane}>
        <span>Velocity</span>
        <div aria-hidden="true">
          {steps.map((step, index) => (
            <i key={index} style={{ blockSize: `${String(Math.round(step.velocity * 100))}%` }} />
          ))}
        </div>
      </footer>
    </section>
  );
}

function PlaylistSummary() {
  const patterns = useAppStore((state) => state.project.project.patterns);
  const song = useAppStore((state) => state.project.project.song);
  const activePatternIndex = useAppStore((state) => state.project.project.activePatternIndex);
  const selectPattern = useAppStore((state) => state.selectPattern);
  const addSongEntry = useAppStore((state) => state.addSongEntry);
  const removeSongEntry = useAppStore((state) => state.removeSongEntry);

  return (
    <aside className={styles.playlist} data-component="playlist-summary" aria-label="Playlist">
      <header className={styles.panelHeader}>
        <h2>Playlist</h2>
      </header>
      <ol>
        {song.entries.length === 0 ? (
          <li className={styles.emptyPlaylist}>The Playlist is empty.</li>
        ) : (
          song.entries.map((entry, index) => (
            <li key={`${String(index)}-${String(entry.patternIndex)}`}>
              <button
                type="button"
                aria-pressed={entry.patternIndex === activePatternIndex}
                onClick={() => {
                  selectPattern(entry.patternIndex);
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{patterns[entry.patternIndex]?.name ?? "Missing Pattern"}</strong>
                <small>{`${String(entry.repeats)}×`}</small>
              </button>
              <button
                type="button"
                aria-label={`Remove Playlist row ${String(index + 1)}`}
                onClick={() => {
                  removeSongEntry(index);
                }}
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ol>
      <button
        type="button"
        className={styles.addPattern}
        onClick={() => {
          addSongEntry(activePatternIndex);
        }}
      >
        Add selected Pattern
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
