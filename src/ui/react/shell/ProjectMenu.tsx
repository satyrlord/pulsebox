import { useEffect, useRef, useState } from "react";

import { downloadPortableProject } from "../download-project";
import { useAppStore, useDependencies } from "../store/app-store-context";
import styles from "./ProjectMenu.module.css";

/**
 * The transport's far-left group: one project selector. Storage lives behind the
 * injected project service. This component only knows about portable bytes and
 * file handles.
 */
export function ProjectMenu() {
  const { projects, templates } = useDependencies();
  const projectName = useAppStore((state) => state.project.project.name);
  const savedProjects = useAppStore((state) => state.savedProjects);
  const projectMessage = useAppStore((state) => state.projectMessage);
  const refreshSavedProjects = useAppStore((state) => state.refreshSavedProjects);
  const openProject = useAppStore((state) => state.openProject);
  const importProject = useAppStore((state) => state.importProject);
  const createProjectFromTemplate = useAppStore((state) => state.createProjectFromTemplate);
  const setProjectMessage = useAppStore((state) => state.setProjectMessage);
  const clearProjectMessage = useAppStore((state) => state.clearProjectMessage);

  const [projectsOpen, setProjectsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!projectsOpen) return;
    void refreshSavedProjects();
  }, [projectsOpen, refreshSavedProjects]);

  // The popover is a non-modal dialog: focus moves to its first action on open.
  useEffect(() => {
    if (!projectsOpen) return;
    popoverRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [projectsOpen]);

  // A press outside the popover and its trigger closes the popover. Focus stays
  // with the press target: pulling it back to the trigger would fight the
  // pointer. The trigger itself stays a plain toggle through its own click.
  useEffect(() => {
    if (!projectsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node) === true) return;
      setProjectsOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [projectsOpen]);

  useEffect(() => {
    if (projectMessage === undefined) return;
    const timer = setTimeout(clearProjectMessage, 6_000);
    return () => {
      clearTimeout(timer);
    };
  }, [clearProjectMessage, projectMessage]);

  if (projects === undefined) return null;

  /** Escape and every command close the popover and give focus back. */
  const closeAndRestoreFocus = () => {
    setProjectsOpen(false);
    triggerRef.current?.focus();
  };

  const exportProject = () => {
    closeAndRestoreFocus();
    const result = downloadPortableProject(() => projects.exportPortable(), projectName);
    if (!result.ok) setProjectMessage(result.reason);
  };

  return (
    <div ref={menuRef} className={styles.menu} data-component="project-menu">
      <button
        ref={triggerRef}
        type="button"
        className={styles.projectButton}
        aria-label={`Project selector. Current project: ${projectName}.`}
        aria-haspopup="dialog"
        aria-expanded={projectsOpen}
        onClick={() => {
          setProjectsOpen((open) => !open);
        }}
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

      {projectsOpen ? (
        // The content mixes headings, a list, and commands, so this is a
        // labelled non-modal dialog rather than a menu. Focus moves in on open
        // and returns to the trigger on Escape or on a chosen command.
        <div
          ref={popoverRef}
          className={styles.popover}
          role="dialog"
          aria-label="Project selector"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            closeAndRestoreFocus();
          }}
        >
          <p>New project</p>
          {(templates ?? []).map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                closeAndRestoreFocus();
                void createProjectFromTemplate(template.id);
              }}
            >
              {`New: ${template.name}`}
            </button>
          ))}
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
                      closeAndRestoreFocus();
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
          <p>Project file</p>
          <button type="button" onClick={exportProject}>
            Export
          </button>
          <button
            type="button"
            onClick={() => {
              closeAndRestoreFocus();
              fileInput.current?.click();
            }}
          >
            Import
          </button>
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
