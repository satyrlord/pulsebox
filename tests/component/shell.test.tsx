import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { PulseApp } from "../../src/ui/react/PulseApp";
import { Rack } from "../../src/ui/react/shell/Rack";
import { RackOverview } from "../../src/ui/react/shell/RackOverview";
import { ModuleBrowser } from "../../src/ui/react/shell/ModuleBrowser";
import { TransportBar } from "../../src/ui/react/shell/TransportBar";
import {
  createPulseThemeService,
  elementThemeHost,
  type PulseThemeService,
} from "../../src/themes";
import {
  DIGIT_FIVE_DEFAULT_PARAMETERS,
  DIGIT_FIVE_MANIFEST,
  DRUMLINE_SIX_MANIFEST,
} from "../../src/engine/public";
import {
  createHarness,
  firstModuleId,
  parameterValues,
  renderWithHarness,
  TEST_STEPS,
  UNMAPPABLE_TEST_NOTE,
} from "./helpers";

/**
 * Puts one undoable edit on the history stack. Step editing belongs to the
 * Piano Roll, which is not built yet, so this dispatches the command directly
 * rather than pretending a rack surface can reach it.
 */
function makeHistory(harness: ReturnType<typeof createHarness>, step: number): void {
  const domain = harness.domain;
  domain.dispatch(
    domain.createCommand("pattern-step-toggle", { moduleId: firstModuleId(harness), step }),
  );
}

function memoryThemeService(): PulseThemeService {
  const values = new Map<string, string>();
  return createPulseThemeService({
    host: elementThemeHost(document.documentElement),
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
  });
}

