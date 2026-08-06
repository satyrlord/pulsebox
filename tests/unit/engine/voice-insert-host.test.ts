import { describe, expect, it } from "vitest";

import { validatePluginManifest } from "../../../src/contracts/plugins";
import {
  DISTORTION_MANIFEST,
  DISTORTION_PLUGIN_ID,
  VoiceInsertHost,
} from "../../../src/engine/effects";

const DEFAULT_SAMPLE_RATE = 48_000;

function transitionFramesFor(sampleRate: number): number {
  return Math.round((sampleRate * DISTORTION_MANIFEST.bypassTransitionMilliseconds) / 1_000);
}

function renderTransition(
  host: VoiceInsertHost,
  source: number,
  transitionFrames: number,
): readonly number[] {
  return Array.from({ length: transitionFrames + 1 }, () => host.process(source));
}

function largestStep(values: readonly number[]): number {
  return values.slice(1).reduce((largest, value, index) => {
    return Math.max(largest, Math.abs(value - (values[index] ?? value)));
  }, 0);
}

describe("voice insert host", () => {
  it("registers the fixed distortion effect as a valid voice insert", () => {
    const validation = validatePluginManifest(DISTORTION_MANIFEST);
    expect(validation.ok ? [] : validation.issues).toEqual([]);
    expect(DISTORTION_MANIFEST.placements).toEqual(["voice-insert"]);
  });

  it.each([44_100, 48_000])(
    "crossfades a held voice through the declared bypass transition at %i Hz",
    (sampleRate) => {
      const transitionFrames = transitionFramesFor(sampleRate);
      const host = new VoiceInsertHost(sampleRate);
      const source = 0.28;
      const distorted = Math.tanh(source * 3.2) / 3.2;

      expect(host.process(source)).toBe(source);
      expect(host.set({ pluginId: DISTORTION_PLUGIN_ID, state: {} }, true)).toBe(true);
      const inserted = renderTransition(host, source, transitionFrames);
      expect(inserted[0]).toBeCloseTo(source, 8);
      expect(inserted[transitionFrames]).toBeCloseTo(distorted, 8);
      expect(largestStep(inserted)).toBeLessThan(
        Math.abs(distorted - source) / transitionFrames + 1e-8,
      );

      expect(host.set(null, true)).toBe(true);
      const bypassed = renderTransition(host, source, transitionFrames);
      expect(bypassed[0]).toBeCloseTo(distorted, 8);
      expect(bypassed[transitionFrames]).toBeCloseTo(source, 8);
      expect(largestStep(bypassed)).toBeLessThan(
        Math.abs(distorted - source) / transitionFrames + 1e-8,
      );
    },
  );

  it("rejects an unregistered insert without replacing the active processor", () => {
    const host = new VoiceInsertHost(DEFAULT_SAMPLE_RATE);
    expect(host.set({ pluginId: DISTORTION_PLUGIN_ID, state: {} }, true)).toBe(true);
    renderTransition(host, 0.28, transitionFramesFor(DEFAULT_SAMPLE_RATE));
    const distorted = host.process(0.28);

    expect(
      host.set({ pluginId: "unknown-effect" as typeof DISTORTION_PLUGIN_ID, state: {} }, true),
    ).toBe(false);
    expect(host.process(0.28)).toBe(distorted);
  });

  it("keeps output finite for hostile input", () => {
    const host = new VoiceInsertHost(DEFAULT_SAMPLE_RATE);
    host.set({ pluginId: DISTORTION_PLUGIN_ID, state: {} }, true);
    renderTransition(host, 0, transitionFramesFor(DEFAULT_SAMPLE_RATE));

    expect(host.process(Number.NaN)).toBe(0);
    expect(host.process(Number.POSITIVE_INFINITY)).toBe(0);
    expect(Math.abs(host.process(100))).toBeLessThanOrEqual(1);
  });

  it("compensates Drive so it never increases sample magnitude", () => {
    const host = new VoiceInsertHost(DEFAULT_SAMPLE_RATE);
    host.set({ pluginId: DISTORTION_PLUGIN_ID, state: {} }, false);

    for (const input of [-1, -0.28, -0.05, 0, 0.05, 0.28, 1]) {
      expect(Math.abs(host.process(input))).toBeLessThanOrEqual(Math.abs(input) + 1e-12);
    }
  });

  it("applies an insert change immediately while its voice is silent", () => {
    const host = new VoiceInsertHost(DEFAULT_SAMPLE_RATE);
    const source = 0.28;
    const distorted = Math.tanh(source * 3.2) / 3.2;

    expect(host.set({ pluginId: DISTORTION_PLUGIN_ID, state: {} }, false)).toBe(true);
    expect(host.process(source)).toBeCloseTo(distorted, 8);
    expect(host.set(null, false)).toBe(true);
    expect(host.process(source)).toBe(source);
  });
});
