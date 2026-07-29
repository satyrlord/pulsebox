import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Mixer } from "../../src/ui/react/shell/Mixer";
import { PatternBank } from "../../src/ui/react/shell/PatternBank";
import { ProjectMenu } from "../../src/ui/react/shell/ProjectMenu";
import { SongView } from "../../src/ui/react/shell/SongView";
import { WorkspaceTabs } from "../../src/ui/react/shell/WorkspaceTabs";
import { createHarness, firstModuleId, renderWithHarness } from "./helpers";

describe("PatternBank", () => {
  it("marks the selected Pattern and switches on click", () => {
    const harness = createHarness();
    renderWithHarness(<PatternBank />, harness);

    const first = screen.getByRole("radio", { name: "Pattern 1" });
    expect(first).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Pattern 2" }));

    expect(harness.domain.getState().project.activePatternIndex).toBe(1);
    expect(screen.getByRole("radio", { name: "Pattern 2" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("renames a Pattern from a double-click", () => {
    const harness = createHarness();
    renderWithHarness(<PatternBank />, harness);

    fireEvent.doubleClick(screen.getByRole("radio", { name: "Pattern 1" }));
    const field = screen.getByLabelText("Rename Pattern 1");
    fireEvent.change(field, { target: { value: "Intro" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(harness.domain.getState().project.patterns[0]?.name).toBe("Intro");
  });

  it("clears the selected Pattern and offers Undo", () => {
    const harness = createHarness();
    renderWithHarness(<PatternBank />, harness);
    const moduleId = firstModuleId(harness);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(
      harness.domain.getState().project.modules[moduleId]?.parts[0]?.every((step) => !step.active),
    ).toBe(true);
    expect(harness.store.getState().undoNotice?.message).toContain("Undo is available");
  });
});

describe("Mixer", () => {
  it("renders a strip per loaded module plus the master strip", () => {
    renderWithHarness(<Mixer />);

    expect(screen.getByRole("article", { name: "Acid Bass channel" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Master channel" })).toBeInTheDocument();
  });

  it("mutes a channel through a command and reports it with aria-pressed", () => {
    const harness = createHarness();
    renderWithHarness(<Mixer />, harness);
    const moduleId = firstModuleId(harness);

    const mute = screen.getByRole("button", { name: "Mute Acid Bass" });
    expect(mute).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(mute);

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

    const after = harness.domain.getState().project.modules[moduleId]?.level ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(harness.domain.getState().history.canUndo).toBe(true);
  });

  it("dims a strip that solo has silenced", () => {
    const harness = createHarness();
    const { container } = renderWithHarness(<Mixer />, harness);

    fireEvent.click(screen.getByRole("button", { name: "Solo Acid Bass" }));

    // The only strip is the soloed one, so it stays audible.
    expect(container.querySelector('[data-silenced="true"]')).toBeNull();
  });
});

describe("SongView", () => {
  it("appends chain entries and reports the total length", () => {
    const harness = createHarness();
    renderWithHarness(<SongView />, harness);

    expect(screen.getByRole("status")).toHaveTextContent("Empty chain");

    fireEvent.click(screen.getByRole("button", { name: "Pattern 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Pattern 2" }));

    expect(harness.domain.getState().project.song.entries).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("2 steps, 32 sixteenths.");
  });

  it("changes a repeat count and removes an entry", () => {
    const harness = createHarness();
    renderWithHarness(<SongView />, harness);
    fireEvent.click(screen.getByRole("button", { name: "Pattern 1" }));

    // The field commits on Enter or blur rather than per keystroke, so typing a
    // multi-digit count is one undo entry instead of one per character.
    const repeats = screen.getByLabelText("Repeats");
    fireEvent.change(repeats, { target: { value: "4" } });
    fireEvent.keyDown(repeats, { key: "Enter" });
    expect(harness.domain.getState().project.song.entries[0]?.repeats).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: "Remove song step 1" }));
    expect(harness.domain.getState().project.song.entries).toHaveLength(0);
  });

  it("toggles song mode", () => {
    const harness = createHarness();
    renderWithHarness(<SongView />, harness);

    fireEvent.click(screen.getByRole("button", { name: "Song mode" }));

    expect(harness.domain.getState().project.song.enabled).toBe(true);
    expect(screen.getByRole("button", { name: "Song mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("WorkspaceTabs", () => {
  it("selects exactly one workspace at a time", () => {
    const harness = createHarness();
    renderWithHarness(<WorkspaceTabs />, harness);

    expect(screen.getByRole("tab", { name: "Rack" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "Mixer" }));

    expect(harness.store.getState().workspaceView).toBe("mixer");
    expect(screen.getByRole("tab", { name: "Rack" })).toHaveAttribute("aria-selected", "false");
  });
});

describe("ProjectMenu", () => {
  it("saves through the injected project service", async () => {
    const harness = createHarness();
    renderWithHarness(<ProjectMenu />, harness);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await Promise.resolve();
    });

    expect(harness.projects.save).toHaveBeenCalled();
  });

  it("lists stored projects when Open is expanded and opens one", async () => {
    const harness = createHarness();
    renderWithHarness(<ProjectMenu />, harness);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole("list", { name: "Stored projects" })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Saved session/ }));
      await Promise.resolve();
    });

    expect(harness.projects.open).toHaveBeenCalledWith("stored-1");
  });

  it("reports a rejected import rather than loading it", async () => {
    const harness = createHarness();
    harness.projects.importPortable.mockResolvedValue({
      ok: false,
      reason: "Unknown root keys: evil.",
    });
    renderWithHarness(<ProjectMenu />, harness);

    await act(async () => {
      await harness.store.getState().importProject(new Uint8Array());
    });

    expect(harness.store.getState().projectMessage).toBe("Unknown root keys: evil.");
  });
});
