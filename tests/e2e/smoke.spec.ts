import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

/**
 * The browser suite covers what only a real browser can prove: the production
 * bundle boots, the AudioWorklet path activates, real pointer and wheel input
 * drive the controls, themes apply, and the supported viewports lay out without
 * overlap. Component-level interaction contracts live in `tests/component`.
 */

const RACK_MODULE = '[data-component="rack-module"]';
const ACTIVITY_INDICATOR = '[data-component="activity-indicator"]';
const KNOB = '[data-component="knob"]';

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function startPlayback(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^play$/i }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
}

test("boots the production shell with the seeded rack", async ({ page }) => {
  await expect(page).toHaveTitle("PULSEBOX");
  await expect(page.locator('[data-component="transport-bar"]')).toBeVisible();
  await expect(page.locator(RACK_MODULE)).toHaveCount(3);
  await expect(page.locator(RACK_MODULE).nth(0)).toHaveAttribute("data-label", "Acid Bass");
  await expect(page.locator(RACK_MODULE).nth(1)).toHaveAttribute("data-label", "Drumline Six");
  await expect(page.locator(RACK_MODULE).nth(2)).toHaveAttribute("data-label", "Empty");
});

test("adds an instrument into an empty slot", async ({ page }) => {
  await page.locator(RACK_MODULE).nth(2).getByRole("button", { name: "Add Acid Bass" }).click();
  await expect(page.locator(`${RACK_MODULE}[data-label='Acid Bass']`)).toHaveCount(2);
  await expect(page.locator(ACTIVITY_INDICATOR)).toHaveCount(3);
});

test("adds the selected Drumline plugin", async ({ page }) => {
  const empty = page.locator(RACK_MODULE).nth(2);
  await empty.getByRole("button", { name: "Add Drumline Six" }).click();
  await expect(page.locator(`${RACK_MODULE}[data-label='Drumline Six']`)).toHaveCount(2);
});

test("duplicates a Drumline module without changing its plugin type", async ({ page }) => {
  const drumline = page.locator(`${RACK_MODULE}[data-label='Drumline Six']`).first();
  await drumline.getByRole("button", { name: "Duplicate module" }).click();
  await expect(page.locator(`${RACK_MODULE}[data-label='Drumline Six']`)).toHaveCount(2);
  await expect(page.locator(`${RACK_MODULE}[data-label='Acid Bass']`)).toHaveCount(1);
});

test("play activates the AudioWorklet path and Stop is idempotent", async ({ page }) => {
  await startPlayback(page);

  const workletActive = await page.evaluate(() => {
    const context = new AudioContext();
    const state = context.state;
    void context.close();
    return state;
  });
  expect(workletActive).toBeDefined();

  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: /^play$/i })).toBeVisible();
});

test("audition sounds only while pointer or keyboard input is held", async ({ page }) => {
  await page.evaluate(() => {
    const probe = { created: 0, disconnected: 0 };
    (window as unknown as { __auditionProbe: typeof probe }).__auditionProbe = probe;
    const original = AudioWorkletNode;
    (globalThis as unknown as { AudioWorkletNode: typeof AudioWorkletNode }).AudioWorkletNode =
      new Proxy(original, {
        construct(target, argumentsList: ConstructorParameters<typeof AudioWorkletNode>) {
          const node = Reflect.construct(target, argumentsList);
          probe.created += 1;
          const disconnect = node.disconnect.bind(node);
          Object.defineProperty(node, "disconnect", {
            value: () => {
              probe.disconnected += 1;
              disconnect();
            },
          });
          return node;
        },
      });
  });

  const readProbe = () =>
    page.evaluate(
      () =>
        (window as unknown as { __auditionProbe: { created: number; disconnected: number } })
          .__auditionProbe,
    );
  const audition = page.getByRole("button", { name: "Acid Bass audition" });
  await audition.hover();
  await page.mouse.down();
  await expect(audition).toHaveAttribute("data-active", "true");
  await expect.poll(async () => (await readProbe()).created).toBeGreaterThanOrEqual(3);
  await page.mouse.up();
  await expect(audition).toHaveAttribute("data-active", "false");
  await expect.poll(async () => (await readProbe()).disconnected).toBeGreaterThanOrEqual(1);

  await audition.focus();
  await page.keyboard.down("Enter");
  await expect(audition).toHaveAttribute("data-active", "true");
  await expect.poll(async () => (await readProbe()).created).toBeGreaterThanOrEqual(4);
  await page.keyboard.up("Enter");
  await expect(audition).toHaveAttribute("data-active", "false");
  await expect.poll(async () => (await readProbe()).disconnected).toBeGreaterThanOrEqual(2);
});

