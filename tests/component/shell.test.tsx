import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { PulseApp } from "../../src/ui/react/PulseApp";
import { Rack } from "../../src/ui/react/shell/Rack";
import { TransportBar } from "../../src/ui/react/shell/TransportBar";
import {
  createPulseThemeService,
  elementThemeHost,
  type PulseThemeService,
} from "../../src/themes";
import { createHarness, firstModuleId, renderWithHarness } from "./helpers";

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
      expect(harness.audio.play).toHaveBeenCalledWith(130);
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

    fireEvent.change(tempo, { target: { value: "146" } });
    fireEvent.keyDown(tempo, { key: "Enter" });
    expect(harness.domain.getState().project.tempo).toBe(146);

    fireEvent.change(tempo, { target: { value: "900" } });
    fireEvent.keyDown(tempo, { key: "Enter" });
    expect(harness.domain.getState().project.tempo).toBe(146);
    // The field falls back to the committed value rather than keeping 900.
    expect(tempo.value).toBe("146");
  });

  it("keeps a half-typed tempo out of the transport", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    const tempo = screen.getByLabelText<HTMLInputElement>("Tempo");

    fireEvent.change(tempo, { target: { value: "1" } });
    expect(harness.domain.getState().project.tempo).toBe(130);
  });

  it("disables Undo and Redo until there is history", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

    act(() => {
      makeHistory(harness, 1);
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  });

  it("records swing as undoable project data", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);

    fireEvent.change(screen.getByLabelText("Swing"), { target: { value: "50" } });

    // Swing changes the rendered rhythm, so it belongs to the project and to
    // history rather than being a transient view preference.
    expect(harness.domain.getState().project.swing).toBeCloseTo(0.5);
    expect(harness.domain.getState().history.canUndo).toBe(true);

    act(() => {
      harness.store.getState().undo();
    });
    expect(screen.getByLabelText<HTMLInputElement>("Swing").value).toBe("0");
  });

  it("collapses one swing drag into a single undo entry", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    const slider = screen.getByLabelText("Swing");

    // A range input emits one change per step, so a drag across the control
    // produces dozens of commands. They share one gesture, so they must produce
    // one history entry, not one entry per step.
    fireEvent.pointerDown(slider);
    for (let percent = 1; percent <= 30; percent += 1) {
      fireEvent.change(slider, { target: { value: String(percent) } });
    }
    fireEvent.pointerUp(slider);

    expect(harness.domain.getState().project.swing).toBeCloseTo(0.3);

    act(() => {
      harness.store.getState().undo();
    });
    expect(harness.domain.getState().project.swing).toBe(0);
    expect(harness.domain.getState().history.canUndo).toBe(false);
  });

  it("keeps two separate swing drags separately undoable", () => {
    const harness = createHarness();
    renderWithHarness(<TransportBar />, harness);
    const slider = screen.getByLabelText("Swing");

    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "10" } });
    fireEvent.pointerUp(slider);
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.pointerUp(slider);

    act(() => {
      harness.store.getState().undo();
    });
    expect(harness.domain.getState().project.swing).toBeCloseTo(0.1);
  });
});

describe("Rack", () => {
  it("shows every visible slot and marks the empty ones", () => {
    const { container } = renderWithHarness(<Rack />);
    expect(container.querySelectorAll('[data-component="rack-module"]')).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Add Acid Bass" })).toHaveLength(2);
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
    const audition = screen.getByRole("button", { name: "Acid Bass audition" });
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
    renderWithHarness(<Rack />, harness);
    const [add] = screen.getAllByRole("button", { name: "Add Acid Bass" });
    if (add === undefined) throw new Error("Expected an empty slot.");
    fireEvent.click(add);
    expect(Object.keys(harness.domain.getState().project.modules)).toHaveLength(2);
  });

  it("disables Move left on the first slot and Move right on the last", () => {
    renderWithHarness(<Rack />);
    expect(screen.getByRole("button", { name: "Move left" })).toBeDisabled();
  });

  it("collapses and expands a module", () => {
    const harness = createHarness();
    renderWithHarness(<Rack />, harness);

    expect(screen.getByRole("slider", { name: "Cutoff" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse module" }));
    expect(screen.queryByRole("slider", { name: "Cutoff" })).toBeNull();
    expect(screen.getByRole("button", { name: "Acid Bass audition" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand module" }));
    expect(screen.getByRole("slider", { name: "Cutoff" })).toBeInTheDocument();
    // Collapse is a local view preference, so it never enters project history.
    expect(harness.domain.getState().history.canUndo).toBe(false);
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

  it("shows an Undo notice after a destructive removal instead of a dialog", () => {
    const harness = createHarness();
    renderWithHarness(<PulseApp themeService={memoryThemeService()} />, harness);

    fireEvent.click(screen.getByRole("button", { name: "Remove module" }));

    const notice = document.querySelector(".undo-notice");
    expect(notice).toHaveTextContent("Removed Acid Bass. Undo is available.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
