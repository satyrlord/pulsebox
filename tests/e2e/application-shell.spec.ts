import { createHash } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

interface MeterModeProbe {
  analysers: number;
  contexts: number;
  workletNodes: number;
  contextState: AudioContextState | undefined;
}

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

function targetsDoNotOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function buttonLabelAt(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(
    ([pointX, pointY]) =>
      document.elementFromPoint(pointX, pointY)?.closest("button")?.getAttribute("aria-label") ??
      null,
    [x, y] as const,
  );
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
    expect(footer.height).toBe(26);
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

    const firstStrip = page
      .locator('[data-component="channel-strip"]:not([data-empty="true"])')
      .first();
    const instrumentStripWidths = await page
      .locator('[data-component="channel-strip"]')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
    expect(
      Math.max(...instrumentStripWidths) - Math.min(...instrumentStripWidths),
    ).toBeLessThanOrEqual(1);
    const fader = firstStrip.locator('[data-component="fader"] [role="slider"]');
    const meter = firstStrip.locator('[data-component="level-meter"]');
    const firstStripBox = await box(firstStrip);
    const faderBox = await box(fader);
    const meterBox = await box(meter);
    expect(separated(faderBox, meterBox)).toBe(true);
    expect(faderBox.x).toBeGreaterThanOrEqual(firstStripBox.x);
    expect(meterBox.x + meterBox.width).toBeLessThanOrEqual(firstStripBox.x + firstStripBox.width);
    /*
     * The fader's target is a transparent inset wider than its visible travel
     * line, so declaring 24px is not enough: a clipping ancestor can cut the
     * inset back to the line without changing any computed style. Hit-test both
     * edges to measure what the pointer can actually reach.
     */
    const faderTarget = await fader.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element, "::after");
      const width = Number.parseFloat(style.width);
      const center = Number.parseFloat(style.insetInlineStart);
      const left = rect.x + center - width / 2;
      const middle = rect.y + rect.height / 2;
      const reaches = (x: number) =>
        document.elementFromPoint(x, middle)?.closest('[role="slider"]') === element;
      return {
        width,
        left,
        right: left + width,
        reachesLeftEdge: reaches(left + 1),
        reachesRightEdge: reaches(left + width - 1),
      };
    });
    expect(faderTarget.width).toBeGreaterThanOrEqual(24);
    expect(faderTarget.left).toBeGreaterThanOrEqual(firstStripBox.x);
    expect(faderTarget.right).toBeLessThanOrEqual(meterBox.x);
    expect(faderTarget.reachesLeftEdge).toBe(true);
    expect(faderTarget.reachesRightEdge).toBe(true);

    const mixerButtons = [
      ...(await firstStrip.getByRole("button", { name: /^Open send/ }).all()),
      firstStrip.getByRole("button", { name: /^Solo / }),
      firstStrip.getByRole("button", { name: /^Mute / }),
    ];
    const sendLabels = firstStrip.locator('[data-part="send-label"]');
    await expect(sendLabels).toHaveCount(4);
    for (const sendLabel of await sendLabels.all()) {
      const stacking = await sendLabel.evaluate((element) => {
        const button = element.closest("button");
        if (button === null) throw new Error("The send label has no button owner.");
        return {
          face: Number.parseInt(getComputedStyle(button, "::before").zIndex, 10),
          label: Number.parseInt(getComputedStyle(element).zIndex, 10),
          color: getComputedStyle(element).color,
        };
      });
      expect(stacking.label).toBeGreaterThan(stacking.face);
      expect(stacking.color).not.toBe("rgba(0, 0, 0, 0)");
    }
    const mixerButtonBoxes = [];
    for (const button of mixerButtons) {
      const buttonBox = await box(button);
      const label = await button.getAttribute("aria-label");
      expect(label).not.toBeNull();
      expect(buttonBox.width).toBeGreaterThanOrEqual(24);
      expect(buttonBox.height).toBeGreaterThanOrEqual(24);
      const hitPoints = [
        [buttonBox.x + 1, buttonBox.y + buttonBox.height / 2],
        [buttonBox.x + buttonBox.width - 1, buttonBox.y + buttonBox.height / 2],
        [buttonBox.x + buttonBox.width / 2, buttonBox.y + 1],
        [buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height - 1],
      ] as const;
      for (const [x, y] of hitPoints) expect(await buttonLabelAt(page, x, y)).toBe(label);
      mixerButtonBoxes.push(buttonBox);
    }
    for (const [index, firstBox] of mixerButtonBoxes.entries()) {
      for (const secondBox of mixerButtonBoxes.slice(index + 1)) {
        expect(targetsDoNotOverlap(firstBox, secondBox)).toBe(true);
      }
    }

    await expect
      .poll(() =>
        meter.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          return {
            widthMatches: canvas.width === Math.round(canvas.clientWidth * devicePixelRatio),
            heightMatches: canvas.height === Math.round(canvas.clientHeight * devicePixelRatio),
          };
        }),
      )
      .toEqual({ widthMatches: true, heightMatches: true });

    // Loaded faceplates use one compact horizontal row. Empty rows use less
    // space because the overview and browser own all Add actions.
    const modules = page.locator('[data-component="rack-module"]:not([data-label="Empty"])');
    const emptyModules = page.locator('[data-component="rack-module"][data-label="Empty"]');
    await expect(modules).toHaveCount(6);
    await expect(emptyModules).toHaveCount(2);
    for (const module of await modules.all()) {
      const moduleBox = await box(module);
      expect(moduleBox.height).toBeGreaterThanOrEqual(65);
      expect(moduleBox.height).toBeLessThanOrEqual(75);
      if (viewport.width >= 1440) {
        expect(moduleBox.y + moduleBox.height).toBeLessThanOrEqual(rack.y + rack.height);
      }

      const groupRows = await module.locator('[data-component="module-control-group"]').evaluateAll(
        (groups) =>
          groups.map((group) => ({
            top: group.getBoundingClientRect().top,
            flexWrap: getComputedStyle(group.parentElement as Element).flexWrap,
          })),
      );
      expect(new Set(groupRows.map((group) => Math.round(group.top))).size).toBe(1);
      expect(groupRows.every((group) => group.flexWrap === "nowrap")).toBe(true);

      const outputGap = await module
        .locator('[data-component="module-control-group"][data-group="output"]')
        .evaluate((group) => {
          const row = group.closest('[data-component="module-control-groups"]');
          if (row === null) throw new Error("Expected a module control row.");
          return row.getBoundingClientRect().right - group.getBoundingClientRect().right;
        });
      expect(outputGap).toBeGreaterThanOrEqual(6);
      expect(outputGap).toBeLessThanOrEqual(8);
    }
    for (const emptyModule of await emptyModules.all()) {
      const emptyBox = await box(emptyModule);
      expect(emptyBox.height).toBeGreaterThanOrEqual(37);
      expect(emptyBox.height).toBeLessThanOrEqual(39);
    }

    const inspector = await box(page.locator('[data-component="pattern-inspector"]'));
    const roll = await box(page.locator('[data-component="piano-roll"]'));
    const playlist = await box(page.locator('[data-component="playlist-summary"]'));
    expect(separated(inspector, roll)).toBe(true);
    expect(separated(roll, playlist)).toBe(true);

    const keybed = page.getByRole("group", { name: "Piano keyboard" });
    await expect(keybed.getByRole("button")).toHaveCount(25);
    const naturalKey = keybed.getByRole("button", { name: "C4 piano key audition" });
    const sharpKey = keybed.getByRole("button", { name: "A#3 piano key audition" });
    const naturalBox = await box(naturalKey);
    const sharpBox = await box(sharpKey);
    expect(naturalBox.height).toBeGreaterThanOrEqual(16);
    expect(sharpBox.width).toBeGreaterThanOrEqual(24);
    expect(sharpBox.height).toBeGreaterThanOrEqual(16);
    expect(naturalBox.width).toBeGreaterThan(sharpBox.width);
    expect(sharpBox.width / naturalBox.width).toBeLessThanOrEqual(0.6);
    await expect(naturalKey).toHaveText("C4");
    await expect(keybed.getByRole("button", { name: "B3 piano key audition" })).toHaveText("B3");
    const keyStyles = await Promise.all([
      naturalKey.evaluate((element) => getComputedStyle(element).backgroundImage),
      sharpKey.evaluate((element) => getComputedStyle(element).backgroundImage),
      keybed.evaluate((element) => getComputedStyle(element).backgroundImage),
    ]);
    expect(keyStyles[0]).not.toBe(keyStyles[1]);
    expect(keyStyles[2]).toBe(keyStyles[0]);
    const rollScroll = page.locator('[data-component="piano-roll-scroll"]');
    const scrollState = await rollScroll.evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
    }));
    expect(scrollState.overflowY).toBe("auto");
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);

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

