import { useState } from "react";

import { Toggle } from "../controls/Toggle";
import { useAppStore } from "../store/app-store-context";
import styles from "./SongView.module.css";

const MINIMUM_REPEATS = 1;
const MAXIMUM_REPEATS = 64;

/**
 * Repeat count for one chain step. The field holds free text while it is being
 * edited and commits on Enter or blur, so typing "12" is one undo entry rather
 * than one per keystroke, and a half-typed value never reaches the arrangement.
 */
function SongRepeatsField(props: {
  readonly repeats: number;
  readonly onCommit: (repeats: number) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const value = draft ?? String(props.repeats);

  const commit = () => {
    const next = Number.parseInt(value, 10);
    setDraft(undefined);
    if (!Number.isInteger(next) || next < MINIMUM_REPEATS || next > MAXIMUM_REPEATS) return;
    if (next !== props.repeats) props.onCommit(next);
  };

  return (
    <label className={styles.repeats}>
      <span className={styles.repeatsLabel}>Repeats</span>
      <input
        type="number"
        min={MINIMUM_REPEATS}
        max={MAXIMUM_REPEATS}
        value={value}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        }}
      />
    </label>
  );
}

/**
 * The pattern chain. Each entry names a Pattern and how many times it repeats;
 * the engine expands the chain into one step resolver, so the scheduler itself
 * never learns about song mode.
 */
export function SongView() {
  const patterns = useAppStore((state) => state.project.project.patterns);
  const song = useAppStore((state) => state.project.project.song);
  const toggleSongMode = useAppStore((state) => state.toggleSongMode);
  const addSongEntry = useAppStore((state) => state.addSongEntry);
  const removeSongEntry = useAppStore((state) => state.removeSongEntry);
  const setSongRepeats = useAppStore((state) => state.setSongRepeats);

  const totalSteps = song.entries.reduce((sum, entry) => {
    const length = patterns[entry.patternIndex]?.length ?? 0;
    return sum + length * entry.repeats;
  }, 0);

  return (
    <section className={styles.song} data-component="song" aria-label="Song">
      <header className={styles.header}>
        <Toggle
          label="Song mode"
          caption="SONG"
          tone="accent"
          pressed={song.enabled}
          onToggle={toggleSongMode}
        />
        <p className={styles.summary} role="status">
          {song.entries.length === 0
            ? "Empty chain. The selected Pattern loops."
            : `${String(song.entries.length)} steps, ${String(totalSteps)} sixteenths.`}
        </p>
      </header>

      <div className={styles.add}>
        <span className={styles.addLabel}>Append</span>
        {patterns.map((pattern, index) => (
          <button
            key={pattern.id}
            type="button"
            className={styles.action}
            onClick={() => {
              addSongEntry(index);
            }}
          >
            {pattern.name}
          </button>
        ))}
      </div>

      {song.entries.length > 0 ? (
        <ol className={styles.chain}>
          {song.entries.map((entry, index) => (
            <li key={`${String(index)}-${String(entry.patternIndex)}`} className={styles.entry}>
              <span className={styles.position}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.pattern}>
                {patterns[entry.patternIndex]?.name ?? "Missing Pattern"}
              </span>
              <SongRepeatsField
                repeats={entry.repeats}
                onCommit={(next) => {
                  setSongRepeats(index, next);
                }}
              />
              <button
                type="button"
                className={styles.action}
                aria-label={`Remove song step ${String(index + 1)}`}
                onClick={() => {
                  removeSongEntry(index);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
