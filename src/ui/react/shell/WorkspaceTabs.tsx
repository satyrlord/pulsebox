import { cx } from "../class-names";
import { useAppStore, type WorkspaceView } from "../store/app-store-context";
import styles from "./WorkspaceTabs.module.css";

const VIEWS: readonly { readonly id: WorkspaceView; readonly label: string }[] = [
  { id: "rack", label: "Rack" },
  { id: "mixer", label: "Mixer" },
  { id: "song", label: "Song" },
];

/** Mutually exclusive workspace surfaces, as a tab list. */
export function WorkspaceTabs() {
  const workspaceView = useAppStore((state) => state.workspaceView);
  const setWorkspaceView = useAppStore((state) => state.setWorkspaceView);

  return (
    <div className={styles.tabs} role="tablist" aria-label="Workspace">
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          role="tab"
          aria-selected={view.id === workspaceView}
          className={cx(styles.tab, view.id === workspaceView && styles.active)}
          onClick={() => {
            setWorkspaceView(view.id);
          }}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
