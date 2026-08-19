import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createGestureId } from "../../src/contracts";
import { DRUMLINE_SIX_MANIFEST } from "../../src/engine/public";
import { browserIdFactory } from "../../src/composition/browser-id-factory";
import { DEFAULT_MASTER_LEVEL, PATTERN_TICKS_PER_STEP } from "../../src/state/public";
import { EditorWorkspace } from "../../src/ui/react/shell/EditorWorkspace";
import { EffectsBank } from "../../src/ui/react/shell/EffectsBank";
import { MasterPanel } from "../../src/ui/react/shell/MasterPanel";
import { Mixer } from "../../src/ui/react/shell/Mixer";
import { ProjectMenu } from "../../src/ui/react/shell/ProjectMenu";
import { StudioPanel } from "../../src/ui/react/shell/StudioPanel";
import { WorkspaceBar } from "../../src/ui/react/shell/WorkspaceBar";
import { masterMeterFrameFor, SILENT_MASTER_METER } from "../../src/ui/react/store/app-store";
import { createHarness, firstModuleId, renderWithHarness } from "./helpers";

function activePattern(harness: ReturnType<typeof createHarness>) {
  const pattern = harness.domain
    .getState()
    .project.patterns.find((candidate) => candidate.id === harness.domain.getState().project.activePatternId);
  if (pattern === undefined) throw new Error("The test project has no active Pattern.");
  return pattern;
}

function activePart(harness: ReturnType<typeof createHarness>, moduleId: string) {
  return activePattern(harness).parts[moduleId as never];
}

