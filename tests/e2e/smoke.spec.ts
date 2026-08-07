import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

/**
 * The browser suite covers what only a real browser can prove: the production
 * bundle boots, the AudioWorklet path activates, real pointer and wheel input
 * drive the controls, themes apply, and the supported viewports lay out without
 * overlap. Component-level interaction contracts live in `tests/component`.
 */

const RACK_MODULE = '[data-component="rack-module"]';
/** Loaded faceplates only. Empty slots share the hook but carry `data-label="Empty"`. */
const LOADED_RACK_MODULE = `${RACK_MODULE}:not([data-label="Empty"])`;
const KNOB = '[data-component="knob"]';

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function startPlayback(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^play$/i }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
}

/**
 * Specification 005 section 9.1: eight slots, the six approved instruments in
 * rack order, and the last two empty.
 */
const SEEDED_RACK = [
  "Silver Serpent",
  "Tin Soldier",
  "Soft Thunder",
  "Twin Engine",
  "Gray Ghost",
  "Dusty Mosaic",
  "Empty",
  "Empty",
] as const;

/** The first empty slot in the seeded rack. */
const FIRST_EMPTY_SLOT = SEEDED_RACK.indexOf("Empty");

test("boots the production shell with the seeded rack", async ({ page }) => {
  await expect(page).toHaveTitle("PULSEBOX");
  await expect(page.locator('[data-component="transport-bar"]')).toBeVisible();
  // Every slot keeps a position: six loaded faceplates and two empty ones.
  await expect(page.locator(RACK_MODULE)).toHaveCount(SEEDED_RACK.length);
  await expect(page.locator(LOADED_RACK_MODULE)).toHaveCount(FIRST_EMPTY_SLOT);
  for (const [index, label] of SEEDED_RACK.entries()) {
    await expect(page.locator(RACK_MODULE).nth(index)).toHaveAttribute("data-label", label);
  }
});

test("adds an instrument into an empty slot", async ({ page }) => {
  await page.getByRole("button", { name: "Add Silver Serpent to the first empty rack slot" }).click();
  await expect(page.locator(`${RACK_MODULE}[data-label='Silver Serpent']`)).toHaveCount(2);
  // Faceplates carry no playback-position output; the Piano Roll and transport
  // clock own that feedback.
  await expect(page.locator('[data-component="activity-indicator"]')).toHaveCount(0);
});

test("adds an instrument by double-clicking its complete module card", async ({ page }) => {
  const card = page
    .locator('[data-component="module-browser"] article')
    .filter({ hasText: "Dusty Mosaic" });
  await card.dblclick();
  await expect(page.locator(`${RACK_MODULE}[data-label='Dusty Mosaic']`)).toHaveCount(2);
});

test("drags a complete module card into a specific empty slot", async ({ page }) => {
  const card = page
    .locator('[data-component="module-browser"] article')
    .filter({ hasText: "Tin Soldier" });
  const target = page.locator('[data-component="rack-overview"] li').nth(FIRST_EMPTY_SLOT);
  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (cardBox === null || targetBox === null) throw new Error("Expected visible drag geometry.");

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  await expect(page.locator(`${RACK_MODULE}[data-label='Tin Soldier']`)).toHaveCount(2);
});

test("duplicates a Tin Soldier module without changing its plugin type", async ({ page }) => {
  // Section 13.2: Duplicate lives in the loaded module's context menu.
  const drumline = page.locator(`${RACK_MODULE}[data-label='Tin Soldier']`).first();
  await drumline.getByRole("button", { name: "Tin Soldier module menu" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator(`${RACK_MODULE}[data-label='Tin Soldier']`)).toHaveCount(2);
  await expect(page.locator(`${RACK_MODULE}[data-label='Silver Serpent']`)).toHaveCount(1);
});

test("Stop is idempotent after Play", async ({ page }) => {
  await startPlayback(page);

  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: /^play$/i })).toBeVisible();
});

/**
 * This is the fast one-run guard for the first-sound bound. The five-run
 * persistent-profile release procedure and its environment record live in
 * `first-sound-release.spec.ts`.
 */
