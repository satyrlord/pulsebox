import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DRUMLINE_SIX_MANIFEST } from "../../src/engine/public";
import { DEFAULT_MASTER_LEVEL } from "../../src/state/public";
import { EditorWorkspace } from "../../src/ui/react/shell/EditorWorkspace";
import { EffectsBank } from "../../src/ui/react/shell/EffectsBank";
import { MasterPanel } from "../../src/ui/react/shell/MasterPanel";
import { Mixer } from "../../src/ui/react/shell/Mixer";
import { ProjectMenu } from "../../src/ui/react/shell/ProjectMenu";
import { StudioPanel } from "../../src/ui/react/shell/StudioPanel";
import { WorkspaceBar } from "../../src/ui/react/shell/WorkspaceBar";
import { masterMeterFrameFor, SILENT_MASTER_METER } from "../../src/ui/react/store/app-store";
import { createHarness, firstModuleId, renderWithHarness } from "./helpers";

describe("EditorWorkspace", () => {
  it("opens on Verse without Pattern or Song subtabs", () => {
    renderWithHarness(<EditorWorkspace />);

    expect(screen.getByRole("combobox", { name: "Selected Pattern" })).toHaveValue("1");
    expect(screen.getByRole<HTMLOptionElement>("option", { name: "Verse" }).selected).toBe(true);
    expect(screen.queryByRole("tab", { name: "Pattern" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Song" })).toBeNull();
  });

  it("selects a Pattern and clears its module part through commands", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);

    fireEvent.change(screen.getByRole("combobox", { name: "Selected Pattern" }), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear the Pattern" }));

    expect(harness.domain.getState().project.activePatternIndex).toBe(0);
    expect(harness.domain.getState().project.modules[moduleId]?.parts[0]?.events).toHaveLength(0);
    expect(harness.store.getState().undoNotice?.message).toContain("Undo is available");
  });

  it("shows one module-aware Piano Roll and the current Pattern data", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);

    const roll = document.querySelector('[data-component="piano-roll"]');
    expect(roll).toBeInTheDocument();
    expect(
      within(roll as HTMLElement).getByRole("combobox", { name: "Piano Roll module" }),
    ).toHaveValue(firstModuleId(harness));
    const eventGroup = within(roll as HTMLElement).getByRole("group", {
      name: /events in Verse/,
    });
    expect(within(eventGroup).getAllByRole("button")).toHaveLength(3);
    expect(
      within(eventGroup).getByRole("button", { name: /^C2 note, step 1,/ }),
    ).toBeVisible();
  });

  it("renders a chromatic keybed that auditions the exact held pitch", async () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);
    const keybed = screen.getByRole("group", { name: "Piano keyboard" });
    const keys = within(keybed).getAllByRole("button");
    const c4 = within(keybed).getByRole("button", { name: "C4 piano key audition" });

    expect(keys).toHaveLength(25);
    fireEvent.pointerDown(c4, { button: 0, pointerId: 9 });
    await waitFor(() => expect(harness.audio.startAudition).toHaveBeenCalledWith(moduleId, 60));
    fireEvent.pointerUp(c4, { button: 0, pointerId: 9 });
    expect(harness.audio.stopAudition).toHaveBeenCalledWith(moduleId);
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("moves a selected note by one step with the keyboard", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);
    const eventButton = screen.getByRole("button", { name: /^C2 note, step 1,/ });
    const eventId = harness.domain.getState().project.modules[moduleId]?.parts[1]?.events[0]?.id;

    expect(eventId).toBeDefined();
    fireEvent.keyDown(eventButton, { key: "ArrowRight" });

    expect(
      harness.domain.getState().project.modules[moduleId]?.parts[1]?.events.find(
        (event) => event.id === eventId,
      )?.positionTicks,
    ).toBe(240);
    expect(harness.domain.getState().history.canUndo).toBe(true);
  });

  it("shows Velocity as the only available Piano Roll parameter", () => {
    renderWithHarness(<EditorWorkspace />);
    const selector = screen.getByRole("combobox", { name: "Piano Roll parameter" });

    expect(within(selector).getAllByRole("option")).toHaveLength(1);
    expect(
      within(selector).getByRole<HTMLOptionElement>("option", { name: "Velocity" }).selected,
    ).toBe(true);
    expect(screen.getByRole("group", { name: "Velocity lane" })).toBeVisible();
  });

  it("coalesces one drum paint drag into one Undo entry", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const emptySlot = harness.domain.getState().project.rackSlots.find(
      (slot) => slot.moduleId === undefined,
    );
    if (emptySlot === undefined) throw new Error("The test project has no empty rack slot.");
    act(() => {
      harness.store.getState().addModule(emptySlot.id, DRUMLINE_SIX_MANIFEST.pluginId);
    });
    const drumModuleId = harness.domain.getState().project.rackSlots.find(
      (slot) => slot.id === emptySlot.id,
    )?.moduleId;
    if (drumModuleId === undefined) throw new Error("The drum module was not added.");
    act(() => harness.store.getState().selectModule(drumModuleId));
    const part = harness.domain.getState().project.modules[drumModuleId]?.parts[1];
    const baseline = part?.events.length ?? 0;
    const grid = screen.getByRole("group", { name: /Tin Soldier events in Verse/ });
    Object.assign(grid, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1600,
      bottom: 144,
      width: 1600,
      height: 144,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(grid, { button: 0, pointerId: 37, clientX: 150, clientY: 84 });
    fireEvent.pointerMove(grid, { pointerId: 37, clientX: 250, clientY: 84 });
    fireEvent.pointerMove(grid, { pointerId: 37, clientX: 350, clientY: 84 });
    fireEvent.pointerUp(grid, { pointerId: 37, clientX: 350, clientY: 84 });

    expect(harness.domain.getState().project.modules[drumModuleId]?.parts[1]?.events).toHaveLength(
      baseline + 3,
    );
    act(() => harness.store.getState().undo());
    expect(harness.domain.getState().project.modules[drumModuleId]?.parts[1]?.events).toHaveLength(
      baseline,
    );
  });

  it("keeps same-step velocity controls separate and keyboard reachable", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);

    act(() => {
      harness.store.getState().editPatternEvents(moduleId, 1, {
        type: "create",
        event: {
          type: "note",
          positionTicks: 0,
          durationTicks: 240,
          data: { note: 38, velocity: 0.65, accent: false, slide: false },
        },
      });
    });

    const lane = screen.getByRole("group", { name: "Velocity lane" });
    const firstStepControls = within(lane)
      .getAllByRole("slider")
      .filter((control) => control.getAttribute("aria-label")?.includes("step 1"));
    expect(firstStepControls).toHaveLength(2);
    expect(firstStepControls.every((control) => control.tabIndex >= 0)).toBe(true);
  });

  it("adds the selected Pattern to the compact Playlist", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);

    // Decision D92: the default project ships a five-entry Song chain, so the
    // added entry lands after it.
    const baseline = harness.domain.getState().project.song.entries;
    fireEvent.click(screen.getByRole("button", { name: "Add selected Pattern" }));

    expect(harness.domain.getState().project.song.entries).toEqual([
      ...baseline,
      expect.objectContaining({ patternIndex: 1, repeats: 1 }),
    ]);
    expect(screen.getAllByRole("button", { name: /Verse/ }).length).toBeGreaterThan(0);
  });

  it("edits the active Pattern's Humanize through the tapered header slider", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const slider = screen.getByRole("slider", { name: "Pattern Humanize" });
    expect(slider).toHaveValue("0");
    expect(slider).toHaveAttribute("aria-valuetext", "0 percent");

    // The track is tapered: position 60 of 100 is the 30 percent value.
    fireEvent.change(slider, { target: { value: "60" } });

    expect(harness.domain.getState().project.patterns[1]?.humanize).toBeCloseTo(0.3, 6);
    expect(slider).toHaveAttribute("aria-valuetext", "30 percent");
    // Humanize is Pattern-owned: the other Patterns keep their own value.
    expect(harness.domain.getState().project.patterns[0]?.humanize).toBe(0);
  });

  it("previews Humanize during a pointer gesture and commits once on release", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const slider = screen.getByRole("slider", { name: "Pattern Humanize" });

    fireEvent.pointerDown(slider, { button: 0, pointerId: 21 });
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.change(slider, { target: { value: "60" } });

    expect(slider).toHaveAttribute("aria-valuetext", "30 percent");
    expect(harness.audio.previewHumanize).toHaveBeenLastCalledWith(1, 0.3);
    expect(harness.domain.getState().project.patterns[1]?.humanize).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(false);

    fireEvent.pointerUp(slider, { button: 0, pointerId: 21 });

    expect(harness.domain.getState().project.patterns[1]?.humanize).toBeCloseTo(0.3, 6);
    expect(harness.domain.getState().history.canUndo).toBe(true);
    act(() => {
      harness.store.getState().undo();
    });
    expect(harness.domain.getState().project.patterns[1]?.humanize).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("previews Swing during a pointer gesture and commits once on release", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const slider = screen.getByRole("slider", { name: "Project Swing" });

    fireEvent.pointerDown(slider, { button: 0, pointerId: 22 });
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.change(slider, { target: { value: "60" } });

    expect(slider).toHaveAttribute("aria-valuetext", "30 percent");
    expect(harness.audio.previewSwing).toHaveBeenLastCalledWith(0.3);
    expect(harness.domain.getState().project.swing).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(false);

    fireEvent.pointerUp(slider, { button: 0, pointerId: 22 });

    expect(harness.domain.getState().project.swing).toBeCloseTo(0.3, 6);
    expect(harness.domain.getState().history.canUndo).toBe(true);
    act(() => {
      harness.store.getState().undo();
    });
    expect(harness.domain.getState().project.swing).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("previews a Swing wheel burst and commits once after idle", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const slider = screen.getByRole("slider", { name: "Project Swing" });
    expect(harness.domain.getState().project.swing).toBe(0);

    fireEvent.wheel(slider, { deltaY: -100 });
    fireEvent.wheel(slider, { deltaY: -100 });

    expect(harness.audio.previewSwing).toHaveBeenLastCalledWith(0.04);
    expect(harness.domain.getState().project.swing).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(false);

    fireEvent.wheel(slider, { deltaY: 100, shiftKey: true });
    expect(harness.audio.previewSwing).toHaveBeenLastCalledWith(0.03);
    expect(harness.domain.getState().project.swing).toBe(0);

    await act(() => vi.advanceTimersByTime(250));

    expect(harness.domain.getState().project.swing).toBeCloseTo(0.03, 6);
    expect(harness.domain.getState().history.canUndo).toBe(true);
    vi.useRealTimers();
  });

  it("previews repeated Swing keys and commits once on key release", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const slider = screen.getByRole("slider", { name: "Project Swing" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.change(slider, { target: { value: "1" } });
    fireEvent.keyDown(slider, { key: "ArrowRight", repeat: true });
    fireEvent.change(slider, { target: { value: "2" } });

    expect(harness.audio.previewSwing).toHaveBeenLastCalledWith(0.01);
    expect(harness.domain.getState().project.swing).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(false);

    fireEvent.keyUp(slider, { key: "ArrowRight" });

    expect(harness.domain.getState().project.swing).toBeCloseTo(0.01, 6);
    expect(harness.domain.getState().history.canUndo).toBe(true);
  });

  it.each(["pointer", "keyboard", "wheel"] as const)(
    "commits an active Swing %s gesture when the control disconnects",
    (input) => {
      vi.useFakeTimers();
      const harness = createHarness();
      const view = renderWithHarness(<EditorWorkspace />, harness);
      const slider = screen.getByRole("slider", { name: "Project Swing" });

      if (input === "pointer") {
        fireEvent.pointerDown(slider, { button: 0, pointerId: 31 });
        fireEvent.change(slider, { target: { value: "40" } });
      } else if (input === "keyboard") {
        fireEvent.keyDown(slider, { key: "ArrowRight" });
        fireEvent.change(slider, { target: { value: "2" } });
      } else {
        fireEvent.wheel(slider, { deltaY: -100 });
      }
      expect(harness.domain.getState().history.canUndo).toBe(false);

      view.unmount();

      expect(harness.domain.getState().project.swing).toBeGreaterThan(0);
      expect(harness.domain.getState().history.canUndo).toBe(true);
      act(() => harness.store.getState().undo());
      expect(harness.domain.getState().project.swing).toBe(0);
      expect(harness.domain.getState().history.canUndo).toBe(false);
      vi.useRealTimers();
    },
  );

  it("stores a new deterministic seed through the variation button", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const before = harness.domain.getState().project.patterns[1]?.seed;

    fireEvent.click(screen.getByRole("button", { name: "New variation" }));

    const after = harness.domain.getState().project.patterns[1]?.seed;
    expect(after).not.toBe(before);
    expect(Number.isSafeInteger(after)).toBe(true);
  });

  it("positions the playhead and start marker from a step target while stopped", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);

    fireEvent.click(screen.getByRole("button", { name: "Set the start marker to step 5" }));

    expect(harness.domain.getState().transport.positionTicks).toBe(960);
    expect(harness.domain.getState().transport.startMarkerTicks).toBe(960);
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("disables the seek targets while the transport is playing", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    act(() => {
      harness.domain.dispatch(harness.domain.createCommand("transport-play", {}));
    });

    expect(screen.getByRole("button", { name: "Set the start marker to step 5" })).toBeDisabled();
  });
});

