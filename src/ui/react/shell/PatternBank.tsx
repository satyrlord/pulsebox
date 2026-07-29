import { useState } from "react";

import { cx } from "../class-names";
import { useAppStore } from "../store/app-store-context";
import styles from "./PatternBank.module.css";

/**
 * Selects which named Pattern the rack edits and plays. Selection is a project
 * command, so it is undoable and reaches the engine as a delta; the engine
 * switches at the next scheduled step rather than mid-note.
 */
export function PatternBank() {
  const patterns = useAppStore((state) => state.project.project.patterns);
  const activePatternIndex = useAppStore((state) => state.project.project.activePatternIndex);
  const songEnabled = useAppStore((state) => state.project.project.song.enabled);
  const selectPattern = useAppStore((state) => state.selectPattern);
  const renamePattern = useAppStore((state) => state.renamePattern);
  const clearPattern = useAppStore((state) => state.clearPattern);
  const copyPattern = useAppStore((state) => state.copyPattern);

  const [renaming, setRenaming] = useState<number | undefined>(undefined);
  const [draft, setDraft] = useState("");

  const beginRename = (index: number, name: string) => {
    setDraft(name);
    setRenaming(index);
  };

  const commitRename = () => {
    if (renaming !== undefined && draft.trim().length > 0) renamePattern(renaming, draft);
    setRenaming(undefined);
  };

  return (
    <section className={styles.bank} data-component="pattern-bank" aria-label="Pattern bank">
      <div className={styles.slots} role="radiogroup" aria-label="Pattern">
        {patterns.map((pattern, index) => (
          <div key={pattern.id} className={styles.slot}>
            {renaming === index ? (
              <input
                className={styles.rename}
                aria-label={`Rename ${pattern.name}`}
                value={draft}
                autoFocus
                maxLength={40}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") setRenaming(undefined);
                }}
              />
            ) : (
              <button
                type="button"
                role="radio"
                aria-checked={index === activePatternIndex}
                // One tab stop for the group; arrows move within it, which is
                // the expected keyboard model for a radio group.
                tabIndex={index === activePatternIndex ? 0 : -1}
                data-pattern-slot={index}
                className={cx(styles.select, index === activePatternIndex && styles.active)}
                onClick={() => {
                  selectPattern(index);
                }}
                onDoubleClick={() => {
                  beginRename(index, pattern.name);
                }}
                onKeyDown={(event) => {
                  // F2 and Enter are the conventional rename keys. Without one,
                  // renaming would be reachable only by double-click.
                  if (event.key === "F2" || event.key === "Enter") {
                    event.preventDefault();
                    beginRename(index, pattern.name);
                    return;
                  }
                  const step =
                    event.key === "ArrowRight" || event.key === "ArrowDown"
                      ? 1
                      : event.key === "ArrowLeft" || event.key === "ArrowUp"
                        ? -1
                        : 0;
                  if (step === 0) return;
                  event.preventDefault();
                  const next = (index + step + patterns.length) % patterns.length;
                  selectPattern(next);
                  event.currentTarget
                    .closest("[data-component='pattern-bank']")
                    ?.querySelector<HTMLElement>(`[data-pattern-slot="${String(next)}"]`)
                    ?.focus();
                }}
              >
                {pattern.name}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            copyPattern(activePatternIndex, (activePatternIndex + 1) % patterns.length);
          }}
        >
          Copy to next
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            clearPattern(activePatternIndex);
          }}
        >
          Clear
        </button>
      </div>

      {songEnabled ? (
        <p className={styles.note} role="status">
          Song mode is playing the chain. Editing still targets the selected Pattern.
        </p>
      ) : null}
    </section>
  );
}