test("keeps ivory backing visible beside short Piano Roll black keys", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const keybed = page.getByRole("group", { name: "Piano keyboard" });
  const naturalKey = keybed.getByRole("button", { name: "C4 piano key audition" });
  const sharpKey = keybed.getByRole("button", { name: "A#3 piano key audition" });
  const naturalBox = await box(naturalKey);
  const sharpBox = await box(sharpKey);

  expect(naturalBox.width).toBe(76);
  expect(sharpBox.width).toBe(44);

  const backing = await page.evaluate(
    ({ x, y }) => {
      const keybedElement = document.querySelector('[aria-label="Piano keyboard"]');
      const naturalElement = document.querySelector('[aria-label="C4 piano key audition"]');
      const hit = document.elementFromPoint(x, y);
      return {
        hitKeybed: hit === keybedElement,
        backingImage: hit === null ? "" : getComputedStyle(hit).backgroundImage,
        naturalImage:
          naturalElement === null ? "" : getComputedStyle(naturalElement).backgroundImage,
      };
    },
    {
      x: sharpBox.x + sharpBox.width + 4,
      y: sharpBox.y + sharpBox.height / 2,
    },
  );

  expect(backing.hitKeybed).toBe(true);
  expect(backing.backingImage).toBe(backing.naturalImage);
});

