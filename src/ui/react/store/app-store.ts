import { createStore, type StoreApi } from "zustand";

import type {
  GestureId,
  ModuleInstanceId,
  ParameterValue,
  PluginId,
  PluginManifest,
  RackSlotId,
} from "../../../contracts";
import type { PulseState, PulseStore } from "../../../state/public";

export type AudioStatus = "faulted" | "recovered" | "recovering";

/** The transport surface React is allowed to touch. Never an AudioNode. */
export interface AudioControlPort {
  readonly getPositionTicks: () => number;
  readonly pause: () => number;
  readonly play: (tempo: number) => Promise<void>;
  readonly previewParameter: (moduleId: ModuleInstanceId, parameter: string, value: number) => void;
  /**
   * Transient channel level or pan while a fader is moving. The engine ramps it
   * onto the live mixer node; the committed value still arrives as a command at
   * the end of the gesture.
   */
  readonly previewChannelMix?: (
    moduleId: ModuleInstanceId,
    field: "level" | "pan",
    value: number,
  ) => void;
  /** Transient master level while the master fader is moving. */
  readonly previewMasterLevel?: (level: number) => void;
  readonly startAudition: (moduleId: ModuleInstanceId, note: number) => Promise<void>;
  readonly stopAudition: (moduleId: ModuleInstanceId) => void;
  readonly stop: () => void;
  readonly setSwing?: (swing: number) => void;
}

export type WorkspaceView = "rack" | "mixer" | "song";

export interface SavedProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: string;
}

/**
 * Project storage as the UI sees it. Composition owns the repository and the
 * document codec, so no persistence or browser storage type reaches this layer.
 */
export interface ProjectServicePort {
  save(): Promise<void>;
  list(): Promise<readonly SavedProjectSummary[]>;
  open(id: string): Promise<void>;
  /** Complete portable `.pulsebox` ZIP bytes for download. */
  exportPortable(): Uint8Array;
  /** Validates portable bytes before changing active project state. */
  importPortable(
    bytes: Uint8Array,
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
}

export type AppStorePort = Pick<
  PulseStore,
  "createCommand" | "dispatch" | "getState" | "redo" | "subscribe" | "undo"
>;

export interface AppStoreDependencies {
  readonly store: AppStorePort;
  readonly audio: AudioControlPort;
  readonly manifestFor: (pluginId: PluginId) => PluginManifest | undefined;
  /** Plugins an empty slot offers to add, in menu order. */
  readonly addablePluginIds: readonly PluginId[];
  readonly auditionNoteFor: (pluginId: PluginId, voiceId: string | undefined) => number;
  readonly visibleSlotCount: number;
  readonly projects?: ProjectServicePort;
}

export interface UndoNotice {
  readonly message: string;
  /** Distinguishes consecutive identical messages so the view can re-announce. */
  readonly issuedAt: number;
}

export interface AppState {
  /** Mirror of the domain store. Never mutated here. */
  readonly project: PulseState;
  /** Derived from the audio clock every frame while playing. */
  readonly positionTicks: number;
  readonly audioStatus: AudioStatus | undefined;
  readonly audioMessage: string | undefined;
  readonly audioUnavailable: boolean;
  readonly settingsOpen: boolean;
  readonly undoNotice: UndoNotice | undefined;
  /** Which drum voice the faceplate knobs address, per module. */
  readonly selectedVoiceByModule: Readonly<Record<string, string>>;
  /** Latest peak per module, pushed from the audio thread. */
  readonly meterLevels: Readonly<Record<string, number>>;
  readonly workspaceView: WorkspaceView;

