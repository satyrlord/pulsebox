import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import {
  captureProductionBuildEvidence,
  type ProductionBuildEvidence,
} from "./production-build-evidence";

const CANONICAL_ORIGIN = "http://127.0.0.1:4173";
const LOADED_RACK_MODULE = '[data-component="rack-module"]:not([data-label="Empty"])';
const HASHED_ASSET_PATH = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/u;
const SOURCE_REVISION = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const WORKTREE_SOURCE_HASH = (() => {
  const paths = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "scripts",
      "src",
      "tests",
      "package.json",
      "package-lock.json",
      "playwright.config.ts",
      "vite.config.ts",
    ],
    { encoding: "utf8" },
  )
    .split(/\r?\n/u)
    .filter((path) => path.length > 0)
    .sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    if (existsSync(path)) hash.update(path).update("\0").update(readFileSync(path)).update("\0");
    else hash.update(`deleted:${path}`).update("\0");
  }
  return hash.digest("hex");
})();

interface CacheHeaderEvidence {
  readonly cacheControl: string | null;
  readonly path: string;
}

interface FirstSoundFrame {
  readonly analyzerIndex: number;
  readonly contextTime: number;
  readonly performanceTime: number;
  readonly sampleIndex: number;
  readonly sampleValue: number;
}

interface FirstSoundProbe {
  readonly analyzerCount: number;
  readonly contexts: readonly {
    readonly baseLatency: number;
    readonly latencyHint: AudioContextLatencyCategory | number | null;
    readonly outputLatency: number;
    readonly sampleRate: number;
  }[];
  readonly firstNonSilent: FirstSoundFrame | null;
  readonly outputTimestampSupported: boolean;
  readonly trustedPlayPerformanceTime: number | null;
}

interface FirstSoundRun {
  readonly audioContext: {
    readonly baseLatency: number;
    readonly latencyHint: AudioContextLatencyCategory | number | null;
    readonly outputLatency: number;
    readonly sampleRate: number;
  };
  readonly productionBuild: ProductionBuildEvidence;
  readonly browser: string;
  readonly browserName: "Chrome";
  readonly cacheHeaders: readonly CacheHeaderEvidence[];
  readonly elapsedMilliseconds: number;
  readonly environment: {
    readonly audioDevice: readonly string[] | "not exposed";
    readonly deviceMemoryGiB: number | "not exposed";
    readonly hardwareConcurrency: number | "not exposed";
  };
  readonly firstNonSilent: FirstSoundFrame;
  readonly instruments: readonly string[];
  readonly run: number;
  readonly sampleRate: number;
  readonly trustedPlayPerformanceTime: number;
}

function launchPersistentContext(
  browser: Browser,
  userDataDir: string,
): Promise<BrowserContext> {
  return browser.browserType().launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: true,
    viewport: { width: 1536, height: 1024 },
  });
}

async function loadApp(page: Page): Promise<void> {
  await page.goto(`${CANONICAL_ORIGIN}/`);
  await expect(page.getByRole("button", { name: /^play$/i })).toBeVisible();
}

async function assertFreshProfileGuidance(page: Page): Promise<void> {
  const selector = page.getByRole("button", { name: /Project selector/ });
  await expect(selector).toHaveAccessibleName(/Current project: Neon Basement/);
  await expect(page.locator(LOADED_RACK_MODULE)).toHaveCount(6);
  await expect(page.getByRole("button", { name: /^play$/i })).toHaveAttribute(
    "title",
    "Play. Space.",
  );
  expect(await page.getByRole("combobox", { name: "Selected Pattern" }).inputValue()).toMatch(
    /^[0-9a-f-]{36}$/u,
  );
  await expect(page.getByRole("group", { name: /Silver Serpent events in Verse/u })).toBeVisible();
  await expect(page.locator('[data-component="piano-roll-event"]').first()).toHaveAccessibleName(
    /note, step [0-9]+,/u,
  );

  await selector.click();
  await expect(page.getByRole("list", { name: "Stored projects" })).toHaveText(
    "No stored projects yet.",
  );
  await selector.click();
}