test("keeps a Piano Roll black key dark when no module is available", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const sharpKey = page
    .getByRole("group", { name: "Piano keyboard" })
    .getByRole("button", { name: "A#3 piano key audition" });
  const activeFace = await sharpKey.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );

  await sharpKey.evaluate((element) => {
    (element as HTMLButtonElement).disabled = true;
  });

  await expect(sharpKey).toBeDisabled();
  expect(activeFace).not.toBe("none");
  await expect
    .poll(() => sharpKey.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toBe(activeFace);
});

test("omits redundant rack and module-browser controls", async ({ page }) => {
  const rack = page.locator('[data-component="rack"]');
  const overview = page.locator('[data-component="rack-overview"]');
  const browser = page.locator('[data-component="module-browser"]');
  const bassMono = rack.locator('[data-label="Silver Serpent"]');

  // Section 2.2: the icon badge is the loaded faceplate's only identity mark.
  await expect(bassMono.locator('[data-component="module-icon"]')).toBeVisible();
  await expect(bassMono).not.toContainText("ACID");
  await expect(bassMono.getByText("Silver Serpent", { exact: true })).toHaveCount(0);
  await expect(rack.getByText(/^(SEL|FOLD|DUP|SWAP)$/u)).toHaveCount(0);
  await expect(overview.getByText(/^(SEL|DUP|SWAP)$/u)).toHaveCount(0);
  await expect(rack.getByRole("combobox", { name: /Pattern/u })).toHaveCount(0);
  await expect(rack.getByRole("button", { name: /Add module to rack slot/u })).toHaveCount(0);
  await expect(browser.locator('[data-component="module-inspector"]')).toHaveCount(0);
  await expect(browser.getByRole("button", { name: /Drag /u })).toHaveCount(0);
  const bassMonoCard = browser.locator("article").filter({ hasText: "Silver Serpent" });
  await expect(bassMonoCard).toHaveAttribute(
    "title",
    "Monophonic instrument. Drag Silver Serpent into an empty rack slot.",
  );
  await expect(browser.getByText("Monophonic instrument", { exact: true })).toHaveCount(0);
  const tempoPlate = page.locator("label").filter({ has: page.locator('[data-field="tempo"]') });
  await expect(tempoPlate).toHaveAttribute(
    "title",
    "Beats per minute. Drag vertically or type a value.",
  );
  await expect(tempoPlate.getByText("BPM", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open the master channel" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Effects" }).click();
  await expect(page.getByRole("button", { name: "Details" })).toHaveCount(0);

  await bassMono.getByRole("button", { name: "Silver Serpent module menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Swap to Tin Soldier" })).toBeVisible();
});