describe("TransportBar", () => {
  it("starts and pauses playback through the audio port only", async () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);

    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    await waitFor(() => {
      expect(harness.audio.play).toHaveBeenCalledWith(128);
    });
    expect(harness.domain.getState().transport.status).toBe("playing");

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(harness.audio.pause).toHaveBeenCalledTimes(1);
    expect(harness.domain.getState().transport.status).toBe("paused");
  });

  it("stops without leaving the transport playing", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(harness.audio.stop).toHaveBeenCalledTimes(1);
    expect(harness.domain.getState().transport.status).toBe("stopped");
  });

  it("commits a tempo only when it is inside the supported range", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    const tempo = screen.getByLabelText<HTMLInputElement>("Tempo");

    expect(tempo.closest("label")).toHaveAttribute(
      "title",
      "Beats per minute. Drag vertically or type a value.",
    );
    expect(tempo).toHaveAccessibleDescription("Beats per minute");
    expect(tempo.closest("label")).not.toHaveTextContent("BPM");

    fireEvent.change(tempo, { target: { value: "146" } });
    fireEvent.keyDown(tempo, { key: "Enter" });
    expect(harness.domain.getState().project.tempo).toBe(146);

    fireEvent.change(tempo, { target: { value: "900" } });
    fireEvent.keyDown(tempo, { key: "Enter" });
    expect(harness.domain.getState().project.tempo).toBe(146);
    // A rejected tempo states the accepted range and keeps the typed value, so
    // the user corrects it rather than retypes it. Silently reverting would
    // leave a rejection indistinguishable from a value that simply took effect.
    expect(tempo.value).toBe("900");
    expect(tempo).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tempo must be between 40 and 240 BPM.",
    );

    // Correcting the value withdraws the objection.
    fireEvent.change(tempo, { target: { value: "128" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.keyDown(tempo, { key: "Enter" });
    expect(harness.domain.getState().project.tempo).toBe(128);
  });

  it("restores the committed tempo when a rejected edit is abandoned", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    const tempo = screen.getByLabelText<HTMLInputElement>("Tempo");

    fireEvent.change(tempo, { target: { value: "900" } });
    fireEvent.keyDown(tempo, { key: "Enter" });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.keyDown(tempo, { key: "Escape" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(tempo.value).toBe(String(harness.domain.getState().project.tempo));
  });

  it("keeps a half-typed tempo out of the transport", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    const tempo = screen.getByLabelText<HTMLInputElement>("Tempo");

    fireEvent.change(tempo, { target: { value: "1" } });
    expect(harness.domain.getState().project.tempo).toBe(128);
  });

  it("previews a tempo pointer drag and commits once on release", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    const tempo = screen.getByLabelText<HTMLInputElement>("Tempo");

    fireEvent.pointerDown(tempo, { button: 0, pointerId: 23, clientY: 100 });
    fireEvent.pointerMove(tempo, { pointerId: 23, clientY: 84 });
    fireEvent.pointerMove(tempo, { pointerId: 23, clientY: 80 });

    expect(tempo).toHaveValue(133);
    expect(harness.audio.previewTempo).toHaveBeenLastCalledWith(133);
    expect(harness.domain.getState().project.tempo).toBe(128);
    expect(harness.domain.getState().history.canUndo).toBe(false);

    fireEvent.pointerUp(tempo, { button: 0, pointerId: 23, clientY: 80 });

    expect(harness.domain.getState().project.tempo).toBe(133);
    expect(harness.domain.getState().history.canUndo).toBe(true);
    act(() => {
      harness.store.getState().undo();
    });
    expect(harness.domain.getState().project.tempo).toBe(128);
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("changes transport scope without stopping playback", async () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(harness.domain.getState().transport.status).toBe("playing"));
    fireEvent.click(screen.getByRole("button", { name: "Song" }));
    expect(harness.domain.getState().project.song.enabled).toBe(true);
    expect(harness.domain.getState().transport.status).toBe("playing");
  });

  it("keeps metronome and meter analysis mode as UI preferences", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    fireEvent.click(screen.getByRole("button", { name: "Metronome" }));
    fireEvent.click(screen.getByRole("button", { name: "Master meter mode: left and right" }));
    expect(harness.store.getState().metronomeEnabled).toBe(true);
    expect(harness.store.getState().meterMode).toBe("ms");
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("forwards the metronome toggle to the engine port", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    fireEvent.click(screen.getByRole("button", { name: "Metronome" }));
    expect(harness.audio.setMetronomeEnabled).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Metronome" }));
    expect(harness.audio.setMetronomeEnabled).toHaveBeenLastCalledWith(false);
  });

  it("sets the tempo from a rolling set of taps", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    let nowValue = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => nowValue);

    const tap = screen.getByRole("button", { name: "Tap tempo" });
    for (const time of [0, 500, 1_000, 1_500]) {
      nowValue = time;
      fireEvent.click(tap);
    }

    // 500 ms between taps is 120 BPM.
    expect(harness.domain.getState().project.tempo).toBe(120);
    expect(harness.domain.getState().history.canUndo).toBe(true);
    now.mockRestore();
  });

  it("powers the audio engine through the port with aria-pressed state", async () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    const power = screen.getByRole("button", { name: "Audio engine power" });
    expect(power).toHaveAttribute("aria-pressed", "false");

    await act(async () => {
      fireEvent.click(power);
      await Promise.resolve();
    });
    expect(harness.audio.setPower).toHaveBeenCalledWith(true);

    act(() => {
      harness.store.getState().reportAudioRuntimeState("active");
    });
    expect(screen.getByRole("button", { name: "Audio engine power" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Audio engine power" }));
      await Promise.resolve();
    });
    expect(harness.audio.setPower).toHaveBeenLastCalledWith(false);
  });

  it("shows the master dB readout and the peak indicator", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    expect(screen.getByLabelText("Master level in decibels")).toHaveTextContent("-inf");
    expect(screen.getByRole("img", { name: "Master peak: idle" })).toBeInTheDocument();
  });

  it("labels the meter pair L/R or M/S from the analysis mode", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Master meter mode: left and right" }));
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
  });
});

