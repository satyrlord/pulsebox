import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("boots the production shell with three functional rack slots", async ({ page }) => {
  await expect(page).toHaveTitle("PULSEBOX");
  await expect(page.locator("pulse-transport-bar")).toBeVisible();
  await expect(page.locator("pulse-rack-module")).toHaveCount(3);
  await expect(page.locator("pulse-rack-module").nth(0)).toHaveAttribute("label", "Acid Bass");
  await expect(page.locator("pulse-rack-module").nth(1)).toHaveAttribute("label", "Empty");

  await page.locator("pulse-rack-module").nth(1).getByRole("button", { name: "Add Acid Bass" }).click();
  await expect(page.locator("pulse-rack-module[label='Acid Bass']")).toHaveCount(2);
  await expect(page.locator("pulse-pattern-strip")).toHaveCount(2);
});

test("patches history actions and keeps focused rack controls mounted", async ({ page }) => {
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo" });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  const firstStep = page.locator("pulse-rack-module").first().locator("pulse-pattern-strip button").first();
  await firstStep.focus();
  await firstStep.press("Space");
  await expect(firstStep).toBeFocused();
  await expect(firstStep).toHaveAttribute("aria-pressed", "false");
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(firstStep).toHaveAttribute("aria-pressed", "true");
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect(firstStep).toHaveAttribute("aria-pressed", "false");
  const record = page.getByRole("button", { name: "Record" });
  await record.focus();
  await record.press("Control+z");
  await expect(firstStep).toHaveAttribute("aria-pressed", "true");
});

test("coalesces one pointer-painted step run into one Undo entry", async ({ page }) => {
  const steps = page.locator("pulse-rack-module").first().locator("pulse-pattern-strip button");
  const boxes = await Promise.all([0, 1, 2].map(async (index) => steps.nth(index).boundingBox()));
  expect(boxes.every((box) => box !== null)).toBe(true);
  const first = boxes[0];
  if (first === null || first === undefined) throw new Error("First pattern step is not visible.");
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  for (const box of boxes.slice(1)) {
    if (box === null) throw new Error("Painted pattern step is not visible.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
  await page.mouse.up();

  for (const index of [0, 1, 2]) await expect(steps.nth(index)).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  for (const index of [0, 1, 2]) await expect(steps.nth(index)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("disables unavailable rack actions and moves only within visible boundaries", async ({ page }) => {
  const slots = page.locator("pulse-rack-module");
  const first = slots.nth(0);
  await expect(first.getByRole("button", { name: "Select module" })).toBeDisabled();
  await expect(first.getByRole("button", { name: "Move left" })).toBeDisabled();
  await expect(first.getByRole("button", { name: "Move right" })).toBeEnabled();
  await expect(first.getByRole("button", { name: "Duplicate module" })).toBeEnabled();

  await first.getByRole("button", { name: "Move right" }).click();
  await expect(slots.nth(0)).toHaveAttribute("label", "Empty");
  await expect(slots.nth(1)).toHaveAttribute("label", "Acid Bass");
  await expect(page.locator(".undo-notice")).toContainText("Moved to rack slot 02.");

  await slots.nth(0).getByRole("button", { name: "Add Acid Bass" }).click();
  await slots.nth(2).getByRole("button", { name: "Add Acid Bass" }).click();
  await expect(slots.locator("button[aria-label='Duplicate module']:disabled")).toHaveCount(3);
  await expect(slots.nth(2).getByRole("button", { name: "Move right" })).toBeDisabled();
});

test("committed controls and patterns participate in undo", async ({ page }) => {
  const firstModule = page.locator("pulse-rack-module").first();
  const cutoff = firstModule.locator("pulse-knob[data-parameter='cutoff']");
  const numeric = cutoff.locator("input[type='number']");
  await numeric.fill("1400");
  await numeric.press("Enter");
  await numeric.blur();
  await expect(cutoff).toHaveAttribute("value", "1400");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(firstModule.locator("pulse-knob[data-parameter='cutoff']")).toHaveAttribute("value", "720");

  const firstStep = firstModule.locator("pulse-pattern-strip button").first();
  await firstStep.press("Space");
  await expect(firstStep).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(firstModule.locator("pulse-pattern-strip button").first()).toHaveAttribute("aria-pressed", "true");
});

test("module removal exposes an accessible non-blocking Undo notice", async ({ page }) => {
  const firstModule = page.locator("pulse-rack-module").first();
  await firstModule.getByRole("button", { name: "Remove module" }).click();

  const notice = page.locator(".undo-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Acid Bass removed.");
  await notice.getByRole("button", { name: "Undo" }).click();

  await expect(page.locator("pulse-rack-module[label='Acid Bass']")).toHaveCount(1);
  await expect(notice).toContainText("Module restored.");
});

test("play activates the AudioWorklet path and Stop is idempotent", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await expect(page.locator("#app")).toHaveAttribute("data-transport", "playing");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-transport", "stopped");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-transport", "stopped");
});

test("resumes cleanly after repeated pause cycles", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await page.waitForTimeout(350);
  await expect(page.locator(".position")).not.toHaveText("1.1.1");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio suspended");
  const pausedPosition = await page.locator(".position").textContent();
  await page.waitForTimeout(100);
  await expect(page.locator(".position")).toHaveText(pausedPosition ?? "");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await page.waitForTimeout(180);
  await expect(page.locator(".position")).not.toHaveText("1.1.1");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-transport", "paused");
});

test("keeps transport stopped when audio activation fails", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: function UnavailableAudioContext() {
        throw new Error("Audio unavailable for deterministic test.");
      },
    });
  });
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio unavailable");
  await expect(page.locator("#app")).toHaveAttribute("data-transport", "stopped");
  await expect(page.getByRole("button", { name: "Play" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Record" })).toBeDisabled();
});

test("pauses position animation while the document is hidden", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-position-tracking", "active");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#app")).toHaveAttribute("data-position-tracking", "paused");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#app")).toHaveAttribute("data-position-tracking", "active");
});