test("collapses one faceplate group without hiding the other groups", async ({ page }) => {
  const soundToggle = page.getByRole("button", {
    name: "Collapse Silver Serpent sound controls",
  });
  const cutoff = page.getByRole("slider", { name: "Cutoff" });
  const audition = page.getByRole("button", { name: "Silver Serpent audition" });

  await expect(cutoff).toBeVisible();
  await soundToggle.click();
  await expect(cutoff).toHaveCount(0);
  await expect(audition).toBeVisible();
  await page.getByRole("button", { name: "Expand Silver Serpent sound controls" }).click();
  await expect(cutoff).toBeVisible();
});

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
    const sends = strip.getByRole("button", { name: /^Send/ });
    await expect(sends).toHaveCount(4);
    for (const send of await sends.all()) await expect(send).toBeDisabled();
    await expect(strip.getByRole("slider", { name: / pan$/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(strip.getByRole("slider", { name: / level$/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(strip.getByRole("button", { name: /^Solo rack slot/ })).toBeDisabled();
    await expect(strip.getByRole("button", { name: /^Mute rack slot/ })).toBeDisabled();
    // The empty ladder still draws its unlit cells, so the strip keeps the
    // loaded silhouette rather than showing a blank canvas.
    const ladder = strip.locator('[data-component="level-meter"]');
    await expect(ladder).toHaveAttribute("aria-hidden", "true");
    await expect
      .poll(() =>
        ladder.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const context = canvas.getContext("2d");
          if (context === null || canvas.width === 0) return 0;
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let painted = 0;
          for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] !== 0) painted += 1;
          }
          return painted;
        }),
      )
      .toBeGreaterThan(0);
  }

  await studio.getByRole("tab", { name: "Effects" }).click();
  await expect(studio.locator('[data-component="mixer"]')).toHaveCount(0);
  await expect(studio.locator('[data-component="effects-bank"]')).toBeVisible();
  await expect(studio.locator('[data-component="effect-slot"]')).toHaveCount(4);

  await studio.getByRole("tab", { name: "Master" }).click();
  await expect(studio.locator('[data-component="effects-bank"]')).toHaveCount(0);
  await expect(studio.locator('[data-component="master-panel"]')).toBeVisible();
});

/**
 * An empty channel reports no level, so its ladder must not hold the theme
 * observer, the wake path, or the visibility handler a live meter needs. Two
 * empty strips would otherwise each watch the document element for a canvas
 * that can never change.
 */
test("an empty strip meter installs no document-level observer", async ({ page }) => {
  /*
   * A live ladder watches the document element so a theme change repaints it.
   * The meter's filter is distinctive, so counting only observers that ask for
   * it isolates ladders from every other document observer in the shell.
   */
  await page.addInitScript(() => {
    const counter = { meterObservers: 0 };
    (window as unknown as { __meterProbe: typeof counter }).__meterProbe = counter;
    const RealMutationObserver = window.MutationObserver;
    class CountingMutationObserver extends RealMutationObserver {
      override observe(target: Node, options?: MutationObserverInit): void {
        if (
          target === document.documentElement &&
          options?.attributeFilter?.includes("data-high-contrast") === true
        ) {
          counter.meterObservers += 1;
        }
        super.observe(target, options);
      }
    }
    window.MutationObserver = CountingMutationObserver;
  });
  await page.goto("/");

  const studio = page.locator('[data-component="studio-panel"]');
  const emptyStrips = studio.locator('[data-empty="true"]');
  await expect(emptyStrips).toHaveCount(2);
  const emptyLadders = await emptyStrips.locator('[data-component="level-meter"]').count();
  const allLadders = await page.locator('[data-component="level-meter"]').count();
  expect(emptyLadders).toBe(2);

  const observers = await page.evaluate(
    () =>
      (window as unknown as { __meterProbe: { meterObservers: number } }).__meterProbe
        .meterObservers,
  );
  // Every ladder that can report a level takes exactly one observer. The two
  // empty ones take none, which is the whole point of the inert path.
  expect(observers).toBe(allLadders - emptyLadders);
});

test("holds and releases a Piano Roll pitch key with pointer and keyboard input", async ({
  page,
}) => {
  const key = page.getByRole("button", { name: "C4 piano key audition" });

  await key.hover();
  await page.mouse.down();
  await expect(key).toHaveAttribute("data-active", "true");
  await page.mouse.up();
  await expect(key).toHaveAttribute("data-active", "false");

  await key.focus();
  await page.keyboard.down("Enter");
  await expect(key).toHaveAttribute("data-active", "true");
  await page.keyboard.up("Enter");
  await expect(key).toHaveAttribute("data-active", "false");

  await page.getByRole("combobox", { name: "Piano Roll module" }).selectOption({
    label: "Tin Soldier",
  });
  await expect(page.getByRole("group", { name: "Piano keyboard" })).toHaveCount(0);
  const drumVoices = page.getByRole("group", { name: "Drum voices" });
  await expect(drumVoices.getByRole("button")).toHaveCount(6);
  await expect(drumVoices.getByRole("button", { name: "Kick voice audition" })).toBeVisible();
});