describe("Rack", () => {
  it("keeps every visible slot without duplicate Add controls", () => {
    const { container } = renderWithHarness(<Rack />);
    expect(container.querySelectorAll('[data-component="rack-module"]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-label="Empty"]')).toHaveLength(7);
    expect(screen.queryByRole("button", { name: /Add module to rack slot/ })).toBeNull();
  });

  it("adds a module through the rack overview's empty-slot picker", () => {
    const harness = createHarness();
    renderWithHarness(<RackOverview />, harness);
    const add = screen.getAllByRole("button", { name: /Add module to rack slot/ })[0];
    if (add === undefined) throw new Error("Expected an empty-slot Add control.");

    fireEvent.click(add);
    fireEvent.click(screen.getByRole("menuitem", { name: "Silver Serpent" }));
    expect(Object.keys(harness.domain.getState().project.modules)).toHaveLength(2);
  });

  it("reveals an already selected module on every overview activation", () => {
    const harness = createHarness();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    renderWithHarness(
      <>
        <RackOverview />
        <Rack />
      </>,
      harness,
    );
    scroll.mockClear();
    const selected = screen.getByRole("button", { name: /Select Silver Serpent/ });

    fireEvent.click(selected);
    fireEvent.click(selected);

    expect(scroll).toHaveBeenCalledTimes(2);
    scroll.mockRestore();
  });

  it("renders no activity indicator and no faceplate step editing", () => {
    const harness = createHarness();
    const { container } = renderWithHarness(<Rack />, harness);
    // The faceplate carries no playback-position output and no step grid; the
    // Piano Roll and transport clock own that feedback.
    expect(container.querySelector('[data-component="activity-indicator"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /pattern step/i })).toBeNull();
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("auditions only while pointer or keyboard input is held", async () => {
    const harness = createHarness();
    renderWithHarness(<Rack />, harness);
    const audition = screen.getByRole("button", { name: "Silver Serpent audition" });
    const moduleId = firstModuleId(harness);

    fireEvent.pointerDown(audition, { button: 0, pointerId: 7 });
    await waitFor(() => {
      expect(harness.audio.startAudition).toHaveBeenCalledWith(moduleId, 36);
    });
    fireEvent.pointerUp(audition, { button: 0, pointerId: 7 });
    expect(harness.audio.stopAudition).toHaveBeenCalledWith(moduleId);

    fireEvent.keyDown(audition, { key: "Enter" });
    expect(harness.audio.startAudition).toHaveBeenCalledTimes(2);
    fireEvent.blur(audition);
    expect(harness.audio.stopAudition).toHaveBeenCalledTimes(2);
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("previews a knob change without committing, then commits once", () => {
    const harness = createHarness();
    renderWithHarness(<Rack />, harness);
    const moduleId = firstModuleId(harness);
    const dial = screen.getAllByRole("slider", { name: "Cutoff" })[0];
    if (dial === undefined) throw new Error("Expected a cutoff knob.");

    fireEvent.keyDown(dial, { key: "ArrowUp" });
    expect(harness.audio.previewParameter).toHaveBeenCalled();
    expect(harness.domain.getState().project.modules[moduleId]?.parameters.cutoff).toBe(720);

    fireEvent.keyUp(dial, { key: "ArrowUp" });
    expect(harness.domain.getState().project.modules[moduleId]?.parameters.cutoff).toBe(721);
  });

  it("adds a module into an empty slot", () => {
    const harness = createHarness();
    renderWithHarness(<ModuleBrowser />, harness);
    const add = screen.getByRole("button", {
      name: "Add Silver Serpent to the first empty rack slot",
    });
    fireEvent.click(add);
    expect(Object.keys(harness.domain.getState().project.modules)).toHaveLength(2);
  });

  it("moves module type descriptions from card text to tooltips", () => {
    const harness = createHarness();
    const { container } = renderWithHarness(<ModuleBrowser />, harness);
    const bassMonoName = screen.getByText("Silver Serpent");
    const card = bassMonoName.closest("article");

    // The title carries the type description, so assistive technology gets it
    // as the accessible description without a duplicate text node in the card.
    expect(card).toHaveAttribute(
      "title",
      "Monophonic instrument. Drag Silver Serpent into an empty rack slot.",
    );
    expect(card).toHaveAccessibleDescription(
      "Monophonic instrument. Drag Silver Serpent into an empty rack slot.",
    );
    expect(card).not.toHaveAttribute("aria-describedby");

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter modules" }), {
      target: { value: "Monophonic instrument" },
    });
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(screen.getByText("Silver Serpent")).toBeInTheDocument();
  });

  it("moves the module down the rack from the ear handle's keyboard reorder", () => {
    const harness = createHarness();
    renderWithHarness(<Rack />, harness);
    const moduleId = firstModuleId(harness);
    const handle = screen.getAllByRole("button", {
      name: "Reorder Silver Serpent, rack slot 01",
    })[0];
    if (handle === undefined) throw new Error("Expected a reorder handle.");

    // The first slot cannot move up; ArrowUp commits nothing.
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(harness.domain.getState().project.rackSlots[0]?.moduleId).toBe(moduleId);

    // ArrowDown commits one reversible move to the next slot.
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(harness.domain.getState().project.rackSlots[1]?.moduleId).toBe(moduleId);
    expect(harness.domain.getState().history.canUndo).toBe(true);
  });

  it("opens the context menu with Shift+F10 and swaps the plugin from it", () => {
    const harness = createHarness();
    const { container } = renderWithHarness(<Rack />, harness);
    const moduleId = firstModuleId(harness);
    const plate = container.querySelector('[data-label="Silver Serpent"]');
    if (plate === null) throw new Error("Expected the loaded module plate.");

    fireEvent.keyDown(plate, { key: "F10", shiftKey: true });
    fireEvent.click(screen.getByRole("menuitem", { name: "Swap to Tin Soldier" }));

    const module = harness.domain.getState().project.modules[moduleId];
    expect(module?.pluginId).toBe("drum-analog-small");
    // The module keeps its identity and Pattern parts across the swap.
    expect(module?.parts[1]?.some((step) => step.active)).toBe(true);
    expect(harness.domain.getState().history.canUndo).toBe(true);
  });

  it("toggles the module menu from its trigger and leaves outside-press focus alone", () => {
    renderWithHarness(<Rack />);
    const trigger = screen.getByRole("button", { name: "Silver Serpent module menu" });

    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Silver Serpent module menu" })).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    // A second press on the trigger closes the menu and must not reopen it.
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu", { name: "Silver Serpent module menu" })).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    // Escape returns focus to the trigger. jsdom clicks do not focus the
    // pressed button, so the test sets the opener focus a browser would.
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu", { name: "Silver Serpent module menu" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("menu", { name: "Silver Serpent module menu" })).toBeNull();
    expect(trigger).toHaveFocus();

    // An outside press closes the menu without pulling focus back to the trigger.
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "Silver Serpent module menu" })).toBeNull();
    expect(trigger).not.toHaveFocus();
  });

  it("drops the swapped module's voice selection with the old plugin", () => {
    const harness = createHarness();
    renderWithHarness(<Rack />, harness);
    const moduleId = firstModuleId(harness);
    act(() => {
      harness.store.getState().selectVoice(moduleId, "stale-voice");
    });
    expect(harness.store.getState().selectedVoiceByModule[moduleId]).toBe("stale-voice");

    act(() => {
      harness.store.getState().swapModule(moduleId, DRUMLINE_SIX_MANIFEST.pluginId);
    });

    expect(harness.domain.getState().project.modules[moduleId]?.pluginId).toBe(
      DRUMLINE_SIX_MANIFEST.pluginId,
    );
    // The new plugin has its own voice roster, so the stale entry must go.
    expect(harness.store.getState().selectedVoiceByModule[moduleId]).toBeUndefined();
  });

  it("mutes and solos the module from its faceplate", () => {
    const harness = createHarness();
    renderWithHarness(<Rack />, harness);
    const moduleId = firstModuleId(harness);

    fireEvent.click(
      screen.getByRole("button", { name: "Mute Silver Serpent on the rack faceplate" }),
    );
    expect(harness.domain.getState().project.modules[moduleId]?.muted).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Solo Silver Serpent on the rack faceplate" }),
    );
    expect(harness.domain.getState().project.modules[moduleId]?.solo).toBe(true);
  });

  it("keeps Pattern selection out of the rack faceplate", () => {
    renderWithHarness(<Rack />);
    expect(screen.queryByRole("combobox", { name: /Pattern/u })).toBeNull();
  });

  it("disables the lo-fi reducer knobs while the lo-fi stage is off", () => {
    const harness = createHarness({
      extraModules: [
        {
          seed: {
            pluginId: DIGIT_FIVE_MANIFEST.pluginId,
            parameters: parameterValues(DIGIT_FIVE_DEFAULT_PARAMETERS),
            steps: TEST_STEPS,
          },
          manifest: DIGIT_FIVE_MANIFEST,
        },
      ],
    });
    renderWithHarness(<Rack />, harness);

    const emptySlot = harness.domain
      .getState()
      .project.rackSlots.find((slot) => slot.moduleId === undefined);
    if (emptySlot === undefined) throw new Error("Expected an empty slot.");
    act(() => {
      harness.store.getState().addModule(emptySlot.id, DIGIT_FIVE_MANIFEST.pluginId);
    });
    const moduleId = harness.domain
      .getState()
      .project.rackSlots.find((slot) => slot.id === emptySlot.id)?.moduleId;
    if (moduleId === undefined) throw new Error("Expected the added Dusty Mosaic module.");

    // The stage starts enabled (section 15.7), so both reducers are live.
    const bits = screen.getByRole("slider", { name: "Bit reduction" });
    const rate = screen.getByRole("slider", { name: "Sample-rate reduction" });
    expect(bits).not.toHaveAttribute("aria-disabled");
    expect(rate).not.toHaveAttribute("aria-disabled");

    // Turning the stage off disables both reducer knobs.
    act(() => {
      harness.store.getState().commitParameter(moduleId, "lofi-enabled", false);
    });
    expect(bits).toHaveAttribute("aria-disabled", "true");
    expect(rate).toHaveAttribute("aria-disabled", "true");

    // Re-enabling the stage restores the knobs without touching their values.
    act(() => {
      harness.store.getState().commitParameter(moduleId, "lofi-enabled", true);
    });
    expect(bits).not.toHaveAttribute("aria-disabled");
    expect(rate).not.toHaveAttribute("aria-disabled");
  });

  it("binds selected-voice fast controls to the chosen voice", () => {
    const harness = createHarness();
    renderWithHarness(<Rack />, harness);

    // Load Tin Soldier into the first empty slot through the browser-side
    // store action, then drive its faceplate voice controls.
    const emptySlot = harness.domain
      .getState()
      .project.rackSlots.find((slot) => slot.moduleId === undefined);
    if (emptySlot === undefined) throw new Error("Expected an empty slot.");
    act(() => {
      harness.store.getState().addModule(emptySlot.id, "drum-analog-small" as never);
    });
    const drumId = harness.domain
      .getState()
      .project.rackSlots.find((slot) => slot.id === emptySlot.id)?.moduleId;
    if (drumId === undefined) throw new Error("Expected the added drum module.");

    // The default selected voice is the kick: its mute toggle writes the
    // kick's parameter (section 15.2, AC-021).
    fireEvent.click(screen.getByRole("button", { name: "Tin Soldier Kick mute" }));
    expect(
      harness.domain.getState().project.modules[drumId]?.parameters["kick-mute"],
    ).toBe(true);

    // Choosing another voice rebinds the same fast controls.
    fireEvent.change(screen.getByRole("combobox", { name: "Tin Soldier voice" }), {
      target: { value: "snare" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tin Soldier Snare solo" }));
    expect(
      harness.domain.getState().project.modules[drumId]?.parameters["snare-solo"],
    ).toBe(true);
  });

  it("collapses and expands a faceplate control group without project history", () => {
    const harness = createHarness();
    renderWithHarness(<Rack />, harness);

    expect(screen.getByRole("slider", { name: "Cutoff" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Silver Serpent sound controls" }));
    expect(screen.queryByRole("slider", { name: "Cutoff" })).toBeNull();
    expect(screen.getByRole("button", { name: "Silver Serpent audition" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand Silver Serpent sound controls" }));
    expect(screen.getByRole("slider", { name: "Cutoff" })).toBeInTheDocument();
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("keeps disclosure state with each module across reorder and Undo", () => {
    const harness = createHarness();
    const targetSlot = harness.domain.getState().project.rackSlots[1];
    if (targetSlot === undefined) throw new Error("Expected rack slot 02.");
    act(() => {
      harness.store.getState().addModule(targetSlot.id, "drum-analog-small" as never);
    });
    const acidId = firstModuleId(harness);
    const drumId = harness.domain.getState().project.rackSlots[1]?.moduleId;
    if (drumId === undefined) throw new Error("Expected Tin Soldier in rack slot 02.");

    renderWithHarness(<Rack />, harness);
    fireEvent.click(screen.getByRole("button", { name: "Collapse Silver Serpent sound controls" }));

    act(() => {
      harness.store.getState().moveModule(acidId, targetSlot.id);
    });
    expect(harness.domain.getState().project.rackSlots[0]?.moduleId).toBe(drumId);
    expect(screen.getByRole("button", { name: "Expand Silver Serpent sound controls" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Collapse Tin Soldier sound controls" }),
    ).toBeVisible();

    act(() => {
      harness.store.getState().undo();
    });
    expect(harness.domain.getState().project.rackSlots[0]?.moduleId).toBe(acidId);
    expect(screen.getByRole("button", { name: "Expand Silver Serpent sound controls" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Collapse Tin Soldier sound controls" }),
    ).toBeVisible();
  });

  it("omits redundant rack actions and identity labels", () => {
    const { container } = renderWithHarness(<Rack />);
    const bassMono = container.querySelector('[data-label="Silver Serpent"]');
    // Section 2.2: the icon badge is the loaded faceplate's only identity mark.
    expect(bassMono?.querySelector('[data-component="module-icon"] svg path')).not.toBeNull();
    expect(bassMono).not.toHaveTextContent("ACID");
    expect(bassMono).not.toHaveTextContent("Silver Serpent");
    expect(bassMono).toHaveAccessibleName("Rack slot 01, Silver Serpent");
    expect(screen.queryByRole("button", { name: "Select module" })).toBeNull();
    expect(screen.queryByText(/^(Sel|Fold|Open|Dup|Swap)$/u)).toBeNull();
  });
});

describe("PulseApp under StrictMode", () => {
  it("registers exactly one keyboard listener across a double mount", async () => {
    const harness = createHarness();
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");

    renderWithHarness(
      <StrictMode>
        <PulseApp themeService={memoryThemeService()} />
      </StrictMode>,
      harness,
    );

    fireEvent.keyDown(window, { code: "Space" });
    await waitFor(() => {
      expect(harness.audio.play).toHaveBeenCalledTimes(1);
    });

    const isKeydown = (call: readonly unknown[]) => call[0] === "keydown";
    const keydownAdds = added.mock.calls.filter(isKeydown).length;
    const keydownRemoves = removed.mock.calls.filter(isKeydown).length;
    // StrictMode mounts twice, so one net listener means adds exceed removes by one.
    expect(keydownAdds - keydownRemoves).toBe(1);
  });

  it("stops on Escape and undoes with the platform shortcut", async () => {
    const harness = createHarness();
    renderWithHarness(<PulseApp themeService={memoryThemeService()} />, harness);

    fireEvent.keyDown(window, { code: "Space" });
    await waitFor(() => {
      expect(harness.audio.play).toHaveBeenCalled();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(harness.audio.stop).toHaveBeenCalledTimes(1);

    act(() => {
      makeHistory(harness, 2);
    });
    expect(harness.domain.getState().history.canUndo).toBe(true);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("shows an Undo notice after Delete module in the context menu, with no dialog", () => {
    const harness = createHarness();
    renderWithHarness(<PulseApp themeService={memoryThemeService()} />, harness);

    // Section 13.2: removal starts from `Delete module` in the loaded
    // module's context menu. There is no separate Remove button.
    expect(screen.queryByRole("button", { name: "Remove module" })).toBeNull();
    const plate = document.querySelector('[data-component="rack"] [data-label="Silver Serpent"]');
    if (plate === null) throw new Error("Expected the loaded module plate.");
    fireEvent.contextMenu(plate);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete module" }));

    const notice = document.querySelector(".undo-notice");
    expect(notice).toHaveTextContent("Removed Silver Serpent. Undo is available.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("reports a swap through the non-blocking result panel", () => {
    const harness = createHarness();
    renderWithHarness(<PulseApp themeService={memoryThemeService()} />, harness);

    const plate = document.querySelector('[data-component="rack"] [data-label="Silver Serpent"]');
    if (plate === null) throw new Error("Expected the loaded module plate.");
    fireEvent.contextMenu(plate);
    fireEvent.click(screen.getByRole("menuitem", { name: "Swap to Tin Soldier" }));

    const panel = document.querySelector('[data-component="swap-result-panel"]');
    expect(panel).toHaveTextContent(/Swapped Silver Serpent for Tin Soldier/);
    // Section 14: the panel states the count of events with no voice on the
    // new module. The test Pattern carries exactly one such note, and the
    // sequence data itself stays in place.
    expect(panel).toHaveTextContent("1 sequence event has no voice on the new module");
    expect(screen.queryByRole("alertdialog")).toBeNull();

    const moduleId = firstModuleId(harness);
    const parts = harness.domain.getState().project.modules[moduleId]?.parts;
    expect(parts?.[1]?.[8]?.note).toBe(UNMAPPABLE_TEST_NOTE);
  });

  it("clears the swap result panel on its timer and on undo", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      renderWithHarness(<PulseApp themeService={memoryThemeService()} />, harness);

      const plate = document.querySelector(
        '[data-component="rack"] [data-label="Silver Serpent"]',
      );
      if (plate === null) throw new Error("Expected the loaded module plate.");
      fireEvent.contextMenu(plate);
      fireEvent.click(screen.getByRole("menuitem", { name: "Swap to Tin Soldier" }));
      expect(document.querySelector('[data-component="swap-result-panel"]')).not.toBeNull();

      // An undo reverts the swap, so a panel describing it would be stale.
      act(() => {
        harness.store.getState().undo();
      });
      expect(document.querySelector('[data-component="swap-result-panel"]')).toBeNull();

      // A fresh swap's panel clears itself: it is a notice, not a dialog.
      fireEvent.contextMenu(plate);
      fireEvent.click(screen.getByRole("menuitem", { name: "Swap to Tin Soldier" }));
      expect(document.querySelector('[data-component="swap-result-panel"]')).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(12_000);
      });
      expect(document.querySelector('[data-component="swap-result-panel"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("EditorResizeHandle", () => {
  it("raises the editor height by keyboard and resets on double-click", () => {
    const harness = createHarness();
    renderWithHarness(<PulseApp themeService={memoryThemeService()} />, harness);
    const handle = screen.getByRole("separator", { name: "Editor height" });
    const minimum = Number(handle.getAttribute("aria-valuemin"));

    // The default height is the minimum: no stored size, valuenow at the floor.
    expect(harness.store.getState().editorSize).toBeUndefined();
    expect(Number(handle.getAttribute("aria-valuenow"))).toBe(minimum);

    fireEvent.keyDown(handle, { key: "ArrowUp" });

    const raised = harness.store.getState().editorSize;
    expect(raised).toBeGreaterThan(minimum);
    expect(Number(handle.getAttribute("aria-valuenow"))).toBe(raised);

    fireEvent.doubleClick(handle);

    expect(harness.store.getState().editorSize).toBeUndefined();
    expect(Number(handle.getAttribute("aria-valuenow"))).toBe(minimum);
  });

  it("removes the handle from the focus order while the editor is collapsed", () => {
    const harness = createHarness();
    renderWithHarness(<PulseApp themeService={memoryThemeService()} />, harness);

    act(() => {
      harness.store.getState().setEditorExpanded(false);
    });

    const handle = document.querySelector('[data-component="editor-resize-handle"]');
    expect(handle).toHaveAttribute("hidden");
    expect(handle).toHaveAttribute("tabindex", "-1");
  });
});