async function storeDefaultProject(page: Page): Promise<void> {
  const selector = page.getByRole("button", { name: /Project selector/ });
  await selector.click();
  await page.getByRole("button", { name: "New: Neon Basement" }).click();
  await expect(page.locator('[data-component="project-menu"]').getByRole("status")).toHaveText(
    /Created Neon Basement from the built-in template/,
  );
  await expect(selector).toHaveAccessibleName(/Current project: Neon Basement/);
  await expect(page.locator(LOADED_RACK_MODULE)).toHaveCount(6);

  await selector.click();
  await expect(
    page.getByRole("list", { name: "Stored projects" }).getByRole("button", { name: /Neon Basement/ }),
  ).toHaveCount(2);
  await selector.click();
}

async function warmProfile(
  browser: Browser,
  userDataDir: string,
): Promise<readonly CacheHeaderEvidence[]> {
  const context = await launchPersistentContext(browser, userDataDir);
  try {
    const page = await context.newPage();
    const headers: CacheHeaderEvidence[] = [];
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin !== CANONICAL_ORIGIN) return;
      headers.push({
        cacheControl: response.headers()["cache-control"] ?? null,
        path: url.pathname,
      });
    });
    await loadApp(page);
    await assertFreshProfileGuidance(page);

    const indexResponse = headers.find(
      (header) => header.path === "/" || header.path === "/index.html",
    );
    expect(indexResponse?.cacheControl).toBe("no-cache");
    const hashedAssets = headers.filter((header) => HASHED_ASSET_PATH.test(header.path));
    expect(hashedAssets.length).toBeGreaterThan(0);
    expect(hashedAssets.every((header) => header.cacheControl === "public, max-age=31536000, immutable")).toBe(
      true,
    );
    return headers;
  } finally {
    await context.close();
  }
}

async function installFirstSoundProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Probe {
      analyzerCount: number;
      contexts: {
        baseLatency: number;
        latencyHint: AudioContextLatencyCategory | number | null;
        outputLatency: number;
        sampleRate: number;
      }[];
      firstNonSilent:
        | {
            analyzerIndex: number;
            contextTime: number;
            performanceTime: number;
            sampleIndex: number;
            sampleValue: number;
          }
        | null;
      outputTimestampSupported: boolean;
      trustedPlayPerformanceTime: number | null;
    }
    const state = window as unknown as { __firstSoundProbe: Probe };
    state.__firstSoundProbe = {
      analyzerCount: 0,
      contexts: [],
      firstNonSilent: null,
      outputTimestampSupported: false,
      trustedPlayPerformanceTime: null,
    };

    const NativeAudioContext = window.AudioContext;
    class ProbedAudioContext extends NativeAudioContext {
      override createAnalyser(): AnalyserNode {
        const analyser = super.createAnalyser();
        const analyzerIndex = state.__firstSoundProbe.analyzerCount;
        state.__firstSoundProbe.analyzerCount += 1;
        const nativeRead = analyser.getFloatTimeDomainData.bind(analyser);
        Object.defineProperty(analyser, "getFloatTimeDomainData", {
          configurable: true,
          value: (samples: Float32Array) => {
            nativeRead(samples as Float32Array<ArrayBuffer>);
            const probe = state.__firstSoundProbe;
            if (probe.trustedPlayPerformanceTime === null || probe.firstNonSilent !== null) {
              return;
            }
            const sampleIndex = samples.findIndex((sample) => Math.abs(sample) > 1e-5);
            if (sampleIndex < 0) return;
            const timestamp = this.getOutputTimestamp();
            const contextTime = timestamp.contextTime;
            const performanceTime = timestamp.performanceTime;
            if (
              typeof contextTime !== "number" ||
              typeof performanceTime !== "number" ||
              !Number.isFinite(contextTime) ||
              !Number.isFinite(performanceTime)
            ) {
              return;
            }
            probe.outputTimestampSupported = true;
            const framesAfterFirst = Math.max(0, samples.length - 1 - sampleIndex);
            const offsetMilliseconds = (framesAfterFirst * 1_000) / this.sampleRate;
            probe.firstNonSilent = {
              analyzerIndex,
              contextTime: contextTime - framesAfterFirst / this.sampleRate,
              performanceTime: performanceTime - offsetMilliseconds,
              sampleIndex,
              sampleValue: samples[sampleIndex] ?? 0,
            };
          },
        });
        return analyser;
      }

      constructor(options: AudioContextOptions = {}) {
        super(options);
        state.__firstSoundProbe.contexts.push({
          baseLatency: this.baseLatency,
          latencyHint: options.latencyHint ?? null,
          outputLatency: this.outputLatency,
          sampleRate: this.sampleRate,
        });
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: ProbedAudioContext,
    });

    window.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (
          event.isTrusted &&
          target instanceof Element &&
          target.closest('button[aria-label="Play"]') !== null &&
          state.__firstSoundProbe.trustedPlayPerformanceTime === null
        ) {
          state.__firstSoundProbe.trustedPlayPerformanceTime = performance.now();
        }
      },
      true,
    );
  });
}