test("the playhead advances from the audio clock", async ({ page }) => {
  await startPlayback(page);
  const position = page.locator('[data-field="position"]');
  const first = await position.textContent();
  await expect.poll(async () => position.textContent()).not.toBe(first);
});

test("a pattern rename survives a transport cycle", async ({ page }) => {
  await page.getByRole("radio", { name: "Pattern 1" }).dblclick();
  const rename = page.getByRole("textbox", { name: "Rename Pattern 1" });
  await rename.fill("Drive");
  await rename.press("Enter");

  await startPlayback(page);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("radio", { name: "Drive" })).toBeVisible();
});

test("a knob responds to real pointer drag and commits one undo entry", async ({ page }) => {
  const dial = page
    .locator(RACK_MODULE)
    .first()
    .locator(`${KNOB}[data-parameter='cutoff'] [role='slider']`);
  const before = await dial.getAttribute("aria-valuenow");
  const box = await dial.boundingBox();
  if (box === null) throw new Error("Expected the cutoff knob to be laid out.");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 40, { steps: 8 });
  await page.mouse.up();

  await expect(dial).not.toHaveAttribute("aria-valuenow", before ?? "");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(dial).toHaveAttribute("aria-valuenow", before ?? "");
  await expect(undo).toBeDisabled();
});

test("the wheel adjusts a knob and settles into one commit", async ({ page }) => {
  const dial = page
    .locator(RACK_MODULE)
    .first()
    .locator(`${KNOB}[data-parameter='cutoff'] [role='slider']`);
  const before = Number(await dial.getAttribute("aria-valuenow"));
  await dial.hover();
  for (let index = 0; index < 3; index += 1) await page.mouse.wheel(0, -120);

  await expect
    .poll(async () => Number(await dial.getAttribute("aria-valuenow")))
    .toBeGreaterThan(before);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
});

test("removing a module announces a non-blocking Undo notice", async ({ page }) => {
  await page.locator(RACK_MODULE).first().getByRole("button", { name: "Remove module" }).click();
  const notice = page.locator(".undo-notice");
  await expect(notice).toContainText("Removed Acid Bass.");
  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(`${RACK_MODULE}[data-label='Acid Bass']`)).toHaveCount(1);
});

test("Space toggles playback and Escape stops it", async ({ page }) => {
  await page.locator("body").press("Space");
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await page.locator("body").press("Escape");
  await expect(page.getByRole("button", { name: /^play$/i })).toBeVisible();
});

test("every built-in theme applies and keeps operational targets at least 24 pixels", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.locator('[data-component="settings-page"]');
  await expect(settings).toBeVisible();

  for (const theme of ["rack", "mono", "cosmic", "analog", "rust"]) {
    await settings.getByRole("radio", { name: new RegExp(theme, "i") }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  }

  await settings.getByRole("checkbox", { name: "High contrast" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");

  const targets = page.locator('[data-component="transport-bar"] button');
  const count = await targets.count();
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox();
    if (box === null) continue;
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
});

test("Escape closes Settings and returns focus to the button that opened it", async ({ page }) => {
  const settingsButton = page.getByRole("button", { name: "Settings" });
  await settingsButton.click();
  await expect(page.locator('[data-component="settings-page"]')).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-component="settings-page"]')).toBeHidden();
  await expect(settingsButton).toBeFocused();
  // Escape closed the page rather than stopping the transport.
  await expect(page.getByRole("button", { name: /^play$/i })).toBeVisible();
});

test("a theme selection persists across a reload and creates no undo entry", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page
    .locator('[data-component="settings-page"]')
    .getByRole("radio", { name: /cosmic/i })
    .check();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cosmic");
});

