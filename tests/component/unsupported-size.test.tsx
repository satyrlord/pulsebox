import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createPulseThemeService,
  elementThemeHost,
  type PulseThemeService,
} from "../../src/themes";
import { PulseApp } from "../../src/ui/react/PulseApp";
import { createHarness, renderWithHarness } from "./helpers";

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

function resizeViewport(width: number, height: number): void {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: width },
    innerHeight: { configurable: true, value: height },
  });
  fireEvent(window, new Event("resize"));
}

describe("PulseApp below the editing boundary", () => {
  it("replaces the editable UI with project safety actions and a read-only summary", async () => {
    resizeViewport(1_024, 700);
    const harness = createHarness();
    renderWithHarness(<PulseApp themeService={memoryThemeService()} />, harness);

    expect(screen.getByRole("heading", { name: "Window too small" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Autosave remains active");
    expect(screen.getByLabelText("Read-only project summary")).toHaveTextContent(
      "ProjectPhase 1 session",
    );
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Save",
      "Export",
    ]);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();

    fireEvent.keyDown(window, { code: "Space" });
    expect(harness.audio.play).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(harness.projects.save).toHaveBeenCalledTimes(1);
    });
  });

  it("removes editing controls when a supported window becomes too small", () => {
    const harness = createHarness();
    renderWithHarness(<PulseApp themeService={memoryThemeService()} />, harness);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

    resizeViewport(1_279, 720);

    expect(screen.getByRole("heading", { name: "Window too small" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});