test("edits Piano Roll notes with real pointer and keyboard gestures", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const scroll = page.locator('[data-component="piano-roll-scroll"]');
  await scroll.evaluate((element) => {
    element.scrollTop = 12 * 16;
  });

  const grid = page.locator('[data-component="piano-roll-grid"]');
  const c3Key = page.getByRole("button", { name: "C3 piano key audition" });
  const gridBounds = await box(grid);
  const keyBounds = await box(c3Key);
  const stepWidth = gridBounds.width / 16;
  await page.mouse.dblclick(
    gridBounds.x + stepWidth * 3.5,
    keyBounds.y + keyBounds.height / 2,
  );

  let created = page.getByRole("button", { name: /C3 note, step 4,/u });
  await expect(created).toBeVisible();
  const velocity = page.getByRole("slider", { name: /C3 note, step 4,.*velocity$/u });
  const velocityBounds = await box(velocity);
  expect(velocityBounds.width).toBeGreaterThanOrEqual(24);
  expect(velocityBounds.height).toBeGreaterThanOrEqual(48);
  const pointControl = velocity.locator("..");
  expect(
    await pointControl.evaluate((element) => getComputedStyle(element, "::before").height),
  ).not.toBe("0px");
  const initialVelocity = Number(await velocity.inputValue());
  await page.mouse.move(
    velocityBounds.x + velocityBounds.width / 2,
    velocityBounds.y + velocityBounds.height * (1 - initialVelocity / 100),
  );
  await page.mouse.down();
  await page.mouse.move(
    velocityBounds.x + velocityBounds.width / 2,
    velocityBounds.y + velocityBounds.height * 0.5,
    { steps: 6 },
  );
  await page.mouse.up();
  await velocity.blur();
  const pointerVelocity = Number(await velocity.inputValue());
  expect(pointerVelocity).toBeGreaterThanOrEqual(45);
  expect(pointerVelocity).toBeLessThanOrEqual(55);
  created = page.getByRole("button", {
    name: new RegExp(`C3 note, step 4, ${String(pointerVelocity)} percent velocity`, "u"),
  });
  await expect(created).toBeVisible();

  await created.focus();
  const timeline = page.locator('[data-component="piano-roll-scroll"] button').first();
  const timelineBounds = await box(timeline);
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('[data-component="piano-roll-event"]') === null,
      { x: gridBounds.x + stepWidth * 3.5, y: timelineBounds.y + timelineBounds.height / 2 },
    ),
  ).toBe(true);
  await created.press("Delete");
  await expect(created).toHaveCount(0);

  const moving = page.getByRole("button", { name: /G2 note, step 3,/u });
  const movingBounds = await box(moving);
  await page.mouse.move(movingBounds.x + movingBounds.width / 2, movingBounds.y + 12);
  await page.mouse.down();
  await page.mouse.move(
    movingBounds.x + movingBounds.width / 2 + stepWidth,
    movingBounds.y + 12,
    { steps: 6 },
  );
  await page.mouse.up();
  const moved = page.getByRole("button", { name: /G2 note, step 4,/u });
  await expect(moved).toBeVisible();

  const blocking = page.getByRole("button", { name: /C2 note, step 5,/u });
  await blocking.press("Delete");
  const movedBounds = await box(moved);
  await page.mouse.move(movedBounds.x + movedBounds.width - 3, movedBounds.y + 12);
  await page.mouse.down();
  await page.mouse.move(movedBounds.x + movedBounds.width - 3 + stepWidth, movedBounds.y + 12, {
    steps: 6,
  });
  await page.mouse.up();
  const resized = page.getByRole("button", { name: /G2 note, step 4,.*2 step duration/u });
  await expect(resized).toBeVisible();

  const resizedBounds = await box(resized);
  await page.mouse.move(resizedBounds.x + 3, resizedBounds.y + 12);
  await page.mouse.down();
  await page.mouse.move(resizedBounds.x + 3 - stepWidth, resizedBounds.y + 12, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /G2 note, step 3,.*3 step duration/u })).toBeVisible();
});