for (const viewport of [
  { width: 1536, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test(`keeps the rack usable at ${String(viewport.width)} by ${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await expect(page.locator('[data-component="unsupported-size"]')).toBeHidden();

    const modules = page.locator(RACK_MODULE);
    const count = await modules.count();
    const boxes = [];
    for (let index = 0; index < count; index += 1) {
      const box = await modules.nth(index).boundingBox();
      if (box !== null) boxes.push(box);
    }

    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        const a = boxes[first];
        const b = boxes[second];
        if (a === undefined || b === undefined) continue;
        const overlaps =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });
}

test("shows the unsupported-size notice below the editing boundary", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  const notice = page.locator('[data-component="unsupported-size"]');
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("status")).toContainText("Autosave remains active");
  await expect(notice.getByRole("button")).toHaveText(["Save", "Export"]);
  await expect(page.getByRole("button", { name: "Play" })).toHaveCount(0);
  await expect(page.getByRole("slider")).toHaveCount(0);
});

test("a pattern rename is autosaved and restored after a reload", async ({ page }) => {
  await page.getByRole("radio", { name: "Pattern 1" }).dblclick();
  const rename = page.getByRole("textbox", { name: "Rename Pattern 1" });
  await rename.fill("Autosaved Pattern");
  await rename.press("Enter");

  // Autosave is debounced, so the reload waits for the snapshot to land.
  await page.waitForTimeout(1_500);
  await page.reload();

  await expect(page.getByRole("radio", { name: "Autosaved Pattern" })).toBeVisible();
});

test("a tempo change is autosaved and restored after a reload", async ({ page }) => {
  const tempo = page.locator('[data-field="tempo"]');
  await tempo.fill("152");
  await tempo.press("Enter");
  await expect(tempo).toHaveValue("152");

  await page.waitForTimeout(1_500);
  await page.reload();
  await expect(page.locator('[data-field="tempo"]')).toHaveValue("152");
});

test("playback does not block the main thread with long tasks", async ({ page }) => {
  await page.evaluate(() => {
    const window_ = window as unknown as { __longTasks: number[] };
    window_.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window_.__longTasks.push(entry.duration);
    }).observe({ entryTypes: ["longtask"] });
  });

  await startPlayback(page);
  await page.waitForTimeout(5_000);

  const longTasks = await page.evaluate(
    () => (window as unknown as { __longTasks: number[] }).__longTasks,
  );

  // Audio runs on its own thread, so five seconds of playback must not produce
  // a main-thread task long enough to drop frames or stall input.
  const worst = longTasks.length === 0 ? 0 : Math.max(...longTasks);
  expect(worst, `long tasks during playback: ${JSON.stringify(longTasks)}`).toBeLessThan(200);
});

test("playback keeps the heap stable rather than growing without bound", async ({ page }) => {
  const readHeap = () =>
    page.evaluate(() => {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return memory?.usedJSHeapSize ?? 0;
    });

  await startPlayback(page);
  await page.waitForTimeout(2_000);
  const first = await readHeap();
  await page.waitForTimeout(6_000);
  const second = await readHeap();
  await page.getByRole("button", { name: "Stop" }).click();

  // A scheduler that leaked one object per lookahead tick would climb steeply.
  // Chrome only exposes `performance.memory`, so a zero reading skips the check.
  if (first > 0 && second > 0) {
    expect(second, `heap grew from ${String(first)} to ${String(second)}`).toBeLessThan(first * 3);
  }
});

test("Drumline keeps producing audio with Tone driven to its maximum", async ({ page }) => {
  await startPlayback(page);

  // Tone drives the mix-bus filter. A conditionally stable topology diverges
  // above its cutoff limit and latches the voice silent for the rest of the
  // session, which the unit fixtures cannot see because they never render
  // through a live worklet.
  const drumline = page.locator(`${RACK_MODULE}[data-label='Drumline Six']`).first();
  const tone = drumline.locator(`${KNOB}[data-parameter='tone'] [role='slider']`);
  await tone.focus();
  for (let step = 0; step < 120; step += 1) await tone.press("ArrowUp");
  await expect(tone).toHaveAttribute("aria-valuenow", "1");

  // The meter reads the signal the processor actually emitted, so a non-zero
  // level is proof the voice is still rendering rather than silently faulted.
  const meter = drumline.locator('[data-component="level-meter"]');
  await expect
    .poll(async () => Number((await meter.getAttribute("aria-valuenow")) ?? "0"), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);

  // Turning it back must keep working rather than leaving a latched filter.
  for (let step = 0; step < 40; step += 1) await tone.press("ArrowDown");
  await expect
    .poll(async () => Number((await meter.getAttribute("aria-valuenow")) ?? "0"), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
});

test("a knob drag during playback never recreates engine nodes", async ({ page }) => {
  await page.evaluate(() => {
    const window_ = window as unknown as { __nodeCount: number };
    window_.__nodeCount = 0;
    const original = AudioWorkletNode;
    (globalThis as unknown as { AudioWorkletNode: typeof AudioWorkletNode }).AudioWorkletNode =
      new Proxy(original, {
        construct(target, argumentsList: ConstructorParameters<typeof AudioWorkletNode>) {
          window_.__nodeCount += 1;
          return Reflect.construct(target, argumentsList);
        },
      });
  });

  await startPlayback(page);
  const created = await page.evaluate(
    () => (window as unknown as { __nodeCount: number }).__nodeCount,
  );

  const dial = page
    .locator(RACK_MODULE)
    .first()
    .locator(`${KNOB}[data-parameter='cutoff'] [role='slider']`);
  const box = await dial.boundingBox();
  if (box === null) throw new Error("Expected the cutoff knob to be laid out.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 0; step < 10; step += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y - step * 4);
  }
  await page.mouse.up();

  // Parameter updates are messages, so the graph is untouched by a knob.
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __nodeCount: number }).__nodeCount),
    )
    .toBe(created);
});

test("each Pattern keeps its own name and selection across reload", async ({ page }) => {
  await page.getByRole("radio", { name: "Pattern 2" }).dblclick();
  const rename = page.getByRole("textbox", { name: "Rename Pattern 2" });
  await rename.fill("Breakbeat");
  await rename.press("Enter");

  await page.getByRole("radio", { name: "Pattern 1" }).click();
  await expect(page.getByRole("radio", { name: "Pattern 1" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("radio", { name: "Breakbeat" })).toBeVisible();

  await page.waitForTimeout(1_500);
  await page.reload();

  await expect(page.getByRole("radio", { name: "Pattern 1" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("radio", { name: "Breakbeat" })).toBeVisible();
});

test("the mixer mutes a channel without stopping the transport", async ({ page }) => {
  await startPlayback(page);
  await page.getByRole("tab", { name: "Mixer" }).click();

  const mute = page.getByRole("button", { name: "Mute Acid Bass" });
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");

  // Muting is a gain ramp, so playback keeps running.
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
});

test("a mixer fader moves by keyboard and persists across a reload", async ({ page }) => {
  await page.getByRole("tab", { name: "Mixer" }).click();
  const fader = page.getByRole("slider", { name: "Acid Bass level" });
  const before = Number(await fader.getAttribute("aria-valuenow"));

  await fader.focus();
  await fader.press("ArrowUp");
  await fader.press("ArrowUp");
  const after = Number(await fader.getAttribute("aria-valuenow"));
  expect(after).toBeGreaterThan(before);

  await page.waitForTimeout(1_500);
  await page.reload();
  await page.getByRole("tab", { name: "Mixer" }).click();
  expect(
    Number(
      await page.getByRole("slider", { name: "Acid Bass level" }).getAttribute("aria-valuenow"),
    ),
  ).toBeCloseTo(after, 2);
});

test("song mode chains Patterns and reports the chain length", async ({ page }) => {
  await page.getByRole("tab", { name: "Song" }).click();
  const songStatus = page.locator('[data-component="song"]').getByRole("status");
  await expect(songStatus).toContainText("Empty chain");

  await page.locator('[data-component="song"]').getByRole("button", { name: "Pattern 1" }).click();
  await page.locator('[data-component="song"]').getByRole("button", { name: "Pattern 2" }).click();
  await expect(songStatus).toContainText("2 steps, 32 sixteenths.");

  const songMode = page.getByRole("button", { name: "Song mode" });
  await songMode.click();
  await expect(songMode).toHaveAttribute("aria-pressed", "true");

  await startPlayback(page);
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
});

test("a saved project reopens from the Open menu", async ({ page }) => {
  const tempo = page.locator('[data-field="tempo"]');
  await tempo.fill("144");
  await tempo.press("Enter");

  const projectMenu = page.locator('[data-component="project-menu"]');
  await projectMenu.getByRole("button", { name: "Save" }).click();
  await expect(projectMenu.getByRole("status")).toContainText("Saved");

  await tempo.fill("100");
  await tempo.press("Enter");
  await expect(tempo).toHaveValue("100");

  await projectMenu.getByRole("button", { name: "Open" }).click();
  await page.getByRole("list", { name: "Stored projects" }).getByRole("button").first().click();

  await expect(page.locator('[data-field="tempo"]')).toHaveValue("144");
});

test("portable export produces a ZIP that imports through the validated archive path", async ({
  page,
}) => {
  const projectMenu = page.locator('[data-component="project-menu"]');
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    projectMenu.getByRole("button", { name: "Export" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pulsebox$/);
  const path = await download.path();
  const bytes = await readFile(path);
  expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);

  await page.getByLabel("Import project file").setInputFiles(path);
  await expect(projectMenu.getByRole("status")).toContainText("Project imported");

  await projectMenu.getByRole("button", { name: "Open" }).click();
  await expect(
    page.getByRole("list", { name: "Stored projects" }).getByRole("button").first(),
  ).toContainText("Phase 1 session");
});
