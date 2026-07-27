import type {
  ModuleInstanceId,
  PluginId,
  PluginManifest,
  RackSlotId,
} from "../../contracts";
import type { PulseState, RackModuleState } from "../../state/public";
import { PulseKnob } from "../controls/pulse-knob";
import type { PulseControlEventDetail, PulseStepChangeDetail } from "../events";
import { PulsePatternStrip } from "../shell/pulse-pattern-strip";
import { PulseRackModule } from "../shell/pulse-rack-module";

export interface RackViewCallbacks {
  readonly onAction: (
    action: string,
    moduleId: ModuleInstanceId | undefined,
    slotId: RackSlotId,
  ) => void;
  readonly onParameterCommit: (
    moduleId: ModuleInstanceId,
    parameter: string,
    value: number,
  ) => void;
  readonly onParameterInput: (
    moduleId: ModuleInstanceId,
    parameter: string,
    value: number,
  ) => void;
  readonly onParameterSelect: (
    moduleId: ModuleInstanceId,
    parameter: string,
    value: string | boolean,
  ) => void;
  readonly onStepChange: (
    moduleId: ModuleInstanceId,
    detail: PulseStepChangeDetail,
  ) => void;
}

interface ModuleElements {
  readonly actions: Readonly<Record<string, HTMLButtonElement>>;
  readonly booleanControls: Readonly<Record<string, HTMLInputElement>>;
  readonly knobs: Readonly<Record<string, PulseKnob>>;
  readonly pattern: PulsePatternStrip;
  readonly selects: Readonly<Record<string, HTMLSelectElement>>;
}

interface SlotView {
  readonly host: PulseRackModule;
  moduleElements?: ModuleElements | undefined;
  signature?: string;
}

export class RackView {
  readonly #callbacks: RackViewCallbacks;
  readonly #addLabel: string;
  readonly #manifestFor: (pluginId: PluginId) => PluginManifest | undefined;
  readonly #slots: readonly SlotView[];

