import { useCallback, useEffect } from "react";

import type { PulseThemeService } from "../../themes";
import { downloadPortableProject } from "./download-project";
import { useAudioPosition } from "./hooks/use-audio-position";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { cx } from "./class-names";
import styles from "./PulseApp.module.css";
import { Mixer } from "./shell/Mixer";
import { PatternBank } from "./shell/PatternBank";
import { ProjectMenu } from "./shell/ProjectMenu";
import { Rack } from "./shell/Rack";
import { SettingsPage } from "./shell/SettingsPage";
import { SongView } from "./shell/SongView";
import { TransportBar } from "./shell/TransportBar";
import { UnsupportedSize } from "./shell/UnsupportedSize";
import { useUnsupportedViewport } from "./shell/useUnsupportedViewport";
import { WorkspaceTabs } from "./shell/WorkspaceTabs";
import { useAppStore, useDependencies } from "./store/app-store-context";

export interface PulseAppProps {
  readonly themeService: PulseThemeService;
}

function EditablePulseApp(props: PulseAppProps) {
  useAudioPosition();
  useKeyboardShortcuts();

  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const workspaceView = useAppStore((state) => state.workspaceView);
  const undoNotice = useAppStore((state) => state.undoNotice);
  const dismissUndoNotice = useAppStore((state) => state.dismissUndoNotice);
  const undo = useAppStore((state) => state.undo);
  // The notice is non-blocking: it announces and then clears itself.
  useEffect(() => {
    if (undoNotice === undefined) return;
    const timer = setTimeout(dismissUndoNotice, 6_000);
    return () => {
      clearTimeout(timer);
    };
  }, [dismissUndoNotice, undoNotice]);

  return (
    <div className={styles.app} data-component="pulse-app">
      <TransportBar />
      <PatternBank />
      <div className={styles.workspaceHeader}>
        <WorkspaceTabs />
        <ProjectMenu />
      </div>
      <main className={styles.workspace}>
        {workspaceView === "rack" ? <Rack /> : null}
        {workspaceView === "mixer" ? <Mixer /> : null}
        {workspaceView === "song" ? <SongView /> : null}
        {settingsOpen ? <SettingsPage themeService={props.themeService} /> : null}
      </main>

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
