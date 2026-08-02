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

/** Mirror of the engine's audio-runtime state, as the header displays it. */
export type AudioRuntimeStateView = "locked" | "active" | "suspended" | "unavailable";

/** Post-limiter master analysis for the header meters. Data only. */
export interface MasterMeterView {
  readonly left: number;
  readonly right: number;
  readonly mid: number;
  readonly side: number;
  readonly peak: boolean;
}

export const SILENT_MASTER_METER: MasterMeterView = Object.freeze({
  left: 0,
  right: 0,
  mid: 0,
  side: 0,
  peak: false,
});

/** The transport surface React is allowed to touch. Never an AudioNode. */
export interface AudioControlPort {
  readonly getPositionTicks: () => number;
  readonly pause: () => number;
  readonly play: (tempo: number) => Promise<void>;
  readonly previewParameter: (moduleId: ModuleInstanceId, parameter: string, value: number) => void;
  /** Transient transport tempo while the user moves the tempo field. */
  readonly previewTempo?: (tempo: number) => void;
  /** Transient project Swing while the user moves the timing slider. */
  readonly previewSwing?: (swing: number) => void;
  /** Transient Pattern Humanize while the user moves the timing slider. */
  readonly previewHumanize?: (patternIndex: number, humanize: number) => void;
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
  /** Post-limiter master analysis, polled while the transport runs. */
  readonly getMasterMeter?: () => MasterMeterView;
  readonly setMetronomeEnabled?: (enabled: boolean) => void;
  /** True resumes the engine; false suspends it. Both keep editing available. */
  readonly setPower?: (on: boolean) => Promise<void>;
  readonly setLaunchQuantization?: (steps: number) => void;
}

export type StudioView = "mixer" | "effects" | "master";
export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";

export interface SavedProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: string;
  /**
   * Persisted favorite flag. No MVP control sets it; the post-MVP Favourite
   * feature owns the interface for it.
   */
  readonly favorite: boolean;
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

/** A built-in starter template the user can create a fresh project from. */
export interface ProjectTemplate {
  readonly id: string;
  readonly name: string;
  /** Replaces the working project with a fresh template instance. */
  readonly create: () => void;
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
  /**
   * Notes the plugin can sound, or undefined when every note maps. The swap
   * result panel counts sequence events the swap target cannot map.
   */
  readonly playableNotesFor?: (pluginId: PluginId) => ReadonlySet<number> | undefined;
  readonly visibleSlotCount: number;
  readonly projects?: ProjectServicePort;
  /** Built-in starter templates (section 9.2), in menu order. */
  readonly templates?: readonly ProjectTemplate[];
  /** Random source for new Pattern variations. Tests inject a fixed one. */
  readonly createPatternSeed?: () => number;
  /** Stored lightweight global UI preferences, wired by the composition root. */
  readonly preferences?: {
    readonly metronomeEnabled?: boolean;
    readonly launchQuantizationSteps?: number;
    readonly onMetronomeChange?: (enabled: boolean) => void;
    readonly onLaunchQuantizationChange?: (steps: number) => void;
  };
}

export interface UndoNotice {
  readonly message: string;
  /** Distinguishes consecutive identical messages so the view can re-announce. */
  readonly issuedAt: number;
}

/** Section 14: the non-blocking result panel a swap reports through. */
export interface SwapReport {
  readonly fromName: string;
  readonly toName: string;
  /** Active sequence events the swap target cannot map to a voice. */
  readonly unmappedEvents: number;
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
  readonly studioView: StudioView;
  readonly editorExpanded: boolean;
  /**
   * User-dragged editor row height in CSS pixels. Undefined keeps the CSS
   * default height, which is also the minimum.
   */
  readonly editorSize: number | undefined;
  readonly meterMode: "lr" | "ms";
  readonly metronomeEnabled: boolean;
  readonly selectedSend: "A" | "B" | "C" | "D" | undefined;
  readonly saveStatus: SaveStatus;
  /** Mirror of the engine's audio-runtime state for the header power control. */
  readonly audioRuntimeState: AudioRuntimeStateView;
  /** Latest post-limiter master analysis frame, polled while playing. */
  readonly masterMeter: MasterMeterView;
  /** The header peak lamp, latched briefly after the last peak frame. */
  readonly masterPeakHeld: boolean;
  /** Pattern-launch boundary in sixteenth steps. A global UI preference. */
  readonly launchQuantizationSteps: number;

