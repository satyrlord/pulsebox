import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./Shell.module.css";

export interface WorkspaceBarProps {
  readonly onToggleEditor: () => void;
}

const SAVE_LABELS = {
  clean: "Save",
  dirty: "Save changes",
  saving: "Saving",
  saved: "Saved",
  error: "Retry save",
} as const;

export function WorkspaceBar(props: WorkspaceBarProps) {
  const { projects } = useDependencies();
  const editorExpanded = useAppStore((state) => state.editorExpanded);
  const canUndo = useAppStore((state) => state.project.history.canUndo);
  const canRedo = useAppStore((state) => state.project.history.canRedo);
  const saveStatus = useAppStore((state) => state.saveStatus);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const saveProject = useAppStore((state) => state.saveProject);

  return (
    <footer className={styles.workspaceBar} data-component="workspace-bar">
      <button
        type="button"
        data-action="toggle-editor"
        aria-expanded={editorExpanded}
        aria-controls="lower-editor"
        title={`${editorExpanded ? "Collapse" : "Expand"} the lower editor. Ctrl+Alt+E.`}
        onClick={props.onToggleEditor}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path
            d={editorExpanded ? "m2 4 4 4 4-4" : "m4 2 4 4-4 4"}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        {editorExpanded ? "Collapse editor" : "Expand editor"}
      </button>
      <span className={styles.barSpacer} />
      <button type="button" disabled={!canUndo} title="Undo. Ctrl+Z." onClick={undo}>
        Undo
      </button>
      <button type="button" disabled={!canRedo} title="Redo. Ctrl+Y." onClick={redo}>
        Redo
      </button>
      <button
        type="button"
        disabled={projects === undefined || saveStatus === "saving"}
        data-save-status={saveStatus}
        title="Save the project. Ctrl+S."
        onClick={() => {
          void saveProject();
        }}
      >
        {SAVE_LABELS[saveStatus]}
      </button>
    </footer>
  );
}
