import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.body.innerHTML = `
      <main data-theme="rack">
        <pulse-knob id="cutoff" control-id="cutoff" label="Cutoff" min="0" max="100" step="1" default-value="50" value="25" unit="%"></pulse-knob>
        <pulse-fader id="volume" control-id="volume" label="Volume" min="-60" max="6" step="1" default-value="0" value="-12" unit="dB"></pulse-fader>
        <pulse-toggle id="mute" control-id="mute" label="Mute"></pulse-toggle>
        <pulse-led-button id="record" control-id="record" label="Record"></pulse-led-button>
        <pulse-segment-display id="tempo" label="Tempo" value="128.0"></pulse-segment-display>
        <pulse-meter id="meter" label="Master level" value="0.5"></pulse-meter>
        <pulse-pattern-strip id="pattern" label="Bass pattern"></pulse-pattern-strip>
        <pulse-rack-module id="empty-slot" label="Empty" disabled>
          <button type="button" data-action="add">Add Acid Bass</button>
        </pulse-rack-module>
        <pulse-rack-module id="blocked-slot" label="Unavailable" disabled></pulse-rack-module>
      </main>
    `;
  });
});

test("knob supports keyboard, reset, and numeric entry", async ({ page }) => {
  const knob = page.locator("pulse-knob#cutoff");
  const range = knob.locator('input[type="range"]');
  const numeric = knob.locator('input[type="number"]');

  await range.focus();
  await range.press("End");
  await expect(knob).toHaveAttribute("value", "100");

  await knob.locator(".control").dblclick({ position: { x: 8, y: 8 } });
  await expect(knob).toHaveAttribute("value", "50");

  await numeric.fill("72");
  await numeric.press("Enter");
  await numeric.blur();
  await expect(knob).toHaveAttribute("value", "72");
  await expect(range).toHaveAttribute("aria-label", "Cutoff");
});

test("toggle uses native pressed semantics and emits a composed commit", async ({ page }) => {
  await page.evaluate(() => {
    const toggle = document.querySelector("pulse-toggle#mute");
    toggle?.addEventListener("pulse-control-commit", (event) => {
      const detail = (event as CustomEvent<{ value: boolean }>).detail;
      document.body.dataset.committed = String(detail.value);
    });
  });

  const toggle = page.locator("pulse-toggle#mute");
  const button = toggle.getByRole("button", { name: "Mute" });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.press("Space");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("body")).toHaveAttribute("data-committed", "true");
});

test("meter and segment display expose stable numeric text", async ({ page }) => {
  await expect(page.locator("pulse-segment-display#tempo output")).toHaveAttribute(
    "aria-label",
    "Tempo: 128.0",
  );
  await expect(page.locator("pulse-meter#meter output")).toHaveAttribute(
    "aria-label",
    "Master level: 50%",
  );
});