  readonly play: () => Promise<void>;
  readonly pause: () => void;
  readonly stop: () => void;
  readonly toggleRecordArm: () => void;
  readonly setTempo: (tempo: number) => void;
  readonly setSwing: (swing: number, gestureId?: GestureId) => void;
  readonly commitParameter: (
    moduleId: ModuleInstanceId,
    parameter: string,
    value: ParameterValue,
    gestureId?: GestureId,
  ) => void;
  readonly previewParameter: (moduleId: ModuleInstanceId, parameter: string, value: number) => void;
  readonly previewChannelMix: (
    moduleId: ModuleInstanceId,
    field: "level" | "pan",
    value: number,
  ) => void;
  readonly previewMasterLevel: (level: number) => void;
  readonly addModule: (slotId: RackSlotId, pluginId: PluginId) => void;
  readonly removeModule: (moduleId: ModuleInstanceId) => void;
  readonly duplicateModule: (moduleId: ModuleInstanceId, slotId: RackSlotId) => void;
  readonly moveModule: (moduleId: ModuleInstanceId, slotId: RackSlotId) => void;
  readonly selectModule: (moduleId: ModuleInstanceId | undefined) => void;
  readonly toggleCollapse: (moduleId: ModuleInstanceId) => void;
  readonly selectVoice: (moduleId: ModuleInstanceId, voiceId: string) => void;
  readonly startAudition: (moduleId: ModuleInstanceId) => void;
  readonly stopAudition: (moduleId: ModuleInstanceId) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly setSettingsOpen: (open: boolean) => void;
  readonly setPositionTicks: (ticks: number) => void;
  readonly setMeterLevel: (moduleId: ModuleInstanceId, level: number) => void;
  readonly reportAudioStatus: (status: AudioStatus, message?: string) => void;
  readonly markAudioUnavailable: () => void;
  readonly dismissUndoNotice: () => void;
  readonly setWorkspaceView: (view: WorkspaceView) => void;

  readonly selectPattern: (patternIndex: number) => void;
  readonly renamePattern: (patternIndex: number, name: string) => void;
  readonly clearPattern: (patternIndex: number) => void;
  readonly copyPattern: (fromPatternIndex: number, toPatternIndex: number) => void;
  readonly toggleSongMode: () => void;
  readonly addSongEntry: (patternIndex: number) => void;
  readonly removeSongEntry: (entryIndex: number) => void;
  readonly setSongRepeats: (entryIndex: number, repeats: number) => void;

  readonly toggleMute: (moduleId: ModuleInstanceId) => void;
  readonly toggleSolo: (moduleId: ModuleInstanceId) => void;
  readonly setChannelLevel: (
    moduleId: ModuleInstanceId,
    level: number,
    gestureId?: GestureId,
  ) => void;
  readonly setChannelPan: (moduleId: ModuleInstanceId, pan: number, gestureId?: GestureId) => void;
  readonly setMasterLevel: (level: number, gestureId?: GestureId) => void;

