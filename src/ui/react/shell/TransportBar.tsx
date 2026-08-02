import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Led } from "../controls/Led";
import { LevelMeter } from "../controls/LevelMeter";
import { SegmentDisplay } from "../controls/SegmentDisplay";
import { useContinuousGesture } from "../controls/use-gesture-id";
import { useAppStore } from "../store/app-store-context";
import { gainToDecibels } from "./fader-decibels";
import { ProjectMenu } from "./ProjectMenu";
import styles from "./TransportBar.module.css";

const TICKS_PER_QUARTER = 960;
const TICKS_PER_STEP = 240;
const STEPS_PER_BAR = 16;
/** The accepted tempo range. The field, its validation and its message share it. */
const TEMPO_MINIMUM = 40;
const TEMPO_MAXIMUM = 240;
/** Rolling tap set: taps older than this fall out; at most this many are kept. */
const TAP_WINDOW_MILLISECONDS = 3_000;
const TAP_MAXIMUM_COUNT = 8;
/** Vertical pixels per BPM while dragging the tempo readout. */
const TEMPO_DRAG_PIXELS_PER_BPM = 4;
const TEMPO_DRAG_THRESHOLD_PIXELS = 4;

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

/** The header readout floor: deeper than a fader, so quiet peaks stay legible. */
const METER_READOUT_FLOOR_DB = -96;