test("pattern steps expose state and emit composed changes", async ({ page }) => {
  await page.evaluate(() => {
    const pattern = document.querySelector("pulse-pattern-strip#pattern");
    pattern?.addEventListener("pulse-step-change", (event) => {
      const detail = (event as CustomEvent<{ active: boolean; index: number }>).detail;
      document.body.dataset.step = `${String(detail.index)}:${String(detail.active)}`;
      document.body.dataset.stepGesture = (event as CustomEvent<{ gestureId: string }>).detail.gestureId;
    });
  });

  const firstStep = page.locator("pulse-pattern-strip#pattern button").first();
  await expect(firstStep).toHaveAttribute("aria-label", "Step 1: inactive");
  await firstStep.press("Space");
  await expect(firstStep).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("body")).toHaveAttribute("data-step", "0:true");
  await expect(page.locator("body")).toHaveAttribute(
    "data-step-gesture",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("pointer painting keeps one component and one gesture ID", async ({ page }) => {
  await page.evaluate(() => {
    const pattern = document.querySelector("pulse-pattern-strip#pattern");
    if (pattern === null) throw new Error("Pattern fixture is missing.");
    const firstButton = pattern.shadowRoot?.querySelector("button");
    if (firstButton === null || firstButton === undefined) {
      throw new Error("Pattern button fixture is missing.");
    }
    const state = {
      details: [] as { active: boolean; gestureId: string; index: number }[],
      firstButton,
      pattern,
    };
    (window as unknown as { patternPaintState: typeof state }).patternPaintState = state;
    pattern.addEventListener("pulse-step-change", (event) => {
      state.details.push(
        (event as CustomEvent<{ active: boolean; gestureId: string; index: number }>).detail,
      );
    });
  });

  const buttons = page.locator("pulse-pattern-strip#pattern button");
  const first = await buttons.nth(0).boundingBox();
  const third = await buttons.nth(2).boundingBox();
  if (first === null || third === null) throw new Error("Pattern buttons are not laid out.");
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(buttons.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(buttons.nth(2)).toHaveAttribute("aria-pressed", "true");
  const result = await page.evaluate(() => {
    const state = (window as unknown as {
      patternPaintState: {
        details: { gestureId: string }[];
        firstButton: Element;
        pattern: Element;
      };
    }).patternPaintState;
    const currentPattern = document.querySelector("pulse-pattern-strip#pattern");
    return {
      gestureIds: [...new Set(state.details.map((detail) => detail.gestureId))],
      sameButton: currentPattern?.shadowRoot?.querySelector("button") === state.firstButton,
      samePattern: currentPattern === state.pattern,
    };
  });
  expect(result.samePattern).toBe(true);
  expect(result.sameButton).toBe(true);
  expect(result.gestureIds).toHaveLength(1);
  expect(result.gestureIds[0]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("addable empty slots are not exposed as disabled containers", async ({ page }) => {
  const emptySlot = page.locator("pulse-rack-module#empty-slot");
  await expect(emptySlot.locator("article")).not.toHaveAttribute("aria-disabled", "true");
  await expect(emptySlot.getByRole("button", { name: "Add Acid Bass" })).toBeEnabled();
  await expect(page.locator("pulse-rack-module#blocked-slot article")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("built-in themes and high contrast resolve without changing target geometry", async ({ page }) => {
  const button = page.locator("pulse-toggle#mute button");
  const initialBox = await button.boundingBox();
  expect(initialBox).not.toBeNull();

  for (const [theme, expectedApp] of [
    ["rack", "#0b0d0f"],
    ["mono", "#050505"],
    ["cosmic", "#070a18"],
    ["analog", "#171512"],
    ["rust", "#130d0a"],
  ] as const) {
    const resolved = await page.locator("main").evaluate((element, nextTheme) => {
      element.dataset.theme = nextTheme;
      return getComputedStyle(element).getPropertyValue("--pulse-color-app").trim();
    }, theme);
    expect(resolved).toBe(expectedApp);
    expect(await button.boundingBox()).toEqual(initialBox);
  }

  const highContrastApp = await page.locator("main").evaluate((element) => {
    element.dataset.highContrast = "true";
    return getComputedStyle(element).getPropertyValue("--pulse-color-app").trim();
  });
  expect(["#000", "#000000"]).toContain(highContrastApp);
  expect(await button.boundingBox()).toEqual(initialBox);
});

test("a wheel burst coalesces into one commit and ends after the 250 ms boundary", async ({ page }) => {
  const knob = page.locator("pulse-knob#cutoff");
  await page.evaluate(() => {
    const element = document.querySelector("pulse-knob#cutoff");
    const counts: { input: number; commit: number } = { input: 0, commit: 0 };
    (window as unknown as { counts: typeof counts }).counts = counts;
    element?.addEventListener("pulse-control-input", () => (counts.input += 1));
    element?.addEventListener("pulse-control-commit", () => (counts.commit += 1));
  });

  const box = await knob.boundingBox();
  if (box === null) throw new Error("Knob is not laid out.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let notch = 0; notch < 6; notch += 1) await page.mouse.wheel(0, -100);

  // Before the boundary elapses the burst is still open, so nothing has committed.
  const duringBurst = await page.evaluate(
    () => (window as unknown as { counts: { input: number; commit: number } }).counts.commit,
  );
  expect(duringBurst).toBe(0);

  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { counts: { input: number; commit: number } }).counts.commit,
      ),
    )
    .toBe(1);

  const counts = await page.evaluate(
    () => (window as unknown as { counts: { input: number; commit: number } }).counts,
  );
  // Every notch previews, but the whole burst yields exactly one history entry.
  expect(counts.input).toBe(6);
  expect(counts.commit).toBe(1);

  // A later burst on the same target starts a new gesture and commits once more.
  await page.mouse.wheel(0, -100);
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { counts: { input: number; commit: number } }).counts.commit,
      ),
    )
    .toBe(2);
});

test("normal and Shift-wheel adjustments are both operative", async ({ page }) => {
  const knob = page.locator("pulse-knob#cutoff");
  await knob.locator('input[type="range"]').focus();
  await knob.evaluate((element) => {
    element.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    }));
  });
  await expect(knob).toHaveAttribute("value", "35");
  await knob.evaluate((element) => {
    element.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      shiftKey: true,
    }));
    window.dispatchEvent(new Event("blur"));
  });
  await expect(knob).toHaveAttribute("value", "36");
});