  readonly play: () => Promise<void>;
  readonly pause: () => void;
  readonly stop: () => void;
  readonly toggleRecordArm: () => void;
  readonly setTempo: (tempo: number, gestureId?: GestureId) => void;
  readonly setSwing: (swing: number, gestureId?: GestureId) => void;
  readonly previewTempo: (tempo: number) => void;
  readonly previewSwing: (swing: number) => void;
  /** Positions the playhead and start marker while not playing. */
  readonly seek: (positionTicks: number) => void;
  readonly setHumanize: (patternIndex: number, humanize: number, gestureId?: GestureId) => void;
  readonly previewHumanize: (patternIndex: number, humanize: number) => void;
  /** Stores a new random seed, which creates a new deterministic variation. */
  readonly newPatternVariation: (patternIndex: number) => void;
  readonly togglePower: () => Promise<void>;
  readonly setMasterMeterFrame: (frame: MasterMeterView) => void;
  readonly reportAudioRuntimeState: (state: AudioRuntimeStateView) => void;
  readonly setLaunchQuantization: (steps: number) => void;
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
  readonly swapModule: (moduleId: ModuleInstanceId, pluginId: PluginId) => void;
  readonly swapReport: SwapReport | undefined;
  readonly dismissSwapReport: () => void;
  readonly selectModule: (moduleId: ModuleInstanceId | undefined) => void;
  readonly selectVoice: (moduleId: ModuleInstanceId, voiceId: string) => void;
  readonly startAudition: (moduleId: ModuleInstanceId, note?: number) => void;
  readonly stopAudition: (moduleId: ModuleInstanceId) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly setSettingsOpen: (open: boolean) => void;
  readonly setPositionTicks: (ticks: number) => void;
  readonly setMeterLevel: (moduleId: ModuleInstanceId, level: number) => void;
  /**
   * Applies a whole frame of meter levels in one store write. Each worklet
   * posts its own level about 30 times a second, so writing them one at a time
   * notifies every selector in the tree once per module per frame. That is main
   * -thread work competing with the scheduler tick, so the composition root
   * coalesces a frame's levels and commits them here together.
   */
  readonly setMeterLevels: (levels: Readonly<Record<string, number>>) => void;
  readonly reportAudioStatus: (status: AudioStatus, message?: string) => void;
  readonly markAudioUnavailable: () => void;
  readonly dismissUndoNotice: () => void;
  readonly setStudioView: (view: StudioView) => void;
  readonly setEditorExpanded: (expanded: boolean) => void;
  readonly setEditorSize: (size: number | undefined) => void;
  readonly toggleMeterMode: () => void;
  readonly toggleMetronome: () => void;
  readonly openSend: (send: "A" | "B" | "C" | "D") => void;

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
  /** Saves the active project. Returns false when storage rejects the save. */
  readonly saveProject: () => Promise<boolean>;
  readonly refreshSavedProjects: () => Promise<void>;
  readonly openProject: (id: string) => Promise<void>;
  readonly importProject: (bytes: Uint8Array) => Promise<void>;
  /** Reports a project-surface outcome, such as a refused export. */
  readonly setProjectMessage: (message: string) => void;
  readonly clearProjectMessage: () => void;
  /** Saves the active project, then replaces it with a built-in template. */
  readonly createProjectFromTemplate: (id: string) => Promise<void>;
}

export type AppStore = StoreApi<AppState>;

const PEAK_HOLD_MILLISECONDS = 1_500;

/**
 * Zustand owns everything React reads. The domain store keeps owning commands,
 * undo, revisions, and engine projection, so this layer holds no project truth
 * of its own — it mirrors and dispatches.
 */
