import { forwardRef, useState } from "react";

import type { ModuleInstanceId } from "../../../contracts";
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

function PianoRoll() {
  const { manifestFor } = useDependencies();
  const modules = useAppStore((state) => state.project.project.modules);
  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const activePatternIndex = useAppStore((state) => state.project.project.activePatternIndex);
  const patterns = useAppStore((state) => state.project.project.patterns);
  const swing = useAppStore((state) => state.project.project.swing);
  const selectModule = useAppStore((state) => state.selectModule);
  const setSwing = useAppStore((state) => state.setSwing);
  const swingGesture = useContinuousGesture();
  const module = selectedModuleId === undefined ? undefined : modules[selectedModuleId];
  const manifest = module === undefined ? undefined : manifestFor(module.pluginId);
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
      <div className={styles.rollBody}>
        <div className={styles.pitchLabels} aria-hidden="true">
          <span>C4</span>
          <span>B3</span>
          <span>A3</span>
          <span>G3</span>
          <span>F3</span>
          <span>E3</span>
        </div>
        <div
          className={styles.noteGrid}
          role="img"
          aria-label={
            activeSteps.length === 0
              ? "The selected Pattern has no active steps."
              : `Active steps: ${activeSteps.join(", ")}.`
          }
        >
          {Array.from({ length: 16 }, (_, index) => (
            <i key={index} data-active={steps[index]?.active === true} aria-hidden="true" />
          ))}
          <b className={styles.playhead} aria-hidden="true" />
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
