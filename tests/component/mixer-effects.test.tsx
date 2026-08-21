import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RACK_SLOT_IDS, SEND_BUS_IDS, type PluginId } from "../../src/contracts";
import { DRUMLINE_SIX_MANIFEST } from "../../src/engine/public";
import { EffectsBank } from "../../src/ui/react/shell/EffectsBank";
import { EditorWorkspace } from "../../src/ui/react/shell/EditorWorkspace";
import { MasterPanel } from "../../src/ui/react/shell/MasterPanel";
import { Mixer } from "../../src/ui/react/shell/Mixer";
import { Rack } from "../../src/ui/react/shell/Rack";
import { StudioPanel } from "../../src/ui/react/shell/StudioPanel";
import { firstModuleId, createHarness, renderWithHarness } from "./helpers";

const SEND_A_ID = SEND_BUS_IDS[0];

/** The Edit control of the named send card, not the first card in DOM order. */
function sendEditorButton(send: "A" | "B" | "C" | "D"): HTMLElement {
  const card = screen
    .getByRole("button", { name: `Select send ${send}` })
    .closest('[data-component="effect-slot"]');
  if (card === null) throw new Error(`Expected the Send ${send} effect card.`);
  return within(card as HTMLElement).getByRole("button", {
    name: `Edit Send ${send} effects`,
  });
}