  readonly savedProjects: readonly SavedProjectSummary[];
  readonly projectMessage: string | undefined;
  readonly saveProject: () => Promise<void>;
  readonly refreshSavedProjects: () => Promise<void>;
  readonly openProject: (id: string) => Promise<void>;
  readonly importProject: (bytes: Uint8Array) => Promise<void>;
  /** Reports a project-surface outcome, such as a refused export. */
  readonly setProjectMessage: (message: string) => void;
  readonly clearProjectMessage: () => void;
}

export type AppStore = StoreApi<AppState>;

/**
 * Zustand owns everything React reads. The domain store keeps owning commands,
 * undo, revisions, and engine projection, so this layer holds no project truth
 * of its own — it mirrors and dispatches.
 */
export function createAppStore(dependencies: AppStoreDependencies): AppStore {
  const { store, audio } = dependencies;
  let noticeSequence = 0;

  const notice = (message: string): UndoNotice => {
    noticeSequence += 1;
    return { message, issuedAt: noticeSequence };
  };

  const appStore = createStore<AppState>()((set, get) => ({
    project: store.getState(),
    positionTicks: 0,
    audioStatus: undefined,
    audioMessage: undefined,
    audioUnavailable: false,
    settingsOpen: false,
    undoNotice: undefined,
    selectedVoiceByModule: {},
    meterLevels: {},
    workspaceView: "rack",

    play: async () => {
      if (get().audioUnavailable) return;
      const tempo = get().project.project.tempo;
      try {
        await audio.play(tempo);
        store.dispatch(store.createCommand("transport-play", {}));
      } catch {
        set({ audioUnavailable: true });
      }
    },

    pause: () => {
      const positionTicks = audio.pause();
      store.dispatch(store.createCommand("transport-pause", { positionTicks }));
    },

    stop: () => {
      audio.stop();
      store.dispatch(store.createCommand("transport-stop", {}));
    },

    toggleRecordArm: () => {
      store.dispatch(store.createCommand("transport-record-toggle", {}));
    },

    setTempo: (tempo) => {
      store.dispatch(store.createCommand("transport-tempo-set", { tempo }));
    },

    setSwing: (swing, gestureId) => {
      const clamped = Math.min(1, Math.max(0, swing));
      store.dispatch(
        store.createCommand(
          "transport-swing-set",
          { swing: clamped },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    commitParameter: (moduleId, parameter, value, gestureId) => {
      store.dispatch(
        store.createCommand(
          "rack-parameter-set",
          { moduleId, parameter, value },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    previewParameter: (moduleId, parameter, value) => {
      audio.previewParameter(moduleId, parameter, value);
    },

    previewChannelMix: (moduleId, field, value) => {
      audio.previewChannelMix?.(moduleId, field, value);
    },

    previewMasterLevel: (level) => {
      audio.previewMasterLevel?.(level);
    },

    addModule: (slotId, pluginId) => {
      store.dispatch(store.createCommand("rack-module-add", { slotId, pluginId }));
    },

    removeModule: (moduleId) => {
      const manifest = manifestForModule(dependencies, get().project, moduleId);
      audio.stopAudition(moduleId);
      const result = store.dispatch(store.createCommand("rack-module-remove", { moduleId }));
      if (result.status !== "accepted") return;
      set((state) => ({
        selectedVoiceByModule: Object.fromEntries(
          Object.entries(state.selectedVoiceByModule).filter(([id]) => id !== moduleId),
        ),
        // A removed module never reports another meter frame, so its last level
        // would otherwise sit in this map for the rest of the session.
        meterLevels: Object.fromEntries(
          Object.entries(state.meterLevels).filter(([id]) => id !== moduleId),
        ),
        undoNotice: notice(`Removed ${manifest?.productName ?? "module"}. Undo is available.`),
      }));
    },

    duplicateModule: (moduleId, slotId) => {
      store.dispatch(store.createCommand("rack-module-duplicate", { moduleId, slotId }));
    },

    moveModule: (moduleId, slotId) => {
      const result = store.dispatch(store.createCommand("rack-module-move", { moduleId, slotId }));
      if (result.status !== "accepted") return;
      const position = get().project.project.rackSlots.findIndex((slot) => slot.id === slotId);
      set({
        undoNotice: notice(`Moved to rack slot ${String(position + 1).padStart(2, "0")}.`),
      });
    },

    selectModule: (moduleId) => {
      store.dispatch(
        store.createCommand("rack-module-select", moduleId === undefined ? {} : { moduleId }),
      );
    },

    toggleCollapse: (moduleId) => {
      store.dispatch(store.createCommand("rack-module-collapse-toggle", { moduleId }));
    },

    selectVoice: (moduleId, voiceId) => {
      set((state) => ({
        selectedVoiceByModule: { ...state.selectedVoiceByModule, [moduleId]: voiceId },
      }));
    },

    startAudition: (moduleId) => {
      const state = get();
      const module = state.project.project.modules[moduleId];
      if (module === undefined) return;
      if (state.audioUnavailable) {
        set({ audioMessage: "Audio is unavailable. Audition could not start." });
        return;
      }
      const manifest = dependencies.manifestFor(module.pluginId);
      const selectedVoice =
        state.selectedVoiceByModule[moduleId] ??
        (manifest?.kind === "instrument" ? manifest.voices[0]?.id : undefined);
      const note = dependencies.auditionNoteFor(module.pluginId, selectedVoice);
      void audio.startAudition(moduleId, note).catch(() => {
        set({
          audioUnavailable: true,
          audioMessage: "Audio is unavailable. Audition could not start.",
        });
      });
    },

    stopAudition: (moduleId) => {
      audio.stopAudition(moduleId);
    },

    undo: () => {
      store.undo();
      set({ undoNotice: undefined });
    },

    redo: () => {
      store.redo();
    },

    setSettingsOpen: (settingsOpen) => {
      set({ settingsOpen });
    },

    setPositionTicks: (positionTicks) => {
      if (get().positionTicks === positionTicks) return;
      set({ positionTicks });
    },

    setMeterLevel: (moduleId, level) => {
      set((state) => ({ meterLevels: { ...state.meterLevels, [moduleId]: level } }));
    },

    reportAudioStatus: (audioStatus, audioMessage) => {
      set({ audioStatus, audioMessage });
    },

    markAudioUnavailable: () => {
      set({ audioUnavailable: true });
    },

    dismissUndoNotice: () => {
      set({ undoNotice: undefined });
    },

    setWorkspaceView: (workspaceView) => {
      set({ workspaceView });
    },

    selectPattern: (patternIndex) => {
      store.dispatch(store.createCommand("pattern-select", { patternIndex }));
    },

    renamePattern: (patternIndex, name) => {
      store.dispatch(store.createCommand("pattern-rename", { patternIndex, name }));
    },

    clearPattern: (patternIndex) => {
      const name = get().project.project.patterns[patternIndex]?.name ?? "Pattern";
      const result = store.dispatch(store.createCommand("pattern-clear", { patternIndex }));
      if (result.status !== "accepted") return;
      set({ undoNotice: notice(`Cleared ${name}. Undo is available.`) });
    },

    copyPattern: (fromPatternIndex, toPatternIndex) => {
      store.dispatch(store.createCommand("pattern-copy", { fromPatternIndex, toPatternIndex }));
    },

    toggleSongMode: () => {
      store.dispatch(store.createCommand("song-mode-toggle", {}));
    },

    addSongEntry: (patternIndex) => {
      store.dispatch(store.createCommand("song-entry-add", { patternIndex }));
    },

    removeSongEntry: (entryIndex) => {
      store.dispatch(store.createCommand("song-entry-remove", { entryIndex }));
    },

    setSongRepeats: (entryIndex, repeats) => {
      store.dispatch(store.createCommand("song-entry-repeats-set", { entryIndex, repeats }));
    },

    toggleMute: (moduleId) => {
      store.dispatch(store.createCommand("mixer-mute-toggle", { moduleId }));
    },

    toggleSolo: (moduleId) => {
      store.dispatch(store.createCommand("mixer-solo-toggle", { moduleId }));
    },

    setChannelLevel: (moduleId, level, gestureId) => {
      store.dispatch(
        store.createCommand(
          "mixer-level-set",
          { moduleId, level },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    setChannelPan: (moduleId, pan, gestureId) => {
      store.dispatch(
        store.createCommand(
          "mixer-pan-set",
          { moduleId, pan },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    setMasterLevel: (level, gestureId) => {
      store.dispatch(
        store.createCommand(
          "mixer-master-level-set",
          { level },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    savedProjects: [],
    projectMessage: undefined,

    saveProject: async () => {
      const projects = dependencies.projects;
      if (projects === undefined) return;
      try {
        await projects.save();
        set({ projectMessage: notice(`Saved ${get().project.project.name}.`).message });
        await get().refreshSavedProjects();
      } catch {
        set({ projectMessage: "Saving failed. This browser may be blocking storage." });
      }
    },

    refreshSavedProjects: async () => {
      const projects = dependencies.projects;
      if (projects === undefined) return;
      try {
        set({ savedProjects: await projects.list() });
      } catch {
        set({ savedProjects: [], projectMessage: "Stored projects could not be listed." });
      }
    },

    openProject: async (id) => {
      const projects = dependencies.projects;
      if (projects === undefined) return;
      try {
        await projects.open(id);
        set({ projectMessage: "Project opened." });
      } catch {
        set({ projectMessage: "That project could not be opened." });
      }
    },

    importProject: async (bytes) => {
      const projects = dependencies.projects;
      if (projects === undefined) return;
      const result = await projects.importPortable(bytes);
      set({ projectMessage: result.ok ? "Project imported." : result.reason });
    },

    setProjectMessage: (projectMessage) => {
      set({ projectMessage });
    },

    clearProjectMessage: () => {
      set({ projectMessage: undefined });
    },
  }));

  return appStore;
}

/**
 * Mirrors domain state into the Zustand store. Returns the unsubscribe function,
 * so a React effect can tear it down and re-create it without leaking under
 * StrictMode's double invocation.
 */
export function connectDomainStore(appStore: AppStore, store: AppStorePort): () => void {
  appStore.setState({ project: store.getState() });
  return store.subscribe(
    (state) => state,
    (state) => {
      appStore.setState({ project: state });
    },
  );
}

function manifestForModule(
  dependencies: AppStoreDependencies,
  state: PulseState,
  moduleId: ModuleInstanceId,
): PluginManifest | undefined {
  const module = state.project.modules[moduleId];
  return module === undefined ? undefined : dependencies.manifestFor(module.pluginId);
}
