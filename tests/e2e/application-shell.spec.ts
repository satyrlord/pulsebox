import { createHash } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

const SUPPORTED_VIEWPORTS = [
  { width: 1536, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
] as const;

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (value === null)
    throw new Error(`Expected ${await locator.getAttribute("data-component")} to be laid out.`);
  return value;
}

function separated(left: { x: number; width: number }, right: { x: number }): boolean {
  return left.x + left.width <= right.x;
}

async function measureRasterDifference(page: Page, first: Buffer, second: Buffer) {
  return page.evaluate(
    async ([firstBase64, secondBase64]) => {
      const load = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        return image;
      };
      const [firstImage, secondImage] = await Promise.all([load(firstBase64), load(secondBase64)]);
      const canvas = document.createElement("canvas");
      canvas.width = firstImage.naturalWidth;
      canvas.height = firstImage.naturalHeight;
      const context = canvas.getContext("2d");
      if (context === null)
        throw new Error("Chrome did not provide a screenshot comparison canvas.");
      context.drawImage(firstImage, 0, 0);
      const firstPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(secondImage, 0, 0);
      const secondPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let changedPixels = 0;
      let maximumChannelDelta = 0;
      for (let offset = 0; offset < firstPixels.length; offset += 4) {
        let changed = false;
        for (let channel = 0; channel < 4; channel += 1) {
          const delta = Math.abs(
            (firstPixels[offset + channel] ?? 0) - (secondPixels[offset + channel] ?? 0),
          );
          if (delta > 0) changed = true;
          maximumChannelDelta = Math.max(maximumChannelDelta, delta);
        }
        if (changed) changedPixels += 1;
      }
      return { changedPixels, maximumChannelDelta };
    },
    [first.toString("base64"), second.toString("base64")] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

for (const viewport of SUPPORTED_VIEWPORTS) {
  test(`fits the complete shell at ${String(viewport.width)} by ${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await expect(page.locator('[data-component="unsupported-size"]')).toHaveCount(0);

    const header = await box(page.locator('[data-component="transport-bar"]'));
    const main = await box(page.locator('[data-component="main-workspace"]'));
    const editor = await box(page.locator('[data-component="editor-workspace"]'));
    const footer = await box(page.locator('[data-component="workspace-bar"]'));
    expect(header.height).toBe(58);
    expect(footer.height).toBe(52);
    expect(header.y + header.height).toBeLessThanOrEqual(main.y);
    expect(main.y + main.height).toBeLessThanOrEqual(editor.y);
    expect(editor.y + editor.height).toBeLessThanOrEqual(footer.y);

    const browser = await box(page.locator('[data-component="module-browser"]'));
    const overview = await box(page.locator('[data-component="rack-overview"]'));
    const rack = await box(page.locator('[data-component="rack"]'));
    const studio = await box(page.locator('[data-component="studio-panel"]'));
    expect(separated(browser, overview)).toBe(true);
    expect(separated(overview, rack)).toBe(true);
    expect(separated(rack, studio)).toBe(true);
    expect(rack.width).toBeGreaterThan(studio.width);

    if (viewport.width >= 1440) {
      // The seeded project loads six of the eight slots. The height band below
      // describes a loaded faceplate, so empty slots are excluded here.
      const modules = page.locator('[data-component="rack-module"]:not([data-label="Empty"])');
      await expect(modules).toHaveCount(6);
      for (const module of await modules.all()) {
        const moduleBox = await box(module);
        if (viewport.height > 900) {
          expect(moduleBox.height).toBeGreaterThanOrEqual(86);
          expect(moduleBox.height).toBeLessThanOrEqual(98);
        }
        expect(moduleBox.y + moduleBox.height).toBeLessThanOrEqual(rack.y + rack.height);
      }
    }

    const inspector = await box(page.locator('[data-component="pattern-inspector"]'));
    const roll = await box(page.locator('[data-component="piano-roll"]'));
    const playlist = await box(page.locator('[data-component="playlist-summary"]'));
    expect(separated(inspector, roll)).toBe(true);
    expect(separated(roll, playlist)).toBe(true);

    const viewportState = await page.evaluate(() => ({
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(viewportState.scrollWidth).toBeLessThanOrEqual(viewportState.innerWidth);
    expect(viewportState.scrollHeight).toBeLessThanOrEqual(viewportState.innerHeight);

    const transportButtons = page.locator('[data-component="transport-bar"] button');
    for (let index = 0; index < (await transportButtons.count()); index += 1) {
      const target = await box(transportButtons.nth(index));
      expect(target.x).toBeGreaterThanOrEqual(0);
      expect(target.x + target.width).toBeLessThanOrEqual(viewport.width);
      expect(target.height).toBeGreaterThanOrEqual(24);
    }
  });
}

test("keeps all mixer strips visible and studio panes mutually exclusive", async ({ page }) => {
  const studio = page.locator('[data-component="studio-panel"]');
  const tabs = studio.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  const widths = await tabs.evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().width),
  );
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);

  await expect(studio.locator('[data-component="channel-strip"]')).toHaveCount(8);
  await expect(studio.locator('[data-component="master-strip"]')).toHaveCount(1);
  const empty = studio.locator('[data-empty="true"]');
  await expect(empty).toHaveCount(2);
  await expect(empty.nth(0)).toContainText("07");
  await expect(empty.nth(1)).toContainText("08");
  for (const strip of await empty.all()) {
    const sends = strip.getByRole("button");
    await expect(sends).toHaveCount(4);
    for (const send of await sends.all()) await expect(send).toBeDisabled();
  }

  await studio.getByRole("tab", { name: "Effects" }).click();
  await expect(studio.locator('[data-component="mixer"]')).toHaveCount(0);
  await expect(studio.locator('[data-component="effects-bank"]')).toBeVisible();
  await expect(studio.locator('[data-component="effect-slot"]')).toHaveCount(4);

  await studio.getByRole("tab", { name: "Master" }).click();
  await expect(studio.locator('[data-component="effects-bank"]')).toHaveCount(0);
  await expect(studio.locator('[data-component="master-panel"]')).toBeVisible();
});

test("changes transport scope without stopping and toggles meter analysis without changing audio", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await page.getByRole("button", { name: "Song" }).click();
  await expect(page.getByRole("button", { name: "Song" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  const meterMode = page.getByRole("button", { name: "Master meter mode: left and right" });
  await meterMode.click();
  await expect(page.getByRole("button", { name: "Master meter mode: mid and side" })).toHaveText(
    "M/S",
  );
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});

test("collapses and restores the lower editor with its focus and scroll context", async ({
  page,
}) => {
  const rack = page.locator('[data-component="rack"]');
  const beforeHeight = (await box(rack)).height;
  const patternName = page.getByRole("textbox", { name: "Pattern name" });

  const addPattern = page.getByRole("button", { name: "Add selected Pattern" });
  for (let index = 0; index < 12; index += 1) await addPattern.click();
  await patternName.focus();
  const playlist = page.locator('[data-component="playlist-summary"] ol');
  await playlist.evaluate((element) => {
    element.scrollTop = 12;
  });
  await page.getByRole("button", { name: "Collapse editor" }).click();
  await expect(page.locator('[data-component="editor-workspace"]')).toBeHidden();
  expect((await box(rack)).height).toBeGreaterThan(beforeHeight);

  await page.getByRole("button", { name: "Expand editor" }).click();
  await expect(page.locator('[data-component="editor-workspace"]')).toBeVisible();
  await expect(patternName).toBeFocused();
  expect(await playlist.evaluate((element) => element.scrollTop)).toBe(12);
});

test("keeps the stopped shell deterministic for visual review", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  // The first raster after a viewport change is discarded. It is taken while
  // the compositor still holds tiles for the old size, so its anti-aliasing is
  // not yet settled. The check is that two settled frames match, which is what
  // proves nothing animates or ticks while the transport is stopped.
  await page.screenshot({ animations: "disabled" });
  const first = await page.screenshot({ animations: "disabled" });
  const second = await page.screenshot({ animations: "disabled" });
  const difference = await measureRasterDifference(page, first, second);
  expect(difference.changedPixels).toBeLessThanOrEqual(4);
  expect(difference.maximumChannelDelta).toBeLessThanOrEqual(2);
  test.info().annotations.push({
    type: "screenshot-sha256",
    description: createHash("sha256").update(first).digest("hex"),
  });
});

test("keeps the project menu inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Neon Basement" }).click();
  const menu = page.getByRole("menu", { name: "Project menu" });
  const bounds = await box(menu);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1280);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
});
