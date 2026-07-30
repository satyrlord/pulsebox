import { useState } from "react";

import { Led } from "../controls/Led";
import { LevelMeter } from "../controls/LevelMeter";
import { SegmentDisplay } from "../controls/SegmentDisplay";
import { useAppStore } from "../store/app-store-context";
import { masterMeterLevel } from "./master-meter";
import { ProjectMenu } from "./ProjectMenu";
import styles from "./TransportBar.module.css";

const TICKS_PER_QUARTER = 960;
const TICKS_PER_STEP = 240;
const STEPS_PER_BAR = 16;
/** The accepted tempo range. The field, its validation and its message share it. */
const TEMPO_MINIMUM = 40;
const TEMPO_MAXIMUM = 240;

function formatPosition(ticks: number): string {
  const bar = Math.floor(ticks / (TICKS_PER_STEP * STEPS_PER_BAR)) + 1;
  const beat = (Math.floor(ticks / TICKS_PER_QUARTER) % 4) + 1;
  const tick = Math.floor(ticks % TICKS_PER_QUARTER);
  return `${String(bar).padStart(3, "0")} : ${String(beat)} : ${String(tick).padStart(3, "0")}`;
}

function formatElapsed(ticks: number, tempo: number): string {
  const totalMilliseconds = Math.max(0, Math.floor((ticks / TICKS_PER_QUARTER) * (60_000 / tempo)));
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function TransportIcon(props: { readonly kind: "play" | "pause" | "stop" | "record" }) {
  if (props.kind === "play") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 2.5v11l9-5.5z" />
      </svg>
    );
  }
  if (props.kind === "pause") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 2.5h3v11h-3zm6 0h3v11h-3z" />
      </svg>
    );
  }
  if (props.kind === "stop") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3" y="3" width="10" height="10" rx="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5" />
    </svg>
  );
}

function MetronomeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M6 2h4l3 12H3z" />
      <path d="M8 12 11 4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.05"
    >
      <circle cx="8" cy="8" r="2.6" />
      <path d="M2.5 7.4l1.4-.3.4-1-.8-1.2 1.3-1.3 1.2.8 1-.4.3-1.4h1.9l.3 1.4 1 .4 1.2-.8 1.3 1.3-.8 1.2.4 1 1.4.3v1.9l-1.4.3-.4 1 .8 1.2-1.3 1.3-1.2-.8-1 .4-.3 1.4H7.3l-.3-1.4-1-.4-1.2.8-1.3-1.3.8-1.2-.4-1-1.4-.3z" />
    </svg>
  );
}

