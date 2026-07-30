import { useCallback, useEffect, useRef } from "react";

import type { PulseThemeService } from "../../themes";
import { downloadPortableProject } from "./download-project";
import { useAudioPosition } from "./hooks/use-audio-position";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { cx } from "./class-names";
import styles from "./PulseApp.module.css";
import { EditorWorkspace } from "./shell/EditorWorkspace";
import { MainWorkspace } from "./shell/MainWorkspace";
import { SettingsPage } from "./shell/SettingsPage";
import { TransportBar } from "./shell/TransportBar";
import { UnsupportedSize } from "./shell/UnsupportedSize";
import { useUnsupportedViewport } from "./shell/useUnsupportedViewport";
import { WorkspaceBar } from "./shell/WorkspaceBar";
import { useAppStore, useDependencies } from "./store/app-store-context";

export interface PulseAppProps {
  readonly themeService: PulseThemeService;
}

function EditablePulseApp(props: PulseAppProps) {
  useAudioPosition();
  useKeyboardShortcuts();

  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const editorExpanded = useAppStore((state) => state.editorExpanded);
  const setEditorExpanded = useAppStore((state) => state.setEditorExpanded);
  const undoNotice = useAppStore((state) => state.undoNotice);
  const dismissUndoNotice = useAppStore((state) => state.dismissUndoNotice);
  const undo = useAppStore((state) => state.undo);
  const editor = useRef<HTMLDivElement>(null);
  const editorFocus = useRef<HTMLElement | null>(null);
  // The notice is non-blocking: it announces and then clears itself.
  useEffect(() => {
    if (undoNotice === undefined) return;
    const timer = setTimeout(dismissUndoNotice, 6_000);
    return () => {
      clearTimeout(timer);
    };
  }, [dismissUndoNotice, undoNotice]);

  const toggleEditor = useCallback(() => {
    if (editorExpanded) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && editor.current?.contains(active) === true) {
        editorFocus.current = active;
      }
      setEditorExpanded(false);
      return;
    }
    setEditorExpanded(true);
    requestAnimationFrame(() => {
      if (editorFocus.current?.isConnected === true) editorFocus.current.focus();
    });
  }, [editorExpanded, setEditorExpanded]);

  return (
    <div className={styles.app} data-component="pulse-app" data-editor-expanded={editorExpanded}>
      <TransportBar />
      <MainWorkspace />
      <div
        id="lower-editor"
        hidden={!editorExpanded}
        onFocusCapture={(event) => {
          editorFocus.current = event.target;
        }}
      >
        <EditorWorkspace ref={editor} />
      </div>
      <WorkspaceBar onToggleEditor={toggleEditor} />
      {settingsOpen ? <SettingsPage themeService={props.themeService} /> : null}

      {undoNotice === undefined ? null : (
        <div className={cx(styles.notice, "undo-notice")} role="status" aria-live="polite">
          <span>{undoNotice.message}</span>
          <button type="button" onClick={undo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

export function PulseApp(props: PulseAppProps) {
  const unsupportedViewport = useUnsupportedViewport();
  const project = useAppStore((state) => state.project.project);
  const projectMessage = useAppStore((state) => state.projectMessage);
  const saveProject = useAppStore((state) => state.saveProject);
  const setProjectMessage = useAppStore((state) => state.setProjectMessage);
  const { projects } = useDependencies();

  const exportProject = useCallback(() => {
    if (projects === undefined) return;
    const result = downloadPortableProject(() => projects.exportPortable(), project.name);
    if (!result.ok) setProjectMessage(result.reason);
  }, [project.name, projects, setProjectMessage]);

  if (unsupportedViewport) {
    return (
      <UnsupportedSize
        summary={{
          name: project.name,
          tempo: project.tempo,
          moduleCount: Object.keys(project.modules).length,
          patternCount: project.patterns.length,
          songEntryCount: project.song.entries.length,
        }}
        projectMessage={projectMessage}
        onSave={() => {
          void saveProject();
        }}
        onExport={exportProject}
        projectActionsAvailable={projects !== undefined}
      />
    );
  }

  return <EditablePulseApp themeService={props.themeService} />;
}
