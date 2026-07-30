import { useEffect, useRef, useState } from "react";

import { downloadPortableProject } from "../download-project";
import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./ProjectMenu.module.css";

/**
 * Save, open, export, and import. Storage lives behind the injected project
 * service; this component only knows about portable bytes and file handles.
 */
export function ProjectMenu() {
  const { projects } = useDependencies();
  const projectName = useAppStore((state) => state.project.project.name);
  const savedProjects = useAppStore((state) => state.savedProjects);
  const projectMessage = useAppStore((state) => state.projectMessage);
  const saveProject = useAppStore((state) => state.saveProject);
  const refreshSavedProjects = useAppStore((state) => state.refreshSavedProjects);
  const openProject = useAppStore((state) => state.openProject);
  const importProject = useAppStore((state) => state.importProject);
  const setProjectMessage = useAppStore((state) => state.setProjectMessage);
  const clearProjectMessage = useAppStore((state) => state.clearProjectMessage);

  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    void refreshSavedProjects();
  }, [open, refreshSavedProjects]);

  useEffect(() => {
    if (projectMessage === undefined) return;
    const timer = setTimeout(clearProjectMessage, 6_000);
    return () => {
      clearTimeout(timer);
    };
  }, [clearProjectMessage, projectMessage]);

  if (projects === undefined) return null;

  const exportProject = () => {
    const result = downloadPortableProject(() => projects.exportPortable(), projectName);
    if (!result.ok) setProjectMessage(result.reason);
  };

  return (
    <div className={styles.menu} data-component="project-menu">
      <button
        type="button"
        className={styles.projectButton}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{projectName}</span>
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
          <path d="M1 1.5 6 6l5-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      <input
        ref={fileInput}
        className={styles.file}
        type="file"
        accept=".pulsebox,application/zip"
        aria-label="Import project file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file === undefined) return;
          void file.arrayBuffer().then((buffer) => importProject(new Uint8Array(buffer)));
        }}
      />

      {open ? (
        <div className={styles.popover} role="menu" aria-label="Project menu">
          <button type="button" role="menuitem" onClick={() => void saveProject()}>
            Save
          </button>
          <button type="button" role="menuitem" onClick={exportProject}>
            Export
          </button>
          <button type="button" role="menuitem" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <div className={styles.divider} />
          <p>Open project</p>
          <ul className={styles.list} aria-label="Stored projects">
            {savedProjects.length === 0 ? (
              <li className={styles.empty}>No stored projects yet.</li>
            ) : (
              savedProjects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className={styles.entry}
                    onClick={() => {
                      setOpen(false);
                      void openProject(project.id);
                    }}
                  >
                    <span className={styles.entryName}>{project.name}</span>
                    <span className={styles.entryDate}>{project.modifiedAt.slice(0, 10)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {projectMessage === undefined ? null : (
        <p className={styles.message} role="status" aria-live="polite">
          {projectMessage}
        </p>
      )}
    </div>
  );
}
