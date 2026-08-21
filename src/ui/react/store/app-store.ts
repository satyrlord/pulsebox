import { createStore, type StoreApi } from "zustand";

import {
  createGestureId,
  type EffectInstanceId,
  type GestureId,
  type IdFactory,
  type ModuleInstanceId,
  type NoteEventId,
  type PatternId,
  type ParameterValue,
  type PluginId,
  type PluginManifest,
  type RackSlotId,
  type SendBusId,
  type SongPlacementId,
} from "../../../contracts";
import {
  clampUnitInterval,
  countUnmappedEvents,
  PATTERN_TICKS_PER_BAR,
  PATTERN_TICKS_PER_STEP,
  type PatternEventEdit,
  type PatternEvent,
  type AutomationStepState,
  type ExternalAutomationTarget,
  type PatternPartState,
  type PatternScale,
  type ProjectSaveResult,
  type PulseState,
  type PulseStore,
  type TemplateCreateResult,
} from "../../../state/public";
import { DEFAULT_LIVE_KEY_MAP, type LiveKeyMap } from "../hooks/live-key-map";

export type AudioStatus = "faulted" | "recovered" | "recovering";

/** Mirror of the engine's audio-runtime state, as the header displays it. */
export type AudioRuntimeStateView = "locked" | "active" | "suspended" | "unavailable";

/** Post-limiter master analysis for the header meters. Data only. */
export interface MasterMeterView {
  readonly left: number;
  readonly right: number;
  readonly mid: number;
  readonly side: number;
  readonly truePeakLeft: number;
  readonly truePeakRight: number;
  readonly truePeakMid: number;
  readonly truePeakSide: number;
  readonly peak: boolean;
}

export const SILENT_MASTER_METER: MasterMeterView = Object.freeze({
  left: 0,
  right: 0,
  mid: 0,
  side: 0,
  truePeakLeft: 0,
  truePeakRight: 0,
  truePeakMid: 0,
  truePeakSide: 0,
  peak: false,
});

/**
 * Mono display level for the master strip meters: the louder analysis channel
 * of the engine's post-master frame. The engine frame is the only master meter
 * source, so the mixer strip, the Master view, and the header all agree.
 */
export function masterMeterDisplayLevel(view: MasterMeterView): number {
  return Math.max(view.left, view.right);
}

function sameMeterFrame(left: MasterMeterView, right: MasterMeterView): boolean {
  return (
    left.left === right.left &&
    left.right === right.right &&
    left.mid === right.mid &&
    left.side === right.side &&
    left.truePeakLeft === right.truePeakLeft &&
    left.truePeakRight === right.truePeakRight &&
    left.truePeakMid === right.truePeakMid &&
    left.truePeakSide === right.truePeakSide &&
    left.peak === right.peak
  );
}

/**
 * The frame the master meters should show. The engine's analysis branch carries
 * real signal whenever the runtime renders. The shell contract still requires
 * silence while the transport does not render.
 */
export function masterMeterFrameFor(
  runtimeState: AudioRuntimeStateView,
  transportStatus: PulseState["transport"]["status"],
  readFrame: (() => MasterMeterView) | undefined,
): MasterMeterView {
  if (
    runtimeState !== "active" ||
    transportStatus !== "playing" ||
    readFrame === undefined
  ) {
    return SILENT_MASTER_METER;
  }
  return readFrame();
}

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
  readonly previewHumanize?: (patternId: PatternId, humanize: number) => void;
  /** Auditions one complete transformed Pattern part without changing project state. */
  readonly previewPatternPart?: (
    moduleId: ModuleInstanceId,
    part: PatternPartState,
    timing: {
      readonly tempo: number;
      readonly swing: number;
      readonly humanize: number;
      readonly seed: number;
    },
  ) => Promise<void>;
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
  readonly previewChannelSendAmount?: (
    moduleId: ModuleInstanceId,
    sendBusId: SendBusId,
    amount: number,
  ) => void;
  readonly previewSendReturnLevel?: (sendBusId: SendBusId, returnLevel: number) => void;
  readonly previewEffectMix?: (effectInstanceId: EffectInstanceId, mix: number) => void;
  readonly previewEffectGain?: (effectInstanceId: EffectInstanceId, gainDecibels: number) => void;
  readonly previewEffectParameter?: (
    effectInstanceId: EffectInstanceId,
    parameterId: string,
    value: ParameterValue,
  ) => void;
  /** Transient master level while the master fader is moving. */
  readonly previewMasterLevel?: (level: number) => void;
  readonly startAudition: (moduleId: ModuleInstanceId, note: number) => Promise<void>;
  readonly stopAudition: (moduleId: ModuleInstanceId) => void;
  readonly stop: () => void;
  readonly setSwing?: (swing: number) => void;
  /** Post-limiter master analysis, polled while the transport runs. */
  readonly getMasterMeter?: () => MasterMeterView;
  /** Master-chain analysis on either side of user processing. */
  readonly getMasterChainMeter?: (position: "pre" | "post") => MasterMeterView;
  readonly getEffectMeter?: (effectInstanceId: EffectInstanceId, meterId: string) => number;
  readonly resetMasterPeak?: () => void;
  readonly setMetronomeEnabled?: (enabled: boolean) => void;
  /** True resumes the engine; false suspends it. Both keep editing available. */
  readonly setPower?: (on: boolean) => Promise<void>;
  readonly setLaunchQuantization?: (steps: number) => void;
}