async function captureAudioEnvironment(page: Page): Promise<FirstSoundRun["environment"]> {
  return page.evaluate<FirstSoundRun["environment"]>(async () => {
    const navigatorWithMemory = navigator as Navigator & { readonly deviceMemory?: number };
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const labels = devices
        .filter((device) => device.kind === "audiooutput")
        .map((device) => device.label)
        .filter((label) => label.length > 0);
      return {
        audioDevice: labels.length > 0 ? labels : "not exposed",
        deviceMemoryGiB: navigatorWithMemory.deviceMemory ?? "not exposed",
        hardwareConcurrency: navigator.hardwareConcurrency,
      };
    } catch {
      return {
        audioDevice: "not exposed",
        deviceMemoryGiB: navigatorWithMemory.deviceMemory ?? "not exposed",
        hardwareConcurrency: navigator.hardwareConcurrency,
      };
    }
  });
}

async function measureFirstSound(
  browser: Browser,
  userDataDir: string,
  run: number,
  cacheHeaders: readonly CacheHeaderEvidence[],
): Promise<FirstSoundRun> {
  const context = await launchPersistentContext(browser, userDataDir);
  try {
    const page = await context.newPage();
    await installFirstSoundProbe(page);
    await loadApp(page);
    await expect(page.locator(LOADED_RACK_MODULE)).toHaveCount(6);
    await page.getByRole("button", { name: /^play$/i }).click();
    await expect(page.locator(".audio-status")).toHaveText("Audio active");
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const state = window as unknown as {
              __firstSoundProbe: { firstNonSilent: unknown };
            };
            return state.__firstSoundProbe.firstNonSilent !== null;
          }),
        {
          message: "Expected a post-limiter analyzer frame after the trusted Play action.",
          timeout: 3_000,
        },
      )
      .toBe(true);

    const probe = await page.evaluate(() => {
      const state = window as unknown as { __firstSoundProbe: FirstSoundProbe };
      return state.__firstSoundProbe;
    });
    expect(probe.analyzerCount).toBe(2);
    expect(probe.contexts).toHaveLength(1);
    expect(probe.outputTimestampSupported).toBe(true);
    expect(probe.trustedPlayPerformanceTime).not.toBeNull();
    expect(probe.firstNonSilent).not.toBeNull();
    const trustedPlayPerformanceTime = probe.trustedPlayPerformanceTime;
    const firstNonSilent = probe.firstNonSilent;
    if (trustedPlayPerformanceTime === null || firstNonSilent === null) {
      throw new Error("The first-sound probe did not capture both required timestamps.");
    }
    expect(Math.abs(firstNonSilent.sampleValue)).toBeGreaterThan(1e-5);
    const elapsedMilliseconds = firstNonSilent.performanceTime - trustedPlayPerformanceTime;
    expect(elapsedMilliseconds).toBeGreaterThanOrEqual(0);
    expect(elapsedMilliseconds).toBeLessThanOrEqual(3_000);

    const contextEvidence = probe.contexts[0];
    if (contextEvidence === undefined) throw new Error("Expected AudioContext evidence.");
    const instruments = await page.locator(LOADED_RACK_MODULE).evaluateAll((modules) =>
      modules.map((module) => module.getAttribute("data-label") ?? "Unknown"),
    );
    return {
      audioContext: contextEvidence,
      browser: context.browser()?.version() ?? "not exposed",
      browserName: "Chrome",
      cacheHeaders,
      elapsedMilliseconds,
      environment: await captureAudioEnvironment(page),
      firstNonSilent,
      instruments,
      productionBuild: captureProductionBuildEvidence(),
      run,
      sampleRate: contextEvidence.sampleRate,
      trustedPlayPerformanceTime,
    };
  } finally {
    await context.close();
  }
}

