import type {
  CommandResult,
  EngineDelta,
  Listener,
  Selector,
  Unsubscribe,
} from "../contracts/commands";
import type {
  EffectInstanceState,
  EffectsState,
  VoiceInsertSlots,
} from "../contracts/effects";
import {
  createCommandId,
  createEffectInstanceId,
  createNoteEventId,
  createAutomationLaneId,
  createPatternId,
  createSongPlacementId,
  createStateRevisionEpoch,
  isCanonicalUuid,
  type AutomationLaneId,
  type EffectInstanceId,
  type GestureId,
  type IdFactory,
  type ModuleInstanceId,
  type NoteEventId,
  type PatternId,
  type SongPlacementId,
  type StateRevision,
  type VoiceId,
} from "../contracts/ids";
import type { PluginId } from "../contracts/parameters";
import type { PatternEventEdit, PulseCommand } from "./commands";
import {
  createEmptyPatternPart,
  createModule,
  MAXIMUM_PATTERN_COUNT,
  MAXIMUM_PATTERN_SEED,
  MINIMUM_PATTERN_COUNT,
  PATTERN_STEP_COUNT,
  type ModuleSeed,
} from "./default-state";
import {
  DEFAULT_PATTERN_EVENT_PROPERTIES,
  PATTERN_SCALES,
  PATTERN_TICKS_PER_STEP,
  type PatternEvent,
  type PatternEventData,
  type AutomationLaneState,
  type AutomationStepState,
  type PatternPartState,
  type PatternScale,
  type PatternState,
  type ProjectState,
  type PulseState,
  type RackModuleState,
  type VoiceCycleLengthKey,
} from "./model";

const MAX_SONG_REPEATS = 64;
const MAX_HISTORY_ENTRIES = 100;
const MAX_HISTORY_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 17 * 1024 * 1024;

interface HistoryEntry {
  readonly before: ProjectState;
  readonly after: ProjectState;
  readonly bytes: number;
  readonly gestureId: GestureId | undefined;
}

interface HistoryPlan {
  readonly undo: readonly HistoryEntry[];
}

interface PatternEditIssue {
  readonly field: string;
  readonly message: string;
  readonly recoveryAction: string;
}

type PatternEditResult =
  | {
      readonly events: readonly PatternEvent[];
      readonly selectedEventIds: readonly NoteEventId[];
    }
  | { readonly issue: PatternEditIssue };

interface Subscription<Selected = unknown> {
  readonly selector: Selector<PulseState, Selected>;
  readonly listener: Listener<Selected>;
  selected: Selected;
}

export type PulseEngineDelta = EngineDelta<
  | "project-replace"
  | "module-add"
  | "module-remove"
  | "module-move"
  | "module-swap"
  | "parameter-set"
  | "module-effects-set"
  | "pattern-events-set"
  | "transport"
  | "pattern-select"
  | "pattern-rename"
  | "pattern-timing-set"
  | "song-set"
  | "mixer-set",
  Readonly<Record<string, unknown>>
>;

/** The composition boundary supplies effect instances from the shared registry. */
export type VoiceInsertEffectFactory = (
  id: EffectInstanceId,
  pluginId: PluginId,
) => EffectInstanceState | undefined;