export type StudioView = "mixer" | "effects" | "master";
export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";
export type LiveInputQuantizeMode = "input" | "after" | "off";
export type EffectChainTarget =
  | { readonly scope: "module"; readonly targetId: ModuleInstanceId }
  | { readonly scope: "send"; readonly targetId: SendBusId }
  | { readonly scope: "master" };
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
 * Project storage as the UI sees it. State owns the save result and document
 * policy, so no repository or browser storage type reaches this layer.
 */
export interface ProjectServicePort {
  save(): Promise<ProjectSaveResult>;
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
  /**
   * Runs the whole section 9.2 transaction: saves the outgoing project,
   * replaces it with a fresh template instance, and stores the copy. The state
   * coordinator owns the transaction. This layer only reports its outcome.
   */
  readonly create: () => Promise<TemplateCreateResult>;
}

export type AppStorePort = Pick<
  PulseStore,
  "createCommand" | "dispatch" | "getState" | "redo" | "subscribe" | "undo"
>;

export interface AppStoreDependencies {
  readonly store: AppStorePort;
  readonly audio: AudioControlPort;
  /** ID source for gesture identity. Tests inject a deterministic factory. */
  readonly idFactory: IdFactory;
  readonly manifestFor: (pluginId: PluginId) => PluginManifest | undefined;
  /** Plugins an empty slot offers to add, in menu order. */
  readonly addablePluginIds: readonly PluginId[];
  /** Effect plugins the shared chain editor can add, in registry order. */
  readonly addableEffectPluginIds?: readonly PluginId[];
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
    readonly liveKeyMap?: LiveKeyMap;
    readonly liveInputQuantizeMode?: LiveInputQuantizeMode;
    readonly liveCountInBars?: number;
    readonly ghostNotesEnabled?: boolean;
    readonly onMetronomeChange?: (enabled: boolean) => void;
    readonly onLaunchQuantizationChange?: (steps: number) => void;
    readonly onLiveKeyMapChange?: (map: LiveKeyMap) => void;
    readonly onLiveInputQuantizeModeChange?: (mode: LiveInputQuantizeMode) => void;
    readonly onLiveCountInBarsChange?: (bars: number) => void;
    readonly onGhostNotesEnabledChange?: (enabled: boolean) => void;
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
  /** Changes on every module-selection request, including a repeated request. */
  readonly rackRevealRequest: number;
  readonly saveStatus: SaveStatus;
  /** Mirror of the engine's audio-runtime state for the header power control. */
  readonly audioRuntimeState: AudioRuntimeStateView;
  /** Latest post-limiter master analysis frame, polled while playing. */
  readonly masterMeter: MasterMeterView;
  readonly masterChainPreMeter: MasterMeterView;
  readonly masterChainPostMeter: MasterMeterView;
  /** Master true-peak clip state. It remains set until resetMasterPeak runs. */
  readonly masterPeakHeld: boolean;
  /** Pattern-launch boundary in sixteenth steps. A global UI preference. */
  readonly launchQuantizationSteps: number;
  /** Keyboard-capture mode. It is local UI state, never project data. */
  readonly liveInputQuantizeMode: LiveInputQuantizeMode;
  readonly liveCountInBars: number;
  readonly liveKeyMap: LiveKeyMap;
  readonly ghostNotesEnabled: boolean;

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
  readonly setHumanize: (patternId: PatternId, humanize: number, gestureId?: GestureId) => void;
  readonly previewHumanize: (patternId: PatternId, humanize: number) => void;
  /** Stores a new random seed, which creates a new deterministic variation. */
  readonly newPatternVariation: (patternId: PatternId) => void;
  readonly togglePower: () => Promise<void>;
  readonly setMasterMeterFrame: (frame: MasterMeterView) => void;
  readonly setMasterChainMeterFrames: (
    pre: MasterMeterView,
    post: MasterMeterView,
  ) => void;
  readonly resetMasterPeak: () => void;
  readonly reportAudioRuntimeState: (state: AudioRuntimeStateView) => void;
  readonly setLaunchQuantization: (steps: number) => void;
  readonly setLiveInputQuantizeMode: (mode: LiveInputQuantizeMode) => void;
  readonly setLiveCountInBars: (bars: number) => void;
  readonly setLiveKeyMap: (map: LiveKeyMap) => void;
  readonly setGhostNotesEnabled: (enabled: boolean) => void;
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
  readonly previewChannelSendAmount: (
    moduleId: ModuleInstanceId,
    sendBusId: SendBusId,
    amount: number,
  ) => void;
  readonly previewSendReturnLevel: (sendBusId: SendBusId, returnLevel: number) => void;
  readonly previewEffectMix: (effectInstanceId: EffectInstanceId, mix: number) => void;
  readonly previewEffectGain: (effectInstanceId: EffectInstanceId, gainDecibels: number) => void;
  readonly previewEffectParameter: (
    effectInstanceId: EffectInstanceId,
    parameterId: string,
    value: ParameterValue,
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
  readonly setChannelSendAmount: (
    moduleId: ModuleInstanceId,
    sendBusId: SendBusId,
    amount: number,
    gestureId?: GestureId,
  ) => void;
  readonly addEffectToChain: (chain: EffectChainTarget, effectPluginId: PluginId) => void;
  readonly removeEffectFromChain: (effectInstanceId: EffectInstanceId) => void;
  readonly replaceEffectInChain: (
    effectInstanceId: EffectInstanceId,
    effectPluginId: PluginId,
  ) => void;
  readonly reorderEffectInChain: (
    effectInstanceId: EffectInstanceId,
    afterEffectId?: EffectInstanceId,
  ) => void;
  readonly setEffectBypassed: (effectInstanceId: EffectInstanceId, bypassed: boolean) => void;
  readonly setEffectMix: (
    effectInstanceId: EffectInstanceId,
    mix: number,
    gestureId?: GestureId,
  ) => void;
  readonly setEffectGain: (
    effectInstanceId: EffectInstanceId,
    gainDecibels: number,
    gestureId?: GestureId,
  ) => void;
  readonly setEffectParameter: (
    effectInstanceId: EffectInstanceId,
    parameterId: string,
    value: ParameterValue,
    gestureId?: GestureId,
  ) => void;
  readonly setSendReturnLevel: (
    sendBusId: SendBusId,
    returnLevel: number,
    gestureId?: GestureId,
  ) => void;
  readonly setSendChainBypassed: (sendBusId: SendBusId, bypassed: boolean) => void;
  readonly toggleModuleEffectsBypass: (moduleId: ModuleInstanceId) => void;
  readonly toggleAllSendEffectsBypass: () => void;
  readonly setSendFocus: (sendBusId: SendBusId, effectInstanceId: EffectInstanceId | null) => void;
  readonly toggleMasterEffectsBypass: () => void;
  readonly openExternalAutomationTarget: (target: ExternalAutomationTarget) => void;
  readonly setExternalAutomationLaneSteps: (
    target: ExternalAutomationTarget,
    patternId: PatternId,
    steps: readonly AutomationStepState[],
  ) => void;

  readonly selectPattern: (patternId: PatternId) => void;
  readonly addPattern: (name?: string, afterPatternId?: PatternId) => void;
  readonly duplicatePattern: (patternId: PatternId) => void;
  readonly deletePattern: (patternId: PatternId) => void;
  readonly reorderPattern: (patternId: PatternId, afterPatternId?: PatternId) => void;
  readonly renamePattern: (patternId: PatternId, name: string) => void;
  readonly setPatternColor: (patternId: PatternId, color: string) => void;
  readonly setPatternScale: (patternId: PatternId, scale: PatternScale) => void;
  readonly setPatternDuration: (patternId: PatternId, durationBars: number) => void;
  readonly clearPattern: (patternId: PatternId) => void;
  readonly selectPianoRollEvents: (
    moduleId: ModuleInstanceId,
    patternId: PatternId,
    eventIds: readonly NoteEventId[],
  ) => void;
  readonly setPianoRollParameter: (parameter: string) => void;
  readonly editPatternEvents: (
    moduleId: ModuleInstanceId,
    patternId: PatternId,
    edit: PatternEventEdit,
    gestureId?: GestureId,
  ) => void;
  /** Commits one captured computer-keyboard event into the active Pattern. */
  readonly recordLivePatternEvent: (
    moduleId: ModuleInstanceId,
    note: number,
    startedAtTicks: number,
    endedAtTicks: number,
    gestureId: GestureId,
  ) => void;
  /** Replaces one Pattern part after a confirmed generator or transform preview. */
  readonly replacePatternPartEvents: (
    moduleId: ModuleInstanceId,
    patternId: PatternId,
    events: readonly PatternEvent[],
    length?: number,
  ) => void;
  readonly setAutomationLaneSteps: (
    moduleId: ModuleInstanceId,
    patternId: PatternId,
    parameterId: string,
    steps: readonly AutomationStepState[],
  ) => void;
  readonly toggleSongMode: () => void;
  readonly addSongPlacement: (patternId: PatternId) => void;
  readonly removeSongPlacement: (placementId: SongPlacementId) => void;
  readonly setSongPlacementRepeats: (placementId: SongPlacementId, repeats: number) => void;
  readonly setSongPlacementPattern: (placementId: SongPlacementId, patternId: PatternId) => void;
  readonly reorderSongPlacement: (
    placementId: SongPlacementId,
    afterPlacementId?: SongPlacementId,
  ) => void;
  readonly duplicateSongPlacement: (placementId: SongPlacementId) => void;

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

/** Default Pattern-launch boundary: one bar of sixteenth steps. */
const DEFAULT_LAUNCH_QUANTIZATION_STEPS = 16;

/**
 * Zustand owns everything React reads. The domain store keeps owning commands,
 * undo, revisions, and engine projection, so this layer holds no project truth
 * of its own — it mirrors and dispatches.
 */
export function createAppStore(dependencies: AppStoreDependencies): AppStore {
  const { store, audio } = dependencies;
  let noticeSequence = 0;
  /** First transport tick that may write an armed live take after its count-in. */
  let recordCaptureAfterTicks: number | undefined;
  /** Blocks a second Play while the first is still activating the engine. */
  let playInFlight = false;
  let playGeneration = 0;
  let settleCancelledPlay: (() => void | Promise<void>) | undefined;

  const cancelPendingPlay = (settle: () => void | Promise<void>): void => {
    if (!playInFlight) return;
    playGeneration += 1;
    settleCancelledPlay = settle;
  };
  const cancelledPlaySettlement = (): (() => void | Promise<void>) | undefined =>
    settleCancelledPlay;

  const notice = (message: string): UndoNotice => {
    noticeSequence += 1;
    return { message, issuedAt: noticeSequence };
  };

  const initialMetronome = dependencies.preferences?.metronomeEnabled ?? false;
  const initialLaunchQuantization =
    dependencies.preferences?.launchQuantizationSteps ?? DEFAULT_LAUNCH_QUANTIZATION_STEPS;
  const initialLiveInputQuantizeMode =
    dependencies.preferences?.liveInputQuantizeMode ?? "input";
  const initialLiveCountInBars = clampCountInBars(dependencies.preferences?.liveCountInBars ?? 0);
  const initialLiveKeyMap = dependencies.preferences?.liveKeyMap ?? DEFAULT_LIVE_KEY_MAP;
  const initialGhostNotesEnabled = dependencies.preferences?.ghostNotesEnabled ?? true;
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
    rackRevealRequest: 0,
    saveStatus: "clean",
    audioRuntimeState: "locked",
    masterMeter: SILENT_MASTER_METER,
    masterChainPreMeter: SILENT_MASTER_METER,
    masterChainPostMeter: SILENT_MASTER_METER,
    masterPeakHeld: false,
    launchQuantizationSteps: initialLaunchQuantization,
    liveInputQuantizeMode: initialLiveInputQuantizeMode,
    liveCountInBars: initialLiveCountInBars,
    liveKeyMap: initialLiveKeyMap,
    ghostNotesEnabled: initialGhostNotesEnabled,

    play: async () => {
      if (get().audioUnavailable || playInFlight) return;
      if (get().project.transport.status === "playing") return;
      playInFlight = true;
      const generation = ++playGeneration;
      settleCancelledPlay = undefined;
      const tempo = get().project.project.tempo;
      try {
        await audio.play(tempo);
        if (generation !== playGeneration) {
          await cancelledPlaySettlement()?.();
          return;
        }
        store.dispatch(store.createCommand("transport-play", {}));
      } catch {
        if (generation === playGeneration) set({ audioUnavailable: true });
      } finally {
        playInFlight = false;
        settleCancelledPlay = undefined;
      }
    },

    pause: () => {
      cancelPendingPlay(() => {
        audio.pause();
      });
      const positionTicks = audio.pause();
      store.dispatch(store.createCommand("transport-pause", { positionTicks }));
    },

    stop: () => {
      cancelPendingPlay(() => {
        audio.stop();
      });
      audio.stop();
      store.dispatch(store.createCommand("transport-stop", {}));
    },

    toggleRecordArm: () => {
      const current = get();
      const arming = !current.project.transport.recordArmed;
      recordCaptureAfterTicks = arming
        ? current.positionTicks + current.liveCountInBars * PATTERN_TICKS_PER_BAR
        : undefined;
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

    setHumanize: (patternId, humanize, gestureId) => {
      const clamped = clampUnitInterval(humanize);
      store.dispatch(
        store.createCommand(
          "pattern-humanize-set",
          { patternId, humanize: clamped },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    previewHumanize: (patternId, humanize) => {
      audio.previewHumanize?.(patternId, clampUnitInterval(humanize));
    },

    newPatternVariation: (patternId) => {
      const seed =
        dependencies.createPatternSeed?.() ?? Math.floor(Math.random() * 0x1_0000_0000);
      store.dispatch(store.createCommand("pattern-seed-set", { patternId, seed }));
    },

    togglePower: async () => {
      if (get().audioUnavailable) return;
      const powered = get().audioRuntimeState === "active";
      try {
        if (powered) {
          cancelPendingPlay(async () => {
            await audio.setPower?.(false);
          });
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
      const currentState = get();
      const masterPeakHeld = currentState.masterPeakHeld || frame.peak;
      const current = currentState.masterMeter;
      if (
        masterPeakHeld === currentState.masterPeakHeld &&
        sameMeterFrame(current, frame)
      ) {
        return;
      }
      set({ masterMeter: frame, masterPeakHeld });
    },

    setMasterChainMeterFrames: (masterChainPreMeter, masterChainPostMeter) => {
      const current = get();
      if (
        sameMeterFrame(current.masterChainPreMeter, masterChainPreMeter) &&
        sameMeterFrame(current.masterChainPostMeter, masterChainPostMeter)
      ) {
        return;
      }
      set({ masterChainPreMeter, masterChainPostMeter });
    },

    resetMasterPeak: () => {
      audio.resetMasterPeak?.();
      set({ masterPeakHeld: false, masterMeter: { ...get().masterMeter, peak: false } });
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

    setLiveInputQuantizeMode: (liveInputQuantizeMode) => {
      if (!isLiveInputQuantizeMode(liveInputQuantizeMode)) return;
      dependencies.preferences?.onLiveInputQuantizeModeChange?.(liveInputQuantizeMode);
      set({ liveInputQuantizeMode });
    },

    setLiveCountInBars: (liveCountInBars) => {
      const bars = clampCountInBars(liveCountInBars);
      dependencies.preferences?.onLiveCountInBarsChange?.(bars);
      set({ liveCountInBars: bars });
    },

    setLiveKeyMap: (liveKeyMap) => {
      dependencies.preferences?.onLiveKeyMapChange?.(liveKeyMap);
      set({ liveKeyMap: [...liveKeyMap] });
    },

    setGhostNotesEnabled: (ghostNotesEnabled) => {
      dependencies.preferences?.onGhostNotesEnabledChange?.(ghostNotesEnabled);
      set({ ghostNotesEnabled });
    },

    setSwing: (swing, gestureId) => {
      const clamped = clampUnitInterval(swing);
      store.dispatch(
        store.createCommand(
          "transport-swing-set",
          { swing: clamped },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    previewSwing: (swing) => {
      const clamped = clampUnitInterval(swing);
      if (audio.previewSwing !== undefined) audio.previewSwing(clamped);
      else audio.setSwing?.(clamped);
    },

    commitParameter: (moduleId, parameter, value, gestureId) => {
      const current = get();
      const module = current.project.project.modules[moduleId];
      const descriptor =
        module === undefined
          ? undefined
          : dependencies.manifestFor(module.pluginId)?.parameters.find(
              (candidate) => candidate.id === parameter,
            );
      const recordingTarget = current.project.transport.recordArmed
        ? recordingTargetFor(current.project, moduleId, current.positionTicks)
        : undefined;
      const commandGestureId =
        recordingTarget !== undefined && descriptor?.automation === "step"
          ? (gestureId ?? createGestureId(dependencies.idFactory))
          : gestureId;
      const result = store.dispatch(
        store.createCommand(
          "rack-parameter-set",
          { moduleId, parameter, value },
          commandGestureId === undefined ? {} : { gestureId: commandGestureId },
        ),
      );
      if (
        result.status !== "accepted" ||
        recordingTarget === undefined ||
        descriptor?.automation !== "step" ||
        commandGestureId === undefined
      ) {
        return;
      }
      const lane = Object.values(current.project.project.automationLanes).find(
        (candidate) =>
          candidate.patternId === recordingTarget.patternId &&
          candidate.targetId === moduleId &&
          candidate.parameterId === parameter,
      );
      const tick =
        Math.floor(recordingTarget.localTicks / PATTERN_TICKS_PER_STEP) *
        PATTERN_TICKS_PER_STEP;
      const steps = [
        ...(lane?.steps.filter((step) => step.tick !== tick) ?? []),
        { tick, value },
      ].sort((left, right) => left.tick - right.tick);
      store.dispatch(
        store.createCommand(
          "automation-lane-steps-set",
          {
            moduleId,
            patternId: recordingTarget.patternId,
            parameterId: parameter,
            steps,
          },
          { gestureId: commandGestureId },
        ),
      );
    },

    previewParameter: (moduleId, parameter, value) => {
      audio.previewParameter(moduleId, parameter, value);
    },

    previewChannelMix: (moduleId, field, value) => {
      audio.previewChannelMix?.(moduleId, field, value);
    },

    previewChannelSendAmount: (moduleId, sendBusId, amount) => {
      audio.previewChannelSendAmount?.(moduleId, sendBusId, amount);
    },

    previewSendReturnLevel: (sendBusId, returnLevel) => {
      audio.previewSendReturnLevel?.(sendBusId, returnLevel);
    },

    previewEffectMix: (effectInstanceId, mix) => {
      audio.previewEffectMix?.(effectInstanceId, mix);
    },

    previewEffectGain: (effectInstanceId, gainDecibels) => {
      audio.previewEffectGain?.(effectInstanceId, gainDecibels);
    },

    previewEffectParameter: (effectInstanceId, parameterId, value) => {
      audio.previewEffectParameter?.(effectInstanceId, parameterId, value);
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
      // The count is state-owned section 14 policy; this layer only reports it.
      const unmappedEvents = countUnmappedEvents(
        Object.values(get().project.project.patterns)
          .map((pattern) => pattern.parts[moduleId])
          .filter((part): part is NonNullable<typeof part> => part !== undefined),
        dependencies.playableNotesFor?.(pluginId),
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
      set((state) => ({ rackRevealRequest: state.rackRevealRequest + 1 }));
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
      // With no selected voice, the engine falls back to the manifest's
      // declared audition note, so no default-voice rule lives here.
      const selectedVoice = state.selectedVoiceByModule[moduleId];
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
      cancelPendingPlay(() => {
        audio.stop();
      });
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

    setChannelSendAmount: (moduleId, sendBusId, amount, gestureId) => {
      store.dispatch(
        store.createCommand(
          "mixer-send-amount-set",
          { moduleId, sendBusId, amount },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    addEffectToChain: (chain, effectPluginId) => {
      store.dispatch(store.createCommand("effects-chain-effect-add", { chain, effectPluginId }));
    },

    removeEffectFromChain: (effectInstanceId) => {
      store.dispatch(store.createCommand("effects-chain-effect-remove", { effectInstanceId }));
    },

    replaceEffectInChain: (effectInstanceId, effectPluginId) => {
      store.dispatch(
        store.createCommand("effects-chain-effect-replace", {
          effectInstanceId,
          effectPluginId,
        }),
      );
    },

    reorderEffectInChain: (effectInstanceId, afterEffectId) => {
      store.dispatch(
        store.createCommand(
          "effects-chain-effect-reorder",
          afterEffectId === undefined ? { effectInstanceId } : { effectInstanceId, afterEffectId },
        ),
      );
    },

    setEffectBypassed: (effectInstanceId, bypassed) => {
      store.dispatch(store.createCommand("effects-instance-bypass-set", { effectInstanceId, bypassed }));
    },

    setEffectMix: (effectInstanceId, mix, gestureId) => {
      store.dispatch(
        store.createCommand(
          "effects-instance-mix-set",
          { effectInstanceId, mix },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    setEffectGain: (effectInstanceId, gainDecibels, gestureId) => {
      store.dispatch(
        store.createCommand(
          "effects-instance-gain-set",
          { effectInstanceId, gainDecibels },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    setEffectParameter: (effectInstanceId, parameterId, value, gestureId) => {
      store.dispatch(
        store.createCommand(
          "effects-instance-parameter-set",
          { effectInstanceId, parameterId, value },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    setSendReturnLevel: (sendBusId, returnLevel, gestureId) => {
      store.dispatch(
        store.createCommand(
          "effects-send-return-level-set",
          { sendBusId, returnLevel },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
    },

    setSendChainBypassed: (sendBusId, bypassed) => {
      store.dispatch(store.createCommand("effects-send-chain-bypass-set", { sendBusId, bypassed }));
    },

    toggleModuleEffectsBypass: (moduleId) => {
      store.dispatch(store.createCommand("effects-module-chain-bypass-toggle", { moduleId }));
    },

    toggleAllSendEffectsBypass: () => {
      store.dispatch(store.createCommand("effects-send-all-bypass-toggle", {}));
    },

    setSendFocus: (sendBusId, effectInstanceId) => {
      store.dispatch(store.createCommand("effects-send-focus-set", { sendBusId, effectInstanceId }));
    },

    toggleMasterEffectsBypass: () => {
      store.dispatch(store.createCommand("effects-master-bypass-toggle", {}));
    },

    openExternalAutomationTarget: (target) => {
      store.dispatch(store.createCommand("piano-roll-automation-target-set", { target }));
      set({ editorExpanded: true });
    },

    setExternalAutomationLaneSteps: (target, patternId, steps) => {
      const result = store.dispatch(
        store.createCommand("automation-lane-steps-set", {
          patternId,
          scope: target.scope,
          targetId: target.targetId,
          parameterId: target.parameterId,
          steps,
        }),
      );
      if (result.status !== "accepted") return;
      set({ undoNotice: notice("Updated the automation lane. Undo is available.") });
    },

    selectPattern: (patternId) => {
      store.dispatch(store.createCommand("pattern-select", { patternId }));
    },

    addPattern: (name, afterPatternId) => {
      store.dispatch(
        store.createCommand(
          "pattern-add",
          { ...(name === undefined ? {} : { name }), ...(afterPatternId === undefined ? {} : { afterPatternId }) },
        ),
      );
    },

    duplicatePattern: (patternId) => {
      store.dispatch(store.createCommand("pattern-duplicate", { patternId }));
    },

    deletePattern: (patternId) => {
      store.dispatch(store.createCommand("pattern-delete", { patternId }));
    },

    reorderPattern: (patternId, afterPatternId) => {
      store.dispatch(
        store.createCommand(
          "pattern-reorder",
          afterPatternId === undefined ? { patternId } : { patternId, afterPatternId },
        ),
      );
    },

    renamePattern: (patternId, name) => {
      store.dispatch(store.createCommand("pattern-rename", { patternId, name }));
    },

    setPatternColor: (patternId, color) => {
      store.dispatch(store.createCommand("pattern-color-set", { patternId, color }));
    },

    setPatternScale: (patternId, scale) => {
      store.dispatch(store.createCommand("pattern-scale-set", { patternId, scale }));
    },

    setPatternDuration: (patternId, durationBars) => {
      store.dispatch(store.createCommand("pattern-duration-set", { patternId, durationBars }));
    },

    clearPattern: (patternId) => {
      const name = get().project.project.patterns.find((pattern) => pattern.id === patternId)?.name ?? "Pattern";
      const result = store.dispatch(store.createCommand("pattern-clear", { patternId }));
      if (result.status !== "accepted") return;
      set({ undoNotice: notice(`Cleared ${name}. Undo is available.`) });
    },

    selectPianoRollEvents: (moduleId, patternId, eventIds) => {
      store.dispatch(
        store.createCommand("piano-roll-selection-set", {
          moduleId,
          patternId,
          eventIds,
        }),
      );
    },

    setPianoRollParameter: (parameter) => {
      store.dispatch(store.createCommand("piano-roll-parameter-set", { parameter }));
    },

    editPatternEvents: (moduleId, patternId, edit, gestureId) => {
      const result = store.dispatch(
        store.createCommand(
          "pattern-events-edit",
          { moduleId, patternId, edit },
          gestureId === undefined ? {} : { gestureId },
        ),
      );
      if (result.status !== "accepted") return;
      const message =
        edit.type === "create"
          ? "Created an event. Undo is available."
          : edit.type === "delete"
            ? "Deleted the selected events. Undo is available."
            : edit.type === "duplicate"
              ? "Duplicated the selected events. Undo is available."
              : "Changed the selected events. Undo is available.";
      set({ undoNotice: notice(message) });
    },

    recordLivePatternEvent: (moduleId, note, startedAtTicks, endedAtTicks, gestureId) => {
      const state = get();
      if (!state.project.transport.recordArmed) return;
      if (
        recordCaptureAfterTicks !== undefined &&
        Math.max(startedAtTicks, endedAtTicks) < recordCaptureAfterTicks
      ) {
        return;
      }
      const module = state.project.project.modules[moduleId];
      if (module === undefined) return;
      const target = recordingTargetFor(state.project, moduleId, startedAtTicks);
      if (target === undefined) return;
      const patternId = target.patternId;
      const manifest = dependencies.manifestFor(module.pluginId);
      const pitched =
        manifest?.kind === "instrument" && manifest.acceptedEvents.some((event) => event.id === "note");
      const cycleTicks = target.part.length * PATTERN_TICKS_PER_STEP;
      const quantizedStart = quantizeRecordedTicks(target.localTicks, state.liveInputQuantizeMode);
      const start = {
        ...quantizedStart,
        positionTicks: quantizedStart.positionTicks % cycleTicks,
      };
      const rawDuration = Math.max(PATTERN_TICKS_PER_STEP, endedAtTicks - startedAtTicks);
      const duration = Math.min(
        cycleTicks - start.positionTicks,
        quantizeRecordedDuration(rawDuration, state.liveInputQuantizeMode),
      );
      const edit: PatternEventEdit = pitched
        ? {
            type: "create",
            event: {
              type: "note",
              positionTicks: start.positionTicks,
              durationTicks: duration,
              data: {
                note,
                velocity: 0.8,
                accent: false,
                slide: false,
                microTimingTicks: start.microTimingTicks,
              },
            },
          }
        : {
            type: "create",
            event: {
              type: "trigger",
              positionTicks: start.positionTicks,
              data: {
                note,
                velocity: 0.8,
                accent: false,
                slide: false,
                microTimingTicks: start.microTimingTicks,
              },
            },
          };
      get().editPatternEvents(moduleId, patternId, edit, gestureId);
    },

    replacePatternPartEvents: (moduleId, patternId, events, length) => {
      const result = store.dispatch(
        store.createCommand(
          "pattern-part-events-replace",
          length === undefined ? { moduleId, patternId, events } : { moduleId, patternId, events, length },
        ),
      );
      if (result.status !== "accepted") return;
      set({ undoNotice: notice("Applied the Pattern transform. Undo is available.") });
    },

    setAutomationLaneSteps: (moduleId, patternId, parameterId, steps) => {
      const result = store.dispatch(
        store.createCommand("automation-lane-steps-set", { moduleId, patternId, parameterId, steps }),
      );
      if (result.status !== "accepted") return;
      set({ undoNotice: notice("Updated the automation lane. Undo is available.") });
    },

    toggleSongMode: () => {
      store.dispatch(store.createCommand("song-mode-toggle", {}));
    },

    addSongPlacement: (patternId) => {
      store.dispatch(store.createCommand("song-placement-add", { patternId }));
    },

    removeSongPlacement: (placementId) => {
      store.dispatch(store.createCommand("song-placement-remove", { placementId }));
    },

    setSongPlacementRepeats: (placementId, repeatCount) => {
      store.dispatch(
        store.createCommand("song-placement-repeat-count-set", { placementId, repeatCount }),
      );
    },

    setSongPlacementPattern: (placementId, patternId) => {
      store.dispatch(store.createCommand("song-placement-pattern-set", { placementId, patternId }));
    },

    reorderSongPlacement: (placementId, afterPlacementId) => {
      store.dispatch(
        store.createCommand(
          "song-placement-reorder",
          afterPlacementId === undefined ? { placementId } : { placementId, afterPlacementId },
        ),
      );
    },

    duplicateSongPlacement: (placementId) => {
      store.dispatch(store.createCommand("song-placement-duplicate", { placementId }));
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
        const saved = await projects.save();
        const currentRevision = store.getState().project.revision;
        const currentIsSaved =
          saved.snapshotRevision.epoch === currentRevision.epoch &&
          saved.snapshotRevision.counter === currentRevision.counter;
        if (!saved.durable) {
          set({
            projectMessage: "Saving failed. This browser is not providing project storage.",
            saveStatus: "error",
          });
          return false;
        }
        if (!currentIsSaved) {
          set({
            projectMessage: "Earlier changes were saved. New edits are not saved.",
            saveStatus: "dirty",
          });
          await get().refreshSavedProjects();
          return false;
        }
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
      cancelPendingPlay(() => {
        audio.stop();
      });
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
      cancelPendingPlay(() => {
        audio.stop();
      });
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
      cancelPendingPlay(() => {
        audio.stop();
      });
      set({ saveStatus: "saving" });
      // A rejected transaction must not strand `saveStatus` at "saving":
      // `connectDomainStore` never marks a later edit dirty in that state, so
      // the Save control would stop reporting unsaved work for the session.
      const result = await template.create().catch(() => ({ created: false, saved: false }));
      if (!result.created) {
        set({
          saveStatus: "error",
          projectMessage:
            "The template was not created because the current project could not be saved.",
        });
        return;
      }
      // The swap report described a module of the replaced project.
      set({
        swapReport: undefined,
        saveStatus: result.saved ? "saved" : "error",
        projectMessage: result.saved
          ? `Created ${template.name} from the built-in template.`
          : "Saving failed. This browser may be blocking storage.",
      });
      await get().refreshSavedProjects();
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

function isLiveInputQuantizeMode(value: string): value is LiveInputQuantizeMode {
  return value === "input" || value === "after" || value === "off";
}

function clampCountInBars(value: number): number {
  if (!Number.isSafeInteger(value)) return 0;
  return Math.min(4, Math.max(0, value));
}

interface RecordingTarget {
  readonly patternId: PatternId;
  readonly part: PatternPartState;
  readonly localTicks: number;
}

/** Maps the absolute transport clock to the part that is audible at that tick. */
function recordingTargetFor(
  state: PulseState,
  moduleId: ModuleInstanceId,
  absoluteTicks: number,
): RecordingTarget | undefined {
  const ticks = Math.max(0, Number.isFinite(absoluteTicks) ? Math.round(absoluteTicks) : 0);
  if (!state.project.song.enabled || state.project.song.placements.length === 0) {
    const pattern = state.project.patterns.find(
      (candidate) => candidate.id === state.project.activePatternId,
    );
    const part = pattern?.parts[moduleId];
    if (pattern === undefined || part === undefined) return undefined;
    return {
      patternId: pattern.id,
      part,
      localTicks: ticks % (part.length * PATTERN_TICKS_PER_STEP),
    };
  }

  const entries = state.project.song.placements.flatMap((placement) => {
    const pattern = state.project.patterns.find(
      (candidate) => candidate.id === placement.patternId,
    );
    if (pattern === undefined) return [];
    return [{ pattern, repeats: placement.repeatCount }];
  });
  const songTicks = entries.reduce(
    (total, entry) =>
      total + entry.pattern.durationBars * PATTERN_TICKS_PER_BAR * entry.repeats,
    0,
  );
  if (songTicks <= 0) return undefined;
  let offset = ticks % songTicks;
  for (const entry of entries) {
    const patternTicks = entry.pattern.durationBars * PATTERN_TICKS_PER_BAR;
    const placementTicks = patternTicks * entry.repeats;
    if (offset < placementTicks) {
      const part = entry.pattern.parts[moduleId];
      if (part === undefined) return undefined;
      return {
        patternId: entry.pattern.id,
        part,
        localTicks: (offset % patternTicks) % (part.length * PATTERN_TICKS_PER_STEP),
      };
    }
    offset -= placementTicks;
  }
  return undefined;
}

function quantizeRecordedTicks(
  value: number,
  mode: LiveInputQuantizeMode,
): { readonly positionTicks: number; readonly microTimingTicks: number } {
  const ticks = Math.max(0, Number.isFinite(value) ? value : 0);
  const grid = Math.round(ticks / PATTERN_TICKS_PER_STEP) * PATTERN_TICKS_PER_STEP;
  if (mode !== "off") return { positionTicks: grid, microTimingTicks: 0 };
  return {
    positionTicks: grid,
    microTimingTicks: Math.min(60, Math.max(-60, Math.round(ticks - grid))),
  };
}

function quantizeRecordedDuration(value: number, mode: LiveInputQuantizeMode): number {
  const ticks = Math.max(PATTERN_TICKS_PER_STEP, Number.isFinite(value) ? value : 0);
  if (mode === "off") return Math.max(PATTERN_TICKS_PER_STEP, Math.round(ticks / PATTERN_TICKS_PER_STEP) * PATTERN_TICKS_PER_STEP);
  return Math.max(PATTERN_TICKS_PER_STEP, Math.round(ticks / PATTERN_TICKS_PER_STEP) * PATTERN_TICKS_PER_STEP);
}