test("creates a drum trigger by double-click and marquee-selects with a drag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.getByRole("combobox", { name: "Piano Roll module" }).selectOption({
    label: "Tin Soldier",
  });

  const grid = page.locator('[data-component="piano-roll-grid"]');
  const clap = page.getByRole("button", { name: "Clap voice audition" });
  const kick = page.getByRole("button", { name: "Kick voice audition" });
  const eventButtons = grid.locator('[data-component="piano-roll-event"]');
  const baseline = await eventButtons.count();
  const gridBounds = await box(grid);
  const clapBounds = await box(clap);
  const kickBounds = await box(kick);
  const stepWidth = gridBounds.width / 16;

  // A single click on an empty cell creates nothing.
  await page.mouse.click(gridBounds.x + stepWidth * 1.5, clapBounds.y + clapBounds.height / 2);
  await expect(eventButtons).toHaveCount(baseline);

  // A double-click creates one fixed one-cell trigger.
  await page.mouse.dblclick(gridBounds.x + stepWidth * 1.5, clapBounds.y + clapBounds.height / 2);
  const created = page.getByRole("button", { name: /Clap trigger, step 2/u });
  await expect(created).toBeVisible();
  await expect(eventButtons).toHaveCount(baseline + 1);

  // Undo removes the single double-clicked trigger in one entry.
  await page
    .locator('[data-component="workspace-bar"]')
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(eventButtons).toHaveCount(baseline);
  await expect(
    page.locator('[data-component="workspace-bar"]').getByRole("button", { name: "Undo" }),
  ).toBeDisabled();

  // A drag on an empty cell draws a selection box and creates nothing. The
  // kick row holds one trigger at step 6, inside the dragged box.
  const kickStep6 = page.getByRole("button", { name: /Kick trigger, step 7/u });
  await expect(kickStep6).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(gridBounds.x + stepWidth * 2.5, kickBounds.y + kickBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(gridBounds.x + stepWidth * 7.5, kickBounds.y + kickBounds.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(kickStep6).toHaveAttribute("aria-pressed", "true");
  await expect(eventButtons).toHaveCount(baseline);

  // A trigger has no resize edge. A drag that starts near its left edge moves it.
  const triggerBounds = await box(kickStep6);
  await page.mouse.move(triggerBounds.x + 2, triggerBounds.y + triggerBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(triggerBounds.x + 2 + stepWidth, triggerBounds.y + triggerBounds.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /Kick trigger, step 8/u })).toBeVisible();
});

test("schedules Pattern automation through the production worklet port", async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as unknown as {
      __scheduledAutomation: { audioFrame: number; parameterId: string; value: unknown }[];
    };
    target.__scheduledAutomation = [];
    const NativeAudioWorkletNode = window.AudioWorkletNode;
    Object.defineProperty(window, "AudioWorkletNode", {
      configurable: true,
      value: new Proxy(NativeAudioWorkletNode, {
        construct(constructor, argumentsList) {
          const node = Reflect.construct(constructor, argumentsList) as AudioWorkletNode;
          const nativePost = node.port.postMessage.bind(node.port);
          node.port.postMessage = ((message: unknown, transfer?: Transferable[]) => {
            if (typeof message === "object" && message !== null) {
              const envelope = message as {
                kind?: string;
                payload?: {
                  changes?: { audioFrame?: unknown; parameterId?: unknown; value?: unknown }[];
                };
              };
              if (envelope.kind === "parameter-batch") {
                for (const change of envelope.payload?.changes ?? []) {
                  if (
                    typeof change.audioFrame === "number" &&
                    typeof change.parameterId === "string"
                  ) {
                    target.__scheduledAutomation.push({
                      audioFrame: change.audioFrame,
                      parameterId: change.parameterId,
                      value: change.value,
                    });
                  }
                }
              }
            }
            nativePost(message, transfer ?? []);
          }) as typeof node.port.postMessage;
          return node;
        },
      }),
    });
  });
  await page.reload();
  await page.setViewportSize({ width: 1536, height: 1024 });

  await page
    .getByRole("combobox", { name: "Piano Roll parameter" })
    .selectOption("cutoff");
  const step = page.getByRole("slider", { name: "Cutoff, step 1", exact: true });
  await step.press("ArrowUp");
  await expect(step).toHaveAttribute("data-automation-step", "true");
  await page.getByRole("button", { name: /^play$/i }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __scheduledAutomation: unknown[] })
            .__scheduledAutomation.length,
      ),
    )
    .toBeGreaterThan(0);
});