export class PulseStore {
  readonly #idFactory: IdFactory;
  readonly #onEngineDelta: (delta: PulseEngineDelta) => void;
  readonly #moduleSeedFor: (pluginId: PluginId) => ModuleSeed | undefined;
  readonly #validateParameter: (
    module: RackModuleState,
    parameter: string,
    value: number | boolean | string,
  ) => boolean;
  readonly #createVoiceInsertEffect: VoiceInsertEffectFactory | undefined;
  readonly #now: () => string;
  readonly #subscriptions = new Set<Subscription>();
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];
  #state: PulseState;

  constructor(
    initialState: PulseState,
    idFactory: IdFactory,
    moduleSeed: ModuleSeed | ((pluginId: PluginId) => ModuleSeed | undefined),
    onEngineDelta: (delta: PulseEngineDelta) => void,
    // Required with no default: a defaulted validator here would be a second,
    // laxer policy than the shared descriptor check in
    // `persistence/project-document.ts`, and tests would exercise the wrong one.
    validateParameter: (
      module: RackModuleState,
      parameter: string,
      value: number | boolean | string,
    ) => boolean,
    createVoiceInsertEffect?: VoiceInsertEffectFactory,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.#state = {
      ...initialState,
      history: { canUndo: false, canRedo: false },
    };
    this.#idFactory = idFactory;
    this.#moduleSeedFor =
      typeof moduleSeed === "function"
        ? moduleSeed
        : (pluginId) => (pluginId === moduleSeed.pluginId ? moduleSeed : undefined);
    this.#onEngineDelta = onEngineDelta;
    this.#validateParameter = validateParameter;
    this.#createVoiceInsertEffect = createVoiceInsertEffect;
    this.#now = now;
  }

  getState(): Readonly<PulseState> {
    return this.#state;
  }

  subscribe<Selected>(
    selector: Selector<PulseState, Selected>,
    listener: Listener<Selected>,
  ): Unsubscribe {
    const subscription: Subscription<Selected> = {
      selector,
      listener,
      selected: selector(this.#state),
    };
    this.#subscriptions.add(subscription as Subscription);
    return () => this.#subscriptions.delete(subscription as Subscription);
  }

  dispatch(command: PulseCommand): CommandResult {
    const revisionError = validateExpectedRevision(
      command.expectedProjectRevision,
      this.#state.project.revision,
    );
    if (revisionError !== undefined)
      return rejected("expectedProjectRevision", revisionError, "Retry from current state.");

    const previous = this.#state;
    const transition = this.#apply(command);
    if ("error" in transition) return transition.error;
    if (transition.state === previous) return accepted(false, previous.project.revision);

    const historyPlan = transition.projectChanged
      ? this.#planHistory(previous.project, transition.state.project, command.gestureId)
      : undefined;
    if (historyPlan !== undefined && "error" in historyPlan) return historyPlan.error;
    if (historyPlan !== undefined) this.#commitHistory(historyPlan);
    this.#state = {
      ...transition.state,
      history: this.#historyAvailability(),
    };
    this.#notify();
    if (transition.delta !== undefined) this.#onEngineDelta(transition.delta);
    return accepted(true, transition.state.project.revision);
  }

  undo(): CommandResult {
    const entry = this.#undo.at(-1);
    if (entry === undefined) return accepted(false, this.#state.project.revision);
    const previous = this.#state;
    const project = {
      ...entry.before,
      revision: incrementRevision(previous.project.revision, this.#idFactory),
    };
    this.#undo.pop();
    this.#redo.push(entry);
    this.#state = {
      ...previous,
      project,
      ui: reconcileUiReferences(project, previous.ui),
      history: this.#historyAvailability(),
    };
    this.#notify();
    this.#onEngineDelta({
      kind: "project-replace",
      projectRevision: project.revision,
      targetIds: [],
      payload: {},
    });
    return accepted(true, project.revision);
  }

  redo(): CommandResult {
    const entry = this.#redo.at(-1);
    if (entry === undefined) return accepted(false, this.#state.project.revision);
    const previous = this.#state;
    const project = {
      ...entry.after,
      revision: incrementRevision(previous.project.revision, this.#idFactory),
    };
    this.#redo.pop();
    this.#undo.push(entry);
    this.#state = {
      ...previous,
      project,
      ui: reconcileUiReferences(project, previous.ui),
      history: this.#historyAvailability(),
    };
    this.#notify();
    this.#onEngineDelta({
      kind: "project-replace",
      projectRevision: project.revision,
      targetIds: [],
      payload: {},
    });
    return accepted(true, project.revision);
  }

  saveProject(): ProjectState {
    return this.#cloneProject(this.#state.project);
  }

  loadProject(project: ProjectState): CommandResult {
    const previous = this.#state;
    const nextProject = this.#cloneProject(project);
    const revision = incrementRevision(previous.project.revision, this.#idFactory);
    const candidate = { ...nextProject, revision };
    if (sameProjectContent(previous.project, candidate)) {
      return accepted(false, previous.project.revision);
    }
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#state = {
      ...previous,
      project: candidate,
      ui: reconcileUiReferences(candidate, previous.ui),
      history: { canUndo: false, canRedo: false },
    };
    this.#notify();
    this.#onEngineDelta({
      kind: "project-replace",
      projectRevision: candidate.revision,
      targetIds: [],
      payload: { source: "loadProject" },
    });
    return accepted(true, candidate.revision);
  }

  createCommand<T extends PulseCommand["type"]>(
    type: T,
    payload: Extract<PulseCommand, { readonly type: T }>["payload"],
    options: { readonly gestureId?: GestureId } = {},
  ): Extract<PulseCommand, { readonly type: T }> {
    return {
      commandId: createCommandId(this.#idFactory),
      type,
      payload,
      expectedProjectRevision: this.#state.project.revision,
      origin: "ui",
      ...(options.gestureId === undefined ? {} : { gestureId: options.gestureId }),
    } as Extract<PulseCommand, { readonly type: T }>;
  }

  #apply(command: PulseCommand):
    | {
        readonly state: PulseState;
        readonly projectChanged: boolean;
        readonly delta?: PulseEngineDelta;
      }
    | { readonly error: CommandResult } {
    switch (command.type) {
      case "transport-play":
        if (this.#state.transport.status === "playing")
          return { state: this.#state, projectChanged: false };
        return this.#transport({ status: "playing" });
      case "transport-pause":
        if (
          !Number.isSafeInteger(command.payload.positionTicks) ||
          command.payload.positionTicks < 0
        ) {
          return {
            error: rejected(
              "payload.positionTicks",
              "Position must be a non-negative safe integer.",
              "Use a valid transport position.",
            ),
          };
        }
        return this.#transport({ status: "paused", positionTicks: command.payload.positionTicks });
      case "transport-stop":
        if (
          this.#state.transport.status === "stopped" &&
          this.#state.transport.positionTicks === this.#state.transport.startMarkerTicks
        ) {
          return { state: this.#state, projectChanged: false };
        }
        return this.#transport({
          status: "stopped",
          positionTicks: this.#state.transport.startMarkerTicks,
        });
      case "transport-record-toggle":
        return this.#transport({ recordArmed: !this.#state.transport.recordArmed });
      case "transport-seek": {
        const ticks = command.payload.positionTicks;
        if (!Number.isSafeInteger(ticks) || ticks < 0) {
          return {
            error: rejected(
              "payload.positionTicks",
              "Position must be a non-negative safe integer.",
              "Choose a position inside the Pattern.",
            ),
          };
        }
        if (this.#state.transport.status === "playing") {
          return {
            error: rejected(
              "payload.positionTicks",
              "The transport is playing.",
              "Stop or pause before positioning the playhead.",
            ),
          };
        }
        if (
          this.#state.transport.positionTicks === ticks &&
          this.#state.transport.startMarkerTicks === ticks
        ) {
          return { state: this.#state, projectChanged: false };
        }
        // The start marker follows a deliberate playhead position, so the next
        // Stop returns here. The marker key doubles as the engine seek signal.
        return this.#transport({ positionTicks: ticks, startMarkerTicks: ticks });
      }
      case "transport-tempo-set":
        if (
          !Number.isFinite(command.payload.tempo) ||
          command.payload.tempo < 40 ||
          command.payload.tempo > 240
        ) {
          return {
            error: rejected(
              "payload.tempo",
              "Tempo must be between 40 and 240 BPM.",
              "Enter a tempo within the supported range.",
            ),
          };
        }
        if (command.payload.tempo === this.#state.project.tempo) {
          return { state: this.#state, projectChanged: false };
        }
        return this.#projectTransition(
          { ...this.#state.project, tempo: command.payload.tempo },
          "transport",
          [],
          { tempo: command.payload.tempo },
        );
      case "rack-module-select": {
        if (
          command.payload.moduleId !== undefined &&
          this.#state.project.modules[command.payload.moduleId] === undefined
        ) {
          return {
            error: rejected(
              "payload.moduleId",
              "Module does not exist.",
              "Select a loaded rack module.",
            ),
          };
        }
        if (command.payload.moduleId === this.#state.ui.selectedModuleId)
          return { state: this.#state, projectChanged: false };
        return {
          state: {
            ...this.#state,
            ui: {
              ...this.#state.ui,
              selectedModuleId: command.payload.moduleId,
              pianoRollSelection: undefined,
              pianoRollParameter: "velocity",
            },
          },
          projectChanged: false,
        };
      }
      case "rack-module-add":
        return this.#addModule(command.payload.slotId, command.payload.pluginId);
      case "rack-module-duplicate":
        return this.#duplicate(command.payload.moduleId, command.payload.slotId);
      case "rack-module-remove":
        return this.#remove(command.payload.moduleId);
      case "rack-module-move":
        return this.#move(command.payload.moduleId, command.payload.slotId);
      case "rack-module-swap":
        return this.#swap(command.payload.moduleId, command.payload.pluginId);
      case "rack-parameter-set":
        return this.#setParameter(
          command.payload.moduleId,
          command.payload.parameter,
          command.payload.value,
        );
      case "voice-insert-set":
        return this.#setVoiceInsert(
          command.payload.moduleId,
          command.payload.voiceId,
          command.payload.effectPluginId,
        );
      case "pattern-events-edit":
        return this.#editPatternEvents(
          command.payload.moduleId,
          command.payload.patternId,
          command.payload.edit,
        );
      case "piano-roll-selection-set":
        return this.#setPianoRollSelection(
          command.payload.moduleId,
          command.payload.patternId,
          command.payload.eventIds,
        );
      case "piano-roll-parameter-set":
        return this.#setPianoRollParameter(command.payload.parameter);
      case "transport-swing-set":
        return this.#setSwing(command.payload.swing);
      case "pattern-humanize-set":
        return this.#setPatternHumanize(command.payload.patternId, command.payload.humanize);
      case "pattern-seed-set":
        return this.#setPatternSeed(command.payload.patternId, command.payload.seed);
      case "pattern-select":
        return this.#selectPattern(command.payload.patternId);
      case "pattern-rename":
        return this.#renamePattern(command.payload.patternId, command.payload.name);
      case "pattern-color-set":
        return this.#setPatternColor(command.payload.patternId, command.payload.color);
      case "pattern-duration-set":
        return this.#setPatternDuration(command.payload.patternId, command.payload.durationBars);
      case "pattern-scale-set":
        return this.#setPatternScale(command.payload.patternId, command.payload.scale);
      case "pattern-add":
        return this.#addPattern(command.payload.name, command.payload.afterPatternId);
      case "pattern-duplicate":
        return this.#duplicatePattern(command.payload.patternId);
      case "pattern-delete":
        return this.#deletePattern(command.payload.patternId);
      case "pattern-reorder":
        return this.#reorderPattern(command.payload.patternId, command.payload.afterPatternId);
      case "pattern-clear":
        return this.#clearPattern(command.payload.patternId);
      case "pattern-part-events-replace":
        return this.#replacePatternPartEvents(
          command.payload.patternId,
          command.payload.moduleId,
          command.payload.events,
          command.payload.length,
        );
      case "automation-lane-steps-set":
        return this.#setAutomationLaneSteps(command.payload);
      case "pattern-part-length-set":
        return this.#setPatternPartLength(
          command.payload.patternId,
          command.payload.moduleId,
          command.payload.length,
        );
      case "pattern-part-voice-cycle-length-set":
        return this.#setPatternPartVoiceCycleLength(
          command.payload.patternId,
          command.payload.moduleId,
          command.payload.voiceKey,
          command.payload.length,
        );
      case "pattern-part-events-transfer":
        return this.#transferPatternPartEvents(command.payload);
      case "song-mode-toggle":
        return this.#setSong({
          ...this.#state.project.song,
          enabled: !this.#state.project.song.enabled,
        });
      case "song-placement-add":
        return this.#addSongPlacement(command.payload.patternId);
      case "song-placement-remove":
        return this.#removeSongPlacement(command.payload.placementId);
      case "song-placement-repeat-count-set":
        return this.#setSongPlacementRepeatCount(
          command.payload.placementId,
          command.payload.repeatCount,
        );
      case "song-placement-reorder":
        return this.#reorderSongPlacement(command.payload.placementId, command.payload.afterPlacementId);
      case "song-placement-duplicate":
        return this.#duplicateSongPlacement(command.payload.placementId);
      case "song-placement-pattern-set":
        return this.#setSongPlacementPattern(command.payload.placementId, command.payload.patternId);
      case "mixer-mute-toggle":
        return this.#toggleMix(command.payload.moduleId, "muted");
      case "mixer-solo-toggle":
        return this.#toggleMix(command.payload.moduleId, "solo");
      case "mixer-level-set":
        return this.#setMixScalar(command.payload.moduleId, "level", command.payload.level, 0, 1);
      case "mixer-pan-set":
        return this.#setMixScalar(command.payload.moduleId, "pan", command.payload.pan, -1, 1);
      case "mixer-master-level-set":
        return this.#setMasterLevel(command.payload.level);
    }
  }

  #setSwing(rawSwing: number) {
    if (!Number.isFinite(rawSwing) || rawSwing < 0 || rawSwing > 1) {
      return {
        error: rejected(
          "payload.swing",
          "Swing must be between 0 and 1.",
          "Choose a swing amount.",
        ),
      };
    }
    // The document stores whole percent, so the accepted value snaps to the
    // same grid. Otherwise a saved project would replay with shifted timing.
    const swing = Math.round(rawSwing * 100) / 100;
    if (swing === this.#state.project.swing)
      return { state: this.#state, projectChanged: false as const };
    return this.#projectTransition({ ...this.#state.project, swing }, "transport", [], { swing });
  }

  #setPatternHumanize(patternId: PatternId, rawHumanize: number) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    if (!Number.isFinite(rawHumanize) || rawHumanize < 0 || rawHumanize > 1) {
      return {
        error: rejected(
          "payload.humanize",
          "Humanize must be between 0 and 1.",
          "Choose a Humanize amount.",
        ),
      };
    }
    // The document stores whole percent, so the accepted value snaps to the
    // same grid. Otherwise a saved project would replay a different variation.
    const humanize = Math.round(rawHumanize * 100) / 100;
    if (humanize === pattern.humanize) {
      return { state: this.#state, projectChanged: false as const };
    }
    return this.#replacePattern(
      { ...pattern, humanize, modifiedAt: this.#now() },
      "pattern-timing-set",
      { patternId, humanize },
    );
  }

  #setPatternSeed(patternId: PatternId, seed: number) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAXIMUM_PATTERN_SEED) {
      return {
        error: rejected(
          "payload.seed",
          "A Pattern seed must be an unsigned 32-bit integer.",
          "Request a new variation to generate a valid seed.",
        ),
      };
    }
    if (seed === pattern.seed) {
      return { state: this.#state, projectChanged: false as const };
    }
    return this.#replacePattern(
      { ...pattern, seed, modifiedAt: this.#now() },
      "pattern-timing-set",
      { patternId, seed },
    );
  }

  #requirePattern(field: string, patternId: PatternId): PatternState | { readonly error: CommandResult } {
    if (!isCanonicalUuid(patternId)) {
      return { error: rejected(field, "Pattern does not exist.", "Choose a Pattern in the bank.") };
    }
    const pattern = this.#state.project.patterns.find((candidate) => candidate.id === patternId);
    return pattern ?? { error: rejected(field, "Pattern does not exist.", "Choose a Pattern in the bank.") };
  }

  #replacePattern(
    pattern: PatternState,
    kind: PulseEngineDelta["kind"],
    payload: Readonly<Record<string, unknown>>,
    uiPatch: Partial<PulseState["ui"]> = {},
  ) {
    return this.#projectTransition(
      {
        ...this.#state.project,
        patterns: this.#state.project.patterns.map((candidate) =>
          candidate.id === pattern.id ? pattern : candidate,
        ),
      },
      kind,
      [],
      payload,
      uiPatch,
    );
  }

  #selectPattern(patternId: PatternId) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    if (pattern.id === this.#state.project.activePatternId)
      return { state: this.#state, projectChanged: false as const };
    return this.#projectTransition(
      { ...this.#state.project, activePatternId: pattern.id },
      "pattern-select",
      [],
      { patternId: pattern.id },
      { pianoRollSelection: undefined },
    );
  }

  #normalizePatternName(
    name: string | undefined,
    patternId?: PatternId,
  ): { readonly value: string } | { readonly error: CommandResult } {
    const trimmed = name?.trim() ?? "";
    if (trimmed.length === 0 || trimmed.length > 256) {
      return {
        error: rejected(
          "payload.name",
          "A Pattern name must be 1 to 256 characters.",
          "Enter a shorter name.",
        ),
      };
    }
    const duplicate = this.#state.project.patterns.some(
      (candidate) => candidate.id !== patternId && candidate.name.localeCompare(trimmed, undefined, { sensitivity: "accent" }) === 0,
    );
    return duplicate
      ? { error: rejected("payload.name", "Pattern names must be unique.", "Choose another Pattern name.") }
      : { value: trimmed };
  }

  #renamePattern(patternId: PatternId, name: string) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    const normalized = this.#normalizePatternName(name, pattern.id);
    if ("error" in normalized) return normalized;
    if (normalized.value === pattern.name) return { state: this.#state, projectChanged: false as const };
    return this.#replacePattern(
      { ...pattern, name: normalized.value, modifiedAt: this.#now() },
      "pattern-rename",
      { patternId, name: normalized.value },
    );
  }

  #setPatternColor(patternId: PatternId, color: string) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    const normalized = color.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalized)) {
      return { error: rejected("payload.color", "Pattern color must be an opaque six-digit hex color.", "Choose a valid Pattern color.") };
    }
    if (normalized === pattern.color) return { state: this.#state, projectChanged: false as const };
    return this.#replacePattern(
      { ...pattern, color: normalized, modifiedAt: this.#now() },
      "pattern-rename",
      { patternId, color: normalized },
    );
  }

  #setPatternDuration(patternId: PatternId, durationBars: number) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    if (!Number.isSafeInteger(durationBars) || durationBars < 1) {
      return { error: rejected("payload.durationBars", "Pattern duration must be a positive whole bar count.", "Enter a positive duration.") };
    }
    if (durationBars === pattern.durationBars) return { state: this.#state, projectChanged: false as const };
    return this.#replacePattern(
      { ...pattern, durationBars, modifiedAt: this.#now() },
      "pattern-timing-set",
      { patternId, durationBars },
    );
  }

  #setPatternScale(patternId: PatternId, scale: PatternScale) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    if (!PATTERN_SCALES.includes(scale)) {
      return { error: rejected("payload.scale", "Pattern scale is not supported.", "Choose a listed Pattern scale.") };
    }
    if (scale === pattern.scale) return { state: this.#state, projectChanged: false as const };
    return this.#replacePattern(
      { ...pattern, scale, modifiedAt: this.#now() },
      "pattern-timing-set",
      { patternId, scale },
    );
  }

  #addPattern(name: string | undefined, afterPatternId: PatternId | undefined) {
    if (this.#state.project.patterns.length >= MAXIMUM_PATTERN_COUNT) {
      return { error: rejected("payload", `A project holds at most ${String(MAXIMUM_PATTERN_COUNT)} Patterns.`, "Delete a Pattern before adding another.") };
    }
    if (afterPatternId !== undefined && "error" in this.#requirePattern("payload.afterPatternId", afterPatternId)) {
      return { error: rejected("payload.afterPatternId", "Pattern does not exist.", "Choose a Pattern in the bank.") };
    }
    const provisional = name ?? `Pattern ${String(this.#state.project.patterns.length + 1)}`;
    const normalized = this.#normalizePatternName(provisional);
    if ("error" in normalized) return normalized;
    const timestamp = this.#now();
    const id = createPatternId(this.#idFactory);
    const pattern: PatternState = {
      id,
      name: normalized.value,
      color: "#E6A23C",
      durationBars: 1,
      scale: "Chromatic",
      humanize: 0,
      seed: seedFromPatternId(id),
      parts: {},
      automationLaneIds: [],
      createdAt: timestamp,
      modifiedAt: timestamp,
    };
    const patterns = insertAfter(this.#state.project.patterns, pattern, afterPatternId, (candidate) => candidate.id);
    return this.#projectTransition({ ...this.#state.project, patterns }, "project-replace", [], { patternId: id });
  }

  #duplicatePattern(patternId: PatternId) {
    const source = this.#requirePattern("payload.patternId", patternId);
    if ("error" in source) return source;
    if (this.#state.project.patterns.length >= MAXIMUM_PATTERN_COUNT) {
      return { error: rejected("payload.patternId", `A project holds at most ${String(MAXIMUM_PATTERN_COUNT)} Patterns.`, "Delete a Pattern before duplicating another.") };
    }
    const normalized = this.#normalizePatternName(`${source.name} copy`);
    if ("error" in normalized) return normalized;
    const timestamp = this.#now();
    const id = createPatternId(this.#idFactory);
    const laneIdMap = new Map<AutomationLaneId, AutomationLaneId>();
    const automationLanes: Record<AutomationLaneId, AutomationLaneState> = {
      ...this.#state.project.automationLanes,
    };
    for (const sourceLaneId of source.automationLaneIds) {
      const sourceLane = this.#state.project.automationLanes[sourceLaneId];
      if (sourceLane === undefined) continue;
      const laneId = createAutomationLaneId(this.#idFactory);
      laneIdMap.set(sourceLaneId, laneId);
      automationLanes[laneId] = cloneAutomationLane(sourceLane, laneId, id, sourceLane.targetId);
    }
    const parts = Object.fromEntries(
      Object.entries(source.parts).map(([moduleId, part]) => [
        moduleId,
        clonePart(part, moduleId as ModuleInstanceId, this.#idFactory, laneIdMap),
      ]),
    ) as Readonly<Record<ModuleInstanceId, PatternPartState>>;
    const pattern: PatternState = {
      ...source,
      id,
      name: normalized.value,
      parts,
      automationLaneIds: source.automationLaneIds.flatMap((laneId) => {
        const clonedId = laneIdMap.get(laneId);
        return clonedId === undefined ? [] : [clonedId];
      }),
      createdAt: timestamp,
      modifiedAt: timestamp,
    };
    const patterns = insertAfter(this.#state.project.patterns, pattern, source.id, (candidate) => candidate.id);
    return this.#projectTransition(
      { ...this.#state.project, patterns, automationLanes },
      "project-replace",
      [],
      { patternId: id },
    );
  }

  #deletePattern(patternId: PatternId) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    if (this.#state.project.patterns.length <= MINIMUM_PATTERN_COUNT) {
      return { error: rejected("payload.patternId", "A project needs at least one Pattern.", "Add a Pattern before deleting this one.") };
    }
    const patterns = this.#state.project.patterns.filter((candidate) => candidate.id !== pattern.id);
    const placements = this.#state.project.song.placements.filter((placement) => placement.patternId !== pattern.id);
    if (placements.length === 0) {
      return { error: rejected("payload.patternId", "Deleting this Pattern would empty the Playlist.", "Add a placement for another Pattern first.") };
    }
    const automationLanes = Object.fromEntries(
      Object.entries(this.#state.project.automationLanes).filter(([, lane]) => lane.patternId !== pattern.id),
    );
    const firstRemainingPattern = patterns[0];
    if (firstRemainingPattern === undefined) {
      return { error: rejected("payload.patternId", "A project needs at least one Pattern.", "Keep one Pattern in the bank.") };
    }
    const activePatternId =
      this.#state.project.activePatternId === pattern.id
        ? firstRemainingPattern.id
        : this.#state.project.activePatternId;
    return this.#projectTransition(
      {
        ...this.#state.project,
        patterns,
        activePatternId,
        automationLanes,
        song: { ...this.#state.project.song, placements },
      },
      "project-replace",
      [],
      { patternId },
      { pianoRollSelection: undefined },
    );
  }

  #reorderPattern(patternId: PatternId, afterPatternId: PatternId | undefined) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    if (afterPatternId === pattern.id) {
      return { error: rejected("payload.afterPatternId", "A Pattern cannot follow itself.", "Choose another Pattern.") };
    }
    if (afterPatternId !== undefined && "error" in this.#requirePattern("payload.afterPatternId", afterPatternId)) {
      return { error: rejected("payload.afterPatternId", "Pattern does not exist.", "Choose a Pattern in the bank.") };
    }
    const patterns = insertAfter(
      this.#state.project.patterns.filter((candidate) => candidate.id !== pattern.id),
      pattern,
      afterPatternId,
      (candidate) => candidate.id,
    );
    if (sameStructuredValue(patterns, this.#state.project.patterns)) {
      return { state: this.#state, projectChanged: false as const };
    }
    return this.#projectTransition({ ...this.#state.project, patterns }, "project-replace", [], { patternId, afterPatternId });
  }

  #clearPattern(patternId: PatternId) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    const parts = Object.fromEntries(
      Object.entries(pattern.parts).map(([moduleId, part]) => [
        moduleId,
        { ...part, events: [], automationLaneIds: [] },
      ]),
    ) as Readonly<Record<ModuleInstanceId, PatternPartState>>;
    const automationLanes = Object.fromEntries(
      Object.entries(this.#state.project.automationLanes).filter(
        ([, lane]) => lane.patternId !== pattern.id,
      ),
    ) as Readonly<Record<AutomationLaneId, AutomationLaneState>>;
    const nextPattern = {
      ...pattern,
      parts,
      automationLaneIds: [],
      modifiedAt: this.#now(),
    };
    return this.#projectTransition(
      {
        ...this.#state.project,
        patterns: this.#state.project.patterns.map((candidate) =>
          candidate.id === pattern.id ? nextPattern : candidate,
        ),
        automationLanes,
      },
      "project-replace",
      Object.keys(parts) as ModuleInstanceId[],
      { patternId },
      { pianoRollSelection: undefined },
    );
  }

  #setPatternPartLength(patternId: PatternId, moduleId: ModuleInstanceId, length: number) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    if (this.#state.project.modules[moduleId] === undefined) {
      return { error: rejected("payload.moduleId", "Module does not exist.", "Choose a loaded module.") };
    }
    if (!Number.isSafeInteger(length) || length < 1 || length > 64) {
      return { error: rejected("payload.length", "Pattern part length must be from 1 through 64.", "Enter a valid cycle length.") };
    }
    const existing = pattern.parts[moduleId];
    const part = existing ?? createEmptyPatternPart(moduleId, length);
    if (existing !== undefined && part.length === length) {
      return { state: this.#state, projectChanged: false as const };
    }
    const issue = validatePatternEvents(length, part.events);
    if (issue !== undefined) return { error: rejected(issue.field, issue.message, issue.recoveryAction) };
    if (!automationStepsFitPart(part, length, this.#state.project.automationLanes)) {
      return {
        error: rejected(
          "payload.length",
          "Automation steps would fall outside the shortened Pattern part.",
          "Move or erase those automation steps before shortening the part.",
        ),
      };
    }
    return this.#replacePattern(
      {
        ...pattern,
        parts: { ...pattern.parts, [moduleId]: { ...part, length } },
        modifiedAt: this.#now(),
      },
      "pattern-events-set",
      { patternId, moduleId, length },
    );
  }

  #setPatternPartVoiceCycleLength(
    patternId: PatternId,
    moduleId: ModuleInstanceId,
    voiceKey: VoiceCycleLengthKey,
    length: number | undefined,
  ) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    const module = this.#state.project.modules[moduleId];
    if (module === undefined) {
      return { error: rejected("payload.moduleId", "Module does not exist.", "Choose a loaded module.") };
    }
    if (!isVoiceCycleLengthKey(voiceKey)) {
      return { error: rejected("payload.voiceKey", "Voice cycle key is invalid.", "Choose a module voice or numeric note.") };
    }
    const seed = this.#moduleSeedFor(module.pluginId);
    if (seed !== undefined && (seed.voiceIds === undefined || seed.voiceIds.length === 0)) {
      return { error: rejected("payload.moduleId", "This module has no drum voices.", "Choose a drum module.") };
    }
    if (seed?.voiceIds !== undefined && !seed.voiceIds.includes(voiceKey as VoiceId) && !isNumberNoteKey(voiceKey)) {
      return { error: rejected("payload.voiceKey", "Voice cycle key does not belong to this module.", "Choose a module voice or numeric note.") };
    }
    if (length !== undefined && (!Number.isSafeInteger(length) || length < 1 || length > 64)) {
      return { error: rejected("payload.length", "Voice cycle length must be from 1 through 64.", "Enter a valid cycle length.") };
    }
    const part = pattern.parts[moduleId] ?? createEmptyPatternPart(moduleId);
    const voiceCycleLengths: Record<VoiceCycleLengthKey, number> =
      length === undefined
        ? Object.fromEntries(
            Object.entries(part.voiceCycleLengths).filter(([key]) => key !== voiceKey),
          )
        : { ...part.voiceCycleLengths, [voiceKey]: length };
    if (sameStructuredValue(voiceCycleLengths, part.voiceCycleLengths)) {
      return { state: this.#state, projectChanged: false as const };
    }
    return this.#replacePattern(
      {
        ...pattern,
        parts: { ...pattern.parts, [moduleId]: { ...part, voiceCycleLengths } },
        modifiedAt: this.#now(),
      },
      "pattern-events-set",
      { patternId, moduleId, voiceKey, length },
    );
  }

  #setSong(song: PulseState["project"]["song"]) {
    return this.#projectTransition({ ...this.#state.project, song }, "song-set", [], {
      enabled: song.enabled,
      placements: song.placements.map((placement) => ({ ...placement })),
    });
  }

  #addSongPlacement(patternId: PatternId) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    return this.#setSong({
      ...this.#state.project.song,
      placements: [
        ...this.#state.project.song.placements,
        { id: createSongPlacementId(this.#idFactory), patternId: pattern.id, repeatCount: 1 },
      ],
    });
  }

  #requireSongPlacement(placementId: SongPlacementId) {
    const placement = this.#state.project.song.placements.find((candidate) => candidate.id === placementId);
    return placement ?? { error: rejected("payload.placementId", "Playlist placement does not exist.", "Choose a Playlist placement.") };
  }

  #removeSongPlacement(placementId: SongPlacementId) {
    const placement = this.#requireSongPlacement(placementId);
    if ("error" in placement) return placement;
    if (this.#state.project.song.placements.length <= 1) {
      return { error: rejected("payload.placementId", "A Song needs at least one Playlist placement.", "Add another placement before removing this one.") };
    }
    return this.#setSong({
      ...this.#state.project.song,
      placements: this.#state.project.song.placements.filter((candidate) => candidate.id !== placement.id),
    });
  }

  #setSongPlacementRepeatCount(placementId: SongPlacementId, repeatCount: number) {
    const placement = this.#requireSongPlacement(placementId);
    if ("error" in placement) return placement;
    if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > MAX_SONG_REPEATS) {
      return {
        error: rejected(
          "payload.repeatCount",
          `Repeat count must be between 1 and ${String(MAX_SONG_REPEATS)}.`,
          "Choose a repeat count in range.",
        ),
      };
    }
    if (repeatCount === placement.repeatCount) return { state: this.#state, projectChanged: false as const };
    return this.#setSong({
      ...this.#state.project.song,
      placements: this.#state.project.song.placements.map((candidate) =>
        candidate.id === placement.id ? { ...candidate, repeatCount } : candidate,
      ),
    });
  }

  #reorderSongPlacement(placementId: SongPlacementId, afterPlacementId: SongPlacementId | undefined) {
    const placement = this.#requireSongPlacement(placementId);
    if ("error" in placement) return placement;
    if (afterPlacementId === placement.id) {
      return { error: rejected("payload.afterPlacementId", "A placement cannot follow itself.", "Choose another placement.") };
    }
    if (afterPlacementId !== undefined && "error" in this.#requireSongPlacement(afterPlacementId)) {
      return { error: rejected("payload.afterPlacementId", "Playlist placement does not exist.", "Choose a Playlist placement.") };
    }
    const placements = insertAfter(
      this.#state.project.song.placements.filter((candidate) => candidate.id !== placement.id),
      placement,
      afterPlacementId,
      (candidate) => candidate.id,
    );
    if (sameStructuredValue(placements, this.#state.project.song.placements)) return { state: this.#state, projectChanged: false as const };
    return this.#setSong({ ...this.#state.project.song, placements });
  }

  #duplicateSongPlacement(placementId: SongPlacementId) {
    const placement = this.#requireSongPlacement(placementId);
    if ("error" in placement) return placement;
    const copy = { ...placement, id: createSongPlacementId(this.#idFactory) };
    return this.#setSong({
      ...this.#state.project.song,
      placements: insertAfter(this.#state.project.song.placements, copy, placement.id, (candidate) => candidate.id),
    });
  }

  #setSongPlacementPattern(placementId: SongPlacementId, patternId: PatternId) {
    const placement = this.#requireSongPlacement(placementId);
    if ("error" in placement) return placement;
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    if (placement.patternId === pattern.id) return { state: this.#state, projectChanged: false as const };
    return this.#setSong({
      ...this.#state.project.song,
      placements: this.#state.project.song.placements.map((candidate) =>
        candidate.id === placement.id ? { ...candidate, patternId: pattern.id } : candidate,
      ),
    });
  }

  #toggleMix(moduleId: ModuleInstanceId, field: "muted" | "solo") {
    const module = this.#state.project.modules[moduleId];
    if (module === undefined) {
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Choose a loaded module."),
      };
    }
    const next: RackModuleState = { ...module, [field]: !module[field] };
    return this.#projectTransition(
      { ...this.#state.project, modules: { ...this.#state.project.modules, [moduleId]: next } },
      "mixer-set",
      [moduleId],
      { moduleId, [field]: next[field] },
    );
  }

  #setMixScalar(
    moduleId: ModuleInstanceId,
    field: "level" | "pan",
    value: number,
    minimum: number,
    maximum: number,
  ) {
    const module = this.#state.project.modules[moduleId];
    if (module === undefined) {
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Choose a loaded module."),
      };
    }
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      return {
        error: rejected(
          `payload.${field}`,
          `${field} must be between ${String(minimum)} and ${String(maximum)}.`,
          "Choose a value in range.",
        ),
      };
    }
    if (module[field] === value) return { state: this.#state, projectChanged: false as const };
    const next: RackModuleState = { ...module, [field]: value };
    return this.#projectTransition(
      { ...this.#state.project, modules: { ...this.#state.project.modules, [moduleId]: next } },
      "mixer-set",
      [moduleId],
      { moduleId, [field]: value },
    );
  }

  #setMasterLevel(level: number) {
    if (!Number.isFinite(level) || level < 0 || level > 1) {
      return {
        error: rejected(
          "payload.level",
          "Master level must be between 0 and 1.",
          "Choose a value in range.",
        ),
      };
    }
    if (level === this.#state.project.masterLevel)
      return { state: this.#state, projectChanged: false as const };
    return this.#projectTransition(
      { ...this.#state.project, masterLevel: level },
      "mixer-set",
      [],
      {
        masterLevel: level,
      },
    );
  }

  #transport(patch: Partial<PulseState["transport"]>) {
    return {
      state: { ...this.#state, transport: { ...this.#state.transport, ...patch } },
      projectChanged: false as const,
      delta: {
        kind: "transport" as const,
        projectRevision: this.#state.project.revision,
        targetIds: [],
        payload: patch,
      },
    };
  }

  #addModule(slotId: PulseState["project"]["rackSlots"][number]["id"], pluginId: PluginId) {
    const slot = this.#state.project.rackSlots.find((candidate) => candidate.id === slotId);
    if (slot === undefined)
      return {
        error: rejected(
          "payload.slotId",
          "Rack slot does not exist.",
          "Choose slot-01 through slot-08.",
        ),
      };
    if (slot.moduleId !== undefined)
      return {
        error: rejected("payload.slotId", "Rack slot is occupied.", "Choose an empty slot."),
      };
    const seed = this.#moduleSeedFor(pluginId);
    if (seed === undefined) {
      return {
        error: rejected(
          "payload.pluginId",
          "Plugin is not registered.",
          "Choose an instrument from the module browser.",
        ),
      };
    }
    const module = createModule(this.#idFactory, seed);
    return this.#projectTransition(
      {
        ...this.#state.project,
        rackSlots: this.#state.project.rackSlots.map((candidate) =>
          candidate.id === slotId ? { ...candidate, moduleId: module.id } : candidate,
        ),
        modules: { ...this.#state.project.modules, [module.id]: module },
        effects: withNullVoiceInsertSlots(this.#state.project.effects, module.id, seed.voiceIds),
      },
      "module-add",
      [module.id, slotId],
      { moduleId: module.id, slotId },
    );
  }

  #duplicate(moduleId: ModuleInstanceId, slotId: PulseState["project"]["rackSlots"][number]["id"]) {
    const source = this.#state.project.modules[moduleId];
    if (source === undefined)
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Duplicate a loaded module."),
      };
    const slot = this.#state.project.rackSlots.find((candidate) => candidate.id === slotId);
    if (slot?.moduleId !== undefined)
      return {
        error: rejected("payload.slotId", "Rack slot is occupied.", "Choose an empty slot."),
      };
    if (slot === undefined)
      return {
        error: rejected(
          "payload.slotId",
          "Rack slot does not exist.",
          "Choose slot-01 through slot-08.",
        ),
      };
    const seed = this.#moduleSeedFor(source.pluginId);
    if (seed === undefined) {
      return {
        error: rejected(
          "payload.moduleId",
          "The source module plugin is not registered.",
          "Restore the required plugin before duplicating this module.",
        ),
      };
    }
    const module = createModule(this.#idFactory, seed, source);
    const automationLanes: Record<AutomationLaneId, AutomationLaneState> = {
      ...this.#state.project.automationLanes,
    };
    const patterns = this.#state.project.patterns.map((pattern) => {
      const sourcePart = pattern.parts[moduleId];
      if (sourcePart === undefined) return pattern;
      const laneIdMap = new Map<AutomationLaneId, AutomationLaneId>();
      for (const sourceLaneId of sourcePart.automationLaneIds) {
        const sourceLane = this.#state.project.automationLanes[sourceLaneId];
        if (sourceLane === undefined) continue;
        const laneId = createAutomationLaneId(this.#idFactory);
        laneIdMap.set(sourceLaneId, laneId);
        automationLanes[laneId] = cloneAutomationLane(
          sourceLane,
          laneId,
          pattern.id,
          module.id,
        );
      }
      const clonedLaneIds = sourcePart.automationLaneIds.flatMap((laneId) => {
        const clonedId = laneIdMap.get(laneId);
        return clonedId === undefined ? [] : [clonedId];
      });
      return {
        ...pattern,
        parts: {
          ...pattern.parts,
          [module.id]: clonePart(sourcePart, module.id, this.#idFactory, laneIdMap),
        },
        automationLaneIds: [...pattern.automationLaneIds, ...clonedLaneIds],
        modifiedAt: this.#now(),
      };
    });
    return this.#projectTransition(
      {
        ...this.#state.project,
        rackSlots: this.#state.project.rackSlots.map((candidate) =>
          candidate.id === slotId ? { ...candidate, moduleId: module.id } : candidate,
        ),
        modules: { ...this.#state.project.modules, [module.id]: module },
        patterns,
        automationLanes,
        effects: this.#duplicateVoiceInserts(this.#state.project.effects, moduleId, module.id, seed.voiceIds),
      },
      "module-add",
      [module.id, slotId],
      { moduleId: module.id, slotId },
    );
  }

  #remove(moduleId: ModuleInstanceId) {
    if (this.#state.project.modules[moduleId] === undefined)
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Remove a loaded module."),
      };
    const modules = Object.fromEntries(
      Object.entries(this.#state.project.modules).filter(([id]) => id !== moduleId),
    ) as Readonly<Record<ModuleInstanceId, RackModuleState>>;
    const removedLaneIds = new Set(
      Object.values(this.#state.project.automationLanes)
        .filter((lane) => lane.targetId === moduleId)
        .map((lane) => lane.id),
    );
    const automationLanes = Object.fromEntries(
      Object.entries(this.#state.project.automationLanes).filter(([id]) => !removedLaneIds.has(id as never)),
    );
    const patterns = this.#state.project.patterns.map((pattern) => {
      if (pattern.parts[moduleId] === undefined && removedLaneIds.size === 0) return pattern;
      const parts = Object.fromEntries(
        Object.entries(pattern.parts).filter(([id]) => id !== moduleId),
      ) as Readonly<Record<ModuleInstanceId, PatternPartState>>;
      return {
        ...pattern,
        parts,
        automationLaneIds: pattern.automationLaneIds.filter((id) => !removedLaneIds.has(id)),
        modifiedAt: this.#now(),
      };
    });
    return this.#projectTransition(
      {
        ...this.#state.project,
        rackSlots: this.#state.project.rackSlots.map((slot) =>
          slot.moduleId === moduleId ? { id: slot.id } : slot,
        ),
        modules,
        patterns,
        automationLanes,
        effects: withoutModuleVoiceInserts(this.#state.project.effects, moduleId),
      },
      "module-remove",
      [moduleId],
      { moduleId },
      {
        selectedModuleId:
          this.#state.ui.selectedModuleId === moduleId
            ? undefined
            : this.#state.ui.selectedModuleId,
        pianoRollSelection:
          this.#state.ui.pianoRollSelection?.moduleId === moduleId
            ? undefined
            : this.#state.ui.pianoRollSelection,
      },
    );
  }

  #move(moduleId: ModuleInstanceId, slotId: PulseState["project"]["rackSlots"][number]["id"]) {
    if (this.#state.project.modules[moduleId] === undefined)
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Move a loaded module."),
      };
    const target = this.#state.project.rackSlots.find((slot) => slot.id === slotId);
    if (target === undefined)
      return {
        error: rejected(
          "payload.slotId",
          "Rack slot does not exist.",
          "Choose slot-01 through slot-08.",
        ),
      };
    const source = this.#state.project.rackSlots.find((slot) => slot.moduleId === moduleId);
    if (source?.id === slotId) return { state: this.#state, projectChanged: false };
    return this.#projectTransition(
      {
        ...this.#state.project,
        rackSlots: this.#state.project.rackSlots.map((slot) => {
          if (slot.id === slotId) return { ...slot, moduleId };
          if (slot.moduleId === moduleId)
            return target.moduleId === undefined
              ? { id: slot.id }
              : { ...slot, moduleId: target.moduleId };
          return slot;
        }),
      },
      "module-move",
      [moduleId, slotId],
      { moduleId, slotId },
    );
  }

  /**
   * Section 14: a swap replaces the plugin and its parameters while the module
   * keeps its identity, Pattern parts, and mixer state. Event data survives in
   * place; a target that cannot map a note simply does not sound it, and the UI
   * reports the unmapped count through the non-blocking result panel.
   */
  #swap(moduleId: ModuleInstanceId, pluginId: PluginId) {
    const module = this.#state.project.modules[moduleId];
    if (module === undefined)
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Swap a loaded module."),
      };
    if (module.pluginId === pluginId)
      return { state: this.#state, projectChanged: false as const };
    const seed = this.#moduleSeedFor(pluginId);
    if (seed === undefined) {
      return {
        error: rejected(
          "payload.pluginId",
          "Plugin is not registered.",
          "Choose an instrument from the module browser.",
        ),
      };
    }
    const nextModule: RackModuleState = {
      ...module,
      pluginId,
      parameters: { ...seed.parameters },
    };
    return this.#projectTransition(
      {
        ...this.#state.project,
        modules: { ...this.#state.project.modules, [moduleId]: nextModule },
        effects: withNullVoiceInsertSlots(
          withoutModuleVoiceInserts(this.#state.project.effects, moduleId),
          moduleId,
          seed.voiceIds,
        ),
      },
      "module-swap",
      [moduleId],
      { moduleId, pluginId },
    );
  }

  #setParameter(
    moduleId: ModuleInstanceId,
    parameter: string,
    rawValue: number | boolean | string,
  ) {
    const module = this.#state.project.modules[moduleId];
    if (module === undefined)
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Edit a loaded module."),
      };
    if (!this.#validateParameter(module, parameter, rawValue))
      return {
        error: rejected(
          "payload.value",
          "Parameter value is invalid.",
          "Enter a value within the control range.",
        ),
      };
    if (module.parameters[parameter] === rawValue)
      return { state: this.#state, projectChanged: false };
    const nextModule: RackModuleState = {
      ...module,
      parameters: { ...module.parameters, [parameter]: rawValue },
    };
    return this.#projectTransition(
      {
        ...this.#state.project,
        modules: { ...this.#state.project.modules, [moduleId]: nextModule },
      },
      "parameter-set",
      [moduleId],
      { moduleId, parameter, value: rawValue },
    );
  }

  #setVoiceInsert(moduleId: ModuleInstanceId, voiceId: VoiceId, effectPluginId: PluginId | null) {
    if (this.#state.project.modules[moduleId] === undefined) {
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Edit a loaded module."),
      };
    }
    const slots = this.#state.project.effects.voiceInserts[moduleId];
    if (slots === undefined || !Object.hasOwn(slots, voiceId)) {
      return {
        error: rejected(
          "payload.voiceId",
          "Voice does not support an insert slot.",
          "Choose a drum voice with an insert slot.",
        ),
      };
    }
    const currentEffectId = slots[voiceId] ?? null;
    const currentEffect =
      currentEffectId === null ? undefined : this.#state.project.effects.instances[currentEffectId];
    if (effectPluginId !== null && currentEffect?.pluginId === effectPluginId) {
      return { state: this.#state, projectChanged: false as const };
    }
    if (effectPluginId === null && currentEffectId === null) {
      return { state: this.#state, projectChanged: false as const };
    }

    const nextSlots: Record<VoiceId, EffectInstanceId | null> = { ...slots };
    const nextInstances: Record<EffectInstanceId, EffectInstanceState> = {
      ...this.#state.project.effects.instances,
    };
    let nextEffectId: EffectInstanceId | null = null;
    if (effectPluginId !== null) {
      const candidateId = createEffectInstanceId(this.#idFactory);
      const effect = this.#createVoiceInsertEffect?.(candidateId, effectPluginId);
      if (effect?.id !== candidateId || effect.pluginId !== effectPluginId) {
        return {
          error: rejected(
            "payload.effectPluginId",
            "Voice insert effect is not registered.",
            "Choose an available voice insert effect.",
          ),
        };
      }
      nextEffectId = candidateId;
      nextInstances[candidateId] = effect;
    }
    nextSlots[voiceId] = nextEffectId;
    const effects = pruneUnreferencedEffects({
      instances: nextInstances,
      voiceInserts: { ...this.#state.project.effects.voiceInserts, [moduleId]: nextSlots },
    });
    const targetIds =
      nextEffectId === null
        ? currentEffectId === null
          ? [moduleId, voiceId]
          : [moduleId, voiceId, currentEffectId]
        : [moduleId, voiceId, nextEffectId];
    return this.#projectTransition(
      { ...this.#state.project, effects },
      "module-effects-set",
      targetIds,
      { moduleId, voiceId, effectInstanceId: nextEffectId, effectPluginId },
    );
  }

  #duplicateVoiceInserts(
    effects: EffectsState,
    sourceModuleId: ModuleInstanceId,
    targetModuleId: ModuleInstanceId,
    targetVoiceIds: readonly VoiceId[] | undefined,
  ): EffectsState {
    const sourceSlots = effects.voiceInserts[sourceModuleId];
    if (sourceSlots === undefined) {
      return withNullVoiceInsertSlots(effects, targetModuleId, targetVoiceIds);
    }
    const instances: Record<EffectInstanceId, EffectInstanceState> = { ...effects.instances };
    const slots: Record<VoiceId, EffectInstanceId | null> = {};
    for (const [rawVoiceId, sourceEffectId] of Object.entries(sourceSlots)) {
      const voiceId = rawVoiceId as VoiceId;
      if (sourceEffectId === null) {
        slots[voiceId] = null;
        continue;
      }
      const sourceEffect = effects.instances[sourceEffectId];
      if (sourceEffect === undefined) {
        slots[voiceId] = null;
        continue;
      }
      const cloneId = createEffectInstanceId(this.#idFactory);
      instances[cloneId] = {
        ...sourceEffect,
        id: cloneId,
        state: { ...sourceEffect.state },
      };
      slots[voiceId] = cloneId;
    }
    return {
      instances,
      voiceInserts: { ...effects.voiceInserts, [targetModuleId]: slots },
    };
  }

  #setPianoRollSelection(
    moduleId: ModuleInstanceId,
    patternId: PatternId,
    eventIds: readonly NoteEventId[],
  ) {
    if (this.#state.project.modules[moduleId] === undefined)
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Edit a loaded module."),
      };
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    const part = pattern.parts[moduleId];
    if (part === undefined)
      return {
        error: rejected("payload.moduleId", "Pattern part does not exist.", "Select a Pattern part first."),
      };
    const selection = selectEvents(part, eventIds, "payload.eventIds");
    if ("issue" in selection) {
      return {
        error: rejected(
          selection.issue.field,
          selection.issue.message,
          selection.issue.recoveryAction,
        ),
      };
    }
    const nextSelection =
      selection.events.length === 0
        ? undefined
        : { moduleId, patternId: pattern.id, eventIds: selection.events.map((event) => event.id) };
    if (sameStructuredValue(this.#state.ui.pianoRollSelection, nextSelection)) {
      return { state: this.#state, projectChanged: false as const };
    }
    return {
      state: {
        ...this.#state,
        ui: { ...this.#state.ui, pianoRollSelection: nextSelection },
      },
      projectChanged: false as const,
    };
  }

  #setPianoRollParameter(parameter: string) {
    const normalized = parameter.trim();
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(normalized) || normalized.length > 64) {
      return {
        error: rejected(
          "payload.parameter",
          "The Piano Roll parameter ID is invalid.",
          "Choose a parameter from the selected module.",
        ),
      };
    }
    if (normalized === this.#state.ui.pianoRollParameter) {
      return { state: this.#state, projectChanged: false as const };
    }
    return {
      state: {
        ...this.#state,
        ui: { ...this.#state.ui, pianoRollParameter: normalized },
      },
      projectChanged: false as const,
    };
  }

  #editPatternEvents(
    moduleId: ModuleInstanceId,
    patternId: PatternId,
    edit: PatternEventEdit,
  ) {
    const module = this.#state.project.modules[moduleId];
    if (module === undefined)
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Edit a loaded module."),
      };
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    const current = pattern.parts[moduleId] ?? createEmptyPatternPart(moduleId, PATTERN_STEP_COUNT);
    if (edit.type === "create") {
      const moduleSeed = this.#moduleSeedFor(module.pluginId);
      const moduleEventType =
        moduleSeed === undefined
          ? current.events[0]?.type
          : moduleSeed.voiceIds === undefined || moduleSeed.voiceIds.length === 0
            ? "note"
            : "trigger";
      if (moduleEventType !== undefined && edit.event.type !== moduleEventType) {
        return {
          error: rejected(
            "payload.edit.event.type",
            "The event type does not match this module.",
            "Create an event supported by the selected module.",
          ),
        };
      }
    }
    const result = applyPatternEventEdit(current, edit, this.#idFactory);
    if ("issue" in result) {
      return {
        error: rejected(result.issue.field, result.issue.message, result.issue.recoveryAction),
      };
    }
    if (sameStructuredValue(result.events, current.events)) {
      return { state: this.#state, projectChanged: false as const };
    }
    const nextPart: PatternPartState = { ...current, events: result.events };
    const selectedEventIds =
      edit.type === "delete" &&
      this.#state.ui.pianoRollSelection?.moduleId === moduleId &&
      this.#state.ui.pianoRollSelection.patternId === pattern.id
        ? this.#state.ui.pianoRollSelection.eventIds.filter(
            (eventId) => !edit.eventIds.includes(eventId),
          )
        : result.selectedEventIds;
    const nextPattern: PatternState = {
      ...pattern,
      parts: { ...pattern.parts, [moduleId]: nextPart },
      modifiedAt: this.#now(),
    };
    return this.#projectTransition(
      {
        ...this.#state.project,
        patterns: this.#state.project.patterns.map((candidate) =>
          candidate.id === pattern.id ? nextPattern : candidate,
        ),
      },
      "pattern-events-set",
      [moduleId],
      { moduleId, patternId: pattern.id },
      {
        pianoRollSelection:
          selectedEventIds.length === 0
            ? undefined
            : { moduleId, patternId: pattern.id, eventIds: selectedEventIds },
      },
    );
  }

  #replacePatternPartEvents(
    patternId: PatternId,
    moduleId: ModuleInstanceId,
    events: readonly PatternEvent[],
    length: number | undefined,
  ) {
    const pattern = this.#requirePattern("payload.patternId", patternId);
    if ("error" in pattern) return pattern;
    const module = this.#state.project.modules[moduleId];
    if (module === undefined) {
      return { error: rejected("payload.moduleId", "Module does not exist.", "Choose a loaded module.") };
    }
    const current = pattern.parts[moduleId] ?? createEmptyPatternPart(moduleId, PATTERN_STEP_COUNT);
    const targetLength = length ?? current.length;
    if (!Number.isSafeInteger(targetLength) || targetLength < 1 || targetLength > 64) {
      return { error: rejected("payload.length", "Pattern part length must be from 1 through 64.", "Choose a valid target length.") };
    }
    if (!automationStepsFitPart(current, targetLength, this.#state.project.automationLanes)) {
      return {
        error: rejected(
          "payload.length",
          "Automation steps would fall outside the shortened Pattern part.",
          "Move or erase those automation steps before shortening the part.",
        ),
      };
    }
    const issue = validatePatternEvents(targetLength, events);
    if (issue !== undefined) return { error: rejected(issue.field, issue.message, issue.recoveryAction) };
    const expectedType = this.#moduleSeedFor(module.pluginId)?.voiceIds;
    const eventType = expectedType === undefined || expectedType.length === 0 ? "note" : "trigger";
    if (events.some((event) => event.type !== eventType)) {
      return {
        error: rejected(
          "payload.events",
          "The replacement events do not match this module.",
          "Apply events supported by the selected module.",
        ),
      };
    }
    const nextEvents = sortPatternEvents(events.map((event) => ({ ...event, data: { ...event.data } })));
    if (sameStructuredValue(nextEvents, current.events) && targetLength === current.length) {
      return { state: this.#state, projectChanged: false as const };
    }
    const nextPattern: PatternState = {
      ...pattern,
      parts: { ...pattern.parts, [moduleId]: { ...current, length: targetLength, events: nextEvents } },
      modifiedAt: this.#now(),
    };
    return this.#projectTransition(
      {
        ...this.#state.project,
        patterns: this.#state.project.patterns.map((candidate) =>
          candidate.id === pattern.id ? nextPattern : candidate,
        ),
      },
      "pattern-events-set",
      [moduleId],
      { patternId, moduleId, events: nextEvents, ...(length === undefined ? {} : { length: targetLength }) },
      { pianoRollSelection: undefined },
    );
  }

  #setAutomationLaneSteps(
    payload: Extract<PulseCommand, { readonly type: "automation-lane-steps-set" }>["payload"],
  ) {
    const pattern = this.#requirePattern("payload.patternId", payload.patternId);
    if ("error" in pattern) return pattern;
    const module = this.#state.project.modules[payload.moduleId];
    if (module === undefined) {
      return { error: rejected("payload.moduleId", "Module does not exist.", "Choose a loaded module.") };
    }
    const existingPart = pattern.parts[payload.moduleId];
    if (existingPart === undefined && payload.steps.length === 0) {
      return { state: this.#state, projectChanged: false as const };
    }
    // A valid imported Pattern can omit a loaded module part. The first
    // automation step creates the same empty 16-step part that event editing
    // uses, so every automatable module parameter remains available.
    const part: PatternPartState = existingPart ?? {
      moduleId: payload.moduleId,
      length: 16,
      voiceCycleLengths: {},
      events: [],
      automationLaneIds: [],
    };
    const parameterId = payload.parameterId.trim();
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(parameterId)) {
      return {
        error: rejected("payload.parameterId", "Automation parameter ID is invalid.", "Choose an automatable module parameter."),
      };
    }
    const seenTicks = new Set<number>();
    const steps: readonly AutomationStepState[] = payload.steps
      .map((step) => ({ tick: step.tick, value: step.value }))
      .sort((left, right) => left.tick - right.tick);
    for (const [index, step] of steps.entries()) {
      if (
        !Number.isSafeInteger(step.tick) ||
        step.tick < 0 ||
        step.tick >= part.length * PATTERN_TICKS_PER_STEP ||
        step.tick % PATTERN_TICKS_PER_STEP !== 0 ||
        seenTicks.has(step.tick)
      ) {
        return {
          error: rejected(
            `payload.steps[${String(index)}].tick`,
            "Automation steps must use unique 1/16 positions inside the Pattern part.",
            "Use one fixed-grid step inside the Pattern part.",
          ),
        };
      }
      seenTicks.add(step.tick);
      if (!this.#validateParameter(module, parameterId, step.value)) {
        return {
          error: rejected(
            `payload.steps[${String(index)}].value`,
            "Automation value is invalid.",
            "Use a value within the parameter range.",
          ),
        };
      }
    }
    const existing = Object.values(this.#state.project.automationLanes).find(
      (lane) =>
        lane.patternId === pattern.id &&
        lane.targetId === payload.moduleId &&
        lane.parameterId === parameterId,
    );
    if (existing !== undefined && sameStructuredValue(existing.steps, steps)) {
      return { state: this.#state, projectChanged: false as const };
    }
    const timestamp = this.#now();
    let automationLanes = this.#state.project.automationLanes;
    let automationLaneIds = pattern.automationLaneIds;
    let partLaneIds = part.automationLaneIds;
    if (steps.length === 0) {
      if (existing === undefined) return { state: this.#state, projectChanged: false as const };
      automationLanes = Object.fromEntries(
        Object.entries(automationLanes).filter(([id]) => id !== existing.id),
      );
      automationLaneIds = automationLaneIds.filter((id) => id !== existing.id);
      partLaneIds = partLaneIds.filter((id) => id !== existing.id);
    } else if (existing === undefined) {
      const id = createAutomationLaneId(this.#idFactory);
      automationLanes = {
        ...automationLanes,
        [id]: {
          id,
          scope: "module",
          targetId: payload.moduleId,
          parameterId,
          patternId: pattern.id,
          stepTicks: PATTERN_TICKS_PER_STEP,
          steps,
        },
      };
      automationLaneIds = [...automationLaneIds, id];
      partLaneIds = [...partLaneIds, id];
    } else {
      automationLanes = { ...automationLanes, [existing.id]: { ...existing, steps } };
    }
    const nextPattern: PatternState = {
      ...pattern,
      automationLaneIds,
      parts: {
        ...pattern.parts,
        [payload.moduleId]: { ...part, automationLaneIds: partLaneIds },
      },
      modifiedAt: timestamp,
    };
    return this.#projectTransition(
      {
        ...this.#state.project,
        automationLanes,
        patterns: this.#state.project.patterns.map((candidate) =>
          candidate.id === pattern.id ? nextPattern : candidate,
        ),
      },
      "pattern-events-set",
      [payload.moduleId],
      { patternId: pattern.id, moduleId: payload.moduleId, parameterId, steps },
    );
  }

  #transferPatternPartEvents(payload: Extract<PulseCommand, { readonly type: "pattern-part-events-transfer" }> ["payload"]) {
    const sourcePattern = this.#requirePattern("payload.fromPatternId", payload.fromPatternId);
    if ("error" in sourcePattern) return sourcePattern;
    const targetPattern = this.#requirePattern("payload.toPatternId", payload.toPatternId);
    if ("error" in targetPattern) return targetPattern;
    const sourceModule = this.#state.project.modules[payload.fromModuleId];
    const targetModule = this.#state.project.modules[payload.toModuleId];
    if (sourceModule === undefined || targetModule === undefined) {
      return { error: rejected("payload", "A Pattern part module does not exist.", "Choose loaded modules.") };
    }
    if (sourceModule.pluginId !== targetModule.pluginId) {
      return { error: rejected("payload.toModuleId", "Pattern parts require compatible module plugins.", "Choose a module with the same plugin.") };
    }
    if (payload.fromPatternId === payload.toPatternId && payload.fromModuleId === payload.toModuleId) {
      return { error: rejected("payload", "A Pattern part cannot transfer events to itself.", "Choose another Pattern part.") };
    }
    const sourcePart = sourcePattern.parts[payload.fromModuleId];
    if (sourcePart === undefined) {
      return { error: rejected("payload.fromModuleId", "Source Pattern part does not exist.", "Choose a participating module.") };
    }
    const selected = requireEditedEvents(sourcePart, payload.eventIds, "payload.eventIds");
    if ("issue" in selected) return { error: rejected(selected.issue.field, selected.issue.message, selected.issue.recoveryAction) };
    const targetPart = targetPattern.parts[payload.toModuleId] ?? createEmptyPatternPart(payload.toModuleId, sourcePart.length);
    const transferred = selected.events.map((event) =>
      payload.mode === "copy" ? cloneEvent(event, this.#idFactory) : event,
    );
    const targetEvents = [...targetPart.events, ...transferred];
    const targetIssue = validatePatternEvents(targetPart.length, targetEvents);
    if (targetIssue !== undefined) return { error: rejected(targetIssue.field, targetIssue.message, targetIssue.recoveryAction) };
    const nextTargetPart = { ...targetPart, events: sortPatternEvents(targetEvents) };
    const timestamp = this.#now();
    let patterns = this.#state.project.patterns.map((candidate) => {
      if (candidate.id === targetPattern.id) {
        return {
          ...candidate,
          parts: { ...candidate.parts, [payload.toModuleId]: nextTargetPart },
          modifiedAt: timestamp,
        };
      }
      return candidate;
    });
    if (payload.mode === "move") {
      const removed = new Set(payload.eventIds);
      patterns = patterns.map((candidate) => {
        if (candidate.id !== sourcePattern.id) return candidate;
        const current = candidate.parts[payload.fromModuleId];
        if (current === undefined) return candidate;
        return {
          ...candidate,
          parts: { ...candidate.parts, [payload.fromModuleId]: { ...current, events: current.events.filter((event) => !removed.has(event.id)) } },
          modifiedAt: timestamp,
        };
      });
    }
    return this.#projectTransition(
      { ...this.#state.project, patterns },
      "project-replace",
      [payload.fromModuleId, payload.toModuleId],
      payload,
      { pianoRollSelection: undefined },
    );
  }

  #projectTransition(
    project: ProjectState,
    kind: PulseEngineDelta["kind"],
    targetIds: PulseEngineDelta["targetIds"],
    payload: Readonly<Record<string, unknown>>,
    uiPatch: Partial<PulseState["ui"]> = {},
  ) {
    const revision = incrementRevision(this.#state.project.revision, this.#idFactory);
    const nextProject = { ...project, revision };
    return {
      state: { ...this.#state, project: nextProject, ui: { ...this.#state.ui, ...uiPatch } },
      projectChanged: true as const,
      delta: { kind, projectRevision: revision, targetIds, payload },
    };
  }

  #planHistory(
    before: ProjectState,
    after: ProjectState,
    gestureId: GestureId | undefined,
  ): HistoryPlan | { readonly error: CommandResult } {
    // Two gestures can interleave, as when a wheel burst runs on two targets,
    // so the matching entry is not always on top. The newest entry with the
    // same gesture ID absorbs this edit in place: moving it to the top would
    // reorder history and make a later undo restore a mid-gesture state. The
    // scan is bounded by the 100-entry stack.
    const coalescedIndex =
      gestureId === undefined
        ? -1
        : this.#undo.findLastIndex((entry) => entry.gestureId === gestureId);
    const coalescedEntry = coalescedIndex === -1 ? undefined : this.#undo[coalescedIndex];
    const entryBefore = coalescedEntry?.before ?? before;
    const undo = [...this.#undo];
    if (coalescedEntry !== undefined && sameProjectContent(entryBefore, after)) {
      undo.splice(coalescedIndex, 1);
      return { undo };
    }
    const bytes = new TextEncoder().encode(
      JSON.stringify({ before: entryBefore, after }),
    ).byteLength;
    if (bytes > MAX_ENTRY_BYTES) {
      return {
        error: rejected(
          "history",
          "The edit exceeds the 17 MiB history-entry limit.",
          "Reduce the edited project data before retrying.",
        ),
      };
    }

    if (coalescedIndex !== -1) {
      undo[coalescedIndex] = { before: entryBefore, after, bytes, gestureId };
      let historyBytes = undo.reduce((total, entry) => total + entry.bytes, 0);
      while (historyBytes > MAX_HISTORY_BYTES) {
        const evicted = undo.shift();
        if (evicted === undefined) break;
        historyBytes -= evicted.bytes;
      }
      return { undo };
    }

    let historyBytes = undo.reduce((total, entry) => total + entry.bytes, 0);
    while (undo.length >= MAX_HISTORY_ENTRIES || historyBytes + bytes > MAX_HISTORY_BYTES) {
      const evicted = undo.shift();
      if (evicted === undefined) break;
      historyBytes -= evicted.bytes;
    }
    undo.push({ before: entryBefore, after, bytes, gestureId });
    return { undo };
  }

  #commitHistory(plan: HistoryPlan): void {
    this.#undo.splice(0, this.#undo.length, ...plan.undo);
    this.#redo.length = 0;
  }

  #historyAvailability(): PulseState["history"] {
    return {
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
    };
  }

  #notify(): void {
    for (const subscription of this.#subscriptions) {
      const selected = subscription.selector(this.#state);
      if (Object.is(selected, subscription.selected)) continue;
      const previousSelected = subscription.selected;
      subscription.selected = selected;
      subscription.listener(selected, previousSelected);
    }
  }

  #cloneProject(project: ProjectState): ProjectState {
    return JSON.parse(JSON.stringify(project)) as ProjectState;
  }
}