test("dirty pointer and wheel gestures finalize exactly once", async ({ page }) => {
  const result = await page.locator("pulse-knob#cutoff").evaluate(async (element) => {
    const control = element.shadowRoot?.querySelector<HTMLElement>(".control");
    if (control === null || control === undefined) throw new Error("Knob control is missing.");
    const captures = new Set<number>();
    control.setPointerCapture = (pointerId: number) => captures.add(pointerId);
    control.hasPointerCapture = (pointerId: number) => captures.has(pointerId);
    control.releasePointerCapture = (pointerId: number) => captures.delete(pointerId);
    const commits: string[] = [];
    element.addEventListener("pulse-control-commit", (event) => {
      commits.push((event as CustomEvent<{ source: string }>).detail.source);
    });
    const pointer = (type: string, pointerId: number, clientY: number) => {
      control.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        button: 0,
        clientY,
        pointerId,
      }));
    };

    pointer("pointerdown", 7, 100);
    pointer("pointermove", 7, 40);
    pointer("pointercancel", 7, 40);

    pointer("pointerdown", 8, 100);
    pointer("pointermove", 8, 60);
    window.dispatchEvent(new Event("blur"));

    element.shadowRoot?.querySelector<HTMLInputElement>('input[type="range"]')?.focus();
    element.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    }));
    element.remove();
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    return commits;
  });
  expect(result).toEqual(["pointer", "pointer", "wheel"]);
});

test("Escape cancels pointer edits and key repeat commits once on release", async ({ page }) => {
  const result = await page.locator("pulse-knob#cutoff").evaluate((element) => {
    const control = element.shadowRoot?.querySelector<HTMLElement>(".control");
    const range = element.shadowRoot?.querySelector<HTMLInputElement>('input[type="range"]');
    if (control === null || control === undefined || range === null || range === undefined) {
      throw new Error("Knob gesture controls are missing.");
    }
    const captures = new Set<number>();
    control.setPointerCapture = (pointerId: number) => captures.add(pointerId);
    control.hasPointerCapture = (pointerId: number) => captures.has(pointerId);
    control.releasePointerCapture = (pointerId: number) => captures.delete(pointerId);
    const counts = { commits: 0, inputs: 0 };
    element.addEventListener("pulse-control-input", () => (counts.inputs += 1));
    element.addEventListener("pulse-control-commit", () => (counts.commits += 1));

    control.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientY: 100,
      pointerId: 9,
    }));
    control.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      clientY: 40,
      pointerId: 9,
    }));
    range.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    const afterEscape = {
      commits: counts.commits,
      value: element.getAttribute("value"),
    };

    for (const repeat of [false, true, true]) {
      range.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "PageUp",
        repeat,
      }));
    }
    const beforeKeyUp = counts.commits;
    range.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "PageUp" }));
    return {
      afterEscape,
      beforeKeyUp,
      counts,
      value: element.getAttribute("value"),
    };
  });

  expect(result.afterEscape).toEqual({ commits: 0, value: "25" });
  expect(result.beforeKeyUp).toBe(0);
  expect(result.counts.commits).toBe(1);
  expect(result.value).toBe("55");
});

test("every primitive provides at least a 24 pixel target", async ({ page }) => {
  for (const selector of [
    "pulse-knob#cutoff input[type=range]",
    "pulse-fader#volume input[type=range]",
    "pulse-toggle#mute button",
    "pulse-led-button#record button",
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box?.width, selector).toBeGreaterThanOrEqual(24);
    expect(box?.height, selector).toBeGreaterThanOrEqual(24);
  }
});
