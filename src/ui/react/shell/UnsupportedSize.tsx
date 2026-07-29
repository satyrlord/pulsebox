import styles from "./UnsupportedSize.module.css";
import { MINIMUM_VIEWPORT_HEIGHT, MINIMUM_VIEWPORT_WIDTH } from "./useUnsupportedViewport";

export interface UnsupportedSizeSummary {
  readonly name: string;
  readonly tempo: number;
  readonly moduleCount: number;
  readonly patternCount: number;
  readonly songEntryCount: number;
}

export interface UnsupportedSizeProps {
  readonly summary: UnsupportedSizeSummary;
  readonly projectMessage: string | undefined;
  readonly onSave: () => void;
  readonly onExport: () => void;
  readonly projectActionsAvailable: boolean;
}

/**
 * Below the documented editing boundary the workspace is not usable, so the
 * notice takes over rather than letting panels overlap.
 */
export function UnsupportedSize(props: UnsupportedSizeProps) {
  return (
    <main className={styles.notice} data-component="unsupported-size">
      <section className={styles.panel} aria-labelledby="unsupported-size-title">
        <h1 id="unsupported-size-title">Window too small</h1>
        <p className={styles.explanation} role="alert">
          Pulsebox needs at least {MINIMUM_VIEWPORT_WIDTH} by {MINIMUM_VIEWPORT_HEIGHT} pixels to
          edit. Enlarge the window to continue.
        </p>

        <p className={styles.autosave} role="status" aria-live="polite">
          Autosave remains active while editing is unavailable.
          {props.projectMessage === undefined ? "" : ` ${props.projectMessage}`}
        </p>

        <dl className={styles.summary} aria-label="Read-only project summary">
          <div>
            <dt>Project</dt>
            <dd>{props.summary.name}</dd>
          </div>
          <div>
            <dt>Tempo</dt>
            <dd>{props.summary.tempo} BPM</dd>
          </div>
          <div>
            <dt>Modules</dt>
            <dd>{props.summary.moduleCount}</dd>
          </div>
          <div>
            <dt>Patterns</dt>
            <dd>{props.summary.patternCount}</dd>
          </div>
          <div>
            <dt>Song entries</dt>
            <dd>{props.summary.songEntryCount}</dd>
          </div>
        </dl>

        <div className={styles.actions} role="group" aria-label="Project actions">
          <button type="button" onClick={props.onSave} disabled={!props.projectActionsAvailable}>
            Save
          </button>
          <button type="button" onClick={props.onExport} disabled={!props.projectActionsAvailable}>
            Export
          </button>
        </div>
      </section>
    </main>
  );
}