export function TransportBar() {
  const status = useAppStore((state) => state.project.transport.status);
  const recordArmed = useAppStore((state) => state.project.transport.recordArmed);
  const tempo = useAppStore((state) => state.project.project.tempo);
  const masterLevel = useAppStore((state) => state.project.project.masterLevel);
  const songEnabled = useAppStore((state) => state.project.project.song.enabled);
  const positionTicks = useAppStore((state) => state.positionTicks);
  const audioStatus = useAppStore((state) => state.audioStatus);
  const audioMessage = useAppStore((state) => state.audioMessage);
  const audioUnavailable = useAppStore((state) => state.audioUnavailable);
  const meterLevels = useAppStore((state) => state.meterLevels);
  const meterMode = useAppStore((state) => state.meterMode);
  const metronomeEnabled = useAppStore((state) => state.metronomeEnabled);
  const play = useAppStore((state) => state.play);
  const pause = useAppStore((state) => state.pause);
  const stop = useAppStore((state) => state.stop);
  const toggleRecordArm = useAppStore((state) => state.toggleRecordArm);
  const setTempo = useAppStore((state) => state.setTempo);
  const toggleSongMode = useAppStore((state) => state.toggleSongMode);
  const toggleMeterMode = useAppStore((state) => state.toggleMeterMode);
  const toggleMetronome = useAppStore((state) => state.toggleMetronome);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [tempoError, setTempoError] = useState<string | undefined>(undefined);
  const tempoDraft = draft ?? String(tempo);
  const playing = status === "playing";
  const meter = playing ? masterMeterLevel(meterLevels, masterLevel) : 0;

  /**
   * A rejected tempo says what was wrong and what will work, and the field keeps
   * the typed value so the user can correct it rather than retype it. Silently
   * reverting would leave the user unable to tell a rejection from a no-op.
   */
  const commitTempo = () => {
    const next = Number(tempoDraft);
    if (tempoDraft.trim() === "" || !Number.isFinite(next)) {
      setTempoError(
        `Enter a tempo between ${String(TEMPO_MINIMUM)} and ${String(TEMPO_MAXIMUM)} BPM.`,
      );
      return;
    }
    if (next < TEMPO_MINIMUM || next > TEMPO_MAXIMUM) {
      setTempoError(
        `Tempo must be between ${String(TEMPO_MINIMUM)} and ${String(TEMPO_MAXIMUM)} BPM.`,
      );
      return;
    }
    setTempoError(undefined);
    setDraft(undefined);
    setTempo(Math.round(next));
  };

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
      <div className={styles.left}>
        <ProjectMenu />
        <div className={styles.modeToggle} role="group" aria-label="Transport mode">
          <button
            type="button"
            aria-pressed={!songEnabled}
            onClick={() => {
              if (songEnabled) toggleSongMode();
            }}
          >
            Pattern
          </button>
          <button
            type="button"
            aria-pressed={songEnabled}
            onClick={() => {
              if (!songEnabled) toggleSongMode();
            }}
          >
            Song
          </button>
        </div>
        <div className={styles.transport} role="group" aria-label="Transport">
          <button
            type="button"
            className={styles.play}
            aria-pressed={playing}
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause. Space." : "Play. Space."}
            onClick={() => {
              if (playing) pause();
              else void play();
            }}
          >
            <TransportIcon kind={playing ? "pause" : "play"} />
          </button>
          <button type="button" aria-label="Stop" title="Stop. Escape." onClick={stop}>
            <TransportIcon kind="stop" />
          </button>
          <button
            type="button"
            className={styles.record}
            aria-pressed={recordArmed}
            aria-label="Record arm"
            title="Record arm."
            onClick={toggleRecordArm}
          >
            <TransportIcon kind="record" />
          </button>
        </div>
        <label className={styles.tempo} title="Tempo in beats per minute.">
          <span className={styles.srOnly}>Tempo</span>
          <input
            data-field="tempo"
            type="number"
            min={TEMPO_MINIMUM}
            max={TEMPO_MAXIMUM}
            step={1}
            inputMode="numeric"
            aria-label="Tempo"
            aria-invalid={tempoError !== undefined}
            aria-describedby={tempoError === undefined ? undefined : "tempo-error"}
            value={tempoDraft}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              // Clear the objection as soon as the user starts correcting it.
              if (tempoError !== undefined) setTempoError(undefined);
            }}
            onBlur={commitTempo}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(undefined);
                setTempoError(undefined);
                return;
              }
              if (event.key !== "Enter") return;
              event.preventDefault();
              commitTempo();
            }}
          />
          <span>BPM</span>
        </label>
        {tempoError === undefined ? null : (
          <p className={styles.fieldError} id="tempo-error" role="alert">
            {tempoError}
          </p>
        )}
      </div>

      <span className={styles.mark}>PULSEBOX</span>

      <div className={styles.right}>
        <SegmentDisplay
          className={styles.position}
          fieldId="position"
          label="Transport position"
          primary={formatElapsed(positionTicks, tempo)}
          secondary={formatPosition(positionTicks)}
        />
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Metronome"
          aria-pressed={metronomeEnabled}
          title="Metronome."
          onClick={toggleMetronome}
        >
          <MetronomeIcon />
        </button>
        <button
          type="button"
          className={styles.meterMode}
          aria-label={
            meterMode === "lr"
              ? "Master meter mode: left and right"
              : "Master meter mode: mid and side"
          }
          aria-pressed={meterMode === "ms"}
          onClick={toggleMeterMode}
        >
          {meterMode === "lr" ? "L/R" : "M/S"}
        </button>
        <div className={styles.masterMeters} aria-label="Two-channel master meter">
          <span>{meterMode === "lr" ? "L" : "M"}</span>
          <LevelMeter
            label="Master meter channel one"
            level={meter}
            width={116}
            height={6}
            orientation="horizontal"
          />
          <span>{meterMode === "lr" ? "R" : "S"}</span>
          <LevelMeter
            label="Master meter channel two"
            level={meter}
            width={116}
            height={6}
            orientation="horizontal"
          />
        </div>
        <output className={`${styles.audioStatus} audio-status`} aria-live="polite">
          <Led label="Audio engine" lit={playing} decorative />
          {statusText}
        </output>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Settings"
          title="Settings."
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
