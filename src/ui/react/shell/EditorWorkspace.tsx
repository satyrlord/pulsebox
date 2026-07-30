import { forwardRef, useState, type CSSProperties } from "react";

import type { ModuleInstanceId } from "../../../contracts";
import { AuditionButton } from "../controls/AuditionButton";
import { useContinuousGesture } from "../controls/use-gesture-id";
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
        <div>
          <dt>Grid</dt>
          <dd>1/16</dd>
        </div>
      </dl>
      <div className={styles.inspectorActions}>
        <button
          type="button"
          onClick={() => {
            copyPattern(activePatternIndex, (activePatternIndex + 1) % patterns.length);
          }}
        >
          Copy to next
        </button>
        <button
          type="button"
          onClick={() => {
            clearPattern(activePatternIndex);
          }}
        >
          Clear
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
  const setHumanize = useAppStore((state) => state.setHumanize);
  const newPatternVariation = useAppStore((state) => state.newPatternVariation);
  const startAudition = useAppStore((state) => state.startAudition);
  const stopAudition = useAppStore((state) => state.stopAudition);
  const swingGesture = useContinuousGesture();
  const humanizeGesture = useContinuousGesture();
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
        <label>
          <span>Swing</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(swing * 100)}
            aria-label="Project Swing"
            aria-valuetext={`${String(Math.round(swing * 100))} percent`}
            {...swingGesture.handlers}
            onChange={(event) => {
              setSwing(event.currentTarget.valueAsNumber / 100, swingGesture.current());
            }}
          />
          <output>{`${String(Math.round(swing * 100))}%`}</output>
        </label>
        <label>
          <span>Humanize</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(humanize * 100)}
            aria-label="Pattern Humanize"
            aria-valuetext={`${String(Math.round(humanize * 100))} percent`}
            {...humanizeGesture.handlers}
            onChange={(event) => {
              setHumanize(
                activePatternIndex,
                event.currentTarget.valueAsNumber / 100,
                humanizeGesture.current(),
              );
            }}
          />
          <output>{`${String(Math.round(humanize * 100))}%`}</output>
        </label>
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