test("replaces a note at the move destination in one Undo entry", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const scroll = page.locator('[data-component="piano-roll-scroll"]');
  await scroll.evaluate((element) => {
    element.scrollTop = 12 * 16;
  });

  const grid = page.locator('[data-component="piano-roll-grid"]');
  const eventButtons = grid.locator('[data-component="piano-roll-event"]');
  const baseline = await eventButtons.count();
  const gridBounds = await box(grid);
  const stepWidth = gridBounds.width / 16;

  // The default part has a G2 note at step 2 and a C2 note at step 1. Drag the
  // G2 note one step left onto the C2 note. The C2 note is replaced.
  const moving = page.getByRole("button", { name: /G2 note, step 3,/u });
  await expect(moving).toBeVisible();
  const movingBounds = await box(moving);
  await page.mouse.move(movingBounds.x + movingBounds.width / 2, movingBounds.y + 8);
  await page.mouse.down();
  await page.mouse.move(
    movingBounds.x + movingBounds.width / 2 - stepWidth,
    movingBounds.y + 8,
    { steps: 6 },
  );
  await page.mouse.up();

  await expect(page.getByRole("button", { name: /G2 note, step 2,/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /C2 note, step 2,/u })).toHaveCount(0);
  await expect(eventButtons).toHaveCount(baseline - 1);

  await page
    .locator('[data-component="workspace-bar"]')
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(eventButtons).toHaveCount(baseline);
  await expect(page.getByRole("button", { name: /C2 note, step 2,/u })).toBeVisible();
});

