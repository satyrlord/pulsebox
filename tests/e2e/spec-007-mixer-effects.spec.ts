import { expect, test, type Locator, type Page } from "@playwright/test";

const SUPPORTED_VIEWPORTS = [
  { width: 1536, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
] as const;

const SENDS = ["A", "B", "C", "D"] as const;

interface LiveAudioMetrics {
  readonly leftPeak: number;
  readonly rightPeak: number;
  readonly leftRms: number;
  readonly rightRms: number;
  readonly peak: number;
}

interface LiveAudioProbeSnapshot {
  readonly actualSampleRate: number;
  readonly analyserCount: number;
  readonly contextCount: number;
  readonly contextState: AudioContextState | undefined;
  readonly effectPlugins: readonly string[];
  readonly workletNodeCount: number;
}

async function installLiveAudioProbe(page: Page, sampleRate: number): Promise<void> {
  await page.addInitScript((requestedRate) => {
    interface ProbeState {
      analysers: AnalyserNode[];
      contexts: AudioContext[];
      effectPlugins: string[];
      workletNodeCount: number;
    }
    const state = window as unknown as { __spec007AudioProbe: ProbeState };
    state.__spec007AudioProbe = {
      analysers: [],
      contexts: [],
      effectPlugins: [],
      workletNodeCount: 0,
    };

    const NativeAudioContext = window.AudioContext;
    class ProbedAudioContext extends NativeAudioContext {
      constructor(options: AudioContextOptions = {}) {
        super({ ...options, sampleRate: requestedRate });
        state.__spec007AudioProbe.contexts.push(this);
      }

      override createAnalyser(): AnalyserNode {
        const analyser = super.createAnalyser();
        state.__spec007AudioProbe.analysers.push(analyser);
        return analyser;
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
          state.__spec007AudioProbe.workletNodeCount += 1;
          const node = Reflect.construct(target, argumentsList);
          const nativePost = node.port.postMessage.bind(node.port);
          node.port.postMessage = ((message: unknown, transfer?: Transferable[]) => {
            if (typeof message === "object" && message !== null) {
              const payload = (message as { payload?: { pluginId?: unknown } }).payload;
              if (typeof payload?.pluginId === "string") {
                state.__spec007AudioProbe.effectPlugins.push(payload.pluginId);
              }
            }
            nativePost(message, transfer ?? []);
          }) as typeof node.port.postMessage;
          return node;
        },
      }),
    });
  }, sampleRate);
  await page.reload();
}

async function liveAudioProbe(page: Page): Promise<LiveAudioProbeSnapshot> {
  return page.evaluate(() => {
    const state = window as unknown as {
      __spec007AudioProbe: {
        analysers: AnalyserNode[];
        contexts: AudioContext[];
        effectPlugins: string[];
        workletNodeCount: number;
      };
    };
    const context = state.__spec007AudioProbe.contexts[0];
    return {
      actualSampleRate: context?.sampleRate ?? 0,
      analyserCount: state.__spec007AudioProbe.analysers.length,
      contextCount: state.__spec007AudioProbe.contexts.length,
      contextState: context?.state,
      effectPlugins: [...state.__spec007AudioProbe.effectPlugins],
      workletNodeCount: state.__spec007AudioProbe.workletNodeCount,
    };
  });
}

