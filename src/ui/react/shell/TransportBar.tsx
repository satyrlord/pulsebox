import { useState } from "react";

import { Led } from "../controls/Led";
import { useContinuousGesture } from "../controls/use-gesture-id";
import { useAppStore } from "../store/app-store-context";
import { cx } from "../class-names";
import styles from "./TransportBar.module.css";

const TICKS_PER_QUARTER = 960;
const TICKS_PER_STEP = 240;
const STEPS_PER_BAR = 16;

function formatPosition(ticks: number): string {
  const bar = Math.floor(ticks / (TICKS_PER_STEP * STEPS_PER_BAR)) + 1;
  const beat = (Math.floor(ticks / TICKS_PER_QUARTER) % 4) + 1;
  const sixteenth = (Math.floor(ticks / TICKS_PER_STEP) % 4) + 1;
  return `${String(bar).padStart(3, "0")}.${String(beat)}.${String(sixteenth)}`;
}

export function TransportBar() {
  const status = useAppStore((state) => state.project.transport.status);
  const recordArmed = useAppStore((state) => state.project.transport.recordArmed);
  const tempo = useAppStore((state) => state.project.project.tempo);
  const positionTicks = useAppStore((state) => state.positionTicks);
  const canUndo = useAppStore((state) => state.project.history.canUndo);
  const canRedo = useAppStore((state) => state.project.history.canRedo);
  const audioStatus = useAppStore((state) => state.audioStatus);
  const audioMessage = useAppStore((state) => state.audioMessage);
  const audioUnavailable = useAppStore((state) => state.audioUnavailable);
  const swing = useAppStore((state) => state.project.project.swing);

  const play = useAppStore((state) => state.play);
  const pause = useAppStore((state) => state.pause);
  const stop = useAppStore((state) => state.stop);
  const toggleRecordArm = useAppStore((state) => state.toggleRecordArm);
  const setTempo = useAppStore((state) => state.setTempo);
  const setSwing = useAppStore((state) => state.setSwing);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  const swingGesture = useContinuousGesture();

  // The field is free text while being edited, so a half-entered number never
  // reaches the clock. `undefined` means "not editing", which lets the committed
  // tempo show through without an effect syncing two sources of truth.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const tempoDraft = draft ?? String(tempo);

  const commitTempo = () => {
    const next = Number(tempoDraft);
    setDraft(undefined);
    if (!Number.isFinite(next) || next < 40 || next > 240) return;
    setTempo(Math.round(next));
  };

  const playing = status === "playing";
  const statusText = audioUnavailable
    ? "Audio unavailable"
    : audioStatus === "faulted"
      ? (audioMessage ?? "Audio faulted")
      : audioStatus === "recovering"
        ? "Audio recovering"
        : playing
          ? "Audio active"
          : "Audio idle";

  return (
    <header className={styles.bar} data-component="transport-bar">
      <span className={styles.mark}>PULSEBOX</span>

      <div className={styles.group} role="group" aria-label="Transport">
        <button
          type="button"
          className={styles.button}
          aria-pressed={playing}
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (playing) pause();
            else void play();
          }}
        >
          <Led label="Playback" lit={playing} decorative />
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className={styles.button} onClick={stop}>
          Stop
        </button>
        <button
          type="button"
          className={styles.button}
          aria-pressed={recordArmed}
          aria-label="Record arm"
          onClick={toggleRecordArm}
        >
          <Led label="Record arm" lit={recordArmed} decorative />
          Rec
        </button>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Tempo</span>
        <input
          data-field="tempo"
          type="number"
          min={40}
          max={240}
          step={1}
          inputMode="numeric"
          value={tempoDraft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
          onBlur={commitTempo}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitTempo();
          }}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Swing</span>
        <input
          data-field="swing"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(swing * 100)}
          aria-valuetext={`${String(Math.round(swing * 100))} percent`}
          {...swingGesture.handlers}
          onChange={(event) => {
            // One drag is one undo entry: the browser emits a change per step,
            // and they all carry the same gesture ID.
            setSwing(event.currentTarget.valueAsNumber / 100, swingGesture.current());
          }}
        />
      </label>

      <output className={styles.position} data-field="position" aria-label="Transport position">
        {formatPosition(positionTicks)}
      </output>

      <div className={styles.group} role="group" aria-label="History">
        <button type="button" className={styles.button} disabled={!canUndo} onClick={undo}>
          Undo
        </button>
        <button type="button" className={styles.button} disabled={!canRedo} onClick={redo}>
          Redo
        </button>
      </div>

      <output className={cx(styles.status, "audio-status")} aria-live="polite">
        {statusText}
      </output>

      <button
        type="button"
        className={styles.button}
        onClick={() => {
          setSettingsOpen(true);
        }}
      >
        Settings
      </button>
    </header>
  );
}