test("changes transport scope without stopping and toggles meter analysis without changing audio", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as { __meterModeProbe: MeterModeProbe };
    state.__meterModeProbe = { analysers: 0, contexts: 0, workletNodes: 0, contextState: undefined };

    const NativeAudioContext = window.AudioContext;
    class ProbedAudioContext extends NativeAudioContext {
      constructor(options: AudioContextOptions = {}) {
        super(options);
        state.__meterModeProbe.contexts += 1;
        state.__meterModeProbe.contextState = this.state;
      }

      override createAnalyser(): AnalyserNode {
        state.__meterModeProbe.analysers += 1;
        return super.createAnalyser();
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: ProbedAudioContext,
    });

    const NativeAudioWorkletNode = window.AudioWorkletNode;
    Object.defineProperty(window, "AudioWorkletNode", {
      configurable: true,
      value: new Proxy(NativeAudioWorkletNode, {
        construct(target, argumentsList: ConstructorParameters<typeof AudioWorkletNode>) {
          state.__meterModeProbe.workletNodes += 1;
          return Reflect.construct(target, argumentsList);
        },
      }),
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await expect.poll(async () => page.evaluate(() => {
    const probe = (window as unknown as { __meterModeProbe: { analysers: number } }).__meterModeProbe;
    return probe.analysers;
  })).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Pattern playback mode" }).click();
  await expect(page.getByRole("button", { name: "Song playback mode" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  const playlist = page.locator('[data-component="playlist-summary"]');
  await expect(playlist.locator('[data-component="playlist-playback-marker"]')).toHaveCount(1);
  await expect(playlist.getByText("Playing", { exact: true })).toBeVisible();

  const before = await page.evaluate(() => {
    const probe = (window as unknown as { __meterModeProbe: MeterModeProbe }).__meterModeProbe;
    return { ...probe };
  });
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  const historyBefore = { undoDisabled: await undo.isDisabled(), redoDisabled: await redo.isDisabled() };
  const meterMode = page.getByRole("button", { name: "Master meter mode: left and right" });
  await meterMode.click();
  await expect(page.getByRole("button", { name: "Master meter mode: mid and side" })).toHaveText(
    "M/S",
  );
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const probe = (window as unknown as { __meterModeProbe: MeterModeProbe }).__meterModeProbe;
    return { ...probe };
  })).toEqual(before);
  expect(await undo.isDisabled()).toBe(historyBefore.undoDisabled);
  expect(await redo.isDisabled()).toBe(historyBefore.redoDisabled);
});

test("keeps the complete Playlist row contract at the compact supported width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const playlist = page.locator('[data-component="playlist-summary"]');
  const mode = playlist.getByRole("button", { name: "Pattern playback mode" });
  await expect(mode.locator("svg")).toBeVisible();
  await expect(mode).toHaveAttribute("title", /switch to Song/u);

  const handle = playlist.getByRole("button", { name: "Reorder Playlist row 1" });
  await expect(handle.locator("svg")).toBeVisible();
  await expect(handle).toHaveAttribute("title", /Arrow Up and Arrow Down/u);
  const handleTarget = await box(handle);
  expect(handleTarget.width).toBeGreaterThanOrEqual(24);
  expect(handleTarget.height).toBeGreaterThanOrEqual(24);
  await expect(playlist.getByRole("combobox", { name: "Playlist row 1 Pattern" })).toBeVisible();
  await expect(playlist.getByText(/bar/u).first()).toBeVisible();

  const menu = playlist.getByRole("button", { name: "Playlist row 1 menu" });
  await expect(menu.locator("svg")).toBeVisible();
  await menu.click();
  await expect(page.getByRole("menu", { name: "Playlist row 1 menu" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Move /u })).toHaveCount(0);

  const add = playlist.getByRole("button", { name: "Add Verse at the end as Playlist row 6" });
  await expect(add.locator("svg")).toBeVisible();
  await expect(add).toHaveText("Add at end. Row 6.Verse");
  await expect(add).toHaveAttribute("title", "Add Verse at the end as Playlist row 6.");
  expect(await playlist.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("collapses and restores the lower editor with its focus and scroll context", async ({
  page,
}) => {
  const rack = page.locator('[data-component="rack"]');
  const beforeHeight = (await box(rack)).height;
  const patternName = page.getByRole("textbox", { name: "Pattern name" });

  const addPattern = page.getByRole("button", { name: /Add .* at the end as Playlist row \d+/u });
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

test("holds the timing controls still while Swing and Humanize values change", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const swing = page.getByRole("slider", { name: "Project Swing" });
  const humanize = page.getByRole("slider", { name: "Pattern Humanize" });

  const humanizeLabel = page
    .locator('[data-component="piano-roll"] header label')
    .filter({ has: humanize })
    .locator("span");

  const setPosition = async (slider: Locator, position: number) => {
    await slider.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        String(value),
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, position);
  };

  // A one-digit, two-digit, and three-digit readout must all occupy the same
  // width, so a value change never reflows the header row.
  const positions = [0, 20, 60, 100];
  const labelXs: number[] = [];
  const inputXs: number[] = [];
  const record = async () => {
    labelXs.push((await box(humanizeLabel)).x);
    inputXs.push((await box(humanize)).x);
  };

  for (const position of positions) {
    await setPosition(swing, position);
    await record();
  }
  await setPosition(swing, 0);
  for (const position of positions) {
    await setPosition(humanize, position);
    await record();
  }

  expect(Math.max(...labelXs) - Math.min(...labelXs)).toBeLessThanOrEqual(1);
  expect(Math.max(...inputXs) - Math.min(...inputXs)).toBeLessThanOrEqual(1);

  // The reserved readout box must still show its widest value in full.
  const readout = page
    .locator('[data-component="piano-roll"] header label')
    .filter({ has: humanize })
    .locator("output");
  await setPosition(humanize, 100);
  const metrics = await readout.evaluate((element) => ({
    text: element.textContent,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(metrics.text).toBe("100%");
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
});

test("raises the lower editor with the resize handle and restores the default", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const editor = page.locator('[data-component="editor-workspace"]');
  const handle = page.locator('[data-component="editor-resize-handle"]');
  const before = await box(editor);

  const grip = await box(handle);
  const gripCenterX = grip.x + grip.width / 2;
  const gripCenterY = grip.y + grip.height / 2;
  await page.mouse.move(gripCenterX, gripCenterY);
  await page.mouse.down();
  await page.mouse.move(gripCenterX, gripCenterY - 120, { steps: 8 });
  await page.mouse.up();

  const after = await box(editor);
  expect(after.height).toBeGreaterThan(before.height + 80);
  // The default height is the minimum, so a downward drag cannot pass it.
  const main = await box(page.locator('[data-component="main-workspace"]'));
  expect(main.height).toBeGreaterThanOrEqual(350);

  await handle.dblclick();

  const restored = await box(editor);
  expect(Math.abs(restored.height - before.height)).toBeLessThanOrEqual(1);
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

test("suppresses the native context menu on the shell but not on text entry", async ({ page }) => {
  // The app root mounts after the load event. Wait for it before the evaluate
  // runs. On a slow runner, the evaluate can run before the root exists.
  await expect(page.locator('[data-component="pulse-app"]')).toBeVisible();
  const outcome = await page.evaluate(() => {
    const suppressed = (selector: string) => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`Expected ${selector} to exist.`);
      // `dispatchEvent` returns false when a listener called `preventDefault`.
      return !element.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    };
    return {
      shell: suppressed('[data-component="pulse-app"]'),
      // Text entry keeps Cut, Copy, Paste, Undo, and Select all.
      tempo: suppressed('[data-field="tempo"]'),
      filter: suppressed('[data-component="module-browser"] input[type="search"]'),
    };
  });

  expect(outcome).toEqual({ shell: true, tempo: false, filter: false });
});

test("keeps the project menu inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: /Project selector/ }).click();
  const menu = page.getByRole("dialog", { name: "Project selector" });
  const bounds = await box(menu);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1280);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
});
