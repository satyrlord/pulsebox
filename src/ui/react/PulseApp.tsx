import { useCallback, useEffect, useRef, type CSSProperties, type RefObject } from "react";

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

/**
 * Grid geometry mirrored from the `.app` rows in PulseApp.module.css. When the
 * stylesheet changes, keep these values in sync.
 */
const HEADER_ROW = 58;
const BAR_ROW = 52;
const HANDLE_ROW = 6;
const MAIN_ROW_MINIMUM = 350;

function editorSizeBounds() {
  const minimum = Math.min(300, Math.max(230, window.innerHeight * 0.3));
  const maximum = Math.max(
    minimum,
    window.innerHeight - HEADER_ROW - BAR_ROW - HANDLE_ROW - MAIN_ROW_MINIMUM,
  );
  return { minimum, maximum };
}

function clampEditorSize(size: number): number {
  const bounds = editorSizeBounds();
  return Math.round(Math.min(bounds.maximum, Math.max(bounds.minimum, size)));
}

/**
 * The window-splitter bar above the lower editor. A drag previews the height by
 * patching the `--editor-size` custom property directly, so per-frame
 * movement does not re-render the component tree. The store commit happens once
 * at release.
 */
function EditorResizeHandle(props: {
  readonly appElement: RefObject<HTMLDivElement | null>;
  readonly editorElement: RefObject<HTMLDivElement | null>;
  readonly hidden: boolean;
}) {
  const editorSize = useAppStore((state) => state.editorSize);
  const setEditorSize = useAppStore((state) => state.setEditorSize);
  const drag = useRef<
    { pointerId: number; originY: number; base: number; last: number } | undefined
  >(undefined);

  const preview = (size: number) => {
    props.appElement.current?.style.setProperty("--editor-size", `${String(size)}px`);
  };

  const restorePreview = () => {
    if (editorSize === undefined) {
      props.appElement.current?.style.removeProperty("--editor-size");
      return;
    }
    preview(editorSize);
  };

  const measuredSize = () => {
    const measured = props.editorElement.current?.offsetHeight ?? 0;
    return measured > 0 ? measured : editorSizeBounds().minimum;
  };

  const bounds = editorSizeBounds();
  const valueNow = Math.round(
    Math.min(bounds.maximum, Math.max(bounds.minimum, editorSize ?? bounds.minimum)),
  );

  return (
    <div
      className={styles.editorResize}
      data-component="editor-resize-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-controls="lower-editor"
      aria-label="Editor height"
      aria-valuemin={Math.round(bounds.minimum)}
      aria-valuemax={Math.round(bounds.maximum)}
      aria-valuenow={valueNow}
      tabIndex={props.hidden ? -1 : 0}
      hidden={props.hidden}
      title="Drag to make the editor taller. Double-click to restore the default height."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // The default action would put focus on the page rather than the
        // separator, and Escape has to reach this element to cancel the drag.
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        const base = editorSize ?? measuredSize();
        drag.current = { pointerId: event.pointerId, originY: event.clientY, base, last: base };
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (state?.pointerId !== event.pointerId) return;
        // The handle sits above the editor, so upward travel adds height.
        const next = clampEditorSize(state.base + (state.originY - event.clientY));
        state.last = next;
        preview(next);
      }}
      onPointerUp={(event) => {
        const state = drag.current;
        if (state?.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current = undefined;
        setEditorSize(state.last);
      }}
      onPointerCancel={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = undefined;
        restorePreview();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (drag.current === undefined) return;
          event.preventDefault();
          drag.current = undefined;
          restorePreview();
          return;
        }
        const current = editorSize ?? measuredSize();
        let next: number | undefined;
        if (event.key === "ArrowUp") next = current + 16;
        if (event.key === "ArrowDown") next = current - 16;
        if (event.key === "PageUp") next = current + 64;
        if (event.key === "PageDown") next = current - 64;
        if (event.key === "Home") next = bounds.minimum;
        if (event.key === "End") next = bounds.maximum;
        if (next === undefined) return;
        event.preventDefault();
        setEditorSize(clampEditorSize(next));
      }}
      onDoubleClick={() => {
        props.appElement.current?.style.removeProperty("--editor-size");
        setEditorSize(undefined);
      }}
    />
  );
}

function EditablePulseApp(props: PulseAppProps) {
  useAudioPosition();

  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const editorExpanded = useAppStore((state) => state.editorExpanded);
  const setEditorExpanded = useAppStore((state) => state.setEditorExpanded);
  const undoNotice = useAppStore((state) => state.undoNotice);
  const dismissUndoNotice = useAppStore((state) => state.dismissUndoNotice);
  const swapReport = useAppStore((state) => state.swapReport);
  const dismissSwapReport = useAppStore((state) => state.dismissSwapReport);
  const undo = useAppStore((state) => state.undo);
  const editorSize = useAppStore((state) => state.editorSize);
  const app = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const editorFocus = useRef<HTMLElement | null>(null);
  const editorFocusFrame = useRef<number | undefined>(undefined);
  // The focus-restore frame must not fire after unmount.
  useEffect(
    () => () => {
      if (editorFocusFrame.current !== undefined) cancelAnimationFrame(editorFocusFrame.current);
    },
    [],
  );
  // The notice is non-blocking: it announces and then clears itself.
  useEffect(() => {
    if (undoNotice === undefined) return;
    const timer = setTimeout(dismissUndoNotice, 6_000);
    return () => {
      clearTimeout(timer);
    };
  }, [dismissUndoNotice, undoNotice]);
  // The swap result panel is non-blocking too. It holds a count the user may
  // want to read, so it stays longer than the undo notice before it clears.
  useEffect(() => {
    if (swapReport === undefined) return;
    const timer = setTimeout(dismissSwapReport, 12_000);
    return () => {
      clearTimeout(timer);
    };
  }, [dismissSwapReport, swapReport]);

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
    editorFocusFrame.current = requestAnimationFrame(() => {
      editorFocusFrame.current = undefined;
      if (editorFocus.current?.isConnected === true) editorFocus.current.focus();
    });
  }, [editorExpanded, setEditorExpanded]);

  useKeyboardShortcuts({ toggleEditor });

  return (
    <div
      ref={app}
      className={styles.app}
      data-component="pulse-app"
      data-editor-expanded={editorExpanded}
      style={
        editorSize === undefined
          ? undefined
          : ({ "--editor-size": `${String(editorSize)}px` } as CSSProperties)
      }
    >
      <TransportBar />
      <MainWorkspace />
      <EditorResizeHandle appElement={app} editorElement={editor} hidden={!editorExpanded} />
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

      {/* Section 14: a swap reports unmapped sequence data through a
          non-blocking result panel. It never blocks input or playback. */}
      {swapReport === undefined ? null : (
        <div
          className={cx(styles.notice, styles.swapReport)}
          data-component="swap-result-panel"
          role="status"
          aria-live="polite"
        >
          <span>
            {`Swapped ${swapReport.fromName} for ${swapReport.toName}. `}
            {swapReport.unmappedEvents === 0
              ? "All sequence events mapped."
              : `${String(swapReport.unmappedEvents)} sequence ${
                  swapReport.unmappedEvents === 1 ? "event has" : "events have"
                } no voice on the new module. The data is kept and restores on swap back.`}
          </span>
          <button type="button" onClick={dismissSwapReport}>
            Dismiss
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
