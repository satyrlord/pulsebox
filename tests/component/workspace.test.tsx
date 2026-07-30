import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_MASTER_LEVEL } from "../../src/state/public";
import { EditorWorkspace } from "../../src/ui/react/shell/EditorWorkspace";
import { EffectsBank } from "../../src/ui/react/shell/EffectsBank";
import { masterMeterLevel } from "../../src/ui/react/shell/master-meter";
import { MasterPanel } from "../../src/ui/react/shell/MasterPanel";
import { Mixer } from "../../src/ui/react/shell/Mixer";
import { ProjectMenu } from "../../src/ui/react/shell/ProjectMenu";
import { StudioPanel } from "../../src/ui/react/shell/StudioPanel";
import { WorkspaceBar } from "../../src/ui/react/shell/WorkspaceBar";
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
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(harness.domain.getState().project.activePatternIndex).toBe(0);
    expect(
      harness.domain.getState().project.modules[moduleId]?.parts[0]?.every((step) => !step.active),
    ).toBe(true);
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
    expect(within(roll as HTMLElement).getByRole("img")).toHaveAccessibleName(
      "Active steps: 1, 5, 9, 13.",
    );
  });

  it("renders a chromatic keybed that auditions the exact held pitch", async () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);
    const keybed = screen.getByRole("group", { name: "Piano keyboard" });
    const keys = within(keybed).getAllByRole("button");
    const c4 = within(keybed).getByRole("button", { name: "C4 piano key audition" });

    expect(keys).toHaveLength(13);
    fireEvent.pointerDown(c4, { button: 0, pointerId: 9 });
    await waitFor(() => expect(harness.audio.startAudition).toHaveBeenCalledWith(moduleId, 60));
    fireEvent.pointerUp(c4, { button: 0, pointerId: 9 });
    expect(harness.audio.stopAudition).toHaveBeenCalledWith(moduleId);
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("adds the selected Pattern to the compact Playlist", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);

    fireEvent.click(screen.getByRole("button", { name: "Add selected Pattern" }));

    expect(harness.domain.getState().project.song.entries).toEqual([
      expect.objectContaining({ patternIndex: 1, repeats: 1 }),
    ]);
    expect(screen.getByRole("button", { name: /Verse/ })).toBeInTheDocument();
  });
});

describe("Mixer", () => {
  it("commits its displayed decibel value on blur", () => {
    const harness = createHarness();
    renderWithHarness(<Mixer />, harness);
    const level = screen.getByRole("spinbutton", { name: "Acid Bass level value" });

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
    expect(screen.getByRole("article", { name: "Acid Bass channel" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Master channel" })).toBeInTheDocument();
  });

  it("keeps the empty strip controls visible and disabled", () => {
    const { container } = renderWithHarness(<Mixer />);
    const acid = screen.getByRole("article", { name: "Acid Bass channel" });
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


  it("mutes a channel through a typed command", () => {
    const harness = createHarness();
    renderWithHarness(<Mixer />, harness);
    const moduleId = firstModuleId(harness);

    fireEvent.click(screen.getByRole("button", { name: "Mute Acid Bass" }));

    expect(harness.domain.getState().project.modules[moduleId]?.muted).toBe(true);
    expect(screen.getByRole("button", { name: "Mute Acid Bass" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves a channel fader by keyboard and commits one history entry", () => {
    const harness = createHarness();
    renderWithHarness(<Mixer />, harness);
    const moduleId = firstModuleId(harness);
    const before = harness.domain.getState().project.modules[moduleId]?.level ?? 0;
    const fader = screen.getByRole("slider", { name: "Acid Bass level" });

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
  it("scales the instrument peak by the master level", () => {
    expect(masterMeterLevel({ a: 0.8 }, 1)).toBeCloseTo(0.8, 5);
    expect(masterMeterLevel({ a: 0.8 }, 0.5)).toBeCloseTo(0.4, 5);
    // A closed master fader must read silent, not the loudest instrument.
    expect(masterMeterLevel({ a: 0.9, b: 0.4 }, 0)).toBe(0);
    expect(masterMeterLevel({}, 0.5)).toBe(0);
    expect(masterMeterLevel({ a: 1 }, 1)).toBeLessThanOrEqual(1);
  });

  it("moves the Master view meter when the master level changes", () => {
    const harness = createHarness();
    renderWithHarness(<MasterPanel />, harness);
    const valueNow = () =>
      Number(
        screen.getByRole("meter", { name: "Master output level" }).getAttribute("aria-valuenow"),
      );

    act(() => {
      harness.store.getState().setMeterLevel(firstModuleId(harness), 0.8);
    });
    expect(valueNow()).toBeCloseTo(0.4, 2);

    act(() => {
      harness.store.getState().setMasterLevel(1);
    });
    expect(valueNow()).toBeCloseTo(0.8, 2);
  });
});

describe("EffectsBank", () => {
  it("keeps each send's aria-controls target present when collapsed", () => {
    const { container } = renderWithHarness(<EffectsBank />);
    const cards = container.querySelectorAll('[data-component="effect-slot"]');
    expect(cards).toHaveLength(4);

    for (const card of cards) {
      const details = within(card as HTMLElement).getByRole("button", { name: "Details" });
      const targetId = details.getAttribute("aria-controls");
      if (targetId === null) throw new Error("Expected an aria-controls target.");
      // A dangling aria-controls points at nothing, so the reference must
      // resolve even while the panel is collapsed.
      const target = document.getElementById(targetId);
      expect(target).not.toBeNull();
      expect(target).not.toBeVisible();
    }
  });

  it("reveals the selected send's details and leaves the others hidden", () => {
    renderWithHarness(<EffectsBank />);
    const detailButtons = screen.getAllByRole("button", { name: "Details" });
    const first = detailButtons[0];
    if (first === undefined) throw new Error("Expected a Details control.");

    fireEvent.click(first);

    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("send-a-details")).toBeVisible();
    expect(document.getElementById("send-b-details")).not.toBeVisible();
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

    fireEvent.click(screen.getByRole("button", { name: "Open send A for Acid Bass" }));

    expect(harness.store.getState().studioView).toBe("effects");
    expect(harness.store.getState().selectedSend).toBe("A");
    // Every send keeps its details element mounted, so assert on the selected
    // send's own panel rather than on the shared text.
    expect(document.getElementById("send-a-details")).toBeVisible();
    expect(document.getElementById("send-b-details")).not.toBeVisible();
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

  it("opens the compact menu and saves through the injected project service", async () => {
    const harness = createHarness();
    renderWithHarness(<ProjectMenu />, harness);
    fireEvent.click(screen.getByRole("button", { name: "Neon Basement" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));
      await Promise.resolve();
    });

    expect(harness.projects.save).toHaveBeenCalled();
  });

  it("lists and opens stored projects inside the viewport-bound menu", async () => {
    const harness = createHarness();
    renderWithHarness(<ProjectMenu />, harness);
    fireEvent.click(screen.getByRole("button", { name: "Neon Basement" }));

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
