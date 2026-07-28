import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "@playwright/test";

const PROTOTYPE_PATH = resolve(
  import.meta.dirname,
  "../../docs/design/claude-mock-up.html",
);
const PROTOTYPE_URL = pathToFileURL(PROTOTYPE_PATH).href;
const REFERENCE_PATH = resolve(import.meta.dirname, "../../docs/design/image-gen-mock.png");

test.use({ viewport: { width: 1568, height: 1003 } });

test("keeps the parity prototype controls consistent with its mixer and timeline contracts", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(PROTOTYPE_URL);
  await page.evaluate(async () => document.fonts.ready);

  const actualA = await page.screenshot();
  const actualB = await page.screenshot();
  const actualHash = createHash("sha256").update(actualA).digest("hex");
  expect(createHash("sha256").update(actualB).digest("hex")).toBe(actualHash);
  const reference = await readFile(REFERENCE_PATH);
  const parity = await page.evaluate(async ({ actualUrl, referenceUrl }) => {
    const load = (source: string): Promise<HTMLImageElement> => new Promise((resolveImage, reject) => {
      const image = new Image();
      image.onload = () => resolveImage(image);
      image.onerror = () => reject(new Error(`Could not decode parity image: ${source.slice(0, 32)}`));
      image.src = source;
    });
    const [actualImage, referenceImage] = await Promise.all([
      load(actualUrl),
      load(referenceUrl),
    ]);
    if (actualImage.width !== referenceImage.width || actualImage.height !== referenceImage.height) {
      throw new Error("Parity images have different dimensions.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = actualImage.width;
    canvas.height = actualImage.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) {
      throw new Error("Parity canvas has no 2D context.");
    }
    context.drawImage(actualImage, 0, 0);
    const actualPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(referenceImage, 0, 0);
    const referencePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let absoluteError = 0;
    let squaredError = 0;
    let withinTen = 0;
    let channels = 0;
    for (let index = 0; index < actualPixels.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const actualValue = actualPixels[index + channel] ?? 0;
        const referenceValue = referencePixels[index + channel] ?? 0;
        const difference = Math.abs(actualValue - referenceValue);
        absoluteError += difference;
        squaredError += difference * difference;
        withinTen += Number(difference <= 10);
        channels += 1;
      }
    }
    return {
      mae: absoluteError / channels,
      rmse: Math.sqrt(squaredError / channels),
      withinTen: withinTen / channels,
    };
  }, {
    actualUrl: `data:image/png;base64,${actualA.toString("base64")}`,
    referenceUrl: `data:image/png;base64,${reference.toString("base64")}`,
  });
  await testInfo.attach("parity-metrics", {
    body: Buffer.from(JSON.stringify({ ...parity, screenshotSha256: actualHash }, null, 2)),
    contentType: "application/json",
  });
  testInfo.annotations.push({
    type: "parity-metrics",
    description: JSON.stringify({ ...parity, screenshotSha256: actualHash }),
  });
  expect(parity.mae).toBeLessThan(18);
  expect(parity.withinTen).toBeGreaterThan(0.6);

  const emptyStrips = page.locator(".mstrip.empty");
  await expect(emptyStrips).toHaveCount(2);
  await expect(emptyStrips.locator("button:enabled")).toHaveCount(0);
  await expect(emptyStrips.locator('[role="slider"][tabindex="0"]')).toHaveCount(0);
  await expect(emptyStrips.nth(0)).toHaveAttribute("aria-disabled", "true");
  await expect(emptyStrips.nth(1)).toHaveAttribute("aria-disabled", "true");

  await expect(page.locator(".master-returns button")).toHaveCount(0);
  await expect(page.locator(".master-returns .sendbtn")).toHaveCount(4);

  const masterFader = page.locator(".mstrip.master .fader");
  const initialMasterLevel = await masterFader.getAttribute("aria-valuenow");
  const faderBounds = await masterFader.boundingBox();
  expect(faderBounds).not.toBeNull();
  if (faderBounds !== null) {
    const x = faderBounds.x + faderBounds.width / 2;
    const y = faderBounds.y + faderBounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 32, { steps: 4 });
    await page.mouse.up();
  }
  await expect(masterFader).not.toHaveAttribute("aria-valuenow", initialMasterLevel ?? "");
  await expect(page.locator("#btnUndo")).toBeEnabled();
  await page.locator("#btnUndo").click();
  await expect(masterFader).toHaveAttribute("aria-valuenow", initialMasterLevel ?? "");

  await page.locator('.slot[data-mod="six"] .scard').click();
  const triggerCount = await page.locator("#prgrid .trigger").count();
  const gridBounds = await page.locator("#prgrid").boundingBox();
  expect(gridBounds).not.toBeNull();
  if (gridBounds !== null) {
    await page.mouse.click(gridBounds.x + 20, gridBounds.y + gridBounds.height / 2);
  }
  await expect(page.locator("#prgrid .trigger")).toHaveCount(triggerCount);
  expect(pageErrors).toEqual([]);
});