describe("EditorWorkspace", () => {
  it("opens on Verse without Pattern or Song subtabs", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);

    expect(screen.getByRole("combobox", { name: "Selected Pattern" })).toHaveValue(
      activePattern(harness).id,
    );
    expect(
      within(screen.getByRole("combobox", { name: "Selected Pattern" })).getByRole<HTMLOptionElement>(
        "option",
        { name: "Verse" },
      ).selected,
    ).toBe(true);
    expect(screen.queryByRole("tab", { name: "Pattern" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Song" })).toBeNull();
  });

  it("selects a Pattern and clears its module part through commands", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);

    const pattern = harness.domain.getState().project.patterns[0];
    if (pattern === undefined) throw new Error("The test project has no Pattern.");
    fireEvent.change(screen.getByRole("combobox", { name: "Selected Pattern" }), {
      target: { value: pattern.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear the Pattern" }));

    expect(harness.domain.getState().project.activePatternId).toBe(pattern.id);
    expect(activePart(harness, moduleId)).toBeUndefined();
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
    const eventId = activePart(harness, moduleId)?.events[0]?.id;

    expect(eventId).toBeDefined();
    fireEvent.keyDown(eventButton, { key: "ArrowRight" });

    expect(
      activePart(harness, moduleId)?.events.find(
        (event) => event.id === eventId,
      )?.positionTicks,
    ).toBe(240);
    expect(harness.domain.getState().history.canUndo).toBe(true);
  });

  it("shows note-property and step-automation Piano Roll lanes", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const selector = screen.getByRole("combobox", { name: "Piano Roll parameter" });

    expect(within(selector).getAllByRole("option")).toHaveLength(16);
    expect(
      within(selector).getByRole<HTMLOptionElement>("option", { name: "Velocity" }).selected,
    ).toBe(true);
    for (const name of ["Accent", "Slide", "Probability", "Micro timing"]) {
      expect(within(selector).getByRole("option", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("group", { name: "Velocity lane" })).toBeVisible();

    fireEvent.change(selector, { target: { value: "cutoff" } });
    const automationStep = screen.getByRole("slider", { name: "Cutoff, step 1" });
    fireEvent.pointerDown(automationStep, { button: 0, pointerId: 52 });
    fireEvent.change(automationStep, { target: { value: "840" } });
    fireEvent.pointerUp(automationStep);
    expect(Object.values(harness.domain.getState().project.automationLanes)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Move right" }));
    expect(Object.values(harness.domain.getState().project.automationLanes)[0]?.steps).toEqual([
      { tick: 240, value: 840 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Scale up" }));
    expect(Object.values(harness.domain.getState().project.automationLanes)[0]?.steps).toEqual([
      { tick: 240, value: 841 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Erase step" }));
    expect(Object.values(harness.domain.getState().project.automationLanes)).toHaveLength(0);
  });

  it("uses the state-owned catalog for external automation labels, ranges, and values", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);

    act(() => {
      harness.store.getState().openExternalAutomationTarget({
        scope: "mixer",
        targetId: moduleId,
        parameterId: "pan",
      });
    });

    const selector = screen.getByRole("combobox", { name: "Piano Roll parameter" });
    expect(
      within(selector).getByRole<HTMLOptionElement>("option", { name: "Pan" }).selected,
    ).toBe(true);
    expect(screen.getByRole("group", { name: "Silver Serpent mixer: Pan lane" })).toBeVisible();
    const firstStep = screen.getByRole("slider", { name: "Pan, step 1" });
    expect(firstStep).toHaveValue("0");

    act(() => {
      harness.store.getState().setChannelPan(moduleId, 0.65);
    });
    expect(screen.getByRole("slider", { name: "Pan, step 1" })).toHaveValue("0.65");
    expect(Object.values(harness.domain.getState().project.automationLanes)).toHaveLength(0);
  });

  function drumHarness() {
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
    const part = activePart(harness, drumModuleId);
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
    return { harness, drumModuleId, grid, baseline: part?.events.length ?? 0 };
  }

  it("does not create a trigger from a single click on an empty cell", () => {
    const { harness, drumModuleId, grid, baseline } = drumHarness();

    fireEvent.pointerDown(grid, { button: 0, pointerId: 37, clientX: 150, clientY: 84 });
    fireEvent.pointerUp(grid, { pointerId: 37, clientX: 150, clientY: 84 });

    expect(activePart(harness, drumModuleId)?.events.length ?? 0).toBe(baseline);
  });

  it("creates one drum trigger from a double-click in one Undo entry", () => {
    const { harness, drumModuleId, grid, baseline } = drumHarness();

    fireEvent.dblClick(grid, { button: 0, clientX: 350, clientY: 84 });

    expect(activePart(harness, drumModuleId)?.events).toHaveLength(baseline + 1);
    act(() => harness.store.getState().undo());
    expect(activePart(harness, drumModuleId)?.events.length ?? 0).toBe(baseline);
  });

  it("selects the notes inside a marquee drag", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const grid = screen.getByRole("group", { name: /Silver Serpent events in Verse/ });
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
      bottom: 400,
      width: 1600,
      height: 400,
      toJSON: () => ({}),
    });

    // Covers steps 0 through 6 and rows 12 through 24. The test part holds two
    // C2 notes at steps 0 and 4, both on the bottom row.
    fireEvent.pointerDown(grid, { button: 0, pointerId: 41, clientX: 50, clientY: 200 });
    fireEvent.pointerMove(grid, { pointerId: 41, clientX: 650, clientY: 400 });
    fireEvent.pointerUp(grid, { pointerId: 41, clientX: 650, clientY: 400 });

    expect(harness.domain.getState().ui.pianoRollSelection?.eventIds).toHaveLength(2);
  });

  it("keeps same-step velocity controls separate and keyboard reachable", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);

    act(() => {
      harness.store.getState().editPatternEvents(moduleId, activePattern(harness).id, {
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
    const baseline = harness.domain.getState().project.song.placements;
    const addLabel = `Add ${activePattern(harness).name} at the end as Playlist row ${String(baseline.length + 1)}`;
    fireEvent.click(screen.getByRole("button", { name: addLabel }));

    expect(harness.domain.getState().project.song.placements).toEqual([
      ...baseline,
      expect.objectContaining({ patternId: activePattern(harness).id, repeatCount: 1 }),
    ]);
    expect(screen.getAllByRole("button", { name: /Verse/ }).length).toBeGreaterThan(0);
  });

  it("keeps editor selection separate from the current Song placement", async () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const playlist = screen.getByRole("complementary", { name: "Playlist" });

    const addedRowNumber = harness.domain.getState().project.song.placements.length + 1;
    const addLabel = `Add ${activePattern(harness).name} at the end as Playlist row ${String(addedRowNumber)}`;
    fireEvent.click(within(playlist).getByRole("button", { name: addLabel }));
    const selectedVerseRows = within(playlist)
      .getAllByRole("button", { name: /Verse/u })
      .filter((row) => row.getAttribute("aria-pressed") === "true");
    expect(selectedVerseRows).toHaveLength(2);

    fireEvent.click(within(playlist).getByRole("button", { name: "Pattern playback mode" }));
    await harness.store.getState().play();
    harness.store.getState().setPositionTicks(0);

    expect(within(playlist).getAllByText("Playing")).toHaveLength(1);
    expect(playlist.querySelectorAll('[data-component="playlist-playback-marker"]')).toHaveLength(1);
  });

  it("meets the compact Playlist row contract", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const playlist = screen.getByRole("complementary", { name: "Playlist" });
    const mode = within(playlist).getByRole("button", { name: "Pattern playback mode" });

    expect(mode.querySelector("svg")).toBeInTheDocument();
    expect(mode).toHaveAttribute("title", expect.stringContaining("switch to Song"));

    const firstPlacement = harness.domain.getState().project.song.placements[0];
    const firstPattern = harness.domain
      .getState()
      .project.patterns.find((pattern) => pattern.id === firstPlacement?.patternId);
    expect(firstPattern).toBeDefined();
    const selection = within(playlist).getByRole("button", {
      name: new RegExp(`${firstPattern?.name ?? ""}.*${String(firstPattern?.durationBars)} bar`, "u"),
    });
    expect(selection).toBeVisible();

    const handle = within(playlist).getByRole("button", { name: "Reorder Playlist row 1" });
    expect(handle.querySelector("svg")).toBeInTheDocument();
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(harness.domain.getState().project.song.placements[1]?.id).toBe(firstPlacement?.id);

    const picker = within(playlist).getByRole("combobox", { name: "Playlist row 2 Pattern" });
    fireEvent.change(picker, { target: { value: harness.domain.getState().project.patterns[2]?.id } });
    expect(harness.domain.getState().project.song.placements[1]?.patternId).toBe(
      harness.domain.getState().project.patterns[2]?.id,
    );

    const menu = within(playlist).getByRole("button", { name: "Playlist row 2 menu" });
    expect(menu.querySelector("svg")).toBeInTheDocument();
    fireEvent.click(menu);
    expect(screen.getByRole("menu", { name: "Playlist row 2 menu" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: /Move /u })).not.toBeInTheDocument();

    const addedRowNumber = harness.domain.getState().project.song.placements.length + 1;
    const addLabel = `Add ${activePattern(harness).name} at the end as Playlist row ${String(addedRowNumber)}`;
    const add = within(playlist).getByRole("button", { name: addLabel });
    expect(add.querySelector("svg")).toBeInTheDocument();
    expect(add).toHaveTextContent(`Add at end. Row ${String(addedRowNumber)}.${activePattern(harness).name}`);
    expect(add).toHaveAttribute("title", `${addLabel}.`);
    fireEvent.click(add);
    expect(harness.domain.getState().project.song.placements.at(-1)?.patternId).toBe(activePattern(harness).id);
  });

  it("edits the active Pattern's Humanize through the tapered header slider", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const slider = screen.getByRole("slider", { name: "Pattern Humanize" });
    expect(slider).toHaveValue("0");
    expect(slider).toHaveAttribute("aria-valuetext", "0 percent");

    // The track is tapered: position 60 of 100 is the 30 percent value.
    fireEvent.change(slider, { target: { value: "60" } });

    expect(activePattern(harness).humanize).toBeCloseTo(0.3, 6);
    expect(slider).toHaveAttribute("aria-valuetext", "30 percent");
    // Humanize is Pattern-owned: the other Patterns keep their own value.
    expect(
      harness.domain
        .getState()
        .project.patterns.find((pattern) => pattern.id !== activePattern(harness).id)?.humanize,
    ).toBe(0);
  });

  it("previews Humanize during a pointer gesture and commits once on release", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const slider = screen.getByRole("slider", { name: "Pattern Humanize" });

    fireEvent.pointerDown(slider, { button: 0, pointerId: 21 });
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.change(slider, { target: { value: "60" } });

    expect(slider).toHaveAttribute("aria-valuetext", "30 percent");
    expect(harness.audio.previewHumanize).toHaveBeenLastCalledWith(activePattern(harness).id, 0.3);
    expect(activePattern(harness).humanize).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(false);

    fireEvent.pointerUp(slider, { button: 0, pointerId: 21 });

    expect(activePattern(harness).humanize).toBeCloseTo(0.3, 6);
    expect(harness.domain.getState().history.canUndo).toBe(true);
    act(() => {
      harness.store.getState().undo();
    });
    expect(activePattern(harness).humanize).toBe(0);
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

  it("keeps a generator preview out of project state until one atomic Apply", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);
    const before = activePart(harness, moduleId)?.events;

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(activePart(harness, moduleId)?.events).toEqual(before);
    const previewCall = harness.audio.previewPatternPart.mock.calls[0];
    expect(previewCall?.[0]).toBe(moduleId);
    expect(previewCall?.[1].events).toHaveLength(before?.length ?? 0);
    expect(previewCall?.[1].length).toBe(16);
    expect(previewCall?.[2]).toMatchObject({ tempo: 128, swing: 0 });
    expect(harness.audio.startAudition).not.toHaveBeenCalled();
    expect(screen.getByText(/preview events/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(harness.domain.getState().history.canUndo).toBe(true);
    act(() => harness.store.getState().undo());
    expect(activePart(harness, moduleId)?.events).toEqual(before);
  });

  it("stops and clears a Pattern preview when its owner changes", () => {
    const harness = createHarness();
    renderWithHarness(<EditorWorkspace />, harness);
    const moduleId = firstModuleId(harness);
    const otherPattern = harness.domain.getState().project.patterns[0];
    if (otherPattern === undefined) throw new Error("Expected another Pattern.");

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Selected Pattern" }), {
      target: { value: otherPattern.id },
    });

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(harness.audio.stopAudition).toHaveBeenCalledWith(moduleId);
  });

  it("generates Euclidean triggers for the selected drum voice and cancels stale previews", () => {
    const { harness, drumModuleId } = drumHarness();
    const drumModule = harness.domain.getState().project.modules[drumModuleId];
    const clap = DRUMLINE_SIX_MANIFEST.voices.find((voice) => voice.name === "Clap");
    if (drumModule === undefined || clap === undefined) throw new Error("Expected a drum module and Clap voice.");
    act(() => {
      harness.domain.dispatch(
        harness.domain.createCommand("pattern-events-edit", {
          moduleId: drumModule.id,
          patternId: harness.domain.getState().project.activePatternId,
          edit: {
            type: "create",
            event: {
              type: "trigger",
              positionTicks: 0,
              data: { note: clap.note, velocity: 0.8, accent: false, slide: false },
            },
          },
        }),
      );
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Generator or transform" }), {
      target: { value: "euclidean" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Euclidean drum voice" }), {
      target: { value: clap.id },
    });
    expect(screen.getByRole("slider", { name: "Euclidean rhythm amount" })).toHaveValue("4");

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const previewPart = harness.audio.previewPatternPart.mock.calls.at(-1)?.[1];
    expect(previewPart?.events).toHaveLength(4);
    expect(previewPart?.events.every((event) => event.data.note === clap.note)).toBe(true);

    fireEvent.change(screen.getByRole("slider", { name: "Euclidean rhythm amount" }), {
      target: { value: "5" },
    });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(harness.audio.stopAudition).toHaveBeenCalledWith(drumModule.id);
  });

  it("records an armed parameter commit at the current Song-local step with one Undo", () => {
    const harness = createHarness();
    const moduleId = firstModuleId(harness);
    const state = harness.domain.getState();
    const intro = state.project.patterns[0];
    if (intro === undefined) throw new Error("Expected the Intro Pattern.");
    act(() => {
      harness.domain.dispatch(
        harness.domain.createCommand("pattern-events-edit", {
          moduleId,
          patternId: intro.id,
          edit: {
            type: "create",
            event: {
              type: "note",
              positionTicks: 0,
              durationTicks: PATTERN_TICKS_PER_STEP,
              data: { note: 36, velocity: 0.8, accent: false, slide: false },
            },
          },
        }),
      );
      harness.store.getState().toggleSongMode();
      harness.store.getState().toggleRecordArm();
      harness.store.getState().setPositionTicks(17 * PATTERN_TICKS_PER_STEP);
    });
    const beforeValue = harness.domain.getState().project.modules[moduleId]?.parameters.cutoff;

    act(() => harness.store.getState().commitParameter(moduleId, "cutoff", 1_200));

    const lane = Object.values(harness.domain.getState().project.automationLanes).find(
      (candidate) =>
        candidate.patternId === intro.id &&
        candidate.targetId === moduleId &&
        candidate.parameterId === "cutoff",
    );
    expect(lane?.steps).toEqual([{ tick: PATTERN_TICKS_PER_STEP, value: 1_200 }]);
    expect(harness.domain.getState().project.modules[moduleId]?.parameters.cutoff).toBe(1_200);

    act(() => harness.store.getState().undo());
    expect(harness.domain.getState().project.modules[moduleId]?.parameters.cutoff).toBe(beforeValue);
    expect(
      Object.values(harness.domain.getState().project.automationLanes).some(
        (candidate) => candidate.parameterId === "cutoff" && candidate.patternId === intro.id,
      ),
    ).toBe(false);
  });

  it("records one keyboard take as a single Undo entry", () => {
    const harness = createHarness();
    const moduleId = firstModuleId(harness);
    const before = activePart(harness, moduleId)?.events;
    const gestureId = createGestureId(browserIdFactory);

    act(() => {
      harness.store.getState().toggleRecordArm();
      harness.store.getState().recordLivePatternEvent(moduleId, 48, 240, 480, gestureId);
      harness.store.getState().recordLivePatternEvent(moduleId, 50, 720, 960, gestureId);
    });

    expect(activePart(harness, moduleId)?.events).toHaveLength((before?.length ?? 0) + 2);
    act(() => harness.store.getState().undo());
    expect(activePart(harness, moduleId)?.events).toEqual(before);
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

  it("disables the tail of a partial final Pattern page", () => {
    const harness = createHarness();
    const moduleId = firstModuleId(harness);
    const patternId = harness.domain.getState().project.activePatternId;
    act(() => {
      harness.domain.dispatch(
        harness.domain.createCommand("pattern-part-length-set", {
          moduleId,
          patternId,
          length: 17,
        }),
      );
    });
    renderWithHarness(<EditorWorkspace />, harness);

    fireEvent.click(screen.getByRole("button", { name: "Next Pattern page" }));
    expect(screen.getByRole("button", { name: "Set the start marker to step 17" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Set the start marker to step 18" })).toBeDisabled();
    expect(screen.getAllByText("Outside cycle")).toHaveLength(15);
  });

  it("disables Add when the Pattern bank reaches its limit", () => {
    const harness = createHarness();
    act(() => {
      while (harness.domain.getState().project.patterns.length < 32) {
        harness.store.getState().addPattern();
      }
    });
    renderWithHarness(<EditorWorkspace />, harness);

    expect(screen.getByRole("button", { name: "Add Pattern" })).toBeDisabled();
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
    expect(
      emptyStrip.getByRole("button", {
        name: "Select rack slot 02 channel, no module loaded",
      }),
    ).toBeDisabled();
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
    expect(
      emptyStrip.getByRole("button", {
        name: "Select rack slot 02 channel, no module loaded",
      }),
    ).toBeDisabled();
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
    const view = renderWithHarness(<MasterPanel />, harness);
    const valueNow = () =>
      Number(
        screen.getByRole("meter", { name: "Master output level" }).getAttribute("aria-valuenow"),
      );

    act(() => {
      harness.domain.dispatch(harness.domain.createCommand("transport-play", {}));
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

    act(() => {
      harness.domain.dispatch(harness.domain.createCommand("transport-stop", {}));
    });
    expect(valueNow()).toBe(0);

    view.unmount();
    renderWithHarness(<MasterPanel />, harness);
    expect(valueNow()).toBe(0);
  });

  it("reads the engine frame while the runtime and transport are active", () => {
    const frame = { left: 0.6, right: 0.2, mid: 0.4, side: 0.2, peak: false };
    const readFrame = () => frame;
    expect(masterMeterFrameFor("active", "playing", readFrame)).toBe(frame);
  });

  it("holds silence while the runtime or transport is not rendering", () => {
    const frame = { left: 1, right: 1, mid: 1, side: 0, peak: true };
    const readFrame = vi.fn(() => frame);
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
    expect(screen.getByText("Analog Echo")).toBeVisible();
    expect(screen.getByText("Plate Reverb")).toBeVisible();
    expect(screen.getByText("Stereo Width")).toBeVisible();
    const driveCard = screen
      .getByRole("heading", { name: "Send D" })
      .closest('[data-component="effect-slot"]');
    expect(driveCard).not.toBeNull();
    expect(within(driveCard as HTMLElement).getByText("Drive", { selector: "p" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Send D Distortion Model macro" })).toHaveValue("drive");
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

  it("opens an instrument send value surface without changing the mixer pane", () => {
    const harness = createHarness();
    renderWithHarness(<StudioPanel />, harness);

    fireEvent.click(screen.getByRole("button", { name: /^Open send A for Silver Serpent\./ }));

    expect(harness.store.getState().studioView).toBe("mixer");
    expect(screen.getByRole("region", { name: "Send A value" })).toBeVisible();
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

  it("announces save completion and failure through a live region", async () => {
    const harness = createHarness();
    renderWithHarness(<WorkspaceBar onToggleEditor={() => undefined} />, harness);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    // A successful save announces completion.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await Promise.resolve();
    });
    expect(status.textContent).toBe("Saved.");

    // A new edit returns the bar to dirty and clears the announcement.
    harness.projects.save.mockResolvedValueOnce({
      snapshotRevision: harness.domain.getState().project.revision,
      durable: false,
    });
    act(() => {
      harness.store.getState().setTempo(132);
    });
    expect(status.textContent).toBe("");

    // A failed save announces the failure.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await Promise.resolve();
    });
    expect(status.textContent).toBe("Save failed.");
  });

  it("shows keyboard hints without changing the button names", () => {
    const harness = createHarness();
    renderWithHarness(<WorkspaceBar onToggleEditor={() => undefined} />, harness);

    for (const hint of ["Ctrl+Alt+E", "Ctrl+Z", "Ctrl+Y", "Ctrl+S"]) {
      expect(screen.getByText(hint)).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.getByRole("button", { name: "Collapse editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
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
