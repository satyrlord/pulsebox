import type {
  CommandResult,
  GestureId,
  ModuleInstanceId,
  PluginId,
  PluginManifest,
  RackSlotId,
  Unsubscribe,
} from "../../contracts";
import type { PulseCommand, PulseState, PulseStore } from "../../state/public";
import {
  APPEARANCE_STORAGE_KEY,
  elementThemeHost,
  PulseThemeService,
} from "../../themes";
import { PulseKnob } from "../controls/pulse-knob";
import { requiredElement } from "../required-element";
import { PulsePatternStrip } from "../shell/pulse-pattern-strip";
import { PulseSettingsPage } from "../shell/pulse-settings-page";
import { RackView } from "./rack-view";

type CommandPayload<Type extends PulseCommand["type"]> = Extract<
  PulseCommand,
  { readonly type: Type }
>["payload"];

export type PulseAppStorePort = Pick<
  PulseStore,
  "createCommand" | "dispatch" | "getState" | "redo" | "subscribe" | "undo"
>;

export type PulseAudioStatus = "faulted" | "recovered" | "recovering";

export interface PulseAudioControlPort {
  readonly getPositionTicks: () => number;
  readonly pause: () => number;
  readonly play: (tempo: number) => Promise<void>;
  readonly previewParameter: (
    moduleId: ModuleInstanceId,
    parameter: string,
    value: number,
  ) => void;
  readonly stop: () => void;
}

export interface MountPulseboxAppOptions {
  readonly addPluginId: PluginId;
  readonly audio: PulseAudioControlPort;
  readonly manifestFor: (pluginId: PluginId) => PluginManifest | undefined;
  readonly store: PulseAppStorePort;
  readonly visibleSlotCount: number;
}

export interface PulseboxAppHandle {
  readonly dispose: () => void;
  readonly markAudioUnavailable: () => void;
  readonly reportAudioStatus: (status: PulseAudioStatus, message?: string) => void;
  /** Appearance ownership, for the Settings page once it exists. */
  readonly themeService: PulseThemeService;
}

export function mountPulseboxApp(options: MountPulseboxAppOptions): PulseboxAppHandle {
  const app = new PulseboxApp(options);
  app.mount();
  return app;
}

class PulseboxApp implements PulseboxAppHandle {
  readonly #abortController = new AbortController();
  readonly #audio: PulseAudioControlPort;
  readonly #host: HTMLDivElement;
  readonly #store: PulseAppStorePort;
  readonly #themeService: PulseThemeService;
  readonly #unsubscribers: Unsubscribe[] = [];
  readonly #visibleSlotCount: number;
  #audioStatus!: HTMLOutputElement;
  #audioUnavailable = false;
  #positionAnimationFrame: number | undefined;
  #positionOutput!: HTMLOutputElement;
  #rackView!: RackView;
  #recordButton!: HTMLButtonElement;
  #redoButton!: HTMLButtonElement;
  #settingsButton!: HTMLButtonElement;
  #settingsPanel!: HTMLElement;
  #tempo!: HTMLInputElement;
  #undoNotice: HTMLElement | undefined;
  #undoNoticeMessage!: HTMLSpanElement;
  #undoNoticeTimer: number | undefined;
  #undoRemovalButton!: HTMLButtonElement;
  #undoButton!: HTMLButtonElement;
  readonly #addPluginId: PluginId;
  readonly #manifestFor: (pluginId: PluginId) => PluginManifest | undefined;