async function readLiveOutput(
  page: Page,
  options: { readonly waitForSignal: boolean },
): Promise<LiveAudioMetrics> {
  return page.evaluate(async ({ waitForSignal }) => {
    const state = window as unknown as {
      __spec007AudioProbe: { analysers: AnalyserNode[] };
    };
    const leftAnalyser = state.__spec007AudioProbe.analysers[0];
    const rightAnalyser = state.__spec007AudioProbe.analysers[1];
    if (leftAnalyser === undefined || rightAnalyser === undefined) {
      throw new Error("The live post-master analyser pair is missing.");
    }
    const left = new Float32Array(leftAnalyser.fftSize);
    const right = new Float32Array(rightAnalyser.fftSize);
    const readFrame = () => {
      leftAnalyser.getFloatTimeDomainData(left);
      rightAnalyser.getFloatTimeDomainData(right);
      let leftPeak = 0;
      let rightPeak = 0;
      let leftEnergy = 0;
      let rightEnergy = 0;
      for (let index = 0; index < left.length; index += 1) {
        const oneLeft = left[index] ?? 0;
        const oneRight = right[index] ?? 0;
        leftPeak = Math.max(leftPeak, Math.abs(oneLeft));
        rightPeak = Math.max(rightPeak, Math.abs(oneRight));
        leftEnergy += oneLeft * oneLeft;
        rightEnergy += oneRight * oneRight;
      }
      return {
        leftPeak,
        rightPeak,
        leftRms: Math.sqrt(leftEnergy / left.length),
        rightRms: Math.sqrt(rightEnergy / right.length),
      };
    };
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    let frame = readFrame();
    if (waitForSignal) {
      // The full suite runs several live AudioContexts in parallel. This wait
      // only acquires a measurement frame. It is not the three-second
      // first-sound acceptance limit, which has its own release test.
      const deadline = performance.now() + 10_000;
      while (Math.max(frame.leftPeak, frame.rightPeak) <= 1e-4 && performance.now() < deadline) {
        await nextFrame();
        frame = readFrame();
      }
      if (Math.max(frame.leftPeak, frame.rightPeak) <= 1e-4) {
        throw new Error("The live routed output stayed silent.");
      }
    }
    let leftPeak = 0;
    let rightPeak = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    let sampleCount = 0;
    for (let index = 0; index < 12; index += 1) {
      if (index > 0 || !waitForSignal) await nextFrame();
      frame = readFrame();
      leftPeak = Math.max(leftPeak, frame.leftPeak);
      rightPeak = Math.max(rightPeak, frame.rightPeak);
      leftEnergy += frame.leftRms * frame.leftRms * left.length;
      rightEnergy += frame.rightRms * frame.rightRms * right.length;
      sampleCount += left.length;
    }
    return {
      leftPeak,
      rightPeak,
      leftRms: Math.sqrt(leftEnergy / sampleCount),
      rightRms: Math.sqrt(rightEnergy / sampleCount),
      peak: Math.max(leftPeak, rightPeak),
    };
  }, options);
}

async function holdAudition(
  page: Page,
  moduleName = "Silver Serpent",
  waitForSignal = true,
): Promise<LiveAudioMetrics> {
  const audition = page.getByRole("button", { name: `${moduleName} audition`, exact: true });
  await audition.hover();
  await page.mouse.down();
  await expect(audition).toHaveAttribute("data-active", "true");
  const metrics = await readLiveOutput(page, { waitForSignal });
  await page.mouse.up();
  await expect(audition).toHaveAttribute("data-active", "false");
  return metrics;
}

async function primeLiveAudio(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await expect.poll(async () => (await liveAudioProbe(page)).analyserCount).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
}

async function isolateModuleOnMixer(page: Page, moduleName = "Silver Serpent"): Promise<Locator> {
  const mixer = await openStudio(page, "Mixer");
  const channels = mixer.locator('[data-component="channel-strip"]:not([data-empty="true"])');
  for (let index = 0; index < await channels.count(); index += 1) {
    const channel = channels.nth(index);
    const name = (await channel.getAttribute("aria-label")) ?? "";
    const mute = channel.getByRole("button", { name: new RegExp(`^Mute ${name.replace(/ channel$/u, "")}$`) });
    const pressed = await mute.getAttribute("aria-pressed");
    if (name === `${moduleName} channel`) {
      if (pressed === "true") await mute.click();
    } else if (pressed !== "true") {
      await mute.click();
    }
  }
  return mixer.locator(`[data-component="channel-strip"][aria-label="${moduleName} channel"]`);
}

function assertSilent(metrics: LiveAudioMetrics): void {
  expect(metrics.peak).toBeLessThan(1e-4);
}

function assertSignal(metrics: LiveAudioMetrics): void {
  expect(metrics.peak).toBeGreaterThan(1e-4);
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (value === null) throw new Error("Expected the locator to be laid out.");
  return value;
}

