import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import {
  serializePortableProject,
  type ProjectDocument,
} from "../../src/state/public";
import { captureProductionBuildEvidence } from "./production-build-evidence";

const RACK_MODULE = '[data-component="rack-module"]';
const LOADED_RACK_MODULE = `${RACK_MODULE}:not([data-label="Empty"])`;
const DRUMLINE_PROCESSOR = "pulsebox-drumline-six";
/** The fixed 1/16 Pattern grid puts four steps in one beat. */
const STEPS_PER_BEAT = 4;
const DISTORTION_PLUGIN_ID = "distortion";
const DRUMLINE_PLUGIN_ID = "drum-analog-small";
const EFFECT_INSTANCE_ID = "00000000-0000-4000-8000-000000000991";
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
    readonly onsets: readonly OnsetEvidence[];
    readonly resets: number;
    readonly expiredOnsets: number;
    readonly missingSourceSteps: number;
  }[];
}

interface OnsetEvidence {
  readonly audioFrame: number;
  readonly sourceStep: number;
}

interface CrossRateOnsetEvidence extends OnsetEvidence {
  readonly note: number;
}

type NodeEvidence = AudioProbeEvidence["nodes"][number];

interface LatePassEvidence {
  readonly durationMilliseconds: number;
  readonly nodes: readonly NodeEvidence[];
}

interface CrossRateCapture {
  readonly actualSampleRate: number;
  readonly instruments: readonly string[];
  readonly nodes: readonly {
    readonly meterLevels: readonly number[];
    readonly onsets: readonly CrossRateOnsetEvidence[];
    readonly processorName: string;
  }[];
  readonly requestedSampleRate: number;
  readonly renderLengthMilliseconds: number;
  readonly runtime: {
    readonly baseLatency: number;
    readonly outputLatency: number;
  };
  /** The shared absolute frame carried by the supplied loop's step zero. */
  readonly startFrame: number;
}

function documentFromPortableArchive(bytes: Uint8Array): ProjectDocument {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const manifestLength = view.getUint32(18, true);
  const manifestOffset = 30 + nameLength + extraLength;
  const manifest = bytes.subarray(manifestOffset, manifestOffset + manifestLength);
  return JSON.parse(new TextDecoder().decode(manifest)) as ProjectDocument;
}

function distortionFixture(document: ProjectDocument): {
  readonly document: ProjectDocument;
  readonly dryModuleId: string;
  readonly insertedModuleId: string;
} {
  const drumModules = document.rack.filter((slot) => slot.pluginId === DRUMLINE_PLUGIN_ID);
  const dryModuleId = drumModules[0]?.moduleId;
  const insertedModuleId = drumModules[1]?.moduleId;
  if (dryModuleId === undefined || insertedModuleId === undefined) {
    throw new Error("The Distortion fixture requires two Tin Soldier modules.");
  }
  const targetModules = new Set([dryModuleId, insertedModuleId]);
  return {
    dryModuleId,
    insertedModuleId,
    document: {
      ...document,
      plugins: [
        ...document.plugins.filter((plugin) => plugin.pluginId !== DISTORTION_PLUGIN_ID),
        { pluginId: DISTORTION_PLUGIN_ID, stateSchemaVersion: 1 },
      ],
      rack: document.rack.map((slot) => ({
        ...slot,
        ...(slot.moduleId === undefined ? {} : { muted: !targetModules.has(slot.moduleId) }),
      })),
      patterns: document.patterns.map((pattern) => ({
        ...pattern,
        steps: pattern.steps.map((step) =>
          targetModules.has(pattern.moduleId)
            ? { ...step, active: true, note: 36, velocity: 0.8, accent: false, slide: false }
            : { ...step, active: false },
        ),
      })),
      effects: {
        instances: [
          {
            id: EFFECT_INSTANCE_ID,
            pluginId: DISTORTION_PLUGIN_ID,
            stateVersion: 1,
            state: {},
          },
        ],
        voiceInserts: document.effects.voiceInserts.map((slot) => ({
          ...slot,
          effectInstanceId:
            slot.moduleId === insertedModuleId && slot.voiceId === "kick"
              ? EFFECT_INSTANCE_ID
              : null,
        })),
      },
    },
  };
}

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
  expect(nodes.every((node) => node.missingSourceSteps === 0)).toBe(true);
  // Each gesture must have replaced the queued horizon at least once, or the
  // comparison below proves nothing about the rebuild path.
  expect(nodes.every((node) => node.resets > 0)).toBe(true);
  for (const node of nodes) {
    expect(new Set(node.onsets.map((onset) => onset.sourceStep)).size).toBe(node.onsets.length);
  }
  const starts = nodes.map((node) => node.onsets.at(0)?.sourceStep);
  const ends = nodes.map((node) => node.onsets.at(-1)?.sourceStep);
  expect(starts.every((step) => step !== undefined)).toBe(true);
  expect(ends.every((step) => step !== undefined)).toBe(true);
  const commonStart = Math.max(...starts.map((step) => step ?? Number.POSITIVE_INFINITY));
  const commonEnd = Math.min(...ends.map((step) => step ?? Number.NEGATIVE_INFINITY));
  expect(commonStart).toBeLessThanOrEqual(commonEnd);
  const insideCommonRange = (onset: OnsetEvidence) =>
    onset.sourceStep >= commonStart && onset.sourceStep <= commonEnd;
  const reference = (nodes[0]?.onsets ?? []).filter(insideCommonRange);
  expect(reference.length).toBeGreaterThan(0);
  for (const node of nodes) {
    const candidate = node.onsets.filter(insideCommonRange);
    expect(candidate.map((onset) => onset.sourceStep)).toEqual(
      reference.map((onset) => onset.sourceStep),
    );
    for (let index = 0; index < reference.length; index += 1) {
      expect(
        Math.abs(
          (candidate[index]?.audioFrame ?? Number.POSITIVE_INFINITY) -
            (reference[index]?.audioFrame ?? Number.NEGATIVE_INFINITY),
        ),
      ).toBeLessThanOrEqual(maximumFrameSpread);
    }
  }
}

