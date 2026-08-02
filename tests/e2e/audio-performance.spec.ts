import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";

const RACK_MODULE = '[data-component="rack-module"]';
const LOADED_RACK_MODULE = `${RACK_MODULE}:not([data-label="Empty"])`;
const DRUMLINE_PROCESSOR = "pulsebox-drumline-six";
/** The fixed 1/16 Pattern grid puts four steps in one beat. */
const STEPS_PER_BEAT = 4;
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

interface AudioProbeEvidence {
  readonly captureEndedAt: number;
  readonly captureStartedAt: number;
  readonly contexts: readonly {
    readonly sampleRate: number;
    readonly baseLatency: number;
    readonly outputLatency: number;
    readonly latencyHint: AudioContextLatencyCategory | number | undefined;
  }[];
  readonly longTasks: readonly number[];
  readonly meterPeaks: readonly number[];
  readonly nodes: readonly {
    readonly processorName: string;
    /** Onset frames the module sounds, in order. See `onsetsFor` in the probe. */
    readonly onsets: readonly number[];
    readonly resets: number;
    readonly expiredOnsets: number;
  }[];
}

type NodeEvidence = AudioProbeEvidence["nodes"][number];

/**
 * Compares what each module actually sounds, not the raw batches it received.
 *
 * A rebuild clears each queue and refills it, and the audio clock can pass a
 * render boundary in the middle of that pass. A module on the near side of the
 * boundary still has the imminent onset queued, so its rebuild re-sends it. A
 * module on the far side already sounded that onset, so its rebuild correctly
 * omits it. Both modules play the same note at the same frame. The probe models
 * the processor queue so that identical modules compare equal.
 */
function expectAlignedNodes(
  nodes: readonly NodeEvidence[],
  maximumFrameSpread: number,
): void {
  expect(nodes).toHaveLength(3);
  expect(nodes.every((node) => node.expiredOnsets === 0)).toBe(true);
  // Each gesture must have replaced the queued horizon at least once, or the
  // comparison below proves nothing about the rebuild path.
  expect(nodes.every((node) => node.resets > 0)).toBe(true);
  const reference = nodes[0]?.onsets ?? [];
  expect(reference.length).toBeGreaterThan(0);
  for (const node of nodes) {
    const candidate = node.onsets;
    expect(new Set(candidate).size).toBe(candidate.length);
    if (maximumFrameSpread === 0) {
      expect(candidate).toEqual(reference);
      continue;
    }
    expect(Math.abs(candidate.length - reference.length)).toBeLessThanOrEqual(1);
    const offsets: readonly (readonly [number, number])[] =
      candidate.length === reference.length
        ? [[0, 0]]
        : candidate.length > reference.length
          ? [
              [0, 0],
              [1, 0],
            ]
          : [
              [0, 0],
              [0, 1],
            ];
    const compared = Math.min(candidate.length, reference.length);
    const bestSpread = Math.min(
      ...offsets.map(([candidateOffset, referenceOffset]) => {
        let spread = 0;
        for (let onsetIndex = 0; onsetIndex < compared; onsetIndex += 1) {
          spread = Math.max(
            spread,
            Math.abs(
              (candidate[onsetIndex + candidateOffset] ?? 0) -
                (reference[onsetIndex + referenceOffset] ?? 0),
            ),
          );
        }
        return spread;
      }),
    );
    expect(bestSpread).toBeLessThanOrEqual(maximumFrameSpread);
  }
}