function normalizePatternEventData(
  data: Readonly<{
    note: number;
    velocity: number;
    accent: boolean;
    slide: boolean;
    probability?: number;
    microTimingTicks?: number;
    flam?: number;
    roll?: number;
  }>,
): PatternEventData {
  return {
    ...data,
    ...DEFAULT_PATTERN_EVENT_PROPERTIES,
    probability: data.probability ?? DEFAULT_PATTERN_EVENT_PROPERTIES.probability,
    microTimingTicks: data.microTimingTicks ?? DEFAULT_PATTERN_EVENT_PROPERTIES.microTimingTicks,
    flam: data.flam ?? DEFAULT_PATTERN_EVENT_PROPERTIES.flam,
    roll: data.roll ?? DEFAULT_PATTERN_EVENT_PROPERTIES.roll,
  };
}

function cloneEvent(event: PatternEvent, idFactory: IdFactory): PatternEvent {
  return {
    ...event,
    id: createNoteEventId(idFactory),
    data: { ...event.data },
  };
}

function clonePart(
  part: PatternPartState,
  moduleId: ModuleInstanceId,
  idFactory: IdFactory,
  laneIdMap: ReadonlyMap<AutomationLaneId, AutomationLaneId> = new Map(),
): PatternPartState {
  return {
    moduleId,
    length: part.length,
    voiceCycleLengths: { ...part.voiceCycleLengths },
    events: part.events.map((event) => cloneEvent(event, idFactory)),
    automationLaneIds: part.automationLaneIds.flatMap((laneId) => {
      const clonedId = laneIdMap.get(laneId);
      return clonedId === undefined ? [] : [clonedId];
    }),
  };
}