function expectLatePassNodes(nodes: readonly NodeEvidence[]): void {
  expect(nodes).toHaveLength(3);
  expect(nodes.every((node) => node.expiredOnsets === 0)).toBe(true);
  expect(nodes.every((node) => node.missingSourceSteps === 0)).toBe(true);
  const reference = nodes[0]?.onsets ?? [];
  expect(reference.length).toBeGreaterThan(0);
  expect(new Set(reference.map((onset) => onset.sourceStep)).size).toBe(reference.length);
  for (const node of nodes) {
    expect(new Set(node.onsets.map((onset) => onset.sourceStep)).size).toBe(node.onsets.length);
    expect(node.onsets).toEqual(reference);
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
          currentFrame: () => number;
          /** Onsets the module has already sounded. */
          sounded: OnsetEvidence[];
          /** Onsets waiting in the processor queue. */
          queued: OnsetEvidence[];
          /** Onsets sent after the deliberate scheduler stall ends. */
          postStallOnsets: OnsetEvidence[];
          resets: number;
          expiredOnsets: number;
          missingSourceSteps: number;
        }[];
        stallEndedAt: number;
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
        stallEndedAt: 0,
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
            currentFrame: () => Math.floor(context.currentTime * context.sampleRate),
            sounded: [] as OnsetEvidence[],
            queued: [] as OnsetEvidence[],
            postStallOnsets: [] as OnsetEvidence[],
            resets: 0,
            expiredOnsets: 0,
            missingSourceSteps: 0,
          };
          state.__audioProbe.nodes.push(record);
          const nativePost = this.port.postMessage.bind(this.port);
          this.port.postMessage = ((message: unknown, transfer?: Transferable[]) => {
            if (state.__audioProbe.active && typeof message === "object" && message !== null) {
              const envelope = message as {
                kind?: string;
                payload?: {
                  events?: {
                    audioFrame?: number;
                    data?: { sourceStep?: number; type?: string };
                  }[];
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
                record.queued = record.queued.filter((onset) => {
                  if (onset.audioFrame < currentFrame) {
                    record.sounded.push(onset);
                    return false;
                  }
                  return typeof bound === "number" && onset.audioFrame < bound;
                });
              }
              if (envelope.kind === "event-batch" && Array.isArray(envelope.payload?.events)) {
                for (const event of envelope.payload.events) {
                  if (event.data?.type !== "note-on" || typeof event.audioFrame !== "number") continue;
                  if (typeof event.data.sourceStep !== "number") {
                    record.missingSourceSteps += 1;
                    continue;
                  }
                  const onset = {
                    audioFrame: event.audioFrame,
                    sourceStep: event.data.sourceStep,
                  };
                  // The processor rejects an onset whose frame already passed,
                  // so sending one loses that step.
                  if (event.audioFrame < currentFrame) record.expiredOnsets += 1;
                  else record.queued.push(onset);
                  if (state.__audioProbe.stallEndedAt > 0) {
                    record.postStallOnsets.push(onset);
                  }
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
              currentFrame: () => number;
              sounded: OnsetEvidence[];
              queued: OnsetEvidence[];
              resets: number;
              expiredOnsets: number;
              missingSourceSteps: number;
            }[];
          };
        };
        // Everything the module has sounded plus everything it still holds is
        // what it plays. The queue survives the snapshot because the processor
        // still owns it; only the per-phase counters reset.
        const nodes = state.__audioProbe.nodes
          .filter((node) => node.processorName === processorName)
          .map((node) => {
            const currentFrame = node.currentFrame();
            const sounded = [...node.sounded];
            const queued: OnsetEvidence[] = [];
            for (const onset of node.queued) {
              if (onset.audioFrame < currentFrame) sounded.push(onset);
              else queued.push(onset);
            }
            node.queued = queued;
            return {
              processorName: node.processorName,
              onsets: [...sounded, ...queued].sort(
                (left, right) => left.sourceStep - right.sourceStep,
              ),
              resets: node.resets,
              expiredOnsets: node.expiredOnsets,
              missingSourceSteps: node.missingSourceSteps,
            };
          });
        for (const node of state.__audioProbe.nodes) {
          node.sounded = [];
          node.resets = 0;
          node.expiredOnsets = 0;
          node.missingSourceSteps = 0;
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
    await expect(humanize).toHaveAttribute("aria-valuetext", "0 percent");
    // A bounded rebuild keeps imminent events from an earlier preview. Let
    // that lead window sound before the zero-Humanize Tempo phase.
    await page.waitForTimeout(150);
    await takePhaseEvidence();

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

    const latePassDurationMilliseconds = await page.evaluate(() => {
      const state = window as unknown as { __audioProbe: { stallEndedAt: number } };
      const startedAt = performance.now();
      const deadline = startedAt + 650;
      while (performance.now() < deadline) {
        // Deliberately keep the controller thread past the 500 ms lookahead.
      }
      state.__audioProbe.stallEndedAt = performance.now();
      return state.__audioProbe.stallEndedAt - startedAt;
    });
    expect(latePassDurationMilliseconds).toBeGreaterThan(500);
    await expect
      .poll(
        () =>
          page.evaluate((processorName) => {
            const state = window as unknown as {
              __audioProbe: {
                nodes: { processorName: string; postStallOnsets: number[] }[];
              };
            };
            const probed = state.__audioProbe.nodes.filter(
              (node) => node.processorName === processorName,
            );
            return probed.length === 3 && probed.every((node) => node.postStallOnsets.length > 0);
          }, DRUMLINE_PROCESSOR),
        {
          message: "Expected every identical module to receive a post-stall scheduler batch.",
          timeout: 10_000,
        },
      )
      .toBe(true);
    const latePassEvidence: LatePassEvidence = {
      durationMilliseconds: latePassDurationMilliseconds,
      nodes: await page.evaluate((processorName) => {
        const state = window as unknown as {
          __audioProbe: {
            nodes: {
              processorName: string;
              postStallOnsets: OnsetEvidence[];
              expiredOnsets: number;
              missingSourceSteps: number;
            }[];
          };
        };
        return state.__audioProbe.nodes
          .filter((node) => node.processorName === processorName)
          .map((node) => ({
            processorName: node.processorName,
            onsets: [...node.postStallOnsets].sort(
              (left, right) => left.sourceStep - right.sourceStep,
            ),
            resets: 0,
            expiredOnsets: node.expiredOnsets,
            missingSourceSteps: node.missingSourceSteps,
          }));
      }, DRUMLINE_PROCESSOR),
    };
    expectLatePassNodes(latePassEvidence.nodes);

    const evidence = await page.evaluate(() => {
      const state = window as unknown as {
        __audioProbe: AudioProbeEvidence & { active: boolean; captureEndedAt: number };
      };
      state.__audioProbe.captureEndedAt = performance.now();
      state.__audioProbe.active = false;
      return state.__audioProbe;
    });
    const activeInstruments = await page.locator(LOADED_RACK_MODULE).evaluateAll((modules) =>
      modules.map((module) => module.getAttribute("data-label") ?? "Unknown"),
    );

    const productionBuild = captureProductionBuildEvidence();
    const buildPaths = productionBuild.files.map((file) => file.path);
    expect(buildPaths).toContain("index.html");
    expect(buildPaths.filter((path) => path.includes(".worklet-")).length).toBe(6);
    expect(buildPaths.some((path) => path.includes("decoder-worker-"))).toBe(true);
    expect(buildPaths.some((path) => path.endsWith(".woff2"))).toBe(true);
    const report = JSON.stringify(
      {
          browser: browser.version(),
          browserName: "Chrome",
          capturedAt: new Date().toISOString(),
          comparisonMethod:
            "Model each processor queue from its control messages, then compare the absolute note-on frames three identical modules sound across each gesture.",
          context: "live",
          deterministicPatternSeed: 0x1000_0000,
          effects: "No active effects.",
          fixture: "Eight loaded instruments with three identical Tin Soldier modules.",
          instruments: activeInstruments,
          operatingSystem: `${platform()} ${release()} ${arch()}`,
          productionBuild,
          requestedSampleRate,
          renderLengthMilliseconds: evidence.captureEndedAt - evidence.captureStartedAt,
          routing: "Each module routes through its mixer strip to the master output.",
          sourceRevision: SOURCE_REVISION,
          worktreeSourceSha256: WORKTREE_SOURCE_HASH,
          workload:
            "Playback during Swing, Humanize, and Tempo pointer drags, then a 650 ms controller-thread stall.",
          evidence: {
            ...evidence,
            phases: { humanizeEvidence, latePassEvidence, swingEvidence, tempoEvidence },
          },
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

    expect(evidence.contexts).toHaveLength(1);
    expect(evidence.contexts[0]?.sampleRate).toBe(requestedSampleRate);
    expect(evidence.meterPeaks).toHaveLength(8);
    expect(evidence.meterPeaks.every((peak) => peak > 0)).toBe(true);
    expectAlignedNodes(swingEvidence, 0);
    const stepFrames = (requestedSampleRate * 60) / (humanizePhaseTempo * STEPS_PER_BEAT);
    expectAlignedNodes(humanizeEvidence, Math.ceil(stepFrames / 2));
    expectAlignedNodes(tempoEvidence, 0);
    await expect(page.locator(".audio-status")).toHaveText("Audio active");
  });
}

test("saved Distortion reaches the production worklet and transitions while sounding", async (
  { browser, page },
  testInfo,
) => {
  await page.addInitScript(() => {
    interface EffectProbeRecord {
      hasDistortion: boolean | undefined;
      lastMeterLevel: number;
      meterLevels: number[];
      nextStateSnapshot: string | undefined;
      nodeId: string | undefined;
      processorName: string;
      transitionCount: number;
      transitionWasSounding: boolean;
    }
    interface EffectProbe {
      contexts: AudioContext[];
      nodes: EffectProbeRecord[];
    }
    const state = window as unknown as { __effectProbe: EffectProbe };
    state.__effectProbe = { contexts: [], nodes: [] };

    const NativeAudioContext = window.AudioContext;
    class ProbedAudioContext extends NativeAudioContext {
      constructor(options: AudioContextOptions = {}) {
        super(options);
        state.__effectProbe.contexts.push(this);
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: ProbedAudioContext,
    });

    const NativeAudioWorkletNode = window.AudioWorkletNode;
    class ProbedAudioWorkletNode extends NativeAudioWorkletNode {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options);
        const record: EffectProbeRecord = {
          hasDistortion: undefined,
          lastMeterLevel: 0,
          meterLevels: [],
          nextStateSnapshot: undefined,
          nodeId: undefined,
          processorName: name,
          transitionCount: 0,
          transitionWasSounding: false,
        };
        state.__effectProbe.nodes.push(record);
        this.port.addEventListener("message", (event) => {
          const message = event.data as {
            kind?: string;
            payload?: { level?: unknown };
          };
          const level = message.payload?.level;
          if (message.kind !== "meter-frame" || typeof level !== "number") return;
          record.lastMeterLevel = level;
          record.meterLevels.push(level);
          if (record.meterLevels.length > 256) record.meterLevels.shift();
        });

        const nativePost = this.port.postMessage.bind(this.port);
        this.port.postMessage = ((message: unknown, transfer?: Transferable[]) => {
          if (typeof message !== "object" || message === null) {
            nativePost(message, transfer ?? []);
            return;
          }
          const envelope = message as {
            kind?: string;
            nodeId?: string;
            payload?: { voiceInserts?: Record<string, unknown> };
          };
          record.nodeId = envelope.nodeId ?? record.nodeId;
          if (envelope.kind === "state-snapshot") {
            const kick = envelope.payload?.voiceInserts?.kick as
              | { readonly pluginId?: unknown }
              | null
              | undefined;
            record.hasDistortion = kick?.pluginId === "distortion";
          }
          if (envelope.kind === "parameter-batch" && record.nextStateSnapshot !== undefined) {
            const payload = JSON.parse(record.nextStateSnapshot) as {
              parameters: unknown;
              voiceInserts: Record<string, unknown>;
            };
            record.transitionWasSounding = record.lastMeterLevel > 0;
            record.nextStateSnapshot = undefined;
            record.transitionCount += 1;
            nativePost(
              {
                ...envelope,
                kind: "state-snapshot",
                payload,
              },
              transfer ?? [],
            );
            return;
          }
          nativePost(message, transfer ?? []);
        }) as typeof this.port.postMessage;
      }
    }
    Object.defineProperty(window, "AudioWorkletNode", {
      configurable: true,
      value: ProbedAudioWorkletNode,
    });
  });

  await page.goto("/");
  const firstDrumline = page.locator(`${RACK_MODULE}[data-label='Tin Soldier']`).first();
  await firstDrumline.getByRole("button", { name: "Tin Soldier module menu" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator(`${RACK_MODULE}[data-label='Tin Soldier']`)).toHaveCount(2);

  const projectMenu = page.locator('[data-component="project-menu"]');
  await projectMenu.getByRole("button", { name: /Project selector/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    projectMenu.getByRole("button", { name: "Export" }).click(),
  ]);
  const exportedPath = await download.path();
  const exported = await readFile(exportedPath);
  const fixture = distortionFixture(documentFromPortableArchive(exported));
  const insertedParameters = fixture.document.rack.find(
    (slot) => slot.moduleId === fixture.insertedModuleId,
  )?.parameters;
  if (insertedParameters === undefined) throw new Error("The inserted module parameters are missing.");
  const emptyVoiceInserts = Object.fromEntries(
    fixture.document.effects.voiceInserts
      .filter((slot) => slot.moduleId === fixture.insertedModuleId)
      .map((slot) => [slot.voiceId, null]),
  );
  const bypassSnapshot = JSON.stringify({
    parameters: insertedParameters,
    voiceInserts: emptyVoiceInserts,
  });
  const insertSnapshot = JSON.stringify({
    parameters: insertedParameters,
    voiceInserts: {
      ...emptyVoiceInserts,
      kick: { pluginId: DISTORTION_PLUGIN_ID, state: {} },
    },
  });
  const archive = serializePortableProject(fixture.document);
  await page.getByLabel("Import project file").setInputFiles({
    name: "distortion-integration.pulsebox",
    mimeType: "application/zip",
    buffer: Buffer.from(archive),
  });
  await expect(projectMenu.getByRole("status")).toContainText("Project imported");

  await expect
    .poll(() =>
      page.evaluate(
        (processorName) => {
          const state = window as unknown as {
            __effectProbe: {
              contexts: AudioContext[];
              nodes: {
                hasDistortion: boolean | undefined;
                nodeId: string | undefined;
                processorName: string;
              }[];
            };
          };
          const nodes = state.__effectProbe.nodes.filter(
            (node) => node.processorName === processorName,
          );
          return {
            contextCount: state.__effectProbe.contexts.length,
            distortionStates: nodes.map((node) => node.hasDistortion),
            nodeCount: nodes.length,
          };
        },
        DRUMLINE_PROCESSOR,
      ),
    )
    .toEqual({
      contextCount: 1,
      distortionStates: [false, true],
      nodeCount: 2,
    });

  const renderStartedAt = Date.now();
  await page.getByRole("button", { name: /^play$/i }).click();
  await expect(page.locator(".audio-status")).toHaveText("Audio active");
  await expect
    .poll(() =>
      page.evaluate(
        (processorName) => {
          const state = window as unknown as {
            __effectProbe: {
              nodes: {
                meterLevels: number[];
                processorName: string;
              }[];
            };
          };
          const nodes = state.__effectProbe.nodes.filter(
            (node) => node.processorName === processorName,
          );
          const peak = (index: number) => Math.max(0, ...(nodes[index]?.meterLevels ?? []));
          return peak(0) > 0 && peak(1) > 0;
        },
        DRUMLINE_PROCESSOR,
      ),
    )
    .toBe(true);

  const initial = await page.evaluate(
    (processorName) => {
      const state = window as unknown as {
        __effectProbe: {
          contexts: AudioContext[];
          nodes: {
            meterLevels: number[];
            processorName: string;
          }[];
        };
      };
      const nodes = state.__effectProbe.nodes.filter(
        (node) => node.processorName === processorName,
      );
      const peak = (index: number) => Math.max(0, ...(nodes[index]?.meterLevels ?? []));
      return {
        contextTime: state.__effectProbe.contexts[0]?.currentTime ?? 0,
        dryMeterLevels: [...(nodes[0]?.meterLevels ?? [])],
        dryPeak: peak(0),
        insertedMeterLevels: [...(nodes[1]?.meterLevels ?? [])],
        insertedPeak: peak(1),
        nodeCount: state.__effectProbe.nodes.length,
      };
    },
    DRUMLINE_PROCESSOR,
  );
  expect(initial.dryPeak).toBeGreaterThan(0);
  expect(initial.insertedPeak).toBeGreaterThan(0);
  expect(initial.insertedPeak).toBeLessThan(initial.dryPeak * 0.6);

  await page.evaluate(({ processorName, snapshot }) => {
    const state = window as unknown as {
      __effectProbe: {
        nodes: {
          meterLevels: number[];
          nextStateSnapshot: string | undefined;
          processorName: string;
        }[];
      };
    };
    const node = state.__effectProbe.nodes.filter(
      (candidate) => candidate.processorName === processorName,
    )[1];
    if (node === undefined) throw new Error("The inserted worklet probe is missing.");
    node.meterLevels = [];
    node.nextStateSnapshot = snapshot;
  }, { processorName: DRUMLINE_PROCESSOR, snapshot: bypassSnapshot });
  const insertedModule = page.locator(`${RACK_MODULE}[data-label='Tin Soldier']`).nth(1);
  await insertedModule.getByRole("slider", { name: "Tone" }).press("ArrowUp");
  await expect
    .poll(() =>
      page.evaluate((processorName) => {
        const state = window as unknown as {
          __effectProbe: {
            nodes: {
              meterLevels: number[];
              processorName: string;
              transitionCount: number;
              transitionWasSounding: boolean;
            }[];
          };
        };
        const node = state.__effectProbe.nodes.filter(
          (candidate) => candidate.processorName === processorName,
        )[1];
        return node?.transitionCount === 1 && node.transitionWasSounding;
      }, DRUMLINE_PROCESSOR),
    )
    .toBe(true);
  await page.evaluate((processorName) => {
    const state = window as unknown as {
      __effectProbe: {
        nodes: { meterLevels: number[]; processorName: string }[];
      };
    };
    for (const node of state.__effectProbe.nodes.filter(
      (candidate) => candidate.processorName === processorName,
    )) {
      node.meterLevels = [];
    }
  }, DRUMLINE_PROCESSOR);
  await expect
    .poll(() =>
      page.evaluate((processorName) => {
        const state = window as unknown as {
          __effectProbe: {
            nodes: { meterLevels: number[]; processorName: string }[];
          };
        };
        return state.__effectProbe.nodes
          .filter((node) => node.processorName === processorName)
          .every((node) => node.meterLevels.length >= 2);
      }, DRUMLINE_PROCESSOR),
    )
    .toBe(true);

  const bypassed = await page.evaluate(
    (processorName) => {
      const state = window as unknown as {
        __effectProbe: {
          contexts: AudioContext[];
          nodes: {
            meterLevels: number[];
            processorName: string;
          }[];
        };
      };
      const nodes = state.__effectProbe.nodes.filter(
        (node) => node.processorName === processorName,
      );
      const peak = (index: number) => Math.max(0, ...(nodes[index]?.meterLevels ?? []));
      return {
        contextCount: state.__effectProbe.contexts.length,
        contextState: state.__effectProbe.contexts[0]?.state,
        contextTime: state.__effectProbe.contexts[0]?.currentTime ?? 0,
        dryMeterLevels: [...(nodes[0]?.meterLevels ?? [])],
        dryPeak: peak(0),
        insertedMeterLevels: [...(nodes[1]?.meterLevels ?? [])],
        insertedPeak: peak(1),
        nodeCount: state.__effectProbe.nodes.length,
      };
    },
    DRUMLINE_PROCESSOR,
  );
  expect(bypassed.insertedPeak).toBeGreaterThan(initial.insertedPeak * 1.5);
  expect(bypassed.dryPeak).toBeGreaterThan(0);
  expect(bypassed.contextCount).toBe(1);
  expect(bypassed.contextState).toBe("running");
  expect(bypassed.contextTime).toBeGreaterThan(initial.contextTime);
  expect(bypassed.nodeCount).toBe(initial.nodeCount);

  await page.evaluate(({ processorName, snapshot }) => {
    const state = window as unknown as {
      __effectProbe: {
        nodes: {
          meterLevels: number[];
          nextStateSnapshot: string | undefined;
          processorName: string;
        }[];
      };
    };
    const node = state.__effectProbe.nodes.filter(
      (candidate) => candidate.processorName === processorName,
    )[1];
    if (node === undefined) throw new Error("The inserted worklet probe is missing.");
    node.meterLevels = [];
    node.nextStateSnapshot = snapshot;
  }, { processorName: DRUMLINE_PROCESSOR, snapshot: insertSnapshot });
  await insertedModule.getByRole("slider", { name: "Tone" }).press("ArrowDown");
  await expect
    .poll(() =>
      page.evaluate((processorName) => {
        const state = window as unknown as {
          __effectProbe: {
            nodes: {
              meterLevels: number[];
              processorName: string;
              transitionCount: number;
            }[];
          };
        };
        const node = state.__effectProbe.nodes.filter(
          (candidate) => candidate.processorName === processorName,
        )[1];
        return node?.transitionCount === 2;
      }, DRUMLINE_PROCESSOR),
    )
    .toBe(true);
  await page.evaluate((processorName) => {
    const state = window as unknown as {
      __effectProbe: {
        nodes: { meterLevels: number[]; processorName: string }[];
      };
    };
    const node = state.__effectProbe.nodes.filter(
      (candidate) => candidate.processorName === processorName,
    )[1];
    if (node !== undefined) node.meterLevels = [];
  }, DRUMLINE_PROCESSOR);
  await expect
    .poll(() =>
      page.evaluate((processorName) => {
        const state = window as unknown as {
          __effectProbe: {
            nodes: { meterLevels: number[]; processorName: string }[];
          };
        };
        return (
          state.__effectProbe.nodes.filter(
            (candidate) => candidate.processorName === processorName,
          )[1]?.meterLevels.length ?? 0
        );
      }, DRUMLINE_PROCESSOR),
    )
    .toBeGreaterThanOrEqual(2);
  const restored = await page.evaluate((processorName) => {
    const state = window as unknown as {
      __effectProbe: {
        nodes: { meterLevels: number[]; processorName: string }[];
      };
    };
    const node = state.__effectProbe.nodes.filter(
      (candidate) => candidate.processorName === processorName,
    )[1];
    const meterLevels = [...(node?.meterLevels ?? [])];
    return { meterLevels, peak: Math.max(0, ...meterLevels) };
  }, DRUMLINE_PROCESSOR);
  expect(restored.peak).toBeGreaterThan(0);
  expect(restored.peak).toBeLessThan(bypassed.insertedPeak * 0.6);

  const runtimeEvidence = await page.evaluate(() => {
    const state = window as unknown as {
      __effectProbe: { contexts: AudioContext[]; nodes: unknown[] };
    };
    const context = state.__effectProbe.contexts[0];
    if (context === undefined) throw new Error("The Distortion context evidence is missing.");
    return {
      baseLatency: context.baseLatency,
      contextState: context.state,
      nodeCount: state.__effectProbe.nodes.length,
      outputLatency: context.outputLatency,
      sampleRate: context.sampleRate,
    };
  });
  const renderLengthMilliseconds = Date.now() - renderStartedAt;
  const audioArtifactName = "distortion-live-meter-observations.json";
  const audioArtifact = JSON.stringify(
    {
      bypassed: {
        dry: bypassed.dryMeterLevels,
        inserted: bypassed.insertedMeterLevels,
      },
      initial: {
        dry: initial.dryMeterLevels,
        inserted: initial.insertedMeterLevels,
      },
      restored: { inserted: restored.meterLevels },
    },
    null,
    2,
  );
  const audioArtifactHash = createHash("sha256").update(audioArtifact).digest("hex");
  const report = JSON.stringify(
    {
      actualSampleRate: runtimeEvidence.sampleRate,
      activeInstruments: [
        { moduleId: fixture.dryModuleId, name: "Tin Soldier", voice: "Kick", effect: "None" },
        {
          moduleId: fixture.insertedModuleId,
          name: "Tin Soldier",
          voice: "Kick",
          effect: "Distortion",
        },
      ],
      audioArtifact: { name: audioArtifactName, sha256: audioArtifactHash },
      browser: browser.version(),
      browserName: "Chrome",
      capturedAt: new Date().toISOString(),
      comparisonMethod:
        "Compare real worklet meter frames for identical dry and inserted Kick patterns before, during, and after a sounding bypass transition.",
      context: "live",
      deterministicPatternSeeds: fixture.document.patterns
        .filter((pattern) =>
          pattern.moduleId === fixture.dryModuleId || pattern.moduleId === fixture.insertedModuleId,
        )
        .map((pattern) => ({
          moduleId: pattern.moduleId,
          patternIndex: pattern.patternIndex ?? 0,
          seed: pattern.seed ?? 0,
        })),
      effect: "Distortion on one Tin Soldier kick voice, with live bypass and restore.",
      fixture: "Two identical Tin Soldier modules with every step assigned to Kick.",
      operatingSystem: `${platform()} ${release()} ${arch()}`,
      productionBuild: captureProductionBuildEvidence(),
      renderLengthMilliseconds,
      requestedSampleRate: "browser-default",
      routing: "Each module routes through its mixer strip to the master output.",
      runtime: runtimeEvidence,
      sourceRevision: SOURCE_REVISION,
      worktreeSourceSha256: WORKTREE_SOURCE_HASH,
      workload: "Dry and inserted playback, then sounding-voice bypass and restore transitions.",
      result: {
        bypassedDryPeak: bypassed.dryPeak,
        bypassedInsertedPeak: bypassed.insertedPeak,
        initialDryPeak: initial.dryPeak,
        initialInsertedPeak: initial.insertedPeak,
        restoredInsertedPeak: restored.peak,
      },
    },
    null,
    2,
  );
  const reportHash = createHash("sha256").update(report).digest("hex");
  const reportPath = testInfo.outputPath("distortion-live-evidence.json");
  const audioArtifactPath = testInfo.outputPath(audioArtifactName);
  const hashPath = `${reportPath}.sha256`;
  await writeFile(audioArtifactPath, audioArtifact, "utf8");
  await writeFile(reportPath, report, "utf8");
  await writeFile(
    hashPath,
    `${reportHash}  distortion-live-evidence.json\n${audioArtifactHash}  ${audioArtifactName}\n`,
    "utf8",
  );
  await testInfo.attach(audioArtifactName, {
    path: audioArtifactPath,
    contentType: "application/json",
  });
  await testInfo.attach("distortion-live-evidence.json", {
    path: reportPath,
    contentType: "application/json",
  });
  await testInfo.attach("distortion-live-evidence.sha256", {
    path: hashPath,
    contentType: "text/plain",
  });
});

test("live Chrome schedules matching event time at 44.1 and 48 kHz", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const captures: CrossRateCapture[] = [];

  for (const requestedSampleRate of [44_100, 48_000]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.addInitScript((sampleRate) => {
        interface Probe {
          active: boolean;
          contexts: {
            baseLatency: number;
            outputLatency: number;
            sampleRate: number;
          }[];
          nodes: {
            meterLevels: number[];
            onsets: CrossRateOnsetEvidence[];
            processorName: string;
          }[];
        }
        const state = window as unknown as { __crossRateProbe: Probe };
        state.__crossRateProbe = {
          active: false,
          contexts: [],
          nodes: [],
        };
        let idCounter = 1;
        Object.defineProperty(crypto, "randomUUID", {
          configurable: true,
          value: () =>
            `20000000-0000-4000-8000-${String(idCounter++).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
        });

        const NativeAudioContext = window.AudioContext;
        class FixedRateAudioContext extends NativeAudioContext {
          constructor(options: AudioContextOptions = {}) {
            super({ ...options, sampleRate });
            state.__crossRateProbe.contexts.push({
              baseLatency: this.baseLatency,
              outputLatency: this.outputLatency,
              sampleRate: this.sampleRate,
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
              meterLevels: [] as number[],
              onsets: [] as CrossRateOnsetEvidence[],
              processorName: name,
            };
            state.__crossRateProbe.nodes.push(record);
            this.port.addEventListener("message", (event) => {
              const message = event.data as { kind?: string; payload?: { level?: unknown } };
              const level = message.payload?.level;
              if (message.kind !== "meter-frame" || typeof level !== "number") return;
              record.meterLevels.push(level);
              if (record.meterLevels.length > 256) record.meterLevels.shift();
            });
            const nativePost = this.port.postMessage.bind(this.port);
            this.port.postMessage = ((message: unknown, transfer?: Transferable[]) => {
              if (state.__crossRateProbe.active && typeof message === "object" && message !== null) {
                const envelope = message as {
                  kind?: string;
                  payload?: {
                    events?: {
                      audioFrame?: number;
                      data?: { note?: number; sourceStep?: number; type?: string };
                    }[];
                  };
                };
                if (envelope.kind === "event-batch") {
                  for (const event of envelope.payload?.events ?? []) {
                    if (
                      event.data?.type !== "note-on" ||
                      typeof event.audioFrame !== "number" ||
                      typeof event.data.note !== "number" ||
                      typeof event.data.sourceStep !== "number"
                    )
                      continue;
                    record.onsets.push({
                      audioFrame: event.audioFrame,
                      note: event.data.note,
                      sourceStep: event.data.sourceStep,
                    });
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

        window.addEventListener(
          "click",
          (event) => {
            const target = event.target;
            if (
              event.isTrusted &&
              target instanceof Element &&
              target.closest('button[aria-label="Play"]') !== null
            ) {
              state.__crossRateProbe.active = true;
            }
          },
          true,
        );
      }, requestedSampleRate);
      await page.goto("http://127.0.0.1:4173/");
      // The first Play creates the context and worklet nodes. Stop it before
      // measuring, then restart from the transport marker with every node
      // ready. This prevents node construction time from hiding the first
      // scheduled step in only one sample-rate run.
      await page.getByRole("button", { name: /^play$/i }).click();
      await expect(page.locator(".audio-status")).toHaveText("Audio active");
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const state = window as unknown as {
                __crossRateProbe: { nodes: { onsets: CrossRateOnsetEvidence[] }[] };
              };
              return state.__crossRateProbe.nodes.length === 6;
            }),
          { timeout: 10_000 },
        )
        .toBe(true);
      await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expect(page.getByRole("button", { name: /^play$/i })).toBeVisible();
      await page.evaluate(() => {
        const state = window as unknown as {
          __crossRateProbe: {
            active: boolean;
            nodes: { meterLevels: number[]; onsets: CrossRateOnsetEvidence[] }[];
          };
        };
        state.__crossRateProbe.active = false;
        for (const node of state.__crossRateProbe.nodes) {
          node.meterLevels = [];
          node.onsets = [];
        }
      });
      const renderStartedAt = Date.now();
      await page.getByRole("button", { name: /^play$/i }).click();
      await expect(page.locator(".audio-status")).toHaveText("Audio active");
      await page.waitForTimeout(2_000);
      const renderLengthMilliseconds = Date.now() - renderStartedAt;
      const capture = await page.evaluate(() => {
        const state = window as unknown as {
          __crossRateProbe: {
            contexts: {
              baseLatency: number;
              outputLatency: number;
              sampleRate: number;
            }[];
            nodes: {
              meterLevels: number[];
              onsets: CrossRateOnsetEvidence[];
              processorName: string;
            }[];
          };
        };
        const runtime = state.__crossRateProbe.contexts[0];
        if (runtime === undefined) throw new Error("The cross-rate runtime evidence is missing.");
        return {
          actualSampleRate: runtime.sampleRate,
          nodes: state.__crossRateProbe.nodes.map((node) => ({
            meterLevels: [...node.meterLevels],
            onsets: [...node.onsets].sort((left, right) => left.sourceStep - right.sourceStep),
            processorName: node.processorName,
          })),
          runtime: {
            baseLatency: runtime.baseLatency,
            outputLatency: runtime.outputLatency,
          },
        };
      });
      const instruments = await page.locator(LOADED_RACK_MODULE).evaluateAll((modules) =>
        modules.map((module) => module.getAttribute("data-label") ?? "Unknown"),
      );
      expect(capture.actualSampleRate).toBe(requestedSampleRate);
      for (const node of capture.nodes) {
        expect(new Set(node.onsets.map((onset) => onset.sourceStep)).size).toBe(
          node.onsets.length,
        );
        expect(node.meterLevels.some((level) => level > 0)).toBe(true);
      }
      const stepZeroFrames = capture.nodes.flatMap((node) =>
        node.onsets.filter((onset) => onset.sourceStep === 0).map((onset) => onset.audioFrame),
      );
      // The supplied loop starts Bass Mono, Drumline Six, and Boom Eight on
      // step zero. They must receive the known transport anchor at both rates.
      expect(stepZeroFrames).toHaveLength(3);
      expect(new Set(stepZeroFrames).size).toBe(1);
      const startFrame = stepZeroFrames[0];
      expect(startFrame).toBeDefined();
      // An early or duplicate note-on is a timing fault. Do not discard it
      // before the cross-rate comparison below.
      expect(
        capture.nodes.every((node) =>
          node.onsets.every((onset) => onset.audioFrame >= (startFrame ?? Number.MAX_SAFE_INTEGER)),
        ),
      ).toBe(true);
      captures.push({
        ...capture,
        instruments,
        requestedSampleRate,
        renderLengthMilliseconds,
        startFrame: startFrame ?? 0,
      });
    } finally {
      await context.close();
    }
  }

  const at44k = captures.find((capture) => capture.requestedSampleRate === 44_100);
  const at48k = captures.find((capture) => capture.requestedSampleRate === 48_000);
  expect(at44k).toBeDefined();
  expect(at48k).toBeDefined();
  const lowerRateNodes = [...(at44k?.nodes ?? [])].sort((left, right) =>
    left.processorName.localeCompare(right.processorName),
  );
  const higherRateNodes = [...(at48k?.nodes ?? [])].sort((left, right) =>
    left.processorName.localeCompare(right.processorName),
  );
  expect(lowerRateNodes).toHaveLength(6);
  expect(higherRateNodes).toHaveLength(6);

  const comparisonWindowSeconds = 1.5;
  const lowerStart = at44k?.startFrame ?? 0;
  const higherStart = at48k?.startFrame ?? 0;
  const lowerWindowFrames = Math.floor(44_100 * comparisonWindowSeconds);
  const higherWindowFrames = Math.floor(48_000 * comparisonWindowSeconds);
  let maximumDifferenceMilliseconds = 0;
  for (let index = 0; index < lowerRateNodes.length; index += 1) {
    const lower = lowerRateNodes[index];
    const higher = higherRateNodes[index];
    expect(lower?.processorName).toBe(higher?.processorName);
    const lowerOnsets = (lower?.onsets ?? [])
      .map((onset) => ({ ...onset, relativeFrame: onset.audioFrame - lowerStart }))
      .filter((onset) => onset.relativeFrame >= 0 && onset.relativeFrame <= lowerWindowFrames);
    const higherOnsets = (higher?.onsets ?? [])
      .map((onset) => ({ ...onset, relativeFrame: onset.audioFrame - higherStart }))
      .filter((onset) => onset.relativeFrame >= 0 && onset.relativeFrame <= higherWindowFrames);
    expect(lowerOnsets.length).toBeGreaterThan(0);
    expect(higherOnsets.length).toBeGreaterThan(0);
    expect(lowerOnsets.map((onset) => onset.sourceStep)).toEqual(
      higherOnsets.map((onset) => onset.sourceStep),
    );
    for (let onsetIndex = 0; onsetIndex < lowerOnsets.length; onsetIndex += 1) {
      const lowerTime = (lowerOnsets[onsetIndex]?.relativeFrame ?? 0) / 44_100;
      const higherTime = (higherOnsets[onsetIndex]?.relativeFrame ?? 0) / 48_000;
      const differenceMilliseconds = Math.abs(lowerTime - higherTime) * 1_000;
      maximumDifferenceMilliseconds = Math.max(maximumDifferenceMilliseconds, differenceMilliseconds);
      expect(differenceMilliseconds).toBeLessThanOrEqual(1);
    }
  }

  const audioArtifactName = "cross-rate-live-meter-observations.json";
  const audioArtifact = JSON.stringify(
    captures.map((capture) => ({
      actualSampleRate: capture.actualSampleRate,
      nodes: capture.nodes.map((node) => ({
        meterLevels: node.meterLevels,
        processorName: node.processorName,
      })),
      requestedSampleRate: capture.requestedSampleRate,
    })),
    null,
    2,
  );
  const audioArtifactHash = createHash("sha256").update(audioArtifact).digest("hex");
  const report = JSON.stringify(
    {
      activeEffects: "No active effects.",
      activeInstruments: captures[0]?.instruments ?? [],
      activeVoices: Object.fromEntries(
        (captures[0]?.nodes ?? []).map((node) => [
          node.processorName,
          [...new Set(node.onsets.map((onset) => onset.note))].toSorted(
            (left, right) => left - right,
          ),
        ]),
      ),
      audioArtifact: { name: audioArtifactName, sha256: audioArtifactHash },
      browser: browser.version(),
      browserName: "Chrome",
      capturedAt: new Date().toISOString(),
      captures,
      comparisonMethod:
        "Anchor both rates to source step zero, require exact source-step identity lists, and compare matching onset times over 1.5 seconds with a 1 ms limit.",
      context: "live",
      deterministicPatternSeed: 0x2000_0000,
      fixture: "The supplied six-instrument loop with fixed UUID-derived Pattern seeds.",
      maximumDifferenceMilliseconds,
      operatingSystem: `${platform()} ${release()} ${arch()}`,
      productionBuild: captureProductionBuildEvidence(),
      routing: "Each module routes through its mixer strip to the master output.",
      sourceRevision: SOURCE_REVISION,
      worktreeSourceSha256: WORKTREE_SOURCE_HASH,
    },
    null,
    2,
  );
  const reportHash = createHash("sha256").update(report).digest("hex");
  const reportPath = testInfo.outputPath("cross-rate-live-schedule.json");
  const audioArtifactPath = testInfo.outputPath(audioArtifactName);
  const hashPath = `${reportPath}.sha256`;
  await writeFile(audioArtifactPath, audioArtifact, "utf8");
  await writeFile(reportPath, report, "utf8");
  await writeFile(
    hashPath,
    `${reportHash}  ${reportPath.split(/[\\/]/u).at(-1) ?? "cross-rate-live-schedule.json"}\n${audioArtifactHash}  ${audioArtifactName}\n`,
    "utf8",
  );
  await testInfo.attach(audioArtifactName, {
    path: audioArtifactPath,
    contentType: "application/json",
  });
  await testInfo.attach("cross-rate-live-schedule.json", {
    path: reportPath,
    contentType: "application/json",
  });
  await testInfo.attach("cross-rate-live-schedule.sha256", {
    path: hashPath,
    contentType: "text/plain",
  });
});
