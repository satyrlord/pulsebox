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
  createStateRevisionEpoch,
  type EffectInstanceId,
  type GestureId,
  type IdFactory,
  type ModuleInstanceId,
  type StateRevision,
  type VoiceId,
} from "../contracts/ids";
import type { PluginId } from "../contracts/parameters";
import type { PulseCommand } from "./commands";
import { createModule, MAXIMUM_PATTERN_SEED, type ModuleSeed } from "./default-state";
import type { PatternStep, ProjectState, PulseState, RackModuleState } from "./model";

const MAX_SONG_ENTRIES = 128;
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
  | "step-set"
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
            ui: { ...this.#state.ui, selectedModuleId: command.payload.moduleId },
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
      case "pattern-step-toggle":
        return this.#toggleStep(command.payload.moduleId, command.payload.step);
      case "transport-swing-set":
        return this.#setSwing(command.payload.swing);
      case "pattern-humanize-set":
        return this.#setPatternHumanize(command.payload.patternIndex, command.payload.humanize);
      case "pattern-seed-set":
        return this.#setPatternSeed(command.payload.patternIndex, command.payload.seed);
      case "pattern-select":
        return this.#selectPattern(command.payload.patternIndex);
      case "pattern-rename":
        return this.#renamePattern(command.payload.patternIndex, command.payload.name);
      case "pattern-clear":
        return this.#clearPattern(command.payload.patternIndex);
      case "pattern-copy":
        return this.#copyPattern(command.payload.fromPatternIndex, command.payload.toPatternIndex);
      case "song-mode-toggle":
        return this.#setSong({
          ...this.#state.project.song,
          enabled: !this.#state.project.song.enabled,
        });
      case "song-entry-add":
        return this.#addSongEntry(command.payload.patternIndex);
      case "song-entry-remove":
        return this.#removeSongEntry(command.payload.entryIndex);
      case "song-entry-repeats-set":
        return this.#setSongRepeats(command.payload.entryIndex, command.payload.repeats);
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

  #setPatternHumanize(patternIndex: number, rawHumanize: number) {
    const indexError = this.#requirePatternIndex("payload.patternIndex", patternIndex);
    if (indexError !== undefined) return { error: indexError };
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
    if (humanize === this.#state.project.patterns[patternIndex]?.humanize) {
      return { state: this.#state, projectChanged: false as const };
    }
    return this.#projectTransition(
      {
        ...this.#state.project,
        patterns: this.#state.project.patterns.map((slot, index) =>
          index === patternIndex ? { ...slot, humanize } : slot,
        ),
      },
      "pattern-timing-set",
      [],
      { patternIndex, humanize },
    );
  }

  #setPatternSeed(patternIndex: number, seed: number) {
    const indexError = this.#requirePatternIndex("payload.patternIndex", patternIndex);
    if (indexError !== undefined) return { error: indexError };
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAXIMUM_PATTERN_SEED) {
      return {
        error: rejected(
          "payload.seed",
          "A Pattern seed must be an unsigned 32-bit integer.",
          "Request a new variation to generate a valid seed.",
        ),
      };
    }
    if (seed === this.#state.project.patterns[patternIndex]?.seed) {
      return { state: this.#state, projectChanged: false as const };
    }
    return this.#projectTransition(
      {
        ...this.#state.project,
        patterns: this.#state.project.patterns.map((slot, index) =>
          index === patternIndex ? { ...slot, seed } : slot,
        ),
      },
      "pattern-timing-set",
      [],
      { patternIndex, seed },
    );
  }

  #requirePatternIndex(field: string, index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#state.project.patterns.length) {
      return rejected(field, "Pattern does not exist.", "Choose a Pattern in the bank.");
    }
    return undefined;
  }

  #selectPattern(patternIndex: number) {
    const error = this.#requirePatternIndex("payload.patternIndex", patternIndex);
    if (error !== undefined) return { error };
    if (patternIndex === this.#state.project.activePatternIndex)
      return { state: this.#state, projectChanged: false as const };
    return this.#projectTransition(
      { ...this.#state.project, activePatternIndex: patternIndex },
      "pattern-select",
      [],
      { patternIndex },
    );
  }

  #renamePattern(patternIndex: number, name: string) {
    const error = this.#requirePatternIndex("payload.patternIndex", patternIndex);
    if (error !== undefined) return { error };
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 40) {
      return {
        error: rejected(
          "payload.name",
          "A Pattern name must be 1 to 40 characters.",
          "Enter a shorter name.",
        ),
      };
    }
    return this.#projectTransition(
      {
        ...this.#state.project,
        patterns: this.#state.project.patterns.map((slot, index) =>
          index === patternIndex ? { ...slot, name: trimmed } : slot,
        ),
      },
      "pattern-rename",
      [],
      { patternIndex, name: trimmed },
    );
  }

  #mapParts(patternIndex: number, next: (steps: readonly PatternStep[]) => readonly PatternStep[]) {
    const modules: Record<string, RackModuleState> = {};
    for (const [id, module] of Object.entries(this.#state.project.modules)) {
      modules[id] = {
        ...module,
        parts: module.parts.map((steps, index) => (index === patternIndex ? next(steps) : steps)),
      };
    }
    return modules;
  }

  #clearPattern(patternIndex: number) {
    const error = this.#requirePatternIndex("payload.patternIndex", patternIndex);
    if (error !== undefined) return { error };
    const modules = this.#mapParts(patternIndex, (steps) =>
      steps.map((step) => ({ ...step, active: false })),
    );
    return this.#projectTransition({ ...this.#state.project, modules }, "project-replace", [], {
      patternIndex,
    });
  }

  #copyPattern(fromPatternIndex: number, toPatternIndex: number) {
    const fromError = this.#requirePatternIndex("payload.fromPatternIndex", fromPatternIndex);
    if (fromError !== undefined) return { error: fromError };
    const toError = this.#requirePatternIndex("payload.toPatternIndex", toPatternIndex);
    if (toError !== undefined) return { error: toError };
    if (fromPatternIndex === toPatternIndex)
      return { state: this.#state, projectChanged: false as const };
    const modules: Record<string, RackModuleState> = {};
    for (const [id, module] of Object.entries(this.#state.project.modules)) {
      const source = module.parts[fromPatternIndex];
      modules[id] =
        source === undefined
          ? module
          : {
              ...module,
              parts: module.parts.map((steps, index) =>
                index === toPatternIndex ? source.map((step) => ({ ...step })) : steps,
              ),
            };
    }
    return this.#projectTransition({ ...this.#state.project, modules }, "project-replace", [], {
      fromPatternIndex,
      toPatternIndex,
    });
  }

  #setSong(song: PulseState["project"]["song"]) {
    return this.#projectTransition({ ...this.#state.project, song }, "song-set", [], {
      enabled: song.enabled,
      entries: song.entries.map((entry) => ({ ...entry })),
    });
  }

  #addSongEntry(patternIndex: number) {
    const error = this.#requirePatternIndex("payload.patternIndex", patternIndex);
    if (error !== undefined) return { error };
    if (this.#state.project.song.entries.length >= MAX_SONG_ENTRIES) {
      return {
        error: rejected(
          "payload.patternIndex",
          `A song holds at most ${String(MAX_SONG_ENTRIES)} steps.`,
          "Remove a song step before adding another.",
        ),
      };
    }
    return this.#setSong({
      ...this.#state.project.song,
      entries: [...this.#state.project.song.entries, { patternIndex, repeats: 1 }],
    });
  }

  #requireSongEntry(entryIndex: number) {
    if (
      !Number.isInteger(entryIndex) ||
      entryIndex < 0 ||
      entryIndex >= this.#state.project.song.entries.length
    ) {
      return rejected("payload.entryIndex", "Song step does not exist.", "Choose a song step.");
    }
    return undefined;
  }

  #removeSongEntry(entryIndex: number) {
    const error = this.#requireSongEntry(entryIndex);
    if (error !== undefined) return { error };
    return this.#setSong({
      ...this.#state.project.song,
      entries: this.#state.project.song.entries.filter((_, index) => index !== entryIndex),
    });
  }

  #setSongRepeats(entryIndex: number, repeats: number) {
    const error = this.#requireSongEntry(entryIndex);
    if (error !== undefined) return { error };
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > MAX_SONG_REPEATS) {
      return {
        error: rejected(
          "payload.repeats",
          `Repeats must be between 1 and ${String(MAX_SONG_REPEATS)}.`,
          "Choose a repeat count in range.",
        ),
      };
    }
    return this.#setSong({
      ...this.#state.project.song,
      entries: this.#state.project.song.entries.map((entry, index) =>
        index === entryIndex ? { ...entry, repeats } : entry,
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
    return this.#projectTransition(
      {
        ...this.#state.project,
        rackSlots: this.#state.project.rackSlots.map((candidate) =>
          candidate.id === slotId ? { ...candidate, moduleId: module.id } : candidate,
        ),
        modules: { ...this.#state.project.modules, [module.id]: module },
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
    return this.#projectTransition(
      {
        ...this.#state.project,
        rackSlots: this.#state.project.rackSlots.map((slot) =>
          slot.moduleId === moduleId ? { id: slot.id } : slot,
        ),
        modules,
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

  #toggleStep(moduleId: ModuleInstanceId, step: number) {
    const module = this.#state.project.modules[moduleId];
    if (module === undefined)
      return {
        error: rejected("payload.moduleId", "Module does not exist.", "Edit a loaded module."),
      };
    const patternIndex = this.#state.project.activePatternIndex;
    const current = module.parts[patternIndex];
    if (current === undefined)
      return {
        error: rejected("payload.moduleId", "Pattern does not exist.", "Select a Pattern first."),
      };
    if (!Number.isInteger(step) || step < 0 || step >= current.length)
      return {
        error: rejected(
          "payload.step",
          "Step is outside the pattern.",
          "Choose a visible pattern step.",
        ),
      };
    const steps = current.map((value, index) =>
      index === step ? { ...value, active: !value.active } : value,
    );
    const nextModule: RackModuleState = {
      ...module,
      parts: module.parts.map((value, index) => (index === patternIndex ? steps : value)),
    };
    return this.#projectTransition(
      {
        ...this.#state.project,
        modules: { ...this.#state.project.modules, [moduleId]: nextModule },
      },
      "step-set",
      [moduleId],
      { moduleId, patternIndex, step, active: steps[step]?.active ?? false },
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
  return { ...ui, selectedModuleId };
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
    left.activePatternIndex === right.activePatternIndex &&
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