function cloneAutomationLane(
  lane: AutomationLaneState,
  id: AutomationLaneId,
  patternId: PatternId,
  targetId: ModuleInstanceId,
): AutomationLaneState {
  return {
    ...lane,
    id,
    patternId,
    targetId,
    steps: lane.steps.map((step) => ({ ...step })),
  };
}

function seedFromPatternId(patternId: PatternId): number {
  const parsed = Number.parseInt(patternId.replaceAll("-", "").slice(0, 8), 16);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function isNumberNoteKey(value: string): boolean {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return false;
  const note = Number(value);
  return Number.isSafeInteger(note) && note >= 0 && note <= 127;
}

function isVoiceCycleLengthKey(value: string): value is VoiceCycleLengthKey {
  return isNumberNoteKey(value) || /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

function insertAfter<Item>(
  items: readonly Item[],
  item: Item,
  afterId: string | undefined,
  idOf: (value: Item) => string,
): readonly Item[] {
  if (afterId === undefined) return [item, ...items];
  const index = items.findIndex((candidate) => idOf(candidate) === afterId);
  return index === -1 ? items : [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}

function patternEditIssue(field: string, message: string, recoveryAction: string): PatternEditResult {
  return { issue: { field, message, recoveryAction } };
}

function selectEvents(
  part: PatternPartState,
  eventIds: readonly NoteEventId[],
  field: string,
): { readonly events: readonly PatternEvent[] } | { readonly issue: PatternEditIssue } {
  if (!Array.isArray(eventIds)) {
    return {
      issue: {
        field,
        message: "The event selection is not a list.",
        recoveryAction: "Select events from the current Pattern part.",
      },
    };
  }
  const selectedIds = eventIds.filter(
    (eventId: unknown): eventId is NoteEventId => isCanonicalUuid(eventId),
  );
  if (selectedIds.length !== eventIds.length || new Set(selectedIds).size !== selectedIds.length) {
    return {
      issue: {
        field,
        message: "The event selection contains an invalid or duplicate ID.",
        recoveryAction: "Select each current event once.",
      },
    };
  }
  const byId = new Map<NoteEventId, PatternEvent>(
    part.events.map((event): readonly [NoteEventId, PatternEvent] => [event.id, event]),
  );
  const events: PatternEvent[] = [];
  for (const eventId of selectedIds) {
    const event = byId.get(eventId);
    if (event === undefined) {
      return {
        issue: {
          field,
          message: "The event selection contains an event that does not exist.",
          recoveryAction: "Select events from the current Pattern part.",
        },
      };
    }
    events.push(event);
  }
  return { events };
}

function requireEditedEvents(
  part: PatternPartState,
  eventIds: readonly NoteEventId[],
  field: string,
): { readonly events: readonly PatternEvent[] } | { readonly issue: PatternEditIssue } {
  if (eventIds.length === 0) {
    return {
      issue: {
        field,
        message: "The edit needs at least one event.",
        recoveryAction: "Select one or more events.",
      },
    };
  }
  return selectEvents(part, eventIds, field);
}

function applyPatternEventEdit(
  part: PatternPartState,
  edit: PatternEventEdit,
  idFactory: IdFactory,
): PatternEditResult {
  let events: readonly PatternEvent[];
  let selectedEventIds: readonly NoteEventId[];

  switch (edit.type) {
    case "create": {
      const event: PatternEvent = {
        ...edit.event,
        id: createNoteEventId(idFactory),
        data: normalizePatternEventData(edit.event.data),
      };
      events = [...part.events, event];
      selectedEventIds = [event.id];
      break;
    }
    case "delete": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      const deleted = new Set(edit.eventIds);
      events = part.events.filter((event) => !deleted.has(event.id));
      selectedEventIds = [];
      break;
    }
    case "move": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      if (
        !Number.isSafeInteger(edit.deltaTicks) ||
        edit.deltaTicks % PATTERN_TICKS_PER_STEP !== 0 ||
        !Number.isSafeInteger(edit.deltaNote)
      ) {
        return patternEditIssue(
          "payload.edit",
          "The move offset is outside the Piano Roll grid.",
          "Move events by whole 1/16 steps and semitones.",
        );
      }
      const moved = new Set(edit.eventIds);
      events = part.events.map((event) =>
        moved.has(event.id)
          ? {
              ...event,
              positionTicks: event.positionTicks + edit.deltaTicks,
              data: { ...event.data, note: event.data.note + edit.deltaNote },
            }
          : event,
      );
      selectedEventIds = edit.eventIds;
      break;
    }
    case "resize": {
      const selected = requireEditedEvents(part, [edit.eventId], "payload.edit.eventId");
      if ("issue" in selected) return { issue: selected.issue };
      const event = selected.events[0];
      if (event?.type !== "note") {
        return patternEditIssue(
          "payload.edit.eventId",
          "A trigger does not have a duration edge.",
          "Resize a pitched note.",
        );
      }
      events = part.events.map((candidate) =>
        candidate.id === edit.eventId
          ? {
              ...event,
              positionTicks: edit.positionTicks ?? event.positionTicks,
              durationTicks: edit.durationTicks,
            }
          : candidate,
      );
      selectedEventIds = [edit.eventId];
      break;
    }
    case "duplicate": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      const copies = selected.events.map((event) => ({
        ...event,
        id: createNoteEventId(idFactory),
        positionTicks: event.positionTicks + PATTERN_TICKS_PER_STEP,
        data: { ...event.data },
      }));
      events = [...part.events, ...copies];
      selectedEventIds = copies.map((event) => event.id);
      break;
    }
    case "velocity": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      if (!Number.isFinite(edit.velocity) || edit.velocity < 0 || edit.velocity > 1) {
        return patternEditIssue(
          "payload.edit.velocity",
          "Velocity must be between 0 and 1.",
          "Choose a valid velocity.",
        );
      }
      const changed = new Set(edit.eventIds);
      events = part.events.map((event) =>
        changed.has(event.id)
          ? { ...event, data: { ...event.data, velocity: edit.velocity } }
          : event,
      );
      selectedEventIds = edit.eventIds;
      break;
    }
    case "properties": {
      const selected = requireEditedEvents(part, edit.eventIds, "payload.edit.eventIds");
      if ("issue" in selected) return { issue: selected.issue };
      const allowed = new Set([
        "velocity",
        "accent",
        "slide",
        "probability",
        "microTimingTicks",
        "flam",
        "roll",
      ]);
      if (Object.keys(edit.values).some((key) => !allowed.has(key))) {
        return patternEditIssue(
          "payload.edit.values",
          "The event property is not supported.",
          "Choose a supported event property.",
        );
      }
      const changed = new Set(edit.eventIds);
      events = part.events.map((event) =>
        changed.has(event.id)
          ? { ...event, data: { ...event.data, ...edit.values } }
          : event,
      );
      selectedEventIds = edit.eventIds;
      break;
    }
  }

  const issue = validatePatternEvents(part.length, events);
  if (issue !== undefined) return { issue };
  return { events: sortPatternEvents(events), selectedEventIds };
}