describe("mixer and effects surfaces", () => {
  it("keeps rack and mixer selection aligned", () => {
    const harness = createHarness();
    harness.domain.dispatch(
      harness.domain.createCommand("rack-module-add", {
        slotId: RACK_SLOT_IDS[1],
        pluginId: DRUMLINE_SIX_MANIFEST.pluginId,
      }),
    );
    renderWithHarness(
      <>
        <Rack />
        <Mixer />
      </>,
      harness,
    );
    const rackModules = document.querySelectorAll<HTMLElement>('[data-component="rack-module"]');
    const mixerStrips = document.querySelectorAll<HTMLElement>(
      '[data-component="channel-strip"]:not([data-empty="true"])',
    );
    const secondRack = rackModules[1];
    const secondMixer = mixerStrips[1];
    if (secondRack === undefined || secondMixer === undefined) {
      throw new Error("Expected two loaded rack and mixer channels.");
    }
    expect(within(secondRack).getByRole("slider", { name: /Distortion/u })).toHaveValue(0);
    const rackControl = secondRack.querySelector<HTMLElement>('[role="slider"]');
    if (rackControl === null) throw new Error("Expected a rack control.");
    fireEvent.focus(rackControl);
    expect(secondRack).toHaveAttribute("data-selected", "true");
    expect(secondMixer).toHaveAttribute("data-selected", "true");

    const firstSelect = within(mixerStrips[0] ?? document.body).getByRole("button", {
      name: /Select .* channel/u,
    });
    fireEvent.click(firstSelect);
    expect(rackModules[0]).toHaveAttribute("data-selected", "true");

    expect(mixerStrips[0]?.querySelectorAll("button")).toHaveLength(7);
  });

  it("edits Distortion for the selected drum voice from the rack", () => {
    const harness = createHarness();
    harness.domain.dispatch(
      harness.domain.createCommand("rack-module-add", {
        slotId: RACK_SLOT_IDS[1],
        pluginId: DRUMLINE_SIX_MANIFEST.pluginId,
      }),
    );
    renderWithHarness(<Rack />, harness);

    const moduleId = harness.domain.getState().project.rackSlots[1]?.moduleId;
    if (moduleId === undefined) throw new Error("Expected a drum module.");
    const rackModule = document.querySelectorAll<HTMLElement>('[data-component="rack-module"]')[1];
    if (rackModule === undefined) throw new Error("Expected the second rack module.");
    fireEvent.change(within(rackModule).getByRole("combobox", { name: "Tin Soldier voice" }), {
      target: { value: "snare" },
    });
    const distortion = within(rackModule).getByRole("slider", { name: "Distortion" });
    fireEvent.keyDown(distortion, { key: "End" });
    fireEvent.keyUp(distortion, { key: "End" });

    expect(harness.domain.getState().project.modules[moduleId]?.parameters["snare-distortion"]).toBe(
      1,
    );
    expect(harness.domain.getState().project.modules[moduleId]?.parameters["kick-distortion"]).toBe(
      0,
    );
  });

  it("uses an icon-only Output control to bypass all Rack FX with one Undo", () => {
    const harness = createHarness();
    const moduleId = firstModuleId(harness);
    harness.domain.dispatch(
      harness.domain.createCommand("effects-chain-effect-add", {
        chain: { scope: "module", targetId: moduleId },
        effectPluginId: "chorus" as PluginId,
      }),
    );
    renderWithHarness(<Rack />, harness);

    const bypass = screen.getByRole("button", {
      name: "Bypass all Rack FX for Silver Serpent",
    });
    expect(bypass).toHaveAttribute("aria-pressed", "false");
    expect(bypass).toHaveTextContent("");
    expect(bypass.querySelector('[data-component="bypass-all-icon"]')).not.toBeNull();
    fireEvent.click(bypass);
    expect(bypass).toHaveAttribute("aria-pressed", "true");
    expect(harness.domain.getState().project.effects.moduleChains[moduleId]?.bypassed).toBe(
      true,
    );
    act(() => harness.store.getState().undo());
    expect(bypass).toHaveAttribute("aria-pressed", "false");
  });

  it("uses one icon-only Mixer control to bypass all Send FX", () => {
    const harness = createHarness();
    renderWithHarness(<StudioPanel />, harness);

    const bypass = screen.getByRole("button", { name: "Bypass all Send FX" });
    expect(bypass).toHaveAttribute("aria-pressed", "false");
    expect(bypass).toHaveTextContent("");
    expect(bypass.querySelector('[data-component="bypass-all-icon"]')).not.toBeNull();
    fireEvent.click(bypass);
    expect(bypass).toHaveAttribute("aria-pressed", "true");
    expect(harness.domain.getState().project.effects.sendEffectsBypassed).toBe(true);
    expect(
      Object.values(harness.domain.getState().project.effects.sendChains).every(
        (chain) => !chain.bypassed,
      ),
    ).toBe(true);
    act(() => harness.store.getState().undo());
    expect(bypass).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps eight fixed channel strips and opens a send amount and tap surface", () => {
    const harness = createHarness();
    renderWithHarness(<Mixer />, harness);

    expect(document.querySelectorAll('[data-component="channel-strip"]')).toHaveLength(8);
    expect(document.querySelector('[data-component="master-strip"]')).not.toBeNull();
    const masterBypass = screen.getByRole("button", { name: "Bypass master effects" });
    expect(masterBypass).toHaveTextContent("FX ON");
    fireEvent.click(masterBypass);
    expect(masterBypass).toHaveTextContent("FX OFF");
    expect(harness.domain.getState().project.effects.masterEffectsBypassed).toBe(true);
    act(() => harness.store.getState().undo());
    expect(harness.domain.getState().project.effects.masterEffectsBypassed).toBe(false);
    expect(screen.getByRole("status", { name: /Silver Serpent output clip indicator, clear/i })).toBeVisible();
    act(() => harness.store.getState().setMeterLevel(firstModuleId(harness), 0.99));
    expect(screen.getByRole("status", { name: /Silver Serpent output clip indicator, clipping/i })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Open send A for Silver Serpent/i }));
    expect(screen.getByRole("region", { name: "Send A value" })).toBeVisible();
    const amount = screen.getByRole("slider", { name: "Amount" });
    fireEvent.keyDown(amount, { key: "End" });
    expect(harness.audio.previewChannelSendAmount).toHaveBeenCalledWith(
      firstModuleId(harness),
      SEND_A_ID,
      1,
    );
    expect(harness.domain.getState().project.modules[firstModuleId(harness)]?.sends[SEND_A_ID]?.amount).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(false);
    fireEvent.keyUp(amount, { key: "End" });
    expect(harness.domain.getState().project.modules[firstModuleId(harness)]?.sends[SEND_A_ID]?.amount).toBe(1);
    expect(harness.domain.getState().history.canUndo).toBe(true);
    expect(screen.queryByRole("combobox", { name: "Send A tap mode" })).toBeNull();
  });

  it("previews send and effect controls before one committed Undo entry", () => {
    const harness = createHarness();
    renderWithHarness(<EffectsBank />, harness);
    const sendAId = SEND_A_ID;
    const sendA = harness.domain.getState().project.effects.sendChains[sendAId];
    const delayId = sendA?.slots[0];
    if (delayId === null || delayId === undefined) throw new Error("Expected the default delay.");

    const time = screen.getByRole("slider", { name: "Send A Analog Echo Time macro" });
    fireEvent.keyDown(time, { key: "ArrowUp" });
    expect(harness.audio.previewEffectParameter).toHaveBeenCalledWith(delayId, "time", 376);
    expect(harness.domain.getState().project.effects.instances[delayId]?.state.time).toBe(375);
    expect(harness.domain.getState().history.canUndo).toBe(false);
    fireEvent.keyUp(time, { key: "ArrowUp" });
    expect(harness.domain.getState().project.effects.instances[delayId]?.state.time).toBe(376);
    expect(harness.domain.getState().history.canUndo).toBe(true);
    act(() => harness.store.getState().undo());

    const returnLevel = screen.getByRole("slider", { name: "Send A Return Level" });
    fireEvent.keyDown(returnLevel, { key: "Home" });
    expect(harness.audio.previewSendReturnLevel).toHaveBeenCalledWith(sendAId, 0);
    expect(harness.domain.getState().project.effects.sendChains[sendAId]?.returnLevel).toBe(1);
    expect(harness.domain.getState().history.canUndo).toBe(false);
    fireEvent.keyUp(returnLevel, { key: "Home" });
    expect(harness.domain.getState().project.effects.sendChains[sendAId]?.returnLevel).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(true);
  });

  it("preserves manifest units and display precision in compact and detailed effect controls", () => {
    const harness = createHarness();
    renderWithHarness(<EffectsBank />, harness);

    const compactTime = screen.getByRole("slider", {
      name: "Send A Analog Echo Time macro",
    });
    expect(compactTime).toHaveAttribute("aria-valuetext", "375 milliseconds");
    expect(compactTime).toHaveAttribute("title", "375 milliseconds");

    fireEvent.click(sendEditorButton("A"));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Analog Echo in Send A Tempo Sync",
      }),
    );
    const detailedTime = screen.getByRole("slider", {
      name: "Analog Echo in Send A Time",
    });
    expect(detailedTime).toHaveAttribute("aria-valuetext", "375 milliseconds");
    expect(detailedTime).toHaveAttribute("title", "375 milliseconds");
    expect(screen.getByRole("spinbutton", { name: "Analog Echo in Send A Time value" })).toHaveValue(
      375,
    );
  });

  it("keeps per-effect Mix and Gain synchronized with commits and history", () => {
    const harness = createHarness();
    renderWithHarness(<EffectsBank />, harness);
    const sendA = harness.domain.getState().project.effects.sendChains[SEND_A_ID];
    const delayId = sendA?.slots[0];
    if (delayId === null || delayId === undefined) throw new Error("Expected the default delay.");

    fireEvent.click(sendEditorButton("A"));
    const mix = screen.getByRole("slider", { name: "Analog Echo in Send A Mix" });
    const gain = screen.getByRole("slider", { name: "Analog Echo in Send A Gain" });
    expect(mix).toHaveAttribute("aria-valuenow", "0.35");
    expect(gain).toHaveAttribute("aria-valuenow", "0");

    fireEvent.keyDown(mix, { key: "ArrowUp" });
    fireEvent.keyUp(mix, { key: "ArrowUp" });
    expect(harness.domain.getState().project.effects.instances[delayId]?.mix).toBe(0.36);
    act(() => harness.store.getState().undo());
    expect(harness.domain.getState().project.effects.instances[delayId]?.mix).toBe(0.35);
    act(() => harness.store.getState().redo());
    expect(harness.domain.getState().project.effects.instances[delayId]?.mix).toBe(0.36);
    fireEvent.keyDown(gain, { key: "ArrowUp" });
    fireEvent.keyUp(gain, { key: "ArrowUp" });
    expect(harness.domain.getState().project.effects.instances[delayId]?.gainDecibels).toBe(0.1);
  });

  it("opens an external send target in the Piano Roll and writes its first lane step", () => {
    const harness = createHarness();
    renderWithHarness(
      <>
        <Mixer />
        <EditorWorkspace />
      </>,
      harness,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open send A for Silver Serpent/i }));
    fireEvent.click(screen.getByRole("button", { name: "Automate" }));

    expect(screen.getByRole("combobox", { name: "Piano Roll parameter" })).toHaveValue(
      "send-a-amount",
    );
    const firstStep = screen.getByRole("slider", { name: "Amount, step 1" });
    fireEvent.keyUp(firstStep, { target: { value: "0.75" } });

    expect(
      Object.values(harness.domain.getState().project.automationLanes),
    ).toContainEqual(
      expect.objectContaining({
        scope: "send",
        targetId: firstModuleId(harness),
        parameterId: "send-a-amount",
        steps: [{ tick: 0, value: 0.75 }],
      }),
    );
  });

  it("opens the existing automation lane from effect, send, and master controls", () => {
    const harness = createHarness();
    renderWithHarness(
      <>
        <Mixer />
        <EffectsBank />
        <MasterPanel />
        <EditorWorkspace />
      </>,
      harness,
    );
    const parameter = () => screen.getByRole("combobox", { name: "Piano Roll parameter" });

    fireEvent.click(sendEditorButton("A"));
    fireEvent.contextMenu(screen.getByRole("slider", { name: "Analog Echo in Send A Mix" }));
    expect(parameter()).toHaveValue("mix");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.contextMenu(
      within(screen.getByRole("region", { name: "Master routing" })).getByRole("slider", {
        name: "Master level",
      }),
    );
    expect(parameter()).toHaveValue("level");

    fireEvent.contextMenu(
      screen.getByRole("combobox", { name: "Send D Distortion Model macro" }),
    );
    expect(parameter()).toHaveValue("model");

    const edit = sendEditorButton("A");
    fireEvent.click(edit);
    fireEvent.contextMenu(
      screen.getByRole("combobox", { name: "Analog Echo in Send A Mode" }),
    );
    expect(parameter()).toHaveValue("mode");
    fireEvent.keyDown(screen.getByRole("checkbox", { name: "Analog Echo in Send A Tempo Sync" }), {
      key: "A",
      shiftKey: true,
    });
    expect(parameter()).toHaveValue("tempo-sync");
  });

  it("renders manifest sections before Output and hides inactive parameter representations", () => {
    const harness = createHarness();
    renderWithHarness(<EffectsBank />, harness);

    fireEvent.click(sendEditorButton("A"));
    const delayTitle = screen.getByText("Analog Echo", { selector: "strong" });
    const delayPedal = delayTitle.closest("li");
    if (delayPedal === null) throw new Error("Expected the Analog Echo pedal.");
    expect(
      [...delayPedal.querySelectorAll('[data-component="effect-parameter-section"]')].map(
        (section) => section.getAttribute("data-section-id"),
      ),
    ).toEqual(["timing", "echo"]);
    const output = delayPedal.querySelector('[data-component="effect-output-section"]');
    const echo = delayPedal.querySelector('[data-section-id="echo"]');
    if (output === null || echo === null) throw new Error("Expected sound-first pedal sections.");
    expect(echo.compareDocumentPosition(output) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(
      within(delayPedal).queryByRole("slider", {
        name: "Analog Echo in Send A Time",
      }),
    ).toBeNull();
    expect(
      within(delayPedal).getByRole("slider", {
        name: "Analog Echo in Send A Beat Time",
      }),
    ).toBeVisible();
    fireEvent.click(
      within(delayPedal).getByRole("checkbox", {
        name: "Analog Echo in Send A Tempo Sync",
      }),
    );
    expect(
      within(delayPedal).getByRole("slider", {
        name: "Analog Echo in Send A Time",
      }),
    ).toBeVisible();
    expect(
      within(delayPedal).queryByRole("slider", {
        name: "Analog Echo in Send A Beat Time",
      }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(sendEditorButton("B"));
    const reverbTitle = screen.getByText("Plate Reverb", { selector: "strong" });
    const reverbPedal = reverbTitle.closest("li");
    if (reverbPedal === null) throw new Error("Expected the Plate Reverb pedal.");
    expect(
      within(reverbPedal).queryByRole("combobox", {
        name: "Plate Reverb in Send B Mode",
      }),
    ).toBeNull();
    expect(
      within(reverbPedal).getByLabelText("Plate Reverb in Send B Mode: Plate"),
    ).toHaveTextContent("Plate");
  });

  it("shows four send cards and restores focus after closing the deep effect editor", () => {
    const harness = createHarness();
    renderWithHarness(<EffectsBank />, harness);

    expect(document.querySelectorAll('[data-component="effect-slot"]')).toHaveLength(4);
    for (const send of ["A", "B", "C", "D"] as const) {
      expect(
        screen.getByRole("button", { name: `Bypass Send ${send} chain` }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: `Edit Send ${send} effects` }),
      ).toBeVisible();
    }
    const sendACompactPedal = screen.getByRole("button", { name: "Select send A" }).closest("article");
    if (sendACompactPedal === null) throw new Error("Expected the Send A compact pedal.");
    expect(sendACompactPedal).toHaveAttribute("data-bypassed", "false");
    expect(within(sendACompactPedal).getByText("ECHO")).toBeVisible();
    expect(sendACompactPedal).toHaveStyle({
      "--send-accent": "#B66B46",
      "--send-accent-muted": "#5B3624",
    });
    const edit = sendEditorButton("A");
    edit.focus();
    fireEvent.click(edit);
    expect(screen.getByRole("dialog", { name: "Send A effect editor" })).toBeVisible();
    expect(
      screen.getByText("This shared chain processes signal sent from any mixer channel."),
    ).toBeVisible();
    const delayPedal = screen.getByText("Analog Echo", { selector: "strong" }).closest("li");
    expect(delayPedal).toHaveAttribute("data-component", "effect-pedal");
    expect(delayPedal).toHaveStyle({ "--effect-accent": "#B66B46" });
    expect(within(delayPedal as HTMLElement).getByText("ECHO")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Add an effect to Send A" }), {
      target: { value: "chorus" },
    });
    const order = screen.getByRole("list", { name: "Send A effect order" });
    const chorusLabel = within(order)
      .getAllByText("Chorus")
      .find((element) => element.tagName === "STRONG");
    if (chorusLabel === undefined) throw new Error("Expected the Chorus pedal.");
    expect(chorusLabel).toBeVisible();
    const depth = screen.getByRole("slider", { name: "Chorus in Send A Depth" });
    depth.focus();
    fireEvent.keyDown(depth, { key: "ArrowUp" });
    fireEvent.keyUp(depth, { key: "ArrowUp" });
    expect(depth).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "Pin Chorus in Send A to the compact send card" }),
    );
    const sendA = harness.domain.getState().project.effects.sendChains[SEND_A_ID];
    expect(
      sendA?.pinnedEffectId === null || sendA?.pinnedEffectId === undefined
        ? undefined
        : harness.domain.getState().project.effects.instances[sendA.pinnedEffectId]?.pluginId,
    ).toBe("chorus");
    const chorusItem = chorusLabel.closest("li");
    const delayItem = within(order)
      .getAllByText("Analog Echo")
      .find((element) => element.tagName === "STRONG")
      ?.closest("li");
    if (chorusItem === null || delayItem === null || delayItem === undefined) {
      throw new Error("Expected two send pedals.");
    }
    const dispatch = vi.spyOn(harness.domain, "dispatch");
    fireEvent.pointerDown(
      within(chorusItem).getByRole("button", { name: "Drag Chorus in Send A to reorder" }),
      { button: 0, pointerId: 1 },
    );
    expect(chorusItem).toHaveAttribute("data-dragging", "true");
    fireEvent.pointerEnter(delayItem, { pointerId: 1 });
    expect(delayItem).toHaveAttribute("data-drag-target", "true");
    fireEvent.pointerUp(delayItem, { pointerId: 1 });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "effects-chain-effect-reorder",
        payload: { effectInstanceId: sendA?.pinnedEffectId },
      }),
    );
    const pinnedId = harness.domain.getState().project.effects.sendChains[SEND_A_ID]?.pinnedEffectId;
    expect(harness.domain.getState().project.effects.sendChains[SEND_A_ID]?.slots[0]).toBe(
      pinnedId,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Replace Chorus in Send A" }), {
      target: { value: "phaser" },
    });
    expect(
      pinnedId === null || pinnedId === undefined
        ? undefined
        : harness.domain.getState().project.effects.instances[pinnedId]?.pluginId,
    ).toBe("phaser");
    act(() => harness.store.getState().undo());
    expect(
      pinnedId === null || pinnedId === undefined
        ? undefined
        : harness.domain.getState().project.effects.instances[pinnedId]?.pluginId,
    ).toBe("chorus");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(edit).toHaveFocus();
  });

  it("edits stable EQ bands directly by keyboard and pointer as one gesture", () => {
    const harness = createHarness();
    const view = renderWithHarness(<MasterPanel />, harness);
    fireEvent.click(screen.getByRole("button", { name: "Edit chain" }));
    const eqId = harness.domain.getState().project.effects.masterChain.find((effectId) =>
      effectId === null
        ? false
        : harness.domain.getState().project.effects.instances[effectId]?.pluginId ===
          "parametric-eq",
    );
    if (eqId === null || eqId === undefined) throw new Error("Expected the default EQ.");

    const mid = screen.getByRole("button", { name: /^Edit mid EQ band,/ });
    expect(mid).toHaveTextContent("M");
    fireEvent.keyDown(mid, { key: "ArrowUp" });
    expect(harness.audio.previewEffectParameter).toHaveBeenCalledWith(eqId, "mid-gain", 0.1);
    expect(harness.domain.getState().project.effects.instances[eqId]?.state["mid-gain"]).toBe(0);
    fireEvent.keyUp(mid, { key: "ArrowUp" });
    expect(harness.domain.getState().project.effects.instances[eqId]?.state["mid-gain"]).toBe(0.1);
    expect(
      document.querySelector('[data-component="eq-response-curve"] output[aria-live]'),
    ).toHaveTextContent("mid EQ: 1.2 kHz, +0.1 dB.");
    act(() => harness.store.getState().undo());

    const surface = document.querySelector<HTMLElement>('[data-component="eq-response-curve"]');
    const low = screen.getByRole("button", { name: /^Edit low EQ band,/ });
    expect(low).toHaveTextContent("L");
    if (surface === null) throw new Error("Expected the EQ curve surface.");
    Object.assign(low, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 540,
      bottom: 150,
      width: 540,
      height: 150,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(low, { button: 0, pointerId: 7, clientX: 100, clientY: 75 });
    fireEvent.pointerMove(low, { pointerId: 7, clientX: 180, clientY: 45 });
    fireEvent.pointerUp(low, { pointerId: 7, clientX: 180, clientY: 45 });
    expect(harness.domain.getState().project.effects.instances[eqId]?.state["low-frequency"]).not.toBe(120);
    expect(harness.domain.getState().project.effects.instances[eqId]?.state["low-gain"]).not.toBe(0);
    act(() => harness.store.getState().undo());
    expect(harness.domain.getState().project.effects.instances[eqId]?.state["low-frequency"]).toBe(120);
    expect(harness.domain.getState().project.effects.instances[eqId]?.state["low-gain"]).toBe(0);

    fireEvent.keyDown(mid, { key: "ArrowUp" });
    expect(harness.domain.getState().project.effects.instances[eqId]?.state["mid-gain"]).toBe(0);
    fireEvent.blur(window);
    expect(harness.domain.getState().project.effects.instances[eqId]?.state["mid-gain"]).toBe(0.1);
    act(() => harness.store.getState().undo());

    fireEvent.keyDown(mid, { key: "ArrowUp" });
    view.unmount();
    expect(harness.domain.getState().project.effects.instances[eqId]?.state["mid-gain"]).toBe(0.1);
  });

  it("edits a tempo-locked Pattern Filter cutoff lane in the Piano Roll", () => {
    const harness = createHarness();
    renderWithHarness(
      <>
        <EffectsBank />
        <EditorWorkspace />
      </>,
      harness,
    );
    fireEvent.click(sendEditorButton("A"));
    fireEvent.change(screen.getByRole("combobox", { name: "Add an effect to Send A" }), {
      target: { value: "pattern-filter" },
    });
    fireEvent.contextMenu(screen.getByRole("slider", { name: "Pattern Filter in Send A Cutoff" }));
    expect(screen.getByRole("combobox", { name: "Piano Roll parameter" })).toHaveValue("cutoff");
    fireEvent.keyUp(screen.getByRole("slider", { name: "Cutoff, step 1" }), {
      target: { value: "1200" },
    });
    fireEvent.keyUp(screen.getByRole("slider", { name: "Cutoff, step 2" }), {
      target: { value: "4800" },
    });
    expect(Object.values(harness.domain.getState().project.automationLanes)).toContainEqual(
      expect.objectContaining({
        scope: "effect",
        parameterId: "cutoff",
        steps: [
          { tick: 0, value: 1200 },
          { tick: 240, value: 4800 },
        ],
      }),
    );
  });

  it("toggles the project-owned master effects bypass and opens the master editor", () => {
    const harness = createHarness();
    renderWithHarness(<MasterPanel />, harness);
    const bypass = screen.getByRole("button", { name: "Bypass master effects" });

    expect(bypass).not.toHaveAttribute("aria-keyshortcuts");
    expect(screen.queryByTitle("Automate master effects bypass.")).toBeNull();
    fireEvent.click(bypass);
    expect(harness.domain.getState().project.effects.masterEffectsBypassed).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reset peak" }));
    expect(harness.audio.resetMasterPeak).toHaveBeenCalledOnce();
    expect(screen.getByRole("meter", { name: "Before master effects" })).toBeVisible();
    expect(screen.getByRole("meter", { name: "After master effects" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit chain" }));
    expect(screen.getByRole("dialog", { name: "Master chain effect editor" })).toBeVisible();
    expect(screen.getByRole("meter", { name: "Compressor gain reduction" })).toBeVisible();
    expect(screen.getByRole("meter", { name: "Limiter gain reduction" })).toBeVisible();
    const curve = screen.getByRole("img", { name: "Parametric EQ response curve" });
    const before = curve.querySelector('[data-part="response"]')?.getAttribute("d");
    const midGain = screen.getByRole("slider", { name: "Parametric EQ in Master chain Mid Gain" });
    fireEvent.keyDown(midGain, { key: "ArrowUp" });
    fireEvent.keyUp(midGain, { key: "ArrowUp" });
    expect(curve.querySelector('[data-part="response"]')?.getAttribute("d")).not.toBe(before);
    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    expect(screen.queryByRole("dialog", { name: "Master chain effect editor" })).toBeNull();
  });

  it("shows silent master-chain meters after Stop and after the Master panel remounts", () => {
    const harness = createHarness();
    const view = renderWithHarness(<MasterPanel />, harness);
    act(() => {
      harness.domain.dispatch(harness.domain.createCommand("transport-play", {}));
      harness.store.getState().setMasterChainMeterFrames(
        { left: 0.7, right: 0.5, mid: 0.6, side: 0.1, peak: false },
        { left: 0.6, right: 0.4, mid: 0.5, side: 0.1, peak: false },
      );
    });
    expect(screen.getByRole("meter", { name: "Before master effects" })).toHaveAttribute(
      "aria-valuenow",
      "0.7",
    );

    act(() => {
      harness.domain.dispatch(harness.domain.createCommand("transport-stop", {}));
    });
    expect(screen.getByRole("meter", { name: "Before master effects" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByRole("meter", { name: "After master effects" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );

    view.unmount();
    renderWithHarness(<MasterPanel />, harness);
    expect(screen.getByRole("meter", { name: "Before master effects" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });
});