async function openStudio(page: Page, name: "Mixer" | "Effects" | "Master") {
  const studio = page.locator('[data-component="studio-panel"]');
  await studio.getByRole("tab", { name, exact: true }).click();
  await expect(studio.getByRole("tabpanel")).toBeVisible();
  return studio;
}

async function waitForAutosaveValue(page: Page, value: string) {
  await expect.poll(async () =>
    page.evaluate(async (expected) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("pulsebox-v1", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("The project database could not open."));
      });
      const transaction = database.transaction("autosave", "readonly");
      const record = await new Promise<unknown>((resolve, reject) => {
        const request = transaction.objectStore("autosave").get("current");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("The autosave record could not load."));
      });
      database.close();
      const serialized = JSON.stringify(record);
      return typeof serialized === "string" && serialized.includes(expected);
    }, value),
  ).toBe(true);
}

function loadedStrip(studio: Locator) {
  return studio.locator('[data-component="channel-strip"]:not([data-empty="true"])').first();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("keeps the fixed mixer geometry and accessible controls at every supported viewport", async ({
  page,
}) => {
  for (const viewport of SUPPORTED_VIEWPORTS) {
    await page.setViewportSize(viewport);
    const studio = await openStudio(page, "Mixer");
    await expect(page.locator('[data-component="unsupported-size"]')).toHaveCount(0);

    const strips = studio.locator('[data-component="channel-strip"]');
    await expect(strips).toHaveCount(8);
    await expect(studio.locator('[data-component="master-strip"]')).toHaveCount(1);
    await expect(studio.locator('[data-component="channel-strip"][data-empty="true"]')).toHaveCount(2);

    const widths = await strips.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().width),
    );
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    expect(await studio.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

    const loaded = loadedStrip(studio);
    const labels = await loaded
      .getByRole("button", { name: /send [A-D]/iu })
      .evaluateAll((buttons) => buttons.map((button) => button.textContent.trim()));
    expect(labels).toEqual([...SENDS]);
    for (const send of await loaded.getByRole("button", { name: /send [A-D]/iu }).all()) {
      const target = await box(send);
      expect(target.width).toBeGreaterThanOrEqual(24);
      expect(target.height).toBeGreaterThanOrEqual(24);
    }

    const master = studio.locator('[data-component="master-strip"]');
    await expect(master.getByRole("button", { name: /^Send [A-D]/u })).toHaveCount(0);
    await expect(master.getByRole("slider", { name: /pan/u })).toHaveCount(0);
    const channelFader = await box(loaded.getByRole("slider", { name: /level$/iu }));
    const masterFader = await box(master.getByRole("slider", { name: "Master level" }));
    expect(masterFader.height).toBeGreaterThan(channelFader.height);
    expect(Math.abs(
      masterFader.y + masterFader.height - (channelFader.y + channelFader.height),
    )).toBeLessThanOrEqual(1);

    for (const empty of await studio.locator('[data-component="channel-strip"][data-empty="true"]').all()) {
      await expect(empty.getByRole("button", { name: /^Send [A-D]/u })).toHaveCount(4);
      for (const button of await empty.getByRole("button", { name: /^Send [A-D]/u }).all()) {
        await expect(button).toBeDisabled();
      }
      await expect(empty).toHaveAttribute("aria-label", /Rack slot 0[78].*Empty/u);
    }

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.locator('[data-component="settings-page"]');
    const contrast = settings.getByRole("checkbox", { name: /high contrast/i });
    await contrast.check();
    await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await openStudio(page, "Mixer");
    await expect(page.locator('[data-component="channel-strip"]')).toHaveCount(8);
  }
});