/** This checks the AC-077 single-owner fresh-storage startup contract. */
test("fresh storage exposes the supplied loop, Play control, and selected Pattern", async ({ browser }, testInfo) => {
  const context = await launchPersistentContext(
    browser,
    testInfo.outputPath("ac-077-fresh-profile"),
  );
  try {
    const page = await context.newPage();
    await loadApp(page);
    await assertFreshProfileGuidance(page);
  } finally {
    await context.close();
  }
});

test("five warm-cache Chrome runs reach a post-limiter frame within three seconds", async (
  { browser },
  testInfo,
) => {
  test.setTimeout(180_000);
  const runs: FirstSoundRun[] = [];
  for (let run = 1; run <= 5; run += 1) {
    const userDataDir = testInfo.outputPath(`first-sound-profile-${String(run)}`);
    const cacheHeaders = await warmProfile(browser, userDataDir);

    const preparation = await launchPersistentContext(browser, userDataDir);
    try {
      const page = await preparation.newPage();
      await loadApp(page);
      await storeDefaultProject(page);
    } finally {
      await preparation.close();
    }

    runs.push(await measureFirstSound(browser, userDataDir, run, cacheHeaders));
  }

  expect(runs).toHaveLength(5);
  expect(runs.every((run) => run.elapsedMilliseconds <= 3_000)).toBe(true);
  const audioArtifactName = "first-sound-observations.json";
  const audioArtifact = JSON.stringify(
    runs.map((run) => ({
      firstNonSilent: run.firstNonSilent,
      run: run.run,
      sampleRate: run.sampleRate,
      trustedPlayPerformanceTime: run.trustedPlayPerformanceTime,
    })),
    null,
    2,
  );
  const audioArtifactHash = createHash("sha256").update(audioArtifact).digest("hex");
  const report = JSON.stringify(
    {
      activeEffects: "No active effects.",
      activeInstruments: runs[0]?.instruments ?? [],
      activeVoices: "The selected supplied Pattern's saved pitched and drum-note events.",
      audioArtifact: { name: audioArtifactName, sha256: audioArtifactHash },
      browserName: "Chrome",
      capturedAt: new Date().toISOString(),
      comparisonMethod:
        "Measure each trusted Play action to the first post-limiter analyzer sample above 1e-5, with a 3,000 ms limit.",
      context: "live",
      deterministicPatternSeed:
        "Not used by the supplied Pattern because its Humanize value is zero percent.",
      environment: {
        memoryBytes: totalmem(),
        operatingSystem: `${platform()} ${release()} ${arch()}`,
        processors: cpus().map((cpu) => ({ model: cpu.model, speedMHz: cpu.speed })),
      },
      fixture: "The supplied six-instrument loop in the selected Pattern.",
      procedure:
        "For each run: fresh persistent Chrome profile, one successful load, close context, fresh-context template save, close context, then trusted Play to the first post-limiter non-silent analyzer frame.",
      requestedSampleRate: "browser-default",
      routing: "Each module routes through its mixer strip to the post-limiter master analyzer.",
      runs,
      sourceRevision: SOURCE_REVISION,
      worktreeSourceSha256: WORKTREE_SOURCE_HASH,
    },
    null,
    2,
  );
  const reportHash = createHash("sha256").update(report).digest("hex");
  const reportPath = testInfo.outputPath("first-sound-release.json");
  const audioArtifactPath = testInfo.outputPath(audioArtifactName);
  const hashPath = `${reportPath}.sha256`;
  await writeFile(audioArtifactPath, audioArtifact, "utf8");
  await writeFile(reportPath, report, "utf8");
  await writeFile(
    hashPath,
    `${reportHash}  ${reportPath.split(/[\\/]/u).at(-1) ?? "first-sound-release.json"}\n${audioArtifactHash}  ${audioArtifactName}\n`,
    "utf8",
  );
  await testInfo.attach(audioArtifactName, {
    path: audioArtifactPath,
    contentType: "application/json",
  });
  await testInfo.attach("first-sound-release.json", {
    path: reportPath,
    contentType: "application/json",
  });
  await testInfo.attach("first-sound-release.sha256", {
    path: hashPath,
    contentType: "text/plain",
  });
});