test("record and tempo controls update transport state", async ({ page }) => {
  const record = page.getByRole("button", { name: "Record" });
  await expect(record).toHaveAttribute("aria-pressed", "false");
  await record.click();
  await expect(record).toHaveAttribute("aria-pressed", "true");

  const tempo = page.locator("[data-field='tempo']");
  await tempo.fill("146");
  await tempo.press("Enter");
  await tempo.blur();
  await expect(tempo).toHaveValue("146");
});

test("reschedules live audio only when tempo changes", async ({ page }) => {
  await page.addInitScript(() => {
    const port = MessagePort.prototype as unknown as {
      postMessage: (...arguments_: unknown[]) => void;
    };
    const original = port.postMessage;
    const counter = { clears: 0 };
    (window as unknown as { __pulseScheduleCounter: typeof counter }).__pulseScheduleCounter = counter;
    port.postMessage = function (...arguments_: unknown[]): void {
      const message = arguments_[0];
      if (
        typeof message === "object" &&
        message !== null &&
        "kind" in message &&
        message.kind === "clear-scheduled-events"
      ) {
        counter.clears += 1;
      }
      Reflect.apply(original, this, arguments_);
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  const clearCount = await page.evaluate(() =>
    (window as unknown as { __pulseScheduleCounter: { clears: number } })
      .__pulseScheduleCounter.clears
  );

  await page.locator("pulse-rack-module").first().locator("pulse-pattern-strip button").first().press("Space");
  await page.waitForTimeout(100);
  expect(await page.evaluate(() =>
    (window as unknown as { __pulseScheduleCounter: { clears: number } })
      .__pulseScheduleCounter.clears
  )).toBe(clearCount);

  const tempo = page.locator("[data-field='tempo']");
  await tempo.fill("146");
  await tempo.press("Enter");
  await expect.poll(async () => page.evaluate(() =>
    (window as unknown as { __pulseScheduleCounter: { clears: number } })
      .__pulseScheduleCounter.clears
  )).toBe(clearCount + 1);
});

for (const viewport of [
  { width: 1536, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test(`keeps the rack usable at ${String(viewport.width)} by ${String(viewport.height)}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await expect(page.locator(".pulse-shell")).toBeVisible();
    await expect(page.locator("pulse-unsupported-size")).toBeHidden();
    const rack = await page.locator("pulse-rack").boundingBox();
    expect(rack?.width).toBeGreaterThan(900);
    expect(rack?.height).toBeGreaterThan(250);
  });
}

test("shows the unsupported-size notice below the editing boundary", async ({ page }) => {
  await page.setViewportSize({ width: 1279, height: 719 });
  await expect(page.locator(".pulse-shell")).toBeHidden();
  await expect(page.locator("pulse-unsupported-size")).toBeVisible();
  await expect(page.getByRole("heading", { name: "More space is required" })).toBeVisible();
});