export function createAppStore(dependencies: AppStoreDependencies): AppStore {
  const { store, audio } = dependencies;
  let noticeSequence = 0;
  let lastPeakAt = 0;
  /** Blocks a second Play while the first is still activating the engine. */
  let playInFlight = false;

  const notice = (message: string): UndoNotice => {
    noticeSequence += 1;
    return { message, issuedAt: noticeSequence };
  };

  const initialMetronome = dependencies.preferences?.metronomeEnabled ?? false;
  const initialLaunchQuantization = dependencies.preferences?.launchQuantizationSteps ?? 16;
  audio.setMetronomeEnabled?.(initialMetronome);
  audio.setLaunchQuantization?.(initialLaunchQuantization);

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
    studioView: "mixer",
    editorExpanded: true,
    editorSize: undefined,
    meterMode: "lr",
    metronomeEnabled: initialMetronome,
    selectedSend: undefined,
    saveStatus: "clean",
    audioRuntimeState: "locked",
    masterMeter: SILENT_MASTER_METER,
    masterPeakHeld: false,
    launchQuantizationSteps: initialLaunchQuantization,

    play: async () => {
      if (get().audioUnavailable || playInFlight) return;
      if (get().project.transport.status === "playing") return;
      playInFlight = true;
      const tempo = get().project.project.tempo;
      try {
        await audio.play(tempo);
        store.dispatch(store.createCommand("transport-play", {}));
      } catch {
        set({ audioUnavailable: true });
      } finally {
        playInFlight = false;
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

    setTempo: (tempo, gestureId) => {
      store.dispatch(
        store.createCommand(
          "transport-tempo-set",
          { tempo },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    previewTempo: (tempo) => {
      audio.previewTempo?.(tempo);
    },

    seek: (positionTicks) => {
      store.dispatch(store.createCommand("transport-seek", { positionTicks }));
    },

    setHumanize: (patternIndex, humanize, gestureId) => {
      const clamped = Math.min(1, Math.max(0, humanize));
      store.dispatch(
        store.createCommand(
          "pattern-humanize-set",
          { patternIndex, humanize: clamped },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    previewHumanize: (patternIndex, humanize) => {
      audio.previewHumanize?.(patternIndex, Math.min(1, Math.max(0, humanize)));
    },

    newPatternVariation: (patternIndex) => {
      const seed =
        dependencies.createPatternSeed?.() ?? Math.floor(Math.random() * 0x1_0000_0000);
      store.dispatch(store.createCommand("pattern-seed-set", { patternIndex, seed }));
    },

    togglePower: async () => {
      if (get().audioUnavailable) return;
      const powered = get().audioRuntimeState === "active";
      try {
        if (powered) {
          if (get().project.transport.status === "playing") {
            audio.stop();
            store.dispatch(store.createCommand("transport-stop", {}));
          }
          await audio.setPower?.(false);
        } else {
          await audio.setPower?.(true);
        }
      } catch {
        set({ audioUnavailable: true });
      }
    },

    setMasterMeterFrame: (frame) => {
      // One over-threshold analysis frame is shorter than a glance, so the
      // peak lamp latches briefly instead of following the frame exactly.
      const now = performance.now();
      if (frame.peak) lastPeakAt = now;
      const masterPeakHeld =
        frame.peak || (lastPeakAt > 0 && now - lastPeakAt < PEAK_HOLD_MILLISECONDS);
      const current = get().masterMeter;
      if (
        masterPeakHeld === get().masterPeakHeld &&
        current.left === frame.left &&
        current.right === frame.right &&
        current.mid === frame.mid &&
        current.side === frame.side &&
        current.peak === frame.peak
      ) {
        return;
      }
      set({ masterMeter: frame, masterPeakHeld });
    },

    reportAudioRuntimeState: (audioRuntimeState) => {
      if (get().audioRuntimeState === audioRuntimeState) return;
      set({ audioRuntimeState });
    },

    setLaunchQuantization: (steps) => {
      if (!Number.isSafeInteger(steps) || steps < 1) return;
      audio.setLaunchQuantization?.(steps);
      dependencies.preferences?.onLaunchQuantizationChange?.(steps);
      set({ launchQuantizationSteps: steps });
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

    previewSwing: (swing) => {
      const clamped = Math.min(1, Math.max(0, swing));
      if (audio.previewSwing !== undefined) audio.previewSwing(clamped);
      else audio.setSwing?.(clamped);
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

    swapReport: undefined,

    swapModule: (moduleId, pluginId) => {
      const module = get().project.project.modules[moduleId];
      if (module === undefined) return;
      const fromName = dependencies.manifestFor(module.pluginId)?.productName ?? "module";
      const toName = dependencies.manifestFor(pluginId)?.productName ?? "module";
      const playable = dependencies.playableNotesFor?.(pluginId);
      const unmappedEvents =
        playable === undefined
          ? 0
          : module.parts.reduce(
              (total, steps) =>
                total + steps.filter((step) => step.active && !playable.has(step.note)).length,
              0,
            );
      audio.stopAudition(moduleId);
      const result = store.dispatch(
        store.createCommand("rack-module-swap", { moduleId, pluginId }),
      );
      if (result.status !== "accepted") return;
      const issued = notice(`Swapped ${fromName} for ${toName}. Undo is available.`);
      set((state) => ({
        undoNotice: issued,
        swapReport: { fromName, toName, unmappedEvents, issuedAt: issued.issuedAt },
        // The new plugin has its own voice roster, so a kept selection could
        // name a voice the plugin lacks and hide the voice fast controls.
        selectedVoiceByModule: Object.fromEntries(
          Object.entries(state.selectedVoiceByModule).filter(([id]) => id !== moduleId),
        ),
      }));
    },

    dismissSwapReport: () => {
      set({ swapReport: undefined });
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

    selectVoice: (moduleId, voiceId) => {
      set((state) => ({
        selectedVoiceByModule: { ...state.selectedVoiceByModule, [moduleId]: voiceId },
      }));
    },

    startAudition: (moduleId, requestedNote) => {
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
      const note = requestedNote ?? dependencies.auditionNoteFor(module.pluginId, selectedVoice);
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
      // The swap report may describe the swap this undo just reverted.
      set({ undoNotice: undefined, swapReport: undefined });
    },

    redo: () => {
      store.redo();
      set({ swapReport: undefined });
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

    setMeterLevels: (levels) => {
      set((state) => ({ meterLevels: { ...state.meterLevels, ...levels } }));
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

    setStudioView: (studioView) => {
      set({ studioView });
    },

    setEditorExpanded: (editorExpanded) => {
      set({ editorExpanded });
    },

    setEditorSize: (editorSize) => {
      set({ editorSize });
    },

    toggleMeterMode: () => {
      set((state) => ({ meterMode: state.meterMode === "lr" ? "ms" : "lr" }));
    },

    toggleMetronome: () => {
      const metronomeEnabled = !get().metronomeEnabled;
      audio.setMetronomeEnabled?.(metronomeEnabled);
      dependencies.preferences?.onMetronomeChange?.(metronomeEnabled);
      set({ metronomeEnabled });
    },

    openSend: (selectedSend) => {
      set({ selectedSend, studioView: "effects" });
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
      if (projects === undefined) return false;
      set({ saveStatus: "saving" });
      try {
        await projects.save();
        set({
          projectMessage: `Saved ${get().project.project.name}.`,
          saveStatus: "saved",
        });
        await get().refreshSavedProjects();
        return true;
      } catch {
        set({
          projectMessage: "Saving failed. This browser may be blocking storage.",
          saveStatus: "error",
        });
        return false;
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
        // The swap report described a module of the replaced project.
        set({ projectMessage: "Project opened.", saveStatus: "clean", swapReport: undefined });
      } catch {
        set({ projectMessage: "That project could not be opened." });
      }
    },

    importProject: async (bytes) => {
      const projects = dependencies.projects;
      if (projects === undefined) return;
      const result = await projects.importPortable(bytes);
      if (result.ok) await get().refreshSavedProjects();
      set({
        projectMessage: result.ok ? "Project imported." : result.reason,
        // The swap report described a module of the replaced project.
        ...(result.ok ? { swapReport: undefined } : {}),
      });
    },

    setProjectMessage: (projectMessage) => {
      set({ projectMessage });
    },

    clearProjectMessage: () => {
      set({ projectMessage: undefined });
    },

    createProjectFromTemplate: async (id) => {
      const template = dependencies.templates?.find((one) => one.id === id);
      if (template === undefined) return;
      const projects = dependencies.projects;
      // With no storage service there is nothing to save into, so the
      // template still replaces the working project.
      if (projects !== undefined && !(await get().saveProject())) {
        set({
          projectMessage:
            "The template was not created because the current project could not be saved.",
        });
        return;
      }
      template.create();
      // The fresh copy is stored at once, so it appears in the selector and
      // the Save control reports a saved project, not phantom unsaved edits.
      // A failed save already reported itself and leaves the copy unsaved.
      if (projects !== undefined && !(await get().saveProject())) {
        set({ swapReport: undefined });
        return;
      }
      set({
        projectMessage: `Created ${template.name} from the built-in template.`,
        swapReport: undefined,
      });
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
  let revision = store.getState().project.revision;
  return store.subscribe(
    (state) => state,
    (state) => {
      const changed =
        state.project.revision.epoch !== revision.epoch ||
        state.project.revision.counter !== revision.counter;
      revision = state.project.revision;
      appStore.setState((current) => ({
        project: state,
        saveStatus: changed && current.saveStatus !== "saving" ? "dirty" : current.saveStatus,
      }));
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