function validatePatternEvents(
  partLength: number,
  events: readonly PatternEvent[],
): PatternEditIssue | undefined {
  if (!Number.isSafeInteger(partLength) || partLength < 1 || partLength > 64) {
    return {
      field: "payload.patternId",
      message: "The Pattern part length is outside 1 through 64 steps.",
      recoveryAction: "Use a valid Pattern part.",
    };
  }
  const endTicks = partLength * PATTERN_TICKS_PER_STEP;
  const ids = new Set<string>();
  let eventType: PatternEvent["type"] | undefined;
  for (const event of events) {
    if (ids.has(event.id)) {
      return {
        field: "payload.edit",
        message: "The edit creates a duplicate event ID.",
        recoveryAction: "Retry the edit with unique events.",
      };
    }
    ids.add(event.id);
    if (eventType !== undefined && event.type !== eventType) {
      return {
        field: "payload.edit",
        message: "A Pattern part cannot mix notes and triggers.",
        recoveryAction: "Create events supported by the selected module.",
      };
    }
    eventType = event.type;
    if (
      !Number.isSafeInteger(event.positionTicks) ||
      event.positionTicks < 0 ||
      event.positionTicks >= endTicks ||
      event.positionTicks % PATTERN_TICKS_PER_STEP !== 0
    ) {
      return {
        field: "payload.edit",
        message: "An event position is outside the Pattern or the 1/16 grid.",
        recoveryAction: "Place the event on a valid grid step.",
      };
    }
    if (
      !Number.isInteger(event.data.note) ||
      event.data.note < 0 ||
      event.data.note > 127 ||
      !Number.isFinite(event.data.velocity) ||
      event.data.velocity < 0 ||
      event.data.velocity > 1 ||
      typeof event.data.accent !== "boolean" ||
      typeof event.data.slide !== "boolean" ||
      !Number.isFinite(event.data.probability) ||
      event.data.probability < 0 ||
      event.data.probability > 1 ||
      !Number.isInteger(event.data.microTimingTicks) ||
      event.data.microTimingTicks < -60 ||
      event.data.microTimingTicks > 60 ||
      !Number.isInteger(event.data.flam) ||
      event.data.flam < 0 ||
      event.data.flam > 3 ||
      !Number.isInteger(event.data.roll) ||
      event.data.roll < 0 ||
      event.data.roll > 7
    ) {
      return {
        field: "payload.edit",
        message: "An event property is outside its supported range.",
        recoveryAction: "Use values in the supported event-property ranges.",
      };
    }
    if (event.type === "note") {
      if (
        !Number.isSafeInteger(event.durationTicks) ||
        event.durationTicks <= 0 ||
        event.durationTicks % PATTERN_TICKS_PER_STEP !== 0 ||
        event.positionTicks + event.durationTicks > endTicks
      ) {
        return {
          field: "payload.edit",
          message: "A note duration is outside the Pattern or the 1/16 grid.",
          recoveryAction: "Resize the note within the Pattern.",
        };
      }
    } else if (Object.prototype.hasOwnProperty.call(event, "durationTicks")) {
      return {
        field: "payload.edit",
        message: "A trigger cannot have a duration.",
        recoveryAction: "Create a fixed one-cell trigger.",
      };
    }
  }

  const sorted = sortPatternEvents(events);
  if (eventType === "note") {
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (
        previous !== undefined &&
        current !== undefined &&
        previous.positionTicks + (previous.durationTicks ?? 0) > current.positionTicks
      ) {
        return {
          field: "payload.edit",
          message: "Monophonic notes cannot overlap.",
          recoveryAction: "Move or resize the notes so that they do not overlap.",
        };
      }
    }
  } else if (eventType === "trigger") {
    const occupied = new Set<string>();
    for (const event of sorted) {
      const key = `${String(event.positionTicks)}:${String(event.data.note)}`;
      if (occupied.has(key)) {
        return {
          field: "payload.edit",
          message: "A drum voice already has a trigger at this step.",
          recoveryAction: "Use another voice or step.",
        };
      }
      occupied.add(key);
    }
  }
  return undefined;
}