describe("Mixer", () => {
  it("commits its displayed decibel value on blur", () => {
    const harness = createHarness();
    renderWithHarness(<Mixer />, harness);
    const level = screen.getByRole("spinbutton", { name: "Silver Serpent level value" });

    fireEvent.change(level, { target: { value: "-6" } });
    expect(harness.domain.getState().project.modules[firstModuleId(harness)]?.level).toBe(0.4);
    fireEvent.blur(level);

    expect(harness.domain.getState().project.modules[firstModuleId(harness)]?.level).toBeCloseTo(
      0.501,
      2,
    );
  });

  it("renders eight instrument strips and one master strip without banking", () => {
    const { container } = renderWithHarness(<Mixer />);

    expect(container.querySelectorAll('[data-component="channel-strip"]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-empty="true"]')).toHaveLength(7);
    expect(screen.getByRole("article", { name: "Silver Serpent channel" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Master channel" })).toBeInTheDocument();
  });

  it("keeps the empty strip controls visible and disabled", () => {
    const { container } = renderWithHarness(<Mixer />);
    const acid = screen.getByRole("article", { name: "Silver Serpent channel" });
    expect(within(acid).getAllByRole("button", { name: /Open send/ })).toHaveLength(4);

    const empty = container.querySelector('[data-empty="true"]');
    expect(empty).not.toBeNull();
    const emptyStrip = within(empty as HTMLElement);
    expect(emptyStrip.getAllByRole("button", { name: /^Send/ })).toHaveLength(4);
    expect(emptyStrip.getByRole("slider", { name: "Rack slot 02 pan" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(emptyStrip.getByRole("slider", { name: "Rack slot 02 level" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(emptyStrip.queryByRole("meter")).not.toBeInTheDocument();
    const pan = emptyStrip.getByRole("slider", { name: "Rack slot 02 pan" });
    const level = emptyStrip.getByRole("slider", { name: "Rack slot 02 level" });
    fireEvent.wheel(pan, { deltaY: -100 });
    fireEvent.wheel(level, { deltaY: -100 });
    expect(pan).toHaveAttribute("aria-valuenow", "0");
    expect(level).toHaveAttribute("aria-valuenow", "0.4");
    expect(emptyStrip.queryByRole("tooltip")).not.toBeInTheDocument();
    for (const button of emptyStrip.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("renders strip meters through leaf subscriptions that track the store", () => {
    const harness = createHarness();
    renderWithHarness(<Mixer />, harness);
    const moduleId = firstModuleId(harness);

    act(() => {
      harness.store.getState().setMeterLevel(moduleId, 0.5);
    });

    expect(screen.getByRole("meter", { name: "Silver Serpent output" })).toHaveAttribute(
      "aria-valuenow",
      "0.5",
    );
    // The master strip binds the engine's post-master analysis frame, not a
    // UI approximation, so the two master meters can never disagree.
    act(() => {
      harness.store
        .getState()
        .setMasterMeterFrame({ left: 0.42, right: 0.3, mid: 0.36, side: 0.06, peak: false });
    });
    expect(screen.getByRole("meter", { name: "Master output" })).toHaveAttribute(
      "aria-valuenow",
      "0.42",
    );
  });

  it("mutes a channel through a typed command", () => {
    const harness = createHarness();
    renderWithHarness(<Mixer />, harness);
    const moduleId = firstModuleId(harness);

    fireEvent.click(screen.getByRole("button", { name: "Mute Silver Serpent" }));

    expect(harness.domain.getState().project.modules[moduleId]?.muted).toBe(true);
    expect(screen.getByRole("button", { name: "Mute Silver Serpent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves a channel fader by keyboard and commits one history entry", () => {
    const harness = createHarness();
    renderWithHarness(<Mixer />, harness);
    const moduleId = firstModuleId(harness);
    const before = harness.domain.getState().project.modules[moduleId]?.level ?? 0;
    const fader = screen.getByRole("slider", { name: "Silver Serpent level" });

    fireEvent.keyDown(fader, { key: "ArrowUp" });
    fireEvent.keyUp(fader, { key: "ArrowUp" });

    expect(harness.domain.getState().project.modules[moduleId]?.level).toBeGreaterThan(before);
    expect(harness.domain.getState().history.canUndo).toBe(true);
  });

  // D74 and spec-005 section 4 fix the master near -6 dB. The Mixer and the
  // Master view drive one value, so both must reset to that same default.
  it("resets the master fader to the shipped default from either studio view", () => {
    const mixerHarness = createHarness();
    const mixer = renderWithHarness(<Mixer />, mixerHarness);
    const mixerFader = screen.getByRole("slider", { name: "Master level" });
    fireEvent.keyDown(mixerFader, { key: "ArrowUp" });
    fireEvent.keyUp(mixerFader, { key: "ArrowUp" });
    fireEvent.doubleClick(mixerFader);
    expect(mixerHarness.domain.getState().project.masterLevel).toBeCloseTo(DEFAULT_MASTER_LEVEL, 5);
    mixer.unmount();

    const panelHarness = createHarness();
    renderWithHarness(<MasterPanel />, panelHarness);
    const panelFader = screen.getByRole("slider", { name: "Master level" });
    fireEvent.keyDown(panelFader, { key: "ArrowUp" });
    fireEvent.keyUp(panelFader, { key: "ArrowUp" });
    fireEvent.doubleClick(panelFader);
    expect(panelHarness.domain.getState().project.masterLevel).toBeCloseTo(DEFAULT_MASTER_LEVEL, 5);
  });
});

describe("master meter", () => {
  it("shows the louder engine analysis channel in the Master view", () => {
    const harness = createHarness();
    renderWithHarness(<MasterPanel />, harness);
    const valueNow = () =>
      Number(
        screen.getByRole("meter", { name: "Master output level" }).getAttribute("aria-valuenow"),
      );

    act(() => {
      harness.store
        .getState()
        .setMasterMeterFrame({ left: 0.3, right: 0.8, mid: 0.55, side: 0.25, peak: false });
    });
    expect(valueNow()).toBeCloseTo(0.8, 5);

    // Per-module meter frames must not move the master meter: the engine
    // frame is the single master source.
    act(() => {
      harness.store.getState().setMeterLevel(firstModuleId(harness), 1);
    });
    expect(valueNow()).toBeCloseTo(0.8, 5);
  });

  it("reads the engine frame while the runtime and transport are active", () => {
    const frame = { left: 0.6, right: 0.2, mid: 0.4, side: 0.2, peak: false };
    const readFrame = () => frame;
    expect(masterMeterFrameFor("active", "playing", readFrame)).toBe(frame);
  });

  it("holds silence while the runtime or transport is not rendering", () => {
    const readFrame = vi.fn(() => ({ left: 1, right: 1, mid: 1, side: 0, peak: true }));
    for (const state of ["locked", "suspended", "unavailable"] as const) {
      expect(masterMeterFrameFor(state, "playing", readFrame)).toBe(SILENT_MASTER_METER);
    }
    expect(masterMeterFrameFor("active", "stopped", readFrame)).toBe(SILENT_MASTER_METER);
    expect(masterMeterFrameFor("active", "playing", undefined)).toBe(SILENT_MASTER_METER);
    expect(readFrame).not.toHaveBeenCalled();
  });
});

describe("EffectsBank", () => {
  it("shows the four send-chain empty states without dead detail controls", () => {
    const { container } = renderWithHarness(<EffectsBank />);
    const cards = container.querySelectorAll('[data-component="effect-slot"]');
    expect(cards).toHaveLength(4);
    expect(screen.getAllByText("Empty chain")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
  });
});

describe("StudioPanel", () => {
  it("shows only Mixer by default and removes inactive panes from the tree", () => {
    renderWithHarness(<StudioPanel />);

    expect(screen.getByRole("tab", { name: "Mixer" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Mixer" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Send chains" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Effects" }));

    expect(screen.queryByRole("region", { name: "Mixer" })).toBeNull();
    expect(screen.getByRole("region", { name: "Send chains" })).toBeInTheDocument();
  });

  it("supports arrow-key navigation between equal peer tabs", () => {
    const harness = createHarness();
    renderWithHarness(<StudioPanel />, harness);
    const mixer = screen.getByRole("tab", { name: "Mixer" });

    fireEvent.keyDown(mixer, { key: "ArrowRight" });

    expect(harness.store.getState().studioView).toBe("effects");
    expect(screen.getByRole("tab", { name: "Effects" })).toHaveFocus();
  });

  it("opens an instrument send in the Effects pane", () => {
    const harness = createHarness();
    renderWithHarness(<StudioPanel />, harness);

    fireEvent.click(screen.getByRole("button", { name: "Open send A for Silver Serpent" }));

    expect(harness.store.getState().studioView).toBe("effects");
    expect(harness.store.getState().selectedSend).toBe("A");
    expect(document.querySelector('[data-component="effect-slot"][data-selected="true"]')).toHaveTextContent(
      "Send A",
    );
  });
});

describe("WorkspaceBar", () => {
  it("reports editor state and the complete save-state vocabulary", async () => {
    const harness = createHarness();
    renderWithHarness(<WorkspaceBar onToggleEditor={() => undefined} />, harness);

    expect(screen.getByRole("button", { name: "Collapse editor" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "data-save-status",
      "clean",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await Promise.resolve();
    });
    expect(harness.projects.save).toHaveBeenCalled();
    expect(harness.store.getState().saveStatus).toBe("saved");
  });

  it("keeps an edit made during Save marked as unsaved", async () => {
    const harness = createHarness();
    const snapshotRevision = harness.domain.getState().project.revision;
    let finishSave: (() => void) | undefined;
    harness.projects.save.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = () => {
          resolve({ snapshotRevision, durable: true });
        };
      }),
    );
    renderWithHarness(<WorkspaceBar onToggleEditor={() => undefined} />, harness);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => {
      harness.store.getState().setTempo(132);
    });
    await act(async () => {
      finishSave?.();
      await Promise.resolve();
    });

    expect(harness.store.getState().saveStatus).toBe("dirty");
    expect(harness.store.getState().projectMessage).toBe(
      "Earlier changes were saved. New edits are not saved.",
    );
  });
});

describe("ProjectMenu", () => {
  it("refreshes the stored project list after an import", async () => {
    const harness = createHarness();

    await act(async () => {
      await harness.store.getState().importProject(new Uint8Array([1, 2, 3]));
    });

    expect(harness.projects.importPortable).toHaveBeenCalled();
    expect(harness.projects.list).toHaveBeenCalled();
    expect(harness.store.getState().savedProjects[0]?.name).toBe("Saved session");
  });

  it("keeps project management in one selector menu", () => {
    const harness = createHarness();
    Object.assign(harness.dependencies, {
      templates: [{ id: "starter", name: "Neon Basement", create: vi.fn() }],
    });
    renderWithHarness(<ProjectMenu />, harness);
    expect(screen.queryByRole("button", { name: "Main menu" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Project actions" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Project selector/ }));
    const dialog = within(screen.getByRole("dialog", { name: "Project selector" }));
    expect(dialog.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Import" })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "New: Neon Basement" })).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("closes the selector on Escape with focus restored and on an outside press", () => {
    const harness = createHarness();
    renderWithHarness(<ProjectMenu />, harness);
    const trigger = screen.getByRole("button", { name: /Project selector/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

    fireEvent.click(trigger);
    const popover = screen.getByRole("dialog", { name: "Project selector" });
    // The non-modal dialog moves focus to its first action on open.
    expect(popover.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(popover, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Project selector" })).toBeNull();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Project selector" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Project selector" })).toBeNull();
    // An outside press keeps focus with the press target, not the trigger.
    expect(trigger).not.toHaveFocus();
  });

  // The section 9.2 save-create-save transaction is state-owned. The UI
  // runs the template port once and reports its outcome; it never sequences
  // the saves itself.
  it("runs the template transaction through the composition port once", async () => {
    const harness = createHarness();
    const create = vi.fn(() => Promise.resolve({ created: true, saved: true }));
    Object.assign(harness.dependencies, {
      templates: [{ id: "starter", name: "Neon Basement", create }],
    });
    renderWithHarness(<ProjectMenu />, harness);
    fireEvent.click(screen.getByRole("button", { name: /Project selector/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New: Neon Basement" }));
      await Promise.resolve();
    });

    expect(create).toHaveBeenCalledOnce();
    expect(harness.projects.save).not.toHaveBeenCalled();
    expect(harness.store.getState().saveStatus).toBe("saved");
  });

  it("keeps the current project when the transaction reports a failed save", async () => {
    const harness = createHarness();
    const create = vi.fn(() => Promise.resolve({ created: false, saved: false }));
    Object.assign(harness.dependencies, {
      templates: [{ id: "starter", name: "Neon Basement", create }],
    });
    renderWithHarness(<ProjectMenu />, harness);
    fireEvent.click(screen.getByRole("button", { name: /Project selector/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New: Neon Basement" }));
      await Promise.resolve();
    });

    expect(harness.store.getState().saveStatus).toBe("error");
    expect(harness.domain.getState().project.name).toBe("Neon Basement");
  });

  // A stranded "saving" status would also stop every later edit from marking
  // the project dirty, so a rejected transaction must resolve the status.
  it("recovers the save status when the template transaction rejects", async () => {
    const harness = createHarness();
    const create = vi.fn(() => Promise.reject(new Error("Storage failed.")));
    Object.assign(harness.dependencies, {
      templates: [{ id: "starter", name: "Neon Basement", create }],
    });
    renderWithHarness(<ProjectMenu />, harness);
    fireEvent.click(screen.getByRole("button", { name: /Project selector/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New: Neon Basement" }));
      await Promise.resolve();
    });

    expect(harness.store.getState().saveStatus).toBe("error");

    act(() => {
      harness.store.getState().setTempo(132);
    });
    expect(harness.store.getState().saveStatus).toBe("dirty");
  });

  it("lists and opens stored projects inside the viewport-bound selector", async () => {
    const harness = createHarness();
    renderWithHarness(<ProjectMenu />, harness);
    fireEvent.click(screen.getByRole("button", { name: /Project selector/ }));

    await waitFor(() => {
      expect(screen.getByRole("list", { name: "Stored projects" })).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Saved session/ }));
      await Promise.resolve();
    });

    expect(harness.projects.open).toHaveBeenCalledWith("stored-1");
  });

  it("reports a rejected import without changing the project", async () => {
    const harness = createHarness();
    const before = harness.domain.getState();
    harness.projects.importPortable.mockResolvedValue({
      ok: false,
      reason: "Unknown root keys: evil.",
    });

    await act(async () => {
      await harness.store.getState().importProject(new Uint8Array());
    });

    expect(harness.store.getState().projectMessage).toBe("Unknown root keys: evil.");
    expect(harness.domain.getState()).toBe(before);
    expect(harness.projects.list).not.toHaveBeenCalled();
  });
});