test("first Play reaches a non-silent master frame within three seconds", async ({ page }) => {
  await page.getByRole("button", { name: /^play$/i }).click();
  const meter = page.getByRole("meter", { name: "Master meter channel one" });
  await expect
    .poll(async () => Number((await meter.getAttribute("aria-valuenow")) ?? "0"), {
      timeout: 3_000,
    })
    .toBeGreaterThan(0);
  // The master dB readout follows the same analysis branch.
  await expect(page.getByLabel("Master level in decibels")).not.toHaveText(/-inf/);
});

test("a step seek sets the start marker and Stop returns to it", async ({ page }) => {
  await page.getByRole("button", { name: "Set the start marker to step 5" }).click();
  const position = page.locator('[data-field="position"]');
  await expect(position).toContainText("001 : 2 : 000");

  await startPlayback(page);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(position).toContainText("001 : 2 : 000");
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
  const audition = page.getByRole("button", { name: "Silver Serpent audition" });

  // Activating audio and building the seeded rack takes longer than the default
  // expect timeout allows.
  const auditionPoll = { timeout: 20_000 };

  // Start the audio graph first and let the seeded rack finish allocating its
  // own worklet nodes. Otherwise those startup nodes satisfy the "a node was
  // created" poll below, the press is released while the context is still
  // activating — which correctly allocates nothing — and the test measures
  // rack startup rather than the audition.
  await startPlayback(page);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect
    .poll(async () => (await readProbe()).created, auditionPoll)
    .toBeGreaterThanOrEqual(SEEDED_RACK.filter((label) => label !== "Empty").length);

  const beforePress = (await readProbe()).created;
  await audition.hover();
  await page.mouse.down();
  await expect(audition).toHaveAttribute("data-active", "true");
  await expect
    .poll(async () => (await readProbe()).created, auditionPoll)
    .toBeGreaterThan(beforePress);
  await page.mouse.up();
  await expect(audition).toHaveAttribute("data-active", "false");
  await expect
    .poll(async () => (await readProbe()).disconnected, auditionPoll)
    .toBeGreaterThanOrEqual(1);

  const beforeKey = (await readProbe()).created;
  await audition.focus();
  await page.keyboard.down("Enter");
  await expect(audition).toHaveAttribute("data-active", "true");
  await expect
    .poll(async () => (await readProbe()).created, auditionPoll)
    .toBeGreaterThan(beforeKey);
  await page.keyboard.up("Enter");
  await expect(audition).toHaveAttribute("data-active", "false");
  await expect
    .poll(async () => (await readProbe()).disconnected, auditionPoll)
    .toBeGreaterThanOrEqual(2);
});

test("the playhead advances from the audio clock", async ({ page }) => {
  await startPlayback(page);
  const position = page.locator('[data-field="position"]');
  const first = await position.textContent();
  await expect.poll(async () => position.textContent()).not.toBe(first);
});

test("a pattern rename survives a transport cycle", async ({ page }) => {
  await page.getByRole("combobox", { name: "Selected Pattern" }).selectOption({ label: "Intro" });
  const rename = page.getByRole("textbox", { name: "Pattern name" });
  await rename.fill("Drive");
  await rename.press("Enter");

  await startPlayback(page);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(rename).toHaveValue("Drive");
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
  // Section 13.2: removal starts from `Delete module` in the context menu.
  const plate = page.locator(RACK_MODULE).first();
  await plate.getByRole("button", { name: "Silver Serpent module menu" }).click();
  await page.getByRole("menuitem", { name: "Delete module" }).click();
  const notice = page.locator(".undo-notice");
  await expect(notice).toContainText("Removed Silver Serpent.");
  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(`${RACK_MODULE}[data-label='Silver Serpent']`)).toHaveCount(1);
});

test("Space toggles playback and Escape stops it", async ({ page }) => {
  await page.locator("body").press("Space");
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await page.locator("body").press("Escape");
  await expect(page.getByRole("button", { name: /^play$/i })).toBeVisible();
});