function automationStepsFitPart(
  part: PatternPartState,
  length: number,
  lanes: Readonly<Record<string, { readonly steps: readonly { readonly tick: number }[] }>>,
): boolean {
  return part.automationLaneIds.every((id) =>
    (lanes[id] ?? { steps: [] }).steps.every((step) => step.tick < length * PATTERN_TICKS_PER_STEP),
  );
}

function sortPatternEvents(events: readonly PatternEvent[]): readonly PatternEvent[] {
  return [...events].sort(
    (left, right) =>
      left.positionTicks - right.positionTicks ||
      left.data.note - right.data.note ||
      left.id.localeCompare(right.id),
  );
}

function incrementRevision(revision: StateRevision, idFactory: IdFactory): StateRevision {
  if (revision.counter === Number.MAX_SAFE_INTEGER) {
    return { epoch: createStateRevisionEpoch(idFactory), counter: 0 };
  }
  return { epoch: revision.epoch, counter: revision.counter + 1 };
}

function validateExpectedRevision(
  expected: StateRevision,
  actual: StateRevision,
): string | undefined {
  return expected.epoch === actual.epoch && expected.counter === actual.counter
    ? undefined
    : "Command was based on stale project state.";
}

function accepted(changed: boolean, projectRevision: StateRevision): CommandResult {
  return { status: "accepted", changed, projectRevision };
}