test("shows the unsupported-size state one pixel below either editing boundary", async ({ page }) => {
  for (const viewport of [
    { width: 1279, height: 720 },
    { width: 1280, height: 719 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('[data-component="unsupported-size"]')).toBeVisible();
    await expect(page.locator('[data-component="studio-panel"]')).toHaveCount(0);
  }
});

test("edits a fixed pre-fader send amount, then restores it with undo and redo", async ({
  page,
}) => {
  const studio = await openStudio(page, "Mixer");
  const strip = loadedStrip(studio);
  const send = strip.getByRole("button", { name: /send A/iu });
  await send.click();

  const editor = page.locator('[data-component="send-value-surface"]');
  await expect(editor).toBeVisible();
  const amount = editor.getByRole("slider", { name: "Amount", exact: true });
  await amount.focus();
  await amount.press("ArrowRight");
  const changedAmount = Number(await amount.getAttribute("aria-valuenow"));
  expect(changedAmount).toBeGreaterThan(0);
  await expect(editor.getByRole("combobox", { name: "Send A tap mode" })).toHaveCount(0);
  await expect(send).toHaveAttribute("data-active", "true");

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(amount).toHaveAttribute("aria-valuenow", "0");
  await expect(send).toHaveAttribute("data-active", "false");
  await redo.click();
  await expect(send).toHaveAttribute("data-active", "true");

  await waitForAutosaveValue(page, `"amount":${String(changedAmount)}`);
  await page.reload();
  const reloadedStudio = await openStudio(page, "Mixer");
  const reloadedSend = loadedStrip(reloadedStudio).getByRole("button", { name: /send A/iu });
  await expect(reloadedSend).toHaveAttribute("data-active", "true");
  await reloadedSend.click();
  await expect(page.locator('[data-component="send-value-surface"]')).toBeVisible();
  const reloadedEditor = page.locator('[data-component="send-value-surface"]');
  await expect(reloadedEditor.getByRole("combobox", { name: "Send A tap mode" })).toHaveCount(0);
  await expect(reloadedEditor.getByRole("slider", { name: "Amount", exact: true })).toHaveAttribute(
    "aria-valuenow",
    String(changedAmount),
  );
});

test("opens one send-chain editor, supports add, Mix, Gain, bypass, focus, and keyboard reorder", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const studio = await openStudio(page, "Effects");
  const cards = studio.locator('[data-component="effect-slot"]');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toContainText(/Analog echo/i);
  await expect(cards.nth(1)).toContainText(/Plate reverb/i);
  await expect(cards.nth(2)).toContainText(/Stereo width/i);
  await expect(cards.nth(3)).toContainText(/Drive/i);

  const card = cards.nth(0);
  const returnLevel = card.getByRole("slider", { name: "Send A Return Level" });
  const returnBefore = Number(await returnLevel.getAttribute("aria-valuenow"));
  await returnLevel.focus();
  await returnLevel.press("ArrowLeft");
  expect(Number(await returnLevel.getAttribute("aria-valuenow"))).toBeLessThan(returnBefore);
  const chainBypass = card.getByRole("button", { name: /Chain bypass/iu });
  if ((await chainBypass.getAttribute("aria-pressed")) === "true") await chainBypass.click();
  await chainBypass.click();
  await expect(chainBypass).toHaveAttribute("aria-pressed", "true");
  await chainBypass.click();

  const edit = card.getByRole("button", { name: "Edit", exact: true });
  await edit.click();
  const detail = page.locator('[data-component="effect-editor"]');
  await expect(detail).toBeVisible();
  await expect(detail).toHaveAttribute("aria-label", /Send A/i);
  const detailBox = await box(detail);
  expect(detailBox.width).toBeCloseTo(760, 0);
  expect(detailBox.height).toBeCloseTo(680, 0);

  const add = detail.getByRole("combobox", { name: /Add an effect to Send A/i });
  await add.selectOption({ label: "Chorus" });

  const rows = detail.locator("ol > li");
  const added = rows.filter({
    has: page.locator("strong").filter({ hasText: /^Chorus$/u }),
  });
  await expect(added).toBeVisible();
  const bypass = added.getByRole("button", { name: "Bypass Chorus in Send A", exact: true });
  await bypass.click();
  await expect(
    added.getByRole("button", { name: "Bypassed Chorus in Send A", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const mix = added.getByRole("slider", { name: "Chorus in Send A Mix" });
  const mixBefore = Number(await mix.getAttribute("aria-valuenow"));
  await mix.focus();
  await mix.press("ArrowLeft");
  const mixAfter = Number(await mix.getAttribute("aria-valuenow"));
  expect(mixAfter).toBeLessThan(mixBefore);
  const gain = added.getByRole("slider", { name: "Chorus in Send A Gain" });
  await gain.focus();
  await gain.press("ArrowDown");
  const gainAfter = Number(await gain.getAttribute("aria-valuenow"));
  expect(gainAfter).toBeLessThan(0);

  const detailSliderNames = await detail.getByRole("slider").evaluateAll((controls) =>
    controls.map((control) => control.getAttribute("aria-label")),
  );
  expect(new Set(detailSliderNames).size).toBe(detailSliderNames.length);

  const drag = added.getByRole("button", { name: /Drag Chorus in Send A to reorder/i });
  const dragBox = await box(drag);
  const targetBox = await box(rows.first());
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(rows.first().locator("strong").first()).toHaveText("Chorus");

  const later = added.getByRole("button", { name: /Move Chorus in Send A later/i });
  await later.focus();
  await expect(later).toBeEnabled();
  await later.press("Enter");
  await expect(rows.first().locator("strong").first()).toHaveText("Analog Echo");
  const earlier = added.getByRole("button", { name: /Move Chorus in Send A earlier/i });
  await earlier.focus();
  await expect(earlier).toBeEnabled();
  await earlier.press("Enter");
  await expect(rows.first().locator("strong").first()).toHaveText("Chorus");

  const pin = added.getByRole("button", {
    name: /Pin Chorus in Send A to the compact send card/i,
  });
  await expect(pin).toBeEnabled();
  await pin.click();

  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(edit).toBeFocused();
  await expect(card).toContainText(/Chorus/i);

  await waitForAutosaveValue(page, `"mix":${String(mixAfter)}`);
  await waitForAutosaveValue(page, `"gainDecibels":${String(gainAfter)}`);
  await page.reload();
  const reloadedEffects = await openStudio(page, "Effects");
  const reloadedEdit = reloadedEffects.locator('[data-component="effect-slot"]').first().getByRole("button", { name: "Edit", exact: true });
  await reloadedEdit.click();
  const reloadedDetail = page.locator('[data-component="effect-editor"]');
  await expect(
    reloadedDetail.locator("ol > li").filter({
      has: page.locator("strong").filter({ hasText: /^Chorus$/u }),
    }),
  ).toBeVisible();
  await expect(reloadedDetail.getByRole("slider", { name: "Chorus in Send A Mix" })).toHaveAttribute(
    "aria-valuenow",
    String(mixAfter),
  );
  await expect(reloadedDetail.getByRole("slider", { name: "Chorus in Send A Gain" })).toHaveAttribute(
    "aria-valuenow",
    String(gainAfter),
  );
});

test("routes mixer controls and all four send returns through live output", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const sampleRate of [44_100, 48_000]) {
    const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
    const page = await context.newPage();
    try {
      await installLiveAudioProbe(page, sampleRate);
      await page.goto("http://127.0.0.1:4173/");
      await primeLiveAudio(page);
      const probe = await liveAudioProbe(page);
      expect(probe.actualSampleRate).toBe(sampleRate);
      expect(probe.contextCount).toBe(1);

      const target = await isolateModuleOnMixer(page);
      const fader = target.getByRole("slider", { name: "Silver Serpent level" });
      const pan = target.getByRole("slider", { name: "Silver Serpent pan" });
      const mute = target.getByRole("button", { name: "Mute Silver Serpent", exact: true });

      assertSignal(await holdAudition(page));
      await fader.focus();
      await fader.press("Home");
      assertSilent(await holdAudition(page, "Silver Serpent", false));
      await fader.press("End");
      assertSignal(await holdAudition(page));

      await mute.click();
      assertSilent(await holdAudition(page, "Silver Serpent", false));
      await mute.click();

      await pan.focus();
      await pan.press("Home");
      const left = await holdAudition(page);
      expect(left.leftRms).toBeGreaterThan(left.rightRms * 3 + 1e-4);
      await pan.press("End");
      const right = await holdAudition(page);
      expect(right.rightRms).toBeGreaterThan(right.leftRms * 3 + 1e-4);

      await fader.focus();
      await fader.press("Home");
      for (const [index, send] of SENDS.entries()) {
        const mixer = await openStudio(page, "Mixer");
        const sendButton = mixer.getByRole("button", {
          name: new RegExp(`^Open send ${send} for Silver Serpent\\.`),
        });
        await sendButton.click();
        const sendSurface = page.locator('[data-component="send-value-surface"]');
        const amount = sendSurface.getByRole("slider", { name: "Amount", exact: true });
        await amount.focus();
        await amount.press("End");
        await sendSurface.getByRole("button", { name: "Close send value" }).click();

        const effects = await openStudio(page, "Effects");
        const card = effects.locator('[data-component="effect-slot"]').nth(index);
        const returnLevel = card.getByRole("slider", { name: `Send ${send} Return Level` });
        await returnLevel.focus();
        await returnLevel.press("Home");
        assertSilent(await holdAudition(page, "Silver Serpent", false));
        await returnLevel.press("End");
        assertSignal(await holdAudition(page));
        await returnLevel.press("Home");
      }

      const mixer = await openStudio(page, "Mixer");
      const second = mixer.locator('[data-component="channel-strip"][aria-label="Tin Soldier channel"]');
      const targetAgain = mixer.locator('[data-component="channel-strip"][aria-label="Silver Serpent channel"]');
      const secondMute = second.getByRole("button", { name: "Mute Tin Soldier", exact: true });
      if ((await secondMute.getAttribute("aria-pressed")) === "true") await secondMute.click();
      await targetAgain.getByRole("slider", { name: "Silver Serpent level" }).press("End");
      await second.getByRole("slider", { name: "Tin Soldier level" }).press("End");
      await targetAgain.getByRole("slider", { name: "Silver Serpent pan" }).press("Home");
      await second.getByRole("slider", { name: "Tin Soldier pan" }).press("End");

      await page.getByRole("button", { name: "Play", exact: true }).click();
      await expect(page.locator(".audio-status")).toHaveText("Audio active");
      const both = await readLiveOutput(page, { waitForSignal: true });
      expect(both.leftRms).toBeGreaterThan(1e-4);
      expect(both.rightRms).toBeGreaterThan(1e-4);

      const solo = targetAgain.getByRole("button", { name: "Solo Silver Serpent", exact: true });
      await solo.click();
      await expect(second).toHaveAttribute("data-silenced", "true");
      const soloOutput = await readLiveOutput(page, { waitForSignal: true });
      expect(soloOutput.leftRms).toBeGreaterThan(1e-4);
      expect(soloOutput.rightRms).toBeLessThan(both.rightRms * 0.35);
      await page.getByRole("button", { name: "Stop", exact: true }).click();
    } finally {
      await context.close();
    }
  }
});

test("routes every catalog worklet through a module pedalboard at both rates", async ({ browser }) => {
  test.setTimeout(240_000);
  const fixtures = [
    ["Lo-fi", "Sample Rate", "Home"],
    ["Pattern Filter", "Drive", "End"],
    ["Distortion", "Drive", "End"],
    ["Compressor", "Threshold", "Home"],
    ["Analog Echo", "Feedback", "End"],
    ["Plate Reverb", "Decay", "End"],
    ["Chorus", "Depth", "End"],
    ["Phaser", "Depth", "End"],
    ["Parametric EQ", "Mid Gain", "End"],
    ["Transient Shaper", "Attack", "End"],
    ["Stereo Width", "Width", "End"],
  ] as const;
  for (const sampleRate of [44_100, 48_000]) {
    const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
    const page = await context.newPage();
    try {
      await installLiveAudioProbe(page, sampleRate);
      await page.goto("http://127.0.0.1:4173/");
      await primeLiveAudio(page);
      await isolateModuleOnMixer(page);
      const rackModule = page.locator('[data-component="rack-module"][data-label="Silver Serpent"]').first();
      await rackModule.getByRole("button", { name: "Effects", exact: true }).click();
      let editor = page.locator('[data-component="effect-editor"]');
      let add = editor.getByRole("combobox", { name: "Add an effect to Silver Serpent pedalboard" });

      for (const fixture of fixtures) {
        const [effectName, parameterName, key] = fixture;
        await add.selectOption({ label: effectName });
        const row = editor.locator("ol > li").filter({ hasText: effectName }).first();
        await expect(row).toBeVisible();
        const mix = row.getByRole("slider", { name: new RegExp(`${effectName}.* Mix$`, "i") });
        await mix.press("End");
        const parameter = row.getByRole("slider", { name: new RegExp(`${parameterName}$`) });
        await parameter.press(key);
        await page.keyboard.press("Escape");
        await expect(editor).toBeHidden();
        assertSignal(await holdAudition(page));

        const probe = await liveAudioProbe(page);
        expect(probe.effectPlugins).toContain(effectName === "Analog Echo" ? "delay" : effectName === "Plate Reverb" ? "reverb" : effectName.toLowerCase().replaceAll(" ", "-"));
        await rackModule.getByRole("button", { name: "Effects", exact: true }).click();
        editor = page.locator('[data-component="effect-editor"]');
        add = editor.getByRole("combobox", { name: "Add an effect to Silver Serpent pedalboard" });
        const activeRow = editor.locator("ol > li").filter({ hasText: effectName }).first();
        await activeRow.getByRole("button", {
          name: new RegExp(`^Remove ${effectName} in Silver Serpent pedalboard$`),
        }).click();
        await expect(activeRow).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  }
});

test("keeps master gain and the protected limiter active during user-effects bypass", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
  const page = await context.newPage();
  try {
    await installLiveAudioProbe(page, 48_000);
    await page.goto("http://127.0.0.1:4173/");
    const setupStudio = await openStudio(page, "Master");
    const setupMaster = setupStudio.locator('[data-component="master-panel"]');
    await setupMaster.getByRole("button", { name: "Edit chain", exact: true }).click();
    const setupEditor = page.locator('[data-component="effect-editor"]');
    await expect(setupEditor).toBeVisible();
    await setupEditor
      .getByRole("slider", { name: "Compressor in Master chain Threshold" })
      .press("Home");
    await setupEditor
      .getByRole("slider", { name: "Compressor in Master chain Makeup" })
      .press("End");
    await setupEditor
      .getByRole("slider", { name: "Limiter in Master chain Gain" })
      .press("End");
    await page.keyboard.press("Escape");
    await expect(setupEditor).toBeHidden();
    await primeLiveAudio(page);
    await isolateModuleOnMixer(page);

    const studio = await openStudio(page, "Master");
    const master = studio.locator('[data-component="master-panel"]');
    await expect(master).toContainText(/6 effects loaded/u);

    const before = await liveAudioProbe(page);
    const active = await holdAudition(page);
    assertSignal(active);
    expect(active.peak).toBeLessThan(0.95);

    const bypass = master.getByRole("button", {
      name: /Bypass master effects|Master effects bypassed/iu,
    });
    await bypass.click();
    await expect(bypass).toHaveAttribute("aria-pressed", "true");
    const bypassed = await holdAudition(page);
    assertSignal(bypassed);
    expect(bypassed.peak).toBeLessThan(0.95);
    expect(Math.abs(active.leftRms - bypassed.leftRms) + Math.abs(active.rightRms - bypassed.rightRms)).toBeGreaterThan(1e-4);

    const masterFader = master.getByRole("slider", { name: "Master level" });
    await masterFader.press("Home");
    assertSilent(await holdAudition(page, "Silver Serpent", false));
    await masterFader.press("End");
    assertSignal(await holdAudition(page));

    const after = await liveAudioProbe(page);
    expect(after.contextCount).toBe(before.contextCount);
    expect(after.analyserCount).toBe(before.analyserCount);
  } finally {
    await context.close();
  }
});

test("keeps the pedalboard in the instrument rack", async ({ page }) => {
  await openStudio(page, "Mixer");

  const rackModule = page.locator('[data-component="rack-module"]:not([data-label="Empty"])').first();
  await rackModule.getByRole("button", { name: "Effects" }).click();
  await expect(page.getByRole("dialog", { name: /pedalboard effect editor/i })).toBeVisible();
  await expect(page.getByText("This pedalboard processes only this instrument before its mixer channel.")).toBeVisible();
});

test("bypasses all Rack FX and Send FX with icon-only group controls", async ({ page }) => {
  const studio = await openStudio(page, "Mixer");
  const rackModule = page
    .locator('[data-component="rack-module"][data-label="Silver Serpent"]')
    .first();
  const rackBypass = rackModule.getByRole("button", {
    name: "Bypass all Rack FX for Silver Serpent",
  });
  await expect(rackBypass).toBeDisabled();
  await expect(rackBypass.locator('[data-component="bypass-all-icon"]')).toHaveCount(1);
  await expect(rackBypass).toHaveText("");

  await rackModule.getByRole("button", { name: "Effects", exact: true }).click();
  const editor = page.locator('[data-component="effect-editor"]');
  await editor
    .getByRole("combobox", { name: "Add an effect to Silver Serpent pedalboard" })
    .selectOption({ label: "Chorus" });
  await page.keyboard.press("Escape");
  await expect(rackBypass).toBeEnabled();
  await rackBypass.click();
  await expect(rackBypass).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rackBypass).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(rackBypass).toHaveAttribute("aria-pressed", "true");

  const sendBypass = studio.getByRole("button", { name: "Bypass all Send FX" });
  await expect(sendBypass.locator('[data-component="bypass-all-icon"]')).toHaveCount(1);
  await expect(sendBypass).toHaveText("");
  await sendBypass.click();
  await expect(sendBypass).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(sendBypass).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(sendBypass).toHaveAttribute("aria-pressed", "true");

  await waitForAutosaveValue(page, '"sendEffectsBypassed":true');
  await page.reload();
  const reloadedStudio = await openStudio(page, "Mixer");
  await expect(
    reloadedStudio.getByRole("button", { name: "Bypass all Send FX" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Bypass all Rack FX for Silver Serpent" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("keeps the protected limiter and makes master-effects bypass undoable and persistent", async ({
  page,
}) => {
  const studio = await openStudio(page, "Master");
  const master = studio.locator('[data-component="master-panel"]');
  await expect(master).toContainText(/6 effects loaded/u);

  const bypass = studio.getByRole("button", { name: /bypass master effects|master effects bypass/iu });
  await expect(bypass).toHaveAttribute("aria-pressed", "false");
  await bypass.click();
  await expect(bypass).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Master effects bypass/i })).not.toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(bypass).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(bypass).toHaveAttribute("aria-pressed", "true");
  await master.getByRole("button", { name: "Edit chain", exact: true }).click();
  const detail = page.locator('[data-component="effect-editor"]');
  await expect(detail).toBeVisible();
  const limiter = detail.locator("ol > li").filter({
    has: page.locator("strong").filter({ hasText: /^Limiter$/u }),
  });
  await expect(limiter).toBeVisible();
  await expect(limiter.getByRole("button", { name: /protected from removal/i })).toBeDisabled();
  await expect(limiter.getByRole("button", { name: "Bypass Limiter in Master chain", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await waitForAutosaveValue(page, '"masterEffectsBypassed":true');
  await page.reload();
  const reloadedMaster = await openStudio(page, "Master");
  await expect(reloadedMaster.getByRole("button", { name: /bypass master effects|master effects bypass/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("keeps studio panes mutually exclusive and keyboard-operable", async ({ page }) => {
  const studio = page.locator('[data-component="studio-panel"]');
  const tabs = studio.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await tabs.first().focus();
  await tabs.first().press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(studio.locator('[data-component="mixer"]')).toHaveCount(0);
  await expect(studio.locator('[data-component="effects-bank"]')).toBeVisible();
  await tabs.nth(1).press("ArrowRight");
  await expect(tabs.nth(2)).toBeFocused();
  await expect(studio.locator('[data-component="effects-bank"]')).toHaveCount(0);
  await expect(studio.locator('[data-component="master-panel"]')).toBeVisible();
  await expect(studio.locator('[role="tabpanel"] [aria-hidden="false"]')).toHaveCount(0);
});
