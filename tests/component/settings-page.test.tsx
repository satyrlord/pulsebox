import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createPulseThemeService, type PulseThemeService } from "../../src/themes";
import { BUILT_IN_PALETTES, REQUIRED_PALETTE_TOKENS } from "../../src/themes/tokens";
import { SettingsPage } from "../../src/ui/react/shell/SettingsPage";
import { renderWithHarness } from "./helpers";

const VALID_THEME_SOURCE = JSON.stringify({
  formatVersion: 1,
  name: "Test Slate",
  tokens: Object.fromEntries(
    REQUIRED_PALETTE_TOKENS.map((token) => [token, BUILT_IN_PALETTES.rack[token]]),
  ),
});

function createThemeService(): PulseThemeService {
  const stored = new Map<string, string>();
  const service = createPulseThemeService({
    host: {
      clearToken: () => undefined,
      setState: () => undefined,
      setToken: () => undefined,
    },
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => {
        stored.set(key, value);
      },
    },
  });
  service.start();
  return service;
}

function importFile(source: string): void {
  const input = screen.getByLabelText("Import a user theme JSON file");
  const file = new File([source], "theme.json", { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("settings page appearance controls", () => {
  it("exposes theme selection, high contrast, import, and delete", () => {
    const service = createThemeService();
    renderWithHarness(<SettingsPage themeService={service} />);

    expect(screen.getByRole("radio", { name: "Rack" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /User theme/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "High contrast" })).not.toBeChecked();
    expect(screen.getByLabelText("Import a user theme JSON file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete user theme" })).toBeDisabled();
  });

  it("toggles high contrast through the service", () => {
    const service = createThemeService();
    renderWithHarness(<SettingsPage themeService={service} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "High contrast" }));
    expect(service.appearance.highContrast).toBe(true);
    expect(screen.getByRole("checkbox", { name: "High contrast" })).toBeChecked();
  });

  it("installs a valid imported theme and selects it", async () => {
    const service = createThemeService();
    renderWithHarness(<SettingsPage themeService={service} />);

    importFile(VALID_THEME_SOURCE);

    await screen.findByText(/is installed and active/);
    expect(service.appearance.theme).toBe("user");
    expect(service.appearance.userTheme?.name).toBe("Test Slate");
    expect(screen.getByRole("radio", { name: "User theme: Test Slate" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Delete user theme" })).toBeEnabled();
  });

  it("rejects an invalid theme and keeps the active theme", async () => {
    const service = createThemeService();
    renderWithHarness(<SettingsPage themeService={service} />);

    importFile("not json at all");

    await screen.findByText("The theme was rejected. The active theme did not change.");
    expect(service.appearance.theme).toBe("rack");
    expect(service.appearance.userTheme).toBeNull();
  });

  it("switches between the built-in theme and the installed user theme", async () => {
    const service = createThemeService();
    renderWithHarness(<SettingsPage themeService={service} />);

    importFile(VALID_THEME_SOURCE);
    await screen.findByText(/is installed and active/);

    fireEvent.click(screen.getByRole("radio", { name: "Rack" }));
    expect(service.appearance.theme).toBe("rack");
    expect(service.appearance.userTheme?.name).toBe("Test Slate");

    fireEvent.click(screen.getByRole("radio", { name: "User theme: Test Slate" }));
    expect(service.appearance.theme).toBe("user");
  });

  it("deletes the installed user theme and returns to rack", async () => {
    const service = createThemeService();
    renderWithHarness(<SettingsPage themeService={service} />);

    importFile(VALID_THEME_SOURCE);
    await screen.findByText(/is installed and active/);

    fireEvent.click(screen.getByRole("button", { name: "Delete user theme" }));
    expect(service.appearance.theme).toBe("rack");
    expect(service.appearance.userTheme).toBeNull();
    expect(screen.queryByRole("radio", { name: /User theme/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete user theme" })).toBeDisabled();
  });

  it("keeps Tab and Escape available for dialog navigation", () => {
    const service = createThemeService();
    const { harness } = renderWithHarness(<SettingsPage themeService={service} />);
    const mapButton = screen.getByRole("button", { name: /Map semitone 1\./ });
    const before = harness.store.getState().liveKeyMap;

    expect(fireEvent.keyDown(mapButton, { key: "Tab", code: "Tab" })).toBe(true);
    expect(harness.store.getState().liveKeyMap).toEqual(before);
    expect(fireEvent.keyDown(mapButton, { key: "Escape", code: "Escape" })).toBe(true);
    expect(harness.store.getState().liveKeyMap).toEqual(before);

    expect(fireEvent.keyDown(mapButton, { key: "Enter", code: "Enter" })).toBe(false);
    expect(screen.getByText("That key is reserved for keyboard navigation.")).toBeVisible();
  });
});