function reconcileUiReferences(project: ProjectState, ui: PulseState["ui"]): PulseState["ui"] {
  const selectedModuleId =
    ui.selectedModuleId !== undefined && project.modules[ui.selectedModuleId] !== undefined
      ? ui.selectedModuleId
      : undefined;
  const selection = ui.pianoRollSelection;
  const selectedPart =
    selection === undefined
      ? undefined
      : project.patterns.find((pattern) => pattern.id === selection.patternId)?.parts[selection.moduleId];
  const selectedIds = new Set(selectedPart?.events.map((event) => event.id));
  const eventIds = selection?.eventIds.filter((eventId) => selectedIds.has(eventId)) ?? [];
  const pianoRollSelection =
    selection !== undefined && selectedModuleId === selection.moduleId && eventIds.length > 0
      ? { ...selection, eventIds }
      : undefined;
  return { ...ui, selectedModuleId, pianoRollSelection };
}

function sameProjectContent(left: ProjectState, right: ProjectState): boolean {
  return (
    left.id === right.id &&
    left.lineageId === right.lineageId &&
    left.name === right.name &&
    left.tempo === right.tempo &&
    left.swing === right.swing &&
    left.masterLevel === right.masterLevel &&
    sameStructuredValue(left.rackSlots, right.rackSlots) &&
    sameStructuredValue(left.modules, right.modules) &&
    sameStructuredValue(left.effects, right.effects) &&
    sameStructuredValue(left.patterns, right.patterns) &&
    left.activePatternId === right.activePatternId &&
    sameStructuredValue(left.automationLanes, right.automationLanes) &&
    sameStructuredValue(left.song, right.song)
  );
}