  constructor(
    rack: HTMLElement,
    visibleSlotCount: number,
    addProductName: string,
    manifestFor: (pluginId: PluginId) => PluginManifest | undefined,
    callbacks: RackViewCallbacks,
  ) {
    this.#callbacks = callbacks;
    this.#addLabel = `Add ${addProductName}`;
    this.#manifestFor = manifestFor;
    this.#slots = Array.from({ length: visibleSlotCount }, (_, index) => {
      const host = new PulseRackModule();
      host.slotNumber = index + 1;
      rack.append(host);
      return { host };
    });
  }

  patch(state: Readonly<PulseState>): void {
    const visibleSlots = state.project.rackSlots.slice(0, this.#slots.length);
    const hasEmptySlot = visibleSlots.some((slot) => slot.moduleId === undefined);
    this.#slots.forEach((view, index) => {
      const slot = visibleSlots[index];
      if (slot === undefined) return;
      const module = slot.moduleId === undefined
        ? undefined
        : state.project.modules[slot.moduleId];
      const signature = module === undefined ? "empty" : `${module.id}:${module.pluginId}`;
      if (view.signature !== signature) {
        this.#buildSlot(view, slot.id, module);
        view.signature = signature;
      }
      this.#patchSlot(view, state, index, module, hasEmptySlot);
    });
  }

  #buildSlot(
    view: SlotView,
    slotId: RackSlotId,
    module: RackModuleState | undefined,
  ): void {
    for (const child of [...view.host.children]) child.remove();
    view.moduleElements = undefined;
    if (module === undefined) {
      const add = actionButton(this.#addLabel, "add");
      add.addEventListener("click", () => this.#callbacks.onAction("add", undefined, slotId));
      view.host.append(add);
      return;
    }

    const manifest = this.#requireManifest(module.pluginId);
    const controls = document.createElement("div");
    controls.className = "compact-controls";
    const knobs: Record<string, PulseKnob> = {};
    const selects: Record<string, HTMLSelectElement> = {};
    const booleanControls: Record<string, HTMLInputElement> = {};
    for (const descriptor of manifest.parameters) {
      if (descriptor.valueType === "enum") {
        const select = document.createElement("select");
        select.setAttribute("aria-label", descriptor.name);
        for (const optionValue of descriptor.enumValues ?? []) {
          const option = document.createElement("option");
          option.value = optionValue;
          option.textContent = optionValue;
          select.append(option);
        }
        select.addEventListener("change", () => {
          this.#callbacks.onParameterSelect(module.id, descriptor.id, select.value);
        });
        selects[descriptor.id] = select;
        controls.append(select);
        continue;
      }
      if (descriptor.valueType === "boolean") {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.setAttribute("aria-label", descriptor.name);
        checkbox.addEventListener("change", () => {
          this.#callbacks.onParameterSelect(module.id, descriptor.id, checkbox.checked);
        });
        label.append(checkbox, descriptor.shortLabel ?? descriptor.name);
        booleanControls[descriptor.id] = checkbox;
        controls.append(label);
        continue;
      }
      if (
        descriptor.minimum === undefined ||
        descriptor.maximum === undefined ||
        descriptor.step === undefined ||
        typeof descriptor.defaultValue !== "number"
      ) continue;
      const knob = new PulseKnob();
      knob.dataset.parameter = descriptor.id;
      knob.controlId = descriptor.id;
      knob.label = descriptor.shortLabel ?? descriptor.name;
      knob.min = descriptor.minimum;
      knob.max = descriptor.maximum;
      knob.step = descriptor.step;
      knob.defaultValue = descriptor.defaultValue;
      knob.addEventListener("pulse-control-input", (event) => {
        const detail: PulseControlEventDetail<number> = event.detail;
        this.#callbacks.onParameterInput(module.id, descriptor.id, detail.value);
      });
      knob.addEventListener("pulse-control-commit", (event) => {
        if (typeof event.detail.value !== "number") return;
        this.#callbacks.onParameterCommit(module.id, descriptor.id, event.detail.value);
      });
      knobs[descriptor.id] = knob;
      controls.append(knob);
    }
    view.host.append(controls);

    const actionsElement = document.createElement("span");
    actionsElement.slot = "actions";
    actionsElement.className = "module-actions";
    const actions: Record<string, HTMLButtonElement> = {};
    for (const [label, action, text] of [
      ["Select module", "select", "Select"],
      ["Move left", "move-left", "←"],
      ["Move right", "move-right", "→"],
      ["Duplicate module", "duplicate", "Dup"],
      ["Remove module", "remove", "Remove"],
    ] as const) {
      const button = actionButton(label, action, text);
      button.addEventListener("click", () => this.#callbacks.onAction(action, module.id, slotId));
      actions[action] = button;
      actionsElement.append(button);
    }
    view.host.append(actionsElement);

    const pattern = new PulsePatternStrip();
    pattern.slot = "pattern";
    pattern.label = `${manifest.productName} pattern`;
    pattern.addEventListener("pulse-step-change", (event) => {
      this.#callbacks.onStepChange(
        module.id,
        event.detail,
      );
    });
    view.host.append(pattern);
    view.moduleElements = { actions, booleanControls, knobs, pattern, selects };
  }

  #patchSlot(
    view: SlotView,
    state: Readonly<PulseState>,
    index: number,
    module: RackModuleState | undefined,
    hasEmptySlot: boolean,
  ): void {
    const host = view.host;
    if (module === undefined) {
      host.label = "Empty";
      host.shortLabel = "";
      host.disabled = true;
      host.selected = false;
      applyModuleAccent(host, undefined);
      return;
    }
    const manifest = this.#requireManifest(module.pluginId);
    host.label = manifest.productName;
    host.shortLabel = manifest.shortLabel ?? "";
    host.disabled = false;
    host.selected = module.id === state.ui.selectedModuleId;
    applyModuleAccent(host, manifest.ui.moduleAccent);
    const elements = view.moduleElements;
    if (elements === undefined) return;
    for (const descriptor of manifest.parameters) {
      const value = module.parameters[descriptor.id];
      const knob = elements.knobs[descriptor.id];
      if (knob !== undefined && typeof value === "number" && knob.value !== value) knob.value = value;
      const select = elements.selects[descriptor.id];
      if (select !== undefined && typeof value === "string" && select.value !== value) select.value = value;
      const checkbox = elements.booleanControls[descriptor.id];
      if (checkbox !== undefined && typeof value === "boolean") checkbox.checked = value;
    }
    elements.pattern.steps = module.pattern.steps;
    const select = elements.actions.select;
    const moveLeft = elements.actions["move-left"];
    const moveRight = elements.actions["move-right"];
    const duplicate = elements.actions.duplicate;
    if (select !== undefined) select.disabled = host.selected;
    if (moveLeft !== undefined) moveLeft.disabled = index === 0;
    if (moveRight !== undefined) moveRight.disabled = index === this.#slots.length - 1;
    if (duplicate !== undefined) duplicate.disabled = !hasEmptySlot;
  }

  #requireManifest(pluginId: PluginId): PluginManifest {
    const manifest = this.#manifestFor(pluginId);
    if (manifest === undefined) throw new Error(`Unknown plugin ${pluginId}.`);
    return manifest;
  }
}

function actionButton(label: string, action: string, text = label): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.setAttribute("aria-label", label);
  button.dataset.action = action;
  return button;
}

function applyModuleAccent(
  element: HTMLElement,
  accent: PluginManifest["ui"]["moduleAccent"] | undefined,
): void {
  const tokens = {
    "--module-accent": accent?.accent,
    "--module-accent-muted": accent?.accentMuted,
    "--module-led": accent?.led,
    "--module-control-ring": accent?.controlRing,
  };
  for (const [name, value] of Object.entries(tokens)) {
    if (value === undefined) element.style.removeProperty(name);
    else element.style.setProperty(name, value);
  }
}