  constructor(options: MountPulseboxAppOptions) {
    this.#addPluginId = options.addPluginId;
    this.#audio = options.audio;
    this.#host = requiredElement(document, "#app", HTMLDivElement);
    this.#manifestFor = options.manifestFor;
    this.#store = options.store;
    this.#visibleSlotCount = options.visibleSlotCount;
    // Appearance is a global UI preference. It never reaches the store, so a
    // theme change cannot mark a project dirty or enter undo history.
    this.#themeService = new PulseThemeService({
      host: elementThemeHost(document.documentElement),
      storage: {
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => {
          window.localStorage.setItem(key, value);
        },
      },
      onCorruptPreference: () => {
        this.#announce("Stored appearance settings were unreadable, so the Rack theme is active.");
      },
      onStorageFailure: (message) => {
        this.#announce(message);
      },
    });
  }

  get themeService(): PulseThemeService {
    return this.#themeService;
  }

  mount(): void {
    this.#themeService.start();
    this.#host.innerHTML = `
      <div class="pulse-shell" data-pulse-editable-workspace>
        <pulse-transport-bar>
          <span slot="project" class="project-name">Phase 1 session</span>
          <span slot="transport" class="transport-controls">
            <button type="button" data-action="play" aria-label="Play">Play</button>
            <button type="button" data-action="pause" aria-label="Pause">Pause</button>
            <button type="button" data-action="stop" aria-label="Stop">Stop</button>
            <button type="button" data-action="record" aria-label="Record" aria-pressed="false">Record</button>
            <label class="tempo-label">Tempo <input data-field="tempo" type="number" min="40" max="240" step="1"></label>
          </span>
          <output slot="position" class="position" aria-live="polite">1.1.1</output>
          <output slot="master" class="audio-status" aria-live="polite">Audio locked</output>
        </pulse-transport-bar>
        <main class="studio-grid">
          <pulse-rack><span slot="heading">Instrument rack</span></pulse-rack>
          <pulse-editor-workspace>
            <span slot="tabs">Acid Bass editor</span>
            <p class="editor-copy">Select a rack module, shape its sound, and program its sixteen-step pattern.</p>
          </pulse-editor-workspace>
        </main>
        <pulse-workspace-bar>
          <span slot="modes" class="mode-label">Rack</span>
          <span slot="editors" class="history-controls">
            <button type="button" data-action="undo">Undo</button>
            <button type="button" data-action="redo">Redo</button>
          </span>
          <span slot="actions" class="phase-label">
            <button type="button" data-action="settings" aria-expanded="false" aria-controls="settings-panel">Settings</button>
          </span>
        </pulse-workspace-bar>
        <div class="settings-panel" id="settings-panel" hidden>
          <pulse-settings-page></pulse-settings-page>
        </div>
        <aside class="undo-notice" role="status" aria-live="polite" aria-atomic="true" hidden>
          <span class="undo-notice-message"></span>
          <button type="button" data-action="undo-removal">Undo</button>
        </aside>
      </div>
      <pulse-unsupported-size><span slot="summary">Playback controls remain available when the window is enlarged.</span></pulse-unsupported-size>
    `;
    const rack = requiredElement(this.#host, "pulse-rack", HTMLElement);
    this.#tempo = requiredElement(this.#host, "[data-field='tempo']", HTMLInputElement);
    this.#audioStatus = requiredElement(this.#host, ".audio-status", HTMLOutputElement);
    this.#positionOutput = requiredElement(this.#host, ".position", HTMLOutputElement);
    this.#recordButton = requiredElement(this.#host, "[data-action='record']", HTMLButtonElement);
    this.#undoButton = requiredElement(this.#host, "[data-action='undo']", HTMLButtonElement);
    this.#redoButton = requiredElement(this.#host, "[data-action='redo']", HTMLButtonElement);
    this.#undoNotice = requiredElement(this.#host, ".undo-notice", HTMLElement);
    this.#undoNoticeMessage = requiredElement(this.#host, ".undo-notice-message", HTMLSpanElement);
    this.#undoRemovalButton = requiredElement(this.#host, "[data-action='undo-removal']", HTMLButtonElement);
    this.#settingsButton = requiredElement(this.#host, "[data-action='settings']", HTMLButtonElement);
    this.#settingsPanel = requiredElement(this.#host, ".settings-panel", HTMLElement);
    // Appearance ownership stays with the theme service. The page reads and
    // writes preferences through it and never touches the project store.
    requiredElement(this.#host, "pulse-settings-page", PulseSettingsPage)
      .connect(this.#themeService);
    const addProductName = this.#manifestFor(this.#addPluginId)?.productName ?? "module";
    this.#rackView = new RackView(rack, this.#visibleSlotCount, addProductName, this.#manifestFor, {
      onAction: (action, moduleId, slotId) => this.#onRackAction(action, moduleId, slotId),
      onParameterCommit: (moduleId, parameter, value) => {
        this.#dispatch("rack-parameter-set", { moduleId, parameter, value });
      },
      onParameterInput: (moduleId, parameter, value) => {
        this.#audio.previewParameter(moduleId, parameter, value);
      },
      onParameterSelect: (moduleId, parameter, value) => {
        this.#dispatch("rack-parameter-set", { moduleId, parameter, value });
      },
      onStepChange: (moduleId, detail) => {
        this.#dispatch(
          "pattern-step-toggle",
          { moduleId, step: detail.index },
          { gestureId: detail.gestureId },
        );
      },
    });

    const { signal } = this.#abortController;
    this.#host.addEventListener("click", (event) => void this.#onClick(event), { signal });
    this.#host.addEventListener("change", (event) => this.#onChange(event), { signal });
    window.addEventListener("keydown", (event) => this.#onKeyDown(event), { signal });
    document.addEventListener("visibilitychange", () => this.#onVisibilityChange(), { signal });
    // A valid appearance envelope written by another tab applies as a UI-only
    // update. Invalid cross-tab data is ignored without changing appearance.
    window.addEventListener("storage", (event) => {
      if (event.key === APPEARANCE_STORAGE_KEY) this.#themeService.applyCrossTabValue(event.newValue);
    }, { signal });

    this.#unsubscribers.push(
      this.#store.subscribe((state) => state.project, () => this.#patchRack()),
      this.#store.subscribe((state) => state.project.tempo, (tempo) => this.#patchTempo(tempo)),
      this.#store.subscribe((state) => state.ui.selectedModuleId, () => this.#patchRack()),
      this.#store.subscribe((state) => state.transport, (transport) => this.#patchTransport(transport)),
      this.#store.subscribe((state) => state.history, (history) => this.#patchHistory(history)),
    );
    this.#patchRack();
    this.#patchTempo(this.#store.getState().project.tempo);
    this.#patchTransport(this.#store.getState().transport);
    this.#patchHistory(this.#store.getState().history);
  }

  dispose(): void {
    this.#abortController.abort();
    for (const unsubscribe of this.#unsubscribers.splice(0)) unsubscribe();
    this.#stopPositionUpdates();
    this.#hideUndoNotice();
  }

  markAudioUnavailable(): void {
    this.#audioUnavailable = true;
    this.#audioStatus.value = "Audio unavailable";
    for (const action of ["play", "pause", "stop", "record"]) {
      requiredElement(this.#host, `[data-action='${action}']`, HTMLButtonElement).disabled = true;
    }
  }

  reportAudioStatus(status: PulseAudioStatus, message?: string): void {
    if (status === "faulted") {
      this.#audio.stop();
      if (this.#store.getState().transport.status !== "stopped") {
        this.#dispatch("transport-stop", {});
      }
      this.markAudioUnavailable();
      this.#audioStatus.value = message === undefined
        ? "Audio unavailable"
        : `Audio unavailable: ${message}`;
    } else if (status === "recovering") {
      this.#audioStatus.value = message === undefined
        ? "Audio recovering"
        : `Audio recovering: ${message}`;
    } else {
      const transport = this.#store.getState().transport.status;
      this.#audioStatus.value = transport === "playing"
        ? "Audio active"
        : transport === "paused" ? "Audio suspended" : "Audio ready";
    }
  }

  async #onClick(event: MouseEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const action = target.dataset.action;
    if (action === "play") {
      if (this.#audioUnavailable || this.#store.getState().transport.status === "playing") return;
      try {
        await this.#audio.play(this.#store.getState().project.tempo);
        this.#dispatch("transport-play", {});
        this.#audioStatus.value = "Audio active";
      } catch {
        this.markAudioUnavailable();
      }
    } else if (action === "pause") {
      if (this.#store.getState().transport.status !== "playing") return;
      this.#dispatch("transport-pause", { positionTicks: this.#audio.pause() });
      this.#audioStatus.value = "Audio suspended";
    } else if (action === "stop") {
      this.#audio.stop();
      this.#dispatch("transport-stop", {});
    } else if (action === "record") {
      this.#dispatch("transport-record-toggle", {});
    } else if (action === "undo" || action === "undo-removal") {
      const result = this.#store.undo();
      if (result.status === "accepted" && result.changed) {
        if (action === "undo-removal") this.#showUndoNotice("Module restored.", false);
        else this.#hideUndoNotice();
      }
    } else if (action === "redo") {
      const result = this.#store.redo();
      if (result.status === "accepted" && result.changed) this.#hideUndoNotice();
    } else if (action === "settings") {
      this.#setSettingsOpen(this.#settingsPanel.hidden !== false);
    }
  }

  /**
   * Section 11.4 keeps appearance selection on this page alone. Closing returns
   * focus to the button that opened it, so keyboard position is never lost.
   */
  #setSettingsOpen(open: boolean): void {
    this.#settingsPanel.hidden = !open;
    this.#settingsButton.setAttribute("aria-expanded", String(open));
    if (open) {
      const page = this.#settingsPanel.querySelector("pulse-settings-page");
      const first = page?.shadowRoot?.querySelector("input");
      if (first instanceof HTMLInputElement) first.focus();
    } else {
      this.#settingsButton.focus();
    }
  }

  #onChange(event: Event): void {
    if (event.target === this.#tempo) {
      this.#dispatch("transport-tempo-set", { tempo: this.#tempo.valueAsNumber });
    }
  }

  #onKeyDown(event: KeyboardEvent): void {
    const path = event.composedPath();
    const isHistoryShortcut = (event.ctrlKey || event.metaKey) &&
      (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y");
    const ownsNativeHistory = path.some((target) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
    if (isHistoryShortcut && !ownsNativeHistory) {
      event.preventDefault();
      const redo = event.key.toLowerCase() === "y" || event.shiftKey;
      const result = redo ? this.#store.redo() : this.#store.undo();
      if (result.status === "accepted" && result.changed) this.#hideUndoNotice();
      return;
    }
    // An open Settings page owns Escape: closing it must not also stop playback.
    if (event.key === "Escape" && !this.#settingsPanel.hidden) {
      event.preventDefault();
      this.#setSettingsOpen(false);
      return;
    }
    if (path.some((target) =>
      target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof PulseKnob ||
      target instanceof PulsePatternStrip
    )) return;
    if (event.code === "Space") {
      event.preventDefault();
      const action = this.#store.getState().transport.status === "playing" ? "pause" : "play";
      requiredElement(this.#host, `[data-action='${action}']`, HTMLButtonElement).click();
    } else if (event.key === "Escape") {
      requiredElement(this.#host, "[data-action='stop']", HTMLButtonElement).click();
    }
  }

  #onRackAction(action: string, moduleId: ModuleInstanceId | undefined, slotId: RackSlotId): void {
    this.#finalizeControlGestures();
    if (action === "add") {
      this.#dispatch("rack-module-add", { slotId });
      return;
    }
    if (moduleId === undefined) return;
    if (action === "remove") {
      const module = this.#store.getState().project.modules[moduleId];
      const name = module === undefined ? "Module" : this.#manifestFor(module.pluginId)?.productName ?? "Module";
      const result = this.#dispatch("rack-module-remove", { moduleId });
      if (result.status === "accepted" && result.changed) this.#showUndoNotice(`${name} removed.`, true);
    } else if (action === "duplicate") {
      const empty = this.#firstEmptyVisibleSlot();
      if (empty !== undefined) this.#dispatch("rack-module-duplicate", { moduleId, slotId: empty });
    } else if (action === "move-left" || action === "move-right") {
      this.#moveModule(moduleId, action === "move-left" ? -1 : 1);
    } else if (action === "select") {
      this.#dispatch("rack-module-select", { moduleId });
    }
  }

  #patchRack(): void {
    this.#rackView.patch(this.#store.getState());
  }

  #patchTempo(tempo: number): void {
    this.#tempo.value = String(tempo);
  }

  #patchTransport(transport: Readonly<PulseState["transport"]>): void {
    this.#host.dataset.transport = transport.status;
    this.#recordButton.setAttribute("aria-pressed", String(transport.recordArmed));
    if (transport.status === "playing") this.#startPositionUpdates();
    else {
      this.#stopPositionUpdates();
      this.#positionOutput.value = formatPosition(transport.positionTicks);
    }
  }

  #patchHistory(history: Readonly<PulseState["history"]>): void {
    this.#undoButton.disabled = !history.canUndo;
    this.#redoButton.disabled = !history.canRedo;
  }

  #onVisibilityChange(): void {
    if (document.visibilityState === "hidden") this.#stopPositionUpdates();
    else if (this.#store.getState().transport.status === "playing") this.#startPositionUpdates();
  }

  #startPositionUpdates(): void {
    this.#stopPositionUpdates();
    if (document.visibilityState === "hidden") return;
    this.#host.dataset.positionTracking = "active";
    const update = () => {
      this.#positionOutput.value = formatPosition(this.#audio.getPositionTicks());
      this.#positionAnimationFrame = window.requestAnimationFrame(update);
    };
    update();
  }

  #stopPositionUpdates(): void {
    if (this.#positionAnimationFrame !== undefined) {
      window.cancelAnimationFrame(this.#positionAnimationFrame);
    }
    this.#positionAnimationFrame = undefined;
    this.#host.dataset.positionTracking = "paused";
  }

  #moveModule(moduleId: ModuleInstanceId, direction: -1 | 1): void {
    const slots = this.#store.getState().project.rackSlots.slice(0, this.#visibleSlotCount);
    const index = slots.findIndex((slot) => slot.moduleId === moduleId);
    const target = slots[index + direction];
    if (target === undefined) return;
    const result = this.#dispatch("rack-module-move", { moduleId, slotId: target.id });
    if (result.status === "accepted" && result.changed) {
      this.#showUndoNotice(`Moved to rack slot ${String(index + direction + 1).padStart(2, "0")}.`, false);
    }
  }

  #firstEmptyVisibleSlot(): RackSlotId | undefined {
    return this.#store.getState().project.rackSlots
      .slice(0, this.#visibleSlotCount)
      .find((slot) => slot.moduleId === undefined)?.id;
  }

  #finalizeControlGestures(): void {
    window.dispatchEvent(new Event("blur"));
  }

  #dispatch<Type extends PulseCommand["type"]>(
    type: Type,
    payload: CommandPayload<Type>,
    options: { readonly gestureId?: GestureId } = {},
  ): CommandResult {
    this.#hideUndoNotice();
    const createCommand = this.#store.createCommand.bind(this.#store) as unknown as <CommandType extends PulseCommand["type"]>(
      commandType: CommandType,
      commandPayload: CommandPayload<CommandType>,
      commandOptions?: { readonly gestureId?: GestureId },
    ) => Extract<PulseCommand, { readonly type: CommandType }>;
    return this.#store.dispatch(createCommand(type, payload, options));
  }

  #showUndoNotice(message: string, canUndo: boolean): void {
    const notice = this.#undoNotice;
    if (notice === undefined) return;
    if (this.#undoNoticeTimer !== undefined) window.clearTimeout(this.#undoNoticeTimer);
    this.#undoNoticeMessage.textContent = message;
    this.#undoRemovalButton.hidden = !canUndo;
    notice.hidden = false;
    if (!canUndo) {
      this.#undoNoticeTimer = window.setTimeout(() => this.#hideUndoNotice(), 2_500);
    }
  }

  /**
   * Non-blocking status message with an ARIA live announcement. Used for
   * appearance failures, which must never block or change the active theme.
   */
  #announce(message: string): void {
    // The theme service starts before the shell is rendered, so a startup
    // report has no notice element to write into yet. Defer to the next task.
    if (this.#undoNotice === undefined) {
      queueMicrotask(() => {
        if (this.#undoNotice !== undefined) this.#showUndoNotice(message, false);
      });
      return;
    }
    this.#showUndoNotice(message, false);
  }

  #hideUndoNotice(): void {
    if (this.#undoNoticeTimer !== undefined) window.clearTimeout(this.#undoNoticeTimer);
    this.#undoNoticeTimer = undefined;
    if (this.#undoNotice !== undefined) this.#undoNotice.hidden = true;
  }
}

function formatPosition(ticks: number): string {
  const safeTicks = Math.max(0, Math.floor(ticks));
  const bar = Math.floor(safeTicks / 3_840) + 1;
  const beat = Math.floor(safeTicks / 960) % 4 + 1;
  const sixteenth = Math.floor(safeTicks / 240) % 4 + 1;
  return `${String(bar)}.${String(beat)}.${String(sixteenth)}`;
}