/** Fixed-width dB text so the readout never shifts the layout. */
function formatMasterDb(peak: number): string {
  if (peak <= 0.000_01) return "-inf";
  const decibels = gainToDecibels(peak, METER_READOUT_FLOOR_DB);
  return `${decibels >= 0 ? "+" : ""}${decibels.toFixed(1)}`;
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

function PowerIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2v6" />
      <path d="M4.4 4.4a5.2 5.2 0 1 0 7.2 0" />
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

/**
 * Leaf position readout. Position ticks update per animation frame during
 * playback, so only this display re-renders, not the whole header.
 */
function TransportPosition(props: { readonly tempo: number }) {
  const positionTicks = useAppStore((state) => state.positionTicks);
  return (
    <SegmentDisplay
      className={styles.position}
      fieldId="position"
      label="Transport position"
      primary={formatElapsed(positionTicks, props.tempo)}
      secondary={formatPosition(positionTicks)}
    />
  );
}

/**
 * Leaf master readout: the meter pair, the peak lamp, and the dB text. Master
 * meter frames arrive per animation frame, so only these elements re-render.
 */
function MasterMeterReadout(props: {
  readonly playing: boolean;
  readonly meterMode: "lr" | "ms";
}) {
  const masterMeter = useAppStore((state) => state.masterMeter);
  const peakHeld = useAppStore((state) => state.masterPeakHeld);
  const { playing, meterMode } = props;
  const channelOne = playing ? (meterMode === "lr" ? masterMeter.left : masterMeter.mid) : 0;
  const channelTwo = playing ? (meterMode === "lr" ? masterMeter.right : masterMeter.side) : 0;
  return (
    <>
      <div className={styles.masterMeters} aria-label="Two-channel master meter">
        <span>{meterMode === "lr" ? "L" : "M"}</span>
        <LevelMeter
          label="Master meter channel one"
          level={channelOne}
          width={116}
          height={6}
          orientation="horizontal"
        />
        <span>{meterMode === "lr" ? "R" : "S"}</span>
        <LevelMeter
          label="Master meter channel two"
          level={channelTwo}
          width={116}
          height={6}
          orientation="horizontal"
        />
      </div>
      <div className={styles.peak} data-lit={peakHeld}>
        <Led label="Master peak" lit={peakHeld} />
        <span aria-hidden="true">Peak</span>
      </div>
      <output className={styles.masterDb} aria-label="Master level in decibels">
        {formatMasterDb(playing ? Math.max(masterMeter.left, masterMeter.right) : 0)}
        <span> dB</span>
      </output>
    </>
  );
}

export function TransportBar() {
  const status = useAppStore((state) => state.project.transport.status);
  const recordArmed = useAppStore((state) => state.project.transport.recordArmed);
  const tempo = useAppStore((state) => state.project.project.tempo);
  const songEnabled = useAppStore((state) => state.project.project.song.enabled);
  const audioStatus = useAppStore((state) => state.audioStatus);
  const audioMessage = useAppStore((state) => state.audioMessage);
  const audioUnavailable = useAppStore((state) => state.audioUnavailable);
  const audioRuntimeState = useAppStore((state) => state.audioRuntimeState);
  const meterMode = useAppStore((state) => state.meterMode);
  const metronomeEnabled = useAppStore((state) => state.metronomeEnabled);
  const play = useAppStore((state) => state.play);
  const pause = useAppStore((state) => state.pause);
  const stop = useAppStore((state) => state.stop);
  const toggleRecordArm = useAppStore((state) => state.toggleRecordArm);
  const setTempo = useAppStore((state) => state.setTempo);
  const previewTempo = useAppStore((state) => state.previewTempo);
  const toggleSongMode = useAppStore((state) => state.toggleSongMode);
  const toggleMeterMode = useAppStore((state) => state.toggleMeterMode);
  const toggleMetronome = useAppStore((state) => state.toggleMetronome);
  const togglePower = useAppStore((state) => state.togglePower);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [tempoError, setTempoError] = useState<string | undefined>(undefined);
  const tapTimes = useRef<number[]>([]);
  const tempoDrag = useRef<
    | {
        pointerId: number;
        startY: number;
        startTempo: number;
        value: number;
        dragging: boolean;
      }
    | undefined
  >(undefined);
  const tempoGesture = useContinuousGesture();
  const tempoDraft = draft ?? String(tempo);
  const playing = status === "playing";

  /**
   * A rejected tempo says what was wrong and what will work, and the field keeps
   * the typed value so the user can correct it rather than retype it. Silently
   * reverting would leave the user unable to tell a rejection from a no-op.
   */
  const commitTempo = () => {
    if (tempoDrag.current?.dragging === true) return;
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

  /** Tap tempo averages the rolling set of recent taps. */
  const onTapTempo = () => {
    const now = performance.now();
    const taps = tapTimes.current.filter((time) => now - time < TAP_WINDOW_MILLISECONDS);
    taps.push(now);
    tapTimes.current = taps.slice(-TAP_MAXIMUM_COUNT);
    if (tapTimes.current.length < 2) return;
    let intervalSum = 0;
    for (let index = 1; index < tapTimes.current.length; index += 1) {
      intervalSum += (tapTimes.current[index] ?? 0) - (tapTimes.current[index - 1] ?? 0);
    }
    const meanInterval = intervalSum / (tapTimes.current.length - 1);
    const tapped = Math.round(60_000 / meanInterval);
    setDraft(undefined);
    setTempoError(undefined);
    setTempo(Math.min(TEMPO_MAXIMUM, Math.max(TEMPO_MINIMUM, tapped)));
  };

  // Pointer adjustment on the tempo readout: a vertical drag past a small
  // threshold adjusts BPM; a plain click still focuses the field for typing.
  const onTempoPointerDown = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (event.button !== 0) return;
    tempoDrag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTempo: tempo,
      value: tempo,
      dragging: false,
    };
  };
  const onTempoPointerMove = (event: ReactPointerEvent<HTMLInputElement>) => {
    const drag = tempoDrag.current;
    if (drag?.pointerId !== event.pointerId) return;
    const delta = drag.startY - event.clientY;
    if (!drag.dragging) {
      if (Math.abs(delta) < TEMPO_DRAG_THRESHOLD_PIXELS) return;
      drag.dragging = true;
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
    event.preventDefault();
    const fine = event.shiftKey ? 4 : 1;
    const next = Math.round(
      Math.min(
        TEMPO_MAXIMUM,
        Math.max(TEMPO_MINIMUM, drag.startTempo + delta / (TEMPO_DRAG_PIXELS_PER_BPM * fine)),
      ),
    );
    setDraft(undefined);
    setTempoError(undefined);
    if (next === drag.value) return;
    drag.value = next;
    setDraft(String(next));
    previewTempo(next);
  };
  const onTempoPointerEnd = (event: ReactPointerEvent<HTMLInputElement>) => {
    const drag = tempoDrag.current;
    if (drag?.pointerId !== event.pointerId) return;
    tempoDrag.current = undefined;
    if (drag.dragging && drag.value !== drag.startTempo) {
      setDraft(undefined);
      setTempo(drag.value, tempoGesture.current());
    }
    tempoGesture.end();
  };
  const onTempoPointerCancel = (event: ReactPointerEvent<HTMLInputElement>) => {
    const drag = tempoDrag.current;
    if (drag?.pointerId !== event.pointerId) return;
    tempoDrag.current = undefined;
    if (drag.dragging) {
      setDraft(undefined);
      setTempoError(undefined);
      previewTempo(drag.startTempo);
    }
    tempoGesture.end();
  };

  const statusText = audioUnavailable
    ? "Audio unavailable"
    : audioStatus === "faulted"
      ? (audioMessage ?? "Audio faulted")
      : audioStatus === "recovering"
        ? "Audio recovering"
        : audioRuntimeState === "locked"
          ? "Audio locked"
          : audioRuntimeState === "suspended"
            ? "Audio suspended"
            : audioRuntimeState === "unavailable"
              ? "Audio unavailable"
              : "Audio active";

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
        <label
          className={styles.tempo}
          title="Beats per minute. Drag vertically or type a value."
        >
          <span className={styles.srOnly}>Tempo</span>
          <span className={styles.srOnly} id="tempo-description">
            Beats per minute
          </span>
          <input
            data-field="tempo"
            type="number"
            min={TEMPO_MINIMUM}
            max={TEMPO_MAXIMUM}
            step={1}
            inputMode="numeric"
            aria-label="Tempo"
            aria-invalid={tempoError !== undefined}
            aria-describedby={
              tempoError === undefined ? "tempo-description" : "tempo-description tempo-error"
            }
            value={tempoDraft}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              // Clear the objection as soon as the user starts correcting it.
              if (tempoError !== undefined) setTempoError(undefined);
            }}
            onBlur={commitTempo}
            onPointerDown={onTempoPointerDown}
            onPointerMove={onTempoPointerMove}
            onPointerUp={onTempoPointerEnd}
            onPointerCancel={onTempoPointerCancel}
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
        </label>
        <button
          type="button"
          className={styles.tapTempo}
          aria-label="Tap tempo"
          title="Tap tempo. Tap on the beat."
          onClick={onTapTempo}
        >
          Tap
        </button>
        {tempoError === undefined ? null : (
          <p className={styles.fieldError} id="tempo-error" role="alert">
            {tempoError}
          </p>
        )}
      </div>

      <span className={styles.mark}>PULSEBOX</span>

      <div className={styles.right}>
        <TransportPosition tempo={tempo} />
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
          className={styles.iconButton}
          aria-label="Audio engine power"
          aria-pressed={audioRuntimeState === "active"}
          disabled={audioUnavailable}
          title="Audio engine power."
          onClick={() => void togglePower()}
        >
          <PowerIcon />
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
        <MasterMeterReadout playing={playing} meterMode={meterMode} />
        <output className={`${styles.audioStatus} audio-status`} aria-live="polite">
          <Led label="Audio engine" lit={audioRuntimeState === "active"} decorative />
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
