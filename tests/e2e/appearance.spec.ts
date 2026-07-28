import { expect, test } from "@playwright/test";

const STORAGE_KEY = "pulsebox.ui.appearance.v1";

function envelope(theme: string, highContrast = false): string {
  return JSON.stringify({ version: 1, theme, highContrast, userTheme: null });
}

/** Browsers serialize custom-property colors verbatim, so compare canonically. */
function normalizeHex(value: string): string {
  const hex = value.trim().toLowerCase().replace("#", "");
  const expanded = hex.length === 3 ? hex.replace(/./g, (digit) => digit + digit) : hex;
  return `#${expanded}`;
}

test("a new installation starts with the rack theme", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rack");
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "false");
  const app = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--pulse-color-app").trim(),
  );
  expect(normalizeHex(app)).toBe("#0b0d0f");
});

test("a stored appearance preference is restored on startup", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key ?? "", value ?? "");
    },
    [STORAGE_KEY, envelope("cosmic", true)],
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cosmic");
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");
  // The high-contrast overlay wins over the cosmic palette.
  const app = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--pulse-color-app").trim(),
  );
  expect(normalizeHex(app)).toBe("#000000");
});

test("corrupt stored appearance data falls back to rack", async ({ page }) => {
  await page.addInitScript(
    ([key]) => {
      window.localStorage.setItem(key ?? "", "{not json");
    },
    [STORAGE_KEY],
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rack");
});

test("the application header contains no appearance selector", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("pulse-transport-bar");
  await expect(header.getByRole("button", { name: /theme/i })).toHaveCount(0);
  await expect(header.getByRole("combobox", { name: /theme|contrast|appearance/i })).toHaveCount(0);
});

test("switching theme does not shift layout or move focus", async ({ page }) => {
  await page.goto("/");
  const tempo = page.locator("[data-field='tempo']");
  await tempo.focus();
  const before = await tempo.boundingBox();
  expect(before).not.toBeNull();

  for (const [theme, expected] of [
    ["mono", "#050505"],
    ["cosmic", "#070a18"],
    ["analog", "#171512"],
    ["rust", "#130d0a"],
    ["rack", "#0b0d0f"],
  ] as const) {
    const resolved = await page.evaluate((next) => {
      document.documentElement.dataset.theme = next;
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--pulse-color-app")
        .trim();
    }, theme);
    // The palette must actually change. An inline paint of a built-in theme
    // would outrank the stylesheet and freeze every later switch.
    expect(normalizeHex(resolved), theme).toBe(expected);
    expect(await tempo.boundingBox()).toEqual(before);
  }
  await expect(tempo).toBeFocused();
});

test("switching theme during playback keeps the transport running", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  const shell = page.locator("#app");
  await expect(shell).toHaveAttribute("data-transport", "playing");

  await page.evaluate(() => {
    document.documentElement.dataset.theme = "rust";
  });
  await page.waitForTimeout(200);
  // Appearance is a UI-only patch: the transport must not stop or restart.
  await expect(shell).toHaveAttribute("data-transport", "playing");
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
});

test("a theme change creates no undo entry", async ({ page }) => {
  await page.goto("/");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeDisabled();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "mono";
    document.documentElement.dataset.highContrast = "true";
  });
  await expect(undo).toBeDisabled();
});

test("a valid cross-tab appearance envelope applies as a UI-only update", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rack");
  await page.evaluate(
    ([key, value]) => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: key ?? "", newValue: value ?? "" }),
      );
    },
    [STORAGE_KEY, envelope("analog")],
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "analog");
});

test("invalid cross-tab appearance data is ignored", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(
    ([key]) => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: key ?? "", newValue: '{"version":99}' }),
      );
    },
    [STORAGE_KEY],
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rack");
});

test("the Settings page is the only appearance selection surface", async ({ page }) => {
  await page.goto("/");
  const page_ = page.locator("pulse-settings-page");
  // Closed by default, so the workspace is not covered on startup.
  await expect(page.locator(".settings-panel")).toBeHidden();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".settings-panel")).toBeVisible();
  await expect(page_.getByRole("radio", { name: /Rack/ })).toBeChecked();
  for (const theme of ["Mono", "Cosmic", "Analog", "Rust"]) {
    await expect(page_.getByRole("radio", { name: new RegExp(theme) })).toHaveCount(1);
  }
});

test("choosing a theme on the Settings page applies and persists it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator("pulse-settings-page").getByRole("radio", { name: /Cosmic/ }).check();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "cosmic");
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  expect(JSON.parse(stored ?? "{}")).toMatchObject({ theme: "cosmic" });

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cosmic");
});

test("high contrast layers over the selected theme from the Settings page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.locator("pulse-settings-page");
  await settings.getByRole("radio", { name: /Analog/ }).check();
  await settings.getByRole("checkbox", { name: "High contrast" }).check();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "analog");
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");
  const app = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--pulse-color-app").trim(),
  );
  expect(normalizeHex(app)).toBe("#000000");
});

test("a failed preference write leaves the appearance and the control unchanged", async ({ page }) => {
  await page.addInitScript(() => {
    // Simulate a storage quota or privacy-mode rejection.
    const original = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (key: string, value: string) => {
      if (key.startsWith("pulsebox.ui.appearance")) throw new Error("storage blocked");
      original(key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const mono = page.locator("pulse-settings-page").getByRole("radio", { name: /Mono/ });
  // A plain click, not check(): check() asserts the control ends up checked,
  // but reverting is exactly the behavior under test.
  await mono.click({ force: true });

  // The preference was not saved, so it must not be applied or shown as chosen.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rack");
  await expect(mono).not.toBeChecked();
  await expect(page.locator(".undo-notice")).toBeVisible();
});

test("closing the Settings page restores focus to the button that opened it", async ({ page }) => {
  await page.goto("/");
  const settingsButton = page.getByRole("button", { name: "Settings" });
  await settingsButton.click();
  await expect(page.locator(".settings-panel")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-panel")).toBeHidden();
  await expect(settingsButton).toBeFocused();
});

test("Escape closes the Settings page without stopping playback", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  const shell = page.locator("#app");
  await expect(shell).toHaveAttribute("data-transport", "playing");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-panel")).toBeHidden();
  // Escape belongs to the open page here, not to the transport.
  await expect(shell).toHaveAttribute("data-transport", "playing");
});

test("selecting a theme on the Settings page creates no undo entry", async ({ page }) => {
  await page.goto("/");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeDisabled();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator("pulse-settings-page").getByRole("radio", { name: /Rust/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rust");
  await expect(undo).toBeDisabled();
});

test("every built-in theme keeps operational targets at least 24 pixels", async ({ page }) => {
  await page.goto("/");
  for (const theme of ["rack", "mono", "cosmic", "analog", "rust"]) {
    await page.evaluate((next) => {
      document.documentElement.dataset.theme = next;
    }, theme);
    const step = page.locator("pulse-pattern-strip button").first();
    const box = await step.boundingBox();
    expect(box?.width, `${theme} step width`).toBeGreaterThanOrEqual(24);
    expect(box?.height, `${theme} step height`).toBeGreaterThanOrEqual(24);
  }
});
