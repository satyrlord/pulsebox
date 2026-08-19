import type { CommandResult, Listener, Selector, Unsubscribe } from "../contracts/commands";
import type { EffectInstanceState } from "../contracts/effects";
import {
  createCommandId,
  createStateRevisionEpoch,
  type GestureId,
  type IdFactory,
  type StateRevision,
} from "../contracts/ids";
import type { PluginId } from "../contracts/parameters";
import {
  externalAutomationTargetSupportIssue,
  type EffectAutomationParameterValidator,
} from "./automation-targets";
import type { PulseCommand } from "./commands";
import {
  applyPulseCommand,
  type ChainEffectPlacement,
  type EffectInstanceFactory,
  type PulseEngineDelta,
} from "./command-handlers/feature-handlers";
import type { ModuleSeed } from "./default-state";
import {
  type ProjectState,
  type PulseState,
  type RackModuleState,
} from "./model";

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

export type { ChainEffectPlacement, EffectInstanceFactory, PulseEngineDelta };

export class PulseStore {
  readonly #idFactory: IdFactory;
  readonly #onEngineDelta: (delta: PulseEngineDelta) => void;
  readonly #moduleSeedFor: (pluginId: PluginId) => ModuleSeed | undefined;
  readonly #validateParameter: (
    module: RackModuleState,
    parameter: string,
    value: number | boolean | string,
  ) => boolean;
  readonly #createEffectInstance: EffectInstanceFactory | undefined;
  readonly #validateEffectParameter:
    | ((effect: EffectInstanceState, parameter: string, value: number | boolean | string) => boolean)
    | undefined;
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
    now: () => string = () => new Date().toISOString(),
    validateEffectParameter?: (
      effect: EffectInstanceState,
      parameter: string,
      value: number | boolean | string,
    ) => boolean,
    createEffectInstance?: EffectInstanceFactory,
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
    this.#createEffectInstance = createEffectInstance;
    this.#now = now;
    this.#validateEffectParameter = validateEffectParameter;
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
    this.#undo.pop();
    this.#redo.push(entry);
    return this.#replaceProject(entry.before, previous, {}, this.#historyAvailability());
  }

  redo(): CommandResult {
    const entry = this.#redo.at(-1);
    if (entry === undefined) return accepted(false, this.#state.project.revision);
    const previous = this.#state;
    this.#redo.pop();
    this.#undo.push(entry);
    return this.#replaceProject(entry.after, previous, {}, this.#historyAvailability());
  }

  saveProject(): ProjectState {
    return this.#cloneProject(this.#state.project);
  }

  loadProject(project: ProjectState): CommandResult {
    const previous = this.#state;
    const nextProject = this.#cloneProject(project);
    const candidate = {
      ...nextProject,
      revision: incrementRevision(previous.project.revision, this.#idFactory),
    };
    if (sameProjectContent(previous.project, candidate)) {
      return accepted(false, previous.project.revision);
    }
    this.#undo.length = 0;
    this.#redo.length = 0;
    return this.#replaceProject(nextProject, previous, { source: "loadProject" }, {
      canUndo: false,
      canRedo: false,
    });
  }

  #replaceProject(
    project: ProjectState,
    previous: PulseState,
    payload: Readonly<Record<string, unknown>>,
    history: PulseState["history"],
  ): CommandResult {
    const candidate = {
      ...this.#cloneProject(project),
      revision: incrementRevision(previous.project.revision, this.#idFactory),
    };
    this.#state = {
      ...previous,
      project: candidate,
      ui: reconcileUiReferences(candidate, previous.ui, this.#validateEffectParameter),
      history,
    };
    this.#notify();
    this.#onEngineDelta({
      kind: "project-replace",
      projectRevision: candidate.revision,
      targetIds: [],
      payload,
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

  #apply(command: PulseCommand) {
    return applyPulseCommand(command, {
      state: this.#state,
      idFactory: this.#idFactory,
      moduleSeedFor: this.#moduleSeedFor,
      validateParameter: this.#validateParameter,
      createEffectInstance: this.#createEffectInstance,
      validateEffectParameter: this.#validateEffectParameter,
      now: this.#now,
      projectTransition: (nextProject, kind, targetIds, payload, uiPatch) =>
        this.#projectTransition(nextProject, kind, targetIds, payload, uiPatch),
    });
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
      state: {
        ...this.#state,
        project: nextProject,
        ui: reconcileUiReferences(
          nextProject,
          { ...this.#state.ui, ...uiPatch },
          this.#validateEffectParameter,
        ),
      },
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

function reconcileUiReferences(
  project: ProjectState,
  ui: PulseState["ui"],
  validateEffectParameter: EffectAutomationParameterValidator | undefined,
): PulseState["ui"] {
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
  const automationTarget = ui.pianoRollAutomationTarget;
  const pianoRollAutomationTarget =
    automationTarget !== undefined &&
    externalAutomationTargetSupportIssue(
      project,
      automationTarget.scope,
      automationTarget.targetId,
      automationTarget.parameterId,
      validateEffectParameter,
    ) === undefined
      ? automationTarget
      : undefined;
  return { ...ui, selectedModuleId, pianoRollSelection, pianoRollAutomationTarget };
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
