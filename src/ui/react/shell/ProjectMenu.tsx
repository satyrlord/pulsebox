import { useEffect, useRef, useState } from "react";

import { downloadPortableProject } from "../download-project";
import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./ProjectMenu.module.css";

function MainMenuIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M9.5 1.8 14.2 6.5 12 7.2 8.8 10.4 8.4 13.4 2.6 7.6 5.6 7.2 8.8 4z" />
      <path d="m5 11-2.6 2.6" />
    </svg>
  );
}

function ActionsIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <circle cx="3.2" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="12.8" cy="8" r="1.4" />
    </svg>
  );
}

/**
 * The transport's far-left group: main menu, project selector, pin project, and
 * project actions. Storage lives behind the injected project service; this
 * component only knows about portable bytes and file handles.
 */
export function ProjectMenu() {
  const { projects } = useDependencies();
  const projectName = useAppStore((state) => state.project.project.name);
  const savedProjects = useAppStore((state) => state.savedProjects);
  const projectMessage = useAppStore((state) => state.projectMessage);
  const projectPinned = useAppStore((state) => state.projectPinned);
  const saveProject = useAppStore((state) => state.saveProject);
  const refreshSavedProjects = useAppStore((state) => state.refreshSavedProjects);
  const openProject = useAppStore((state) => state.openProject);
  const importProject = useAppStore((state) => state.importProject);
  const togglePinProject = useAppStore((state) => state.togglePinProject);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setProjectMessage = useAppStore((state) => state.setProjectMessage);
  const clearProjectMessage = useAppStore((state) => state.clearProjectMessage);

  const [openPopover, setOpenPopover] = useState<"main" | "projects" | "actions" | undefined>(
    undefined,
  );
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (openPopover !== "projects") return;
    void refreshSavedProjects();
  }, [openPopover, refreshSavedProjects]);

  useEffect(() => {
    if (projectMessage === undefined) return;
    const timer = setTimeout(clearProjectMessage, 6_000);
    return () => {
      clearTimeout(timer);
    };
  }, [clearProjectMessage, projectMessage]);

  if (projects === undefined) return null;

  const toggle = (target: "main" | "projects" | "actions") => {
    setOpenPopover((value) => (value === target ? undefined : target));
  };

  const exportProject = () => {
    const result = downloadPortableProject(() => projects.exportPortable(), projectName);
    if (!result.ok) setProjectMessage(result.reason);
  };

  return (
    <div className={styles.menu} data-component="project-menu">
      <button
        type="button"
        className={styles.iconControl}
        aria-label="Main menu"
        aria-haspopup="menu"
        aria-expanded={openPopover === "main"}
        onClick={() => {
          toggle("main");
        }}
      >
        <MainMenuIcon />
      </button>

      <button
        type="button"
        className={styles.projectButton}
        aria-label={`Project selector. Current project: ${projectName}.`}
        aria-haspopup="menu"
        aria-expanded={openPopover === "projects"}
        onClick={() => {
          toggle("projects");
        }}
      >
        <span>{projectName}</span>
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
          <path d="M1 1.5 6 6l5-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      <button
        type="button"
        className={styles.iconControl}
        aria-label="Pin project"
        aria-pressed={projectPinned}
        title="Pin this project to the top of the project selector."
        onClick={() => void togglePinProject()}
      >
        <PinIcon />
      </button>

      <button
        type="button"
        className={styles.iconControl}
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={openPopover === "actions"}
        onClick={() => {
          toggle("actions");
        }}
      >
        <ActionsIcon />
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

      {openPopover === "main" ? (
        <div className={styles.popover} role="menu" aria-label="Main menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenPopover(undefined);
              setSettingsOpen(true);
            }}
          >
            Settings
          </button>
        </div>
      ) : null}

      {openPopover === "actions" ? (
        <div className={styles.popover} role="menu" aria-label="Project actions">
          <button type="button" role="menuitem" onClick={() => void saveProject()}>
            Save
          </button>
          <button type="button" role="menuitem" onClick={exportProject}>
            Export
          </button>
          <button type="button" role="menuitem" onClick={() => fileInput.current?.click()}>
            Import
          </button>
        </div>
      ) : null}

      {openPopover === "projects" ? (
        <div className={styles.popover} role="menu" aria-label="Project selector">
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
                      setOpenPopover(undefined);
                      void openProject(project.id);
                    }}
                  >
                    <span className={styles.entryName}>
                      {project.pinned ? (
                        <span className={styles.entryPin} role="img" aria-label="Pinned">
                          <PinIcon />
                        </span>
                      ) : null}
                      {project.name}
                    </span>
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