function withNullVoiceInsertSlots(
  effects: EffectsState,
  moduleId: ModuleInstanceId,
  voiceIds: readonly VoiceId[] | undefined,
): EffectsState {
  const voiceInserts: Record<ModuleInstanceId, VoiceInsertSlots> = { ...effects.voiceInserts };
  if (voiceIds === undefined || voiceIds.length === 0) {
    return withoutModuleVoiceInserts(effects, moduleId);
  }
  const slots: Record<VoiceId, EffectInstanceId | null> = {};
  for (const voiceId of voiceIds) slots[voiceId] = null;
  voiceInserts[moduleId] = slots;
  return pruneUnreferencedEffects({ instances: effects.instances, voiceInserts });
}

function withoutModuleVoiceInserts(effects: EffectsState, moduleId: ModuleInstanceId): EffectsState {
  if (effects.voiceInserts[moduleId] === undefined) return effects;
  const voiceInserts = Object.entries(effects.voiceInserts).reduce<
    Record<ModuleInstanceId, VoiceInsertSlots>
  >((next, [rawModuleId, slots]) => {
    if (rawModuleId !== moduleId) next[rawModuleId as ModuleInstanceId] = slots;
    return next;
  }, {});
  return pruneUnreferencedEffects({ instances: effects.instances, voiceInserts });
}

function pruneUnreferencedEffects(effects: EffectsState): EffectsState {
  const referenced = new Set<EffectInstanceId>();
  for (const slots of Object.values(effects.voiceInserts)) {
    for (const effectId of Object.values(slots)) {
      if (effectId !== null) referenced.add(effectId);
    }
  }
  const instances: Record<EffectInstanceId, EffectInstanceState> = {};
  for (const [rawId, instance] of Object.entries(effects.instances)) {
    const id = rawId as EffectInstanceId;
    if (referenced.has(id)) instances[id] = instance;
  }
  return { instances, voiceInserts: effects.voiceInserts };
}

/** Compares immutable project data without serializing the full project. */
function sameStructuredValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }
  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!sameStructuredValue(left[index], right[index])) return false;
    }
    return true;
  }
  if (Array.isArray(right)) return false;
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord);
  if (leftKeys.length !== Object.keys(rightRecord).length) return false;
  for (const key of leftKeys) {
    if (!Object.hasOwn(rightRecord, key) || !sameStructuredValue(leftRecord[key], rightRecord[key])) {
      return false;
    }
  }
  return true;
}

function rejected(field: string, message: string, recoveryAction: string): CommandResult {
  return { status: "rejected", error: { field, message, recoveryAction } };
}