test("the rack theme and high contrast apply and keep operational targets at least 24 pixels", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rack");

  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.locator('[data-component="settings-page"]');
  await expect(settings).toBeVisible();

  await settings.getByRole("checkbox", { name: "High contrast" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rack");

  const targets = page.locator('[data-component="transport-bar"] button');
  const count = await targets.count();
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox();
    if (box === null) continue;
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
});

test("high contrast repaints the rack controls, not only the page behind them", async ({
  page,
}) => {
  /**
   * The overlay flips palette tokens, so a control that consumes a token no
   * theme declares keeps its literal fallback and stays dark on the black
   * overlay. Asserting the attribute or the target size cannot see that: the
   * control has to be sampled before and after, and its color has to change.
   */
  const sample = async () =>
    page.evaluate(() => {
      const read = (selector: string, property: string): string => {
        const element = document.querySelector(selector);
        return element === null ? "" : getComputedStyle(element).getPropertyValue(property).trim();
      };
      const readPseudo = (selector: string, pseudo: string, property: string): string => {
        const element = document.querySelector(selector);
        return element === null
          ? ""
          : getComputedStyle(element, pseudo).getPropertyValue(property).trim();
      };
      return {
        page: getComputedStyle(document.body).backgroundColor,
        appBackground: read('[data-component="pulse-app"]', "background-image"),
        knobCap: read('[data-component="knob"] circle', "fill"),
        knobEdge: read('[data-component="knob"] circle', "stroke"),
        knobEdgeWidth: read('[data-component="knob"] circle', "stroke-width"),
        knobEdgeOpacity: read('[data-component="knob"] circle', "stroke-opacity"),
        knobShade: read('[data-component="knob"] circle:nth-of-type(2)', "display"),
        knobSkirtBackground: readPseudo(
          '[data-component="knob"] [role="slider"]',
          "::before",
          "background-image",
        ),
        knobSkirtShadow: readPseudo(
          '[data-component="knob"] [role="slider"]',
          "::before",
          "box-shadow",
        ),
        knobValue: read('[data-component="knob"] input', "color"),
        faderSlot: read('[data-component="fader"] [data-part="track"]', "background-color"),
        faderOutline: read('[data-component="fader"] [role="slider"]', "outline-width"),
        pianoNatural: read('[aria-label="C4 piano key audition"]', "background-image"),
        pianoSharp: read('[aria-label="A#3 piano key audition"]', "background-image"),
      };
    });

  const beforeOverlay = await sample();
  const idleMeter = page.locator('[data-component="level-meter"]').first();
  const meterBeforeOverlay = await idleMeter.evaluate((element) =>
    (element as HTMLCanvasElement).toDataURL(),
  );

  await page.getByRole("button", { name: "Settings" }).click();
  await page
    .locator('[data-component="settings-page"]')
    .getByRole("checkbox", { name: "High contrast" })
    .check();
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");

  const afterOverlay = await sample();
  for (const surface of Object.keys(beforeOverlay) as (keyof typeof beforeOverlay)[]) {
    expect(afterOverlay[surface], `${surface} must repaint under high contrast`).not.toBe(
      beforeOverlay[surface],
    );
  }
  // The overlay drives borders to pure white, which is what makes a control
  // edge readable against the black page.
  expect(afterOverlay.knobEdge).toBe("rgb(255, 255, 255)");
  expect(afterOverlay.appBackground).toBe("none");
  expect(afterOverlay.knobEdgeWidth).toBe("2px");
  expect(afterOverlay.knobEdgeOpacity).toBe("1");
  expect(afterOverlay.knobShade).toBe("none");
  expect(afterOverlay.knobSkirtBackground).toBe("none");
  expect(afterOverlay.knobSkirtShadow).toBe("rgb(255, 255, 255) 0px 0px 0px 2px inset");
  expect(afterOverlay.faderOutline).toBe("2px");
  expect(afterOverlay.pianoNatural).toContain("rgb(255, 255, 255)");
  expect(afterOverlay.pianoSharp).toBe("none");
  await expect
    .poll(() => idleMeter.evaluate((element) => (element as HTMLCanvasElement).toDataURL()))
    .not.toBe(meterBeforeOverlay);
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

test("the high-contrast choice persists across a reload and creates no undo entry", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page
    .locator('[data-component="settings-page"]')
    .getByRole("checkbox", { name: "High contrast" })
    .check();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");
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
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveCount(0);
  await expect(page.getByRole("slider")).toHaveCount(0);
});

test("a pattern rename is autosaved and restored after a reload", async ({ page }) => {
  await page.getByRole("combobox", { name: "Selected Pattern" }).selectOption({ label: "Intro" });
  const rename = page.getByRole("textbox", { name: "Pattern name" });
  await rename.fill("Autosaved Pattern");
  await rename.press("Enter");

  // Autosave is debounced, so the reload waits for the snapshot to land.
  await page.waitForTimeout(1_500);
  await page.reload();

  await expect(page.getByRole("textbox", { name: "Pattern name" })).toHaveValue(
    "Autosaved Pattern",
  );
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

test("Tin Soldier keeps producing audio with Tone driven to its maximum", async ({ page }) => {
  await startPlayback(page);

  // Tone drives the mix-bus filter. A conditionally stable topology diverges
  // above its cutoff limit and latches the voice silent for the rest of the
  // session, which the unit fixtures cannot see because they never render
  // through a live worklet.
  const drumline = page.locator(`${RACK_MODULE}[data-label='Tin Soldier']`).first();
  const tone = drumline.locator(`${KNOB}[data-parameter='tone'] [role='slider']`);
  await tone.focus();
  // End drives the control to its maximum in one gesture. Stepping there with
  // 120 separate key presses costs more wall clock than the whole test budget
  // and proves nothing extra: the filter either survives the ceiling or it
  // does not.
  await tone.press("End");
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
  // PageDown moves by the large step, so a few presses cover the same travel
  // the previous 40 arrow presses did.
  for (let step = 0; step < 4; step += 1) await tone.press("PageDown");
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
  const pattern = page.getByRole("combobox", { name: "Selected Pattern" });
  await pattern.selectOption({ label: "Verse" });
  const rename = page.getByRole("textbox", { name: "Pattern name" });
  await rename.fill("Breakbeat");
  await rename.press("Enter");

  await pattern.selectOption({ label: "Intro" });
  await expect(pattern).toHaveValue("0");
  await expect(pattern.getByRole("option", { name: "Breakbeat" })).toBeAttached();

  await page.waitForTimeout(1_500);
  await page.reload();

  const reloaded = page.getByRole("combobox", { name: "Selected Pattern", exact: true });
  await expect(reloaded).toHaveValue("0");
  await expect(reloaded.getByRole("option", { name: "Breakbeat" })).toBeAttached();
});

test("the mixer mutes a channel without stopping the transport", async ({ page }) => {
  await startPlayback(page);
  await page.getByRole("tab", { name: "Mixer" }).click();

  // The rack faceplate carries the same channel mute under its own name, so
  // address the mixer strip's key exactly.
  const mute = page.getByRole("button", { name: "Mute Silver Serpent", exact: true });
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");

  // Muting is a gain ramp, so playback keeps running.
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
});

test("a mixer fader moves by keyboard and persists across a reload", async ({ page }) => {
  await page.getByRole("tab", { name: "Mixer" }).click();
  const fader = page.getByRole("slider", { name: "Silver Serpent level" });
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
      await page.getByRole("slider", { name: "Silver Serpent level" }).getAttribute("aria-valuenow"),
    ),
  ).toBeCloseTo(after, 2);
});

/**
 * The mixer well is shorter than the fader's pointer-resolution floor. Mapping
 * drag one-to-one onto that short travel would make a small drag cross most of
 * a 60 dB range, so the floor has to hold whatever height the layout grants.
 */
test("a short mixer well keeps the fader's pointer resolution", async ({ page }) => {
  await page.getByRole("tab", { name: "Mixer" }).click();
  const fader = page.getByRole("slider", { name: "Silver Serpent level" });
  const surface = await fader.boundingBox();
  if (surface === null) throw new Error("Expected the channel fader to be laid out.");
  // The repair only matters while the well is shorter than the 120px floor.
  expect(surface.height).toBeLessThan(120);

  const startValue = Number(await fader.getAttribute("aria-valuenow"));
  const travel = 30;
  await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    surface.x + surface.width / 2,
    surface.y + surface.height / 2 - travel,
    { steps: 10 },
  );
  const moved = Number(await fader.getAttribute("aria-valuenow"));
  await page.mouse.up();

  // 30 pixels over a 0-to-1 range at the 120px floor is 0.25, not the 0.37 a
  // raw one-to-one mapping onto the measured well would produce.
  expect(moved - startValue).toBeCloseTo(travel / 120, 2);
});

test("song mode chains Patterns and reports the chain length", async ({ page }) => {
  const playlist = page.locator('[data-component="playlist-summary"]');
  // Decision D92: the default project ships the five-entry section 9.1 chain.
  await expect(playlist.locator("ol > li")).toHaveCount(5);
  await playlist.getByRole("button", { name: "Add selected Pattern" }).click();
  await playlist.getByRole("button", { name: "Add selected Pattern" }).click();
  await expect(playlist.locator("ol > li")).toHaveCount(7);

  const songMode = page.getByRole("button", { name: "Song" });
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
  await page
    .locator('[data-component="workspace-bar"]')
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(projectMenu.getByRole("status")).toContainText("Saved");

  await tempo.fill("100");
  await tempo.press("Enter");
  await expect(tempo).toHaveValue("100");

  await projectMenu.getByRole("button", { name: /Project selector/ }).click();
  await page.getByRole("list", { name: "Stored projects" }).getByRole("button").first().click();

  await expect(page.locator('[data-field="tempo"]')).toHaveValue("144");
});

test("creating a starter saves the initial project and copies the default project", async ({
  page,
}) => {
  const projectMenu = page.locator('[data-component="project-menu"]');
  const selector = projectMenu.getByRole("button", { name: /Project selector/ });
  const tempo = page.locator('[data-field="tempo"]');

  // Section 9.2: the template copies the section 9.1 default project, so both
  // carry the same name. Move the working project off its default tempo, so a
  // fresh copy is provable rather than indistinguishable from the current one.
  await tempo.fill("101");
  await tempo.press("Enter");
  await expect(tempo).toHaveValue("101");

  await selector.click();
  await projectMenu.getByRole("button", { name: "New: Neon Basement" }).click();
  await expect(selector).toHaveAccessibleName(/Current project: Neon Basement/);

  // The new project is the section 9.1 content: 128 BPM, eight slots with six
  // loaded modules and the last two empty.
  await expect(page.locator('[data-field="tempo"]')).toHaveValue("128");
  await expect(page.locator(RACK_MODULE)).toHaveCount(8);
  await expect(page.locator(`${RACK_MODULE}[data-label="Empty"]`)).toHaveCount(2);

  // Both projects are stored: the fresh copy saves at creation so the Save
  // control never reports phantom unsaved edits. Newest first, the list holds
  // the 128 BPM copy and then the edited 101 BPM original.
  await selector.click();
  const storedProjects = page.getByRole("list", { name: "Stored projects" });
  await expect(storedProjects.getByRole("button", { name: /Neon Basement/ })).toHaveCount(2);
  await storedProjects.getByRole("button", { name: /Neon Basement/ }).nth(1).click();
  await expect(page.locator('[data-field="tempo"]')).toHaveValue("101");
});

test("portable export produces a ZIP that imports through the validated archive path", async ({
  page,
}) => {
  const projectMenu = page.locator('[data-component="project-menu"]');
  await projectMenu.getByRole("button", { name: /Project selector/ }).click();
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

  await projectMenu.getByRole("button", { name: /Project selector/ }).click();
  await expect(
    page.getByRole("list", { name: "Stored projects" }).getByRole("button").first(),
  ).toContainText("Neon Basement");
});