for (const requestedSampleRate of [44_100, 48_000]) {
  test(`eight modules stay aligned during timing interaction at ${String(requestedSampleRate)} Hz`, async (
    { browser, page },
    testInfo,
  ) => {
    await page.addInitScript((sampleRate) => {
      interface Probe {
        active: boolean;
        captureEndedAt: number;
        captureStartedAt: number;
        contexts: {
          sampleRate: number;
          baseLatency: number;
          outputLatency: number;
          latencyHint: AudioContextLatencyCategory | number | undefined;
        }[];
        longTasks: number[];
        meterPeaks: number[];
        nodes: {
          processorName: string;
          /** Onsets the module has already sounded. */
          sounded: number[];
          /** Onsets waiting in the processor queue. */
          queued: number[];
          resets: number;
          expiredOnsets: number;
        }[];
      }
      const state = window as unknown as { __audioProbe: Probe };
      state.__audioProbe = {
        active: false,
        captureEndedAt: 0,
        captureStartedAt: 0,
        contexts: [],
        longTasks: [],
        meterPeaks: [],
        nodes: [],
      };
      let idCounter = 1;
      Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        value: () =>
          `10000000-0000-4000-8000-${String(idCounter++).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
      });

      const NativeAudioContext = window.AudioContext;
      class FixedRateAudioContext extends NativeAudioContext {
        constructor(options: AudioContextOptions = {}) {
          super({ ...options, sampleRate });
          state.__audioProbe.contexts.push({
            sampleRate: this.sampleRate,
            baseLatency: this.baseLatency,
            outputLatency: this.outputLatency,
            latencyHint: options.latencyHint,
          });
        }
      }
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        value: FixedRateAudioContext,
      });

      const NativeAudioWorkletNode = window.AudioWorkletNode;
      class ProbedAudioWorkletNode extends NativeAudioWorkletNode {
        constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
          super(context, name, options);
          const record = {
            processorName: name,
            sounded: [] as number[],
            queued: [] as number[],
            resets: 0,
            expiredOnsets: 0,
          };
          state.__audioProbe.nodes.push(record);
          const nativePost = this.port.postMessage.bind(this.port);
          this.port.postMessage = ((message: unknown, transfer?: Transferable[]) => {
            if (state.__audioProbe.active && typeof message === "object" && message !== null) {
              const envelope = message as {
                kind?: string;
                payload?: {
                  events?: { audioFrame?: number; data?: { type?: string } }[];
                  fromFrame?: number;
                };
              };
              const currentFrame = Math.floor(context.currentTime * context.sampleRate);
              if (envelope.kind === "clear-scheduled-events") {
                record.resets += 1;
                // A queued onset the clock has already passed sounded before
                // the clear reached the processor. With a bound, onsets before
                // it stay queued; only the tail from the bound drops, and the
                // rebuild re-sends a step when the new timing still holds it.
                const bound = envelope.payload?.fromFrame;
                record.queued = record.queued.filter((frame) => {
                  if (frame < currentFrame) {
                    record.sounded.push(frame);
                    return false;
                  }
                  return typeof bound === "number" && frame < bound;
                });
              }
              if (envelope.kind === "event-batch" && Array.isArray(envelope.payload?.events)) {
                for (const event of envelope.payload.events) {
                  if (event.data?.type !== "note-on" || typeof event.audioFrame !== "number") continue;
                  // The processor rejects an onset whose frame already passed,
                  // so sending one loses that step.
                  if (event.audioFrame < currentFrame) record.expiredOnsets += 1;
                  else record.queued.push(event.audioFrame);
                }
              }
            }
            nativePost(message, transfer ?? []);
          }) as typeof this.port.postMessage;
        }
      }
      Object.defineProperty(window, "AudioWorkletNode", {
        configurable: true,
        value: ProbedAudioWorkletNode,
      });

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.__audioProbe.longTasks.push(entry.duration);
      }).observe({ entryTypes: ["longtask"] });
    }, requestedSampleRate);
    await page.goto("/");

    const drumline = page.locator(`${RACK_MODULE}[data-label='Tin Soldier']`).first();
    for (let index = 0; index < 2; index += 1) {
      await drumline.getByRole("button", { name: "Tin Soldier module menu" }).click();
      await page.getByRole("menuitem", { name: "Duplicate" }).click();
    }
    await expect(page.locator(LOADED_RACK_MODULE)).toHaveCount(8);

    await page.getByRole("button", { name: /^play$/i }).click();
    await expect(page.locator(".audio-status")).toHaveText("Audio active");
    await page.evaluate(() => {
      const state = window as unknown as {
        __audioProbe: { active: boolean; captureStartedAt: number; meterPeaks: number[] };
      };
      const meters = [...document.querySelectorAll<HTMLElement>(
        '[data-component="rack-module"]:not([data-label="Empty"]) [data-component="level-meter"]',
      )];
      state.__audioProbe.meterPeaks = meters.map(() => 0);
      state.__audioProbe.captureStartedAt = performance.now();
      state.__audioProbe.active = true;
      const sample = () => {
        if (!state.__audioProbe.active) return;
        for (let index = 0; index < meters.length; index += 1) {
          const value = Number(meters[index]?.getAttribute("aria-valuenow") ?? 0);
          state.__audioProbe.meterPeaks[index] = Math.max(
            state.__audioProbe.meterPeaks[index] ?? 0,
            value,
          );
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const takePhaseEvidence = async () =>
      page.evaluate((processorName) => {
        const state = window as unknown as {
          __audioProbe: {
            nodes: {
              processorName: string;
              sounded: number[];
              queued: number[];
              resets: number;
              expiredOnsets: number;
            }[];
          };
        };
        // Everything the module has sounded plus everything it still holds is
        // what it plays. The queue survives the snapshot because the processor
        // still owns it; only the per-phase counters reset.
        const nodes = state.__audioProbe.nodes
          .filter((node) => node.processorName === processorName)
          .map((node) => ({
            processorName: node.processorName,
            onsets: [...node.sounded, ...node.queued].sort((left, right) => left - right),
            resets: node.resets,
            expiredOnsets: node.expiredOnsets,
          }));
        for (const node of state.__audioProbe.nodes) {
          node.sounded = [];
          node.resets = 0;
          node.expiredOnsets = 0;
        }
        return nodes;
      }, DRUMLINE_PROCESSOR);
    // A gesture commit clears each queue and refills it on a later 25 ms
    // scheduler tick. A fixed wait can snapshot before the refill lands on a
    // loaded host. Poll until each probed node holds a post-clear epoch whose
    // newest entry has an onset, then snapshot.
    const waitForPostGestureRefill = async () => {
      await expect
        .poll(
          () =>
            page.evaluate((processorName) => {
              const state = window as unknown as {
                __audioProbe: {
                  nodes: { processorName: string; resets: number; queued: number[] }[];
                };
              };
              const probed = state.__audioProbe.nodes.filter(
                (node) => node.processorName === processorName,
              );
              return (
                probed.length > 0 &&
                probed.every((node) => node.resets > 0 && node.queued.length > 0)
              );
            }, DRUMLINE_PROCESSOR),
          {
            message: "Expected every probed node to refill its event queue after the gesture.",
            timeout: 10_000,
          },
        )
        .toBe(true);
    };

    const swing = page.getByRole("slider", { name: "Project Swing" });
    const box = await swing.boundingBox();
    if (box === null) throw new Error("Expected visible Swing control geometry.");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, y, { steps: 30 });
    await page.mouse.move(box.x + 2, y, { steps: 30 });
    await page.mouse.up();
    await waitForPostGestureRefill();
    const swingEvidence = await takePhaseEvidence();

    const humanize = page.getByRole("slider", { name: "Pattern Humanize" });
    const humanizeBox = await humanize.boundingBox();
    if (humanizeBox === null) throw new Error("Expected visible Humanize control geometry.");
    const humanizeY = humanizeBox.y + humanizeBox.height / 2;
    await page.mouse.move(humanizeBox.x + 2, humanizeY);
    await page.mouse.down();
    await page.mouse.move(humanizeBox.x + humanizeBox.width / 2, humanizeY, { steps: 10 });
    await page.mouse.move(humanizeBox.x + 2, humanizeY, { steps: 10 });
    await page.mouse.up();
    await waitForPostGestureRefill();
    const humanizeEvidence = await takePhaseEvidence();

    const tempo = page.locator('[data-field="tempo"]');
    // The Humanize spread tolerance depends on the tempo that was active during
    // the Humanize drag. Read that tempo from the transport display before the
    // tempo drag changes it. The default value comes from spec-005 section 9.1,
    // so a changed default project tempo cannot silently break this check.
    const humanizePhaseTempo = Number(await tempo.inputValue());
    expect(humanizePhaseTempo).toBeGreaterThan(0);
    const tempoBox = await tempo.boundingBox();
    if (tempoBox === null) throw new Error("Expected visible Tempo control geometry.");
    await page.mouse.move(tempoBox.x + tempoBox.width / 2, tempoBox.y + tempoBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(tempoBox.x + tempoBox.width / 2, tempoBox.y - 16, { steps: 10 });
    await page.mouse.up();
    await waitForPostGestureRefill();
    const tempoEvidence = await takePhaseEvidence();

    const evidence = await page.evaluate(() => {
      const state = window as unknown as {
        __audioProbe: AudioProbeEvidence & { active: boolean; captureEndedAt: number };
      };
      state.__audioProbe.captureEndedAt = performance.now();
      state.__audioProbe.active = false;
      return state.__audioProbe;
    });
    expect(evidence.contexts).toHaveLength(1);
    expect(evidence.contexts[0]?.sampleRate).toBe(requestedSampleRate);
    expect(evidence.meterPeaks).toHaveLength(8);
    expect(evidence.meterPeaks.every((peak) => peak > 0)).toBe(true);
    expectAlignedNodes(swingEvidence, 0);
    const stepFrames = (requestedSampleRate * 60) / (humanizePhaseTempo * STEPS_PER_BEAT);
    expectAlignedNodes(humanizeEvidence, Math.ceil(stepFrames / 2));
    expectAlignedNodes(tempoEvidence, 0);
    await expect(page.locator(".audio-status")).toHaveText("Audio active");

    const activeInstruments = await page.locator(LOADED_RACK_MODULE).evaluateAll((modules) =>
      modules.map((module) => module.getAttribute("data-label") ?? "Unknown"),
    );

    const artifactHashes = await page.evaluate(async () => {
      const urls = [
        ...new Set([
          ...[...document.scripts].map((script) => script.src),
          ...[...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
            (link) => link.href,
          ),
        ]),
      ].filter((url) => url.length > 0);
      return Promise.all(
        urls.map(async (url) => {
          const bytes = await (await fetch(url)).arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          return {
            url: new URL(url).pathname,
            sha256: [...new Uint8Array(digest)]
              .map((value) => value.toString(16).padStart(2, "0"))
              .join(""),
          };
        }),
      );
    });
    const report = JSON.stringify(
      {
          artifactHashes,
          browser: browser.version(),
          capturedAt: new Date().toISOString(),
          comparisonMethod:
            "Model each processor queue from its control messages, then compare the absolute note-on frames three identical modules sound across each gesture.",
          context: "live",
          deterministicPatternSeed: 0x1000_0000,
          effects: "No active effects.",
          fixture: "Eight loaded instruments with three identical Tin Soldier modules.",
          instruments: activeInstruments,
          operatingSystem: `${platform()} ${release()} ${arch()}`,
          requestedSampleRate,
          renderLengthMilliseconds: evidence.captureEndedAt - evidence.captureStartedAt,
          routing: "Each module routes through its mixer strip to the master output.",
          sourceRevision: SOURCE_REVISION,
          worktreeSourceSha256: WORKTREE_SOURCE_HASH,
          workload: "Playback during Swing, Humanize, and Tempo pointer drags.",
          evidence: { ...evidence, phases: { humanizeEvidence, swingEvidence, tempoEvidence } },
      },
      null,
      2,
    );
    const reportHash = createHash("sha256").update(report).digest("hex");
    const reportPath = testInfo.outputPath(`audio-evidence-${String(requestedSampleRate)}.json`);
    const hashPath = `${reportPath}.sha256`;
    await writeFile(reportPath, report, "utf8");
    await writeFile(hashPath, `${reportHash}  ${reportPath.split(/[\\/]/u).at(-1) ?? "audio-evidence.json"}\n`, "utf8");
    await testInfo.attach(`audio-evidence-${String(requestedSampleRate)}.json`, {
      path: reportPath,
      contentType: "application/json",
    });
    await testInfo.attach(`audio-evidence-${String(requestedSampleRate)}.sha256`, {
      path: hashPath,
      contentType: "text/plain",
    });
  });
}
