import { describe, expect, it } from "vitest";

import { validatePluginManifest } from "../../../src/contracts/plugins";
import { ChorusDsp } from "../../../src/engine/effects/chorus/dsp-core";
import { CompressorDsp } from "../../../src/engine/effects/compressor/dsp-core";
import { DelayDsp } from "../../../src/engine/effects/delay/dsp-core";
import { DistortionDsp, distortSample } from "../../../src/engine/effects/distortion/dsp-core";
import {
  EFFECT_TRANSPORT_TEMPO_PARAMETER,
  type EffectFrameProcessor,
  type EffectState,
} from "../../../src/engine/effects/dsp";
import { LimiterDsp } from "../../../src/engine/effects/limiter/dsp-core";
import { LoFiDsp } from "../../../src/engine/effects/lo-fi/dsp-core";
import { ParametricEqDsp } from "../../../src/engine/effects/parametric-eq/dsp-core";
import { PatternFilterDsp } from "../../../src/engine/effects/pattern-filter/dsp-core";
import { PhaserDsp } from "../../../src/engine/effects/phaser/dsp-core";
import { ReverbDsp } from "../../../src/engine/effects/reverb/dsp-core";
import { BUILT_IN_EFFECTS } from "../../../src/engine/effects/registry";
import {
  EffectParameterSmoother,
  effectParameterSmoothing,
} from "../../../src/engine/effects/registry/parameter-smoother";
import { StereoWidthDsp } from "../../../src/engine/effects/stereo-width/dsp-core";
import { TransientShaperDsp } from "../../../src/engine/effects/transient-shaper/dsp-core";

const EXPECTED_IDS = [
  "lo-fi", "pattern-filter", "distortion", "compressor", "delay", "reverb",
  "chorus", "phaser", "parametric-eq", "transient-shaper", "stereo-width", "limiter",
] as const;

type ProcessorConstructor = new (sampleRate: number, state: EffectState) => EffectFrameProcessor;
const PROCESSORS: readonly ProcessorConstructor[] = [
  LoFiDsp, PatternFilterDsp, DistortionDsp, CompressorDsp, DelayDsp, ReverbDsp,
  ChorusDsp, PhaserDsp, ParametricEqDsp, TransientShaperDsp, StereoWidthDsp, LimiterDsp,
];

const ACTIVE_FIXTURES: Readonly<Record<string, Readonly<Record<string, number | boolean | string>>>> = {
  "lo-fi": { bits: 5, rate: 0.2, character: 0.8 },
  "pattern-filter": { cutoff: 600, resonance: 0.7 },
  distortion: { drive: 7, model: "fold", mix: 1 },
  compressor: { threshold: -30, ratio: 10, makeup: 3 },
  delay: { "tempo-sync": false, time: 20, feedback: 0.7, mix: 0.8 },
  reverb: { "pre-delay": 0, decay: 1.5, mix: 0.8 },
  chorus: { depth: 0.9, rate: 2, mix: 0.8 },
  phaser: { depth: 0.9, rate: 2, mix: 0.8 },
  "parametric-eq": { "mid-frequency": 900, "mid-gain": 9, "mid-q": 2 },
  "transient-shaper": { attack: 1, sustain: -0.5, output: -1 },
  "stereo-width": { width: 1.8, "high-pass": 80, "low-pass": 16_000 },
  limiter: { ceiling: -2, gain: 18, release: 40 },
};

describe("built-in effect catalog", () => {
  it("registers the complete catalog with valid distinct manifests", () => {
    expect(BUILT_IN_EFFECTS.map((effect) => effect.manifest.pluginId)).toEqual(EXPECTED_IDS);
    for (const { manifest } of BUILT_IN_EFFECTS) {
      const validation = validatePluginManifest(manifest);
      expect(validation.ok ? [] : validation.issues, manifest.productName).toEqual([]);
      expect(manifest.renderCapabilities).toEqual({ live: true, offline: true });
      expect(manifest.ui.compactControls.length).toBeLessThanOrEqual(4);
      if (manifest.placements.includes("send-chain")) {
        expect(manifest.ui.compactControls.length, manifest.productName).toBe(4);
      }
      expect(manifest.ui.detailedEditorSections.length).toBeGreaterThan(0);
      expect(Object.keys(manifest.defaultState)).toEqual(
        manifest.parameters.map((parameter) => parameter.id),
      );
    }
  });

  it("limits the protected limiter to the master chain", () => {
    const limiter = BUILT_IN_EFFECTS.find((effect) => effect.manifest.pluginId === "limiter");
    expect(limiter?.manifest.placements).toEqual(["master-chain"]);
    expect(limiter?.manifest.ui.compactControls.map((control) => control.parameterId)).toEqual([
      "ceiling", "gain", "release",
    ]);
    expect(limiter?.manifest.meters.map((meter) => meter.id)).toEqual(["gain-reduction"]);
  });

  it("keeps transport tempo out of effect manifests and project defaults", () => {
    for (const pluginId of ["delay", "chorus", "phaser"]) {
      const effect = BUILT_IN_EFFECTS.find((candidate) => candidate.manifest.pluginId === pluginId);
      expect(effect?.manifest.parameters.some((parameter) => parameter.id === "bpm")).toBe(false);
      expect(effect?.manifest.defaultState).not.toHaveProperty(EFFECT_TRANSPORT_TEMPO_PARAMETER);
    }
  });

  it.each([44_100, 48_000])(
    "derives synced delay time from the runtime transport tempo at %i Hz",
    (sampleRate) => {
      const renderOnset = (tempo: number): number => {
        const delay = new DelayDsp(sampleRate, {
          mode: "clean",
          "tempo-sync": true,
          "beat-time": 0.25,
          feedback: 0,
          filter: 18_000,
          "ping-pong": false,
          mix: 1,
          [EFFECT_TRANSPORT_TEMPO_PARAMETER]: tempo,
        });
        const limit = Math.ceil(sampleRate * 0.3);
        for (let frame = 0; frame < limit; frame += 1) {
          const output = delay.process(frame === 0 ? 1 : 0, 0);
          if (Math.abs(output.left) > 0.1) return frame;
        }
        return -1;
      };

      expect(renderOnset(60)).toBe(Math.floor(sampleRate * 0.25));
      expect(renderOnset(120)).toBe(Math.floor(sampleRate * 0.125));
    },
  );

  it.each([
    ["Chorus", ChorusDsp],
    ["Phaser", PhaserDsp],
  ] as const)("derives synced %s modulation from runtime transport tempo", (_name, Constructor) => {
    const render = (tempo: number): readonly number[] => {
      const processor = new Constructor(48_000, {
        "tempo-sync": true,
        depth: 1,
        feedback: 0.35,
        delay: 12,
        mix: 1,
        [EFFECT_TRANSPORT_TEMPO_PARAMETER]: tempo,
      });
      const output: number[] = [];
      for (let frame = 0; frame < 24_000; frame += 1) {
        const input = Math.sin((frame * 2 * Math.PI * 431) / 48_000) * 0.5;
        output.push(processor.process(input, -input * 0.4).left);
      }
      return output;
    };
    const slow = render(60);
    const fast = render(180);
    const difference = slow.reduce(
      (sum, value, index) => sum + Math.abs(value - (fast[index] ?? 0)),
      0,
    );
    expect(difference).toBeGreaterThan(1);
  });

  it("uses the fixed Piano Roll lane as the Pattern Filter cutoff pattern", () => {
    const patternFilter = BUILT_IN_EFFECTS.find(
      (effect) => effect.manifest.pluginId === "pattern-filter",
    );
    expect(patternFilter?.manifest.parameters.map((parameter) => parameter.id)).toEqual([
      "cutoff",
      "resonance",
      "drive",
      "mix",
    ]);
    expect(
      patternFilter?.manifest.parameters.find((parameter) => parameter.id === "cutoff")
        ?.automation,
    ).toBe("step");
  });

  it.each([44_100, 48_000])("keeps every DSP core finite and frame-count independent at %i Hz", (sampleRate) => {
    for (let index = 0; index < PROCESSORS.length; index += 1) {
      const Constructor = PROCESSORS[index];
      const manifest = BUILT_IN_EFFECTS[index]?.manifest;
      expect(Constructor).toBeDefined();
      expect(manifest).toBeDefined();
      if (Constructor === undefined || manifest === undefined) throw new Error("Effect catalog order is incomplete.");
      const state: Record<string, string | number | boolean> = {};
      for (const parameter of manifest.parameters) state[parameter.id] = parameter.defaultValue;
      const processor = new Constructor(sampleRate, state);
      for (let frame = 0; frame < 503; frame += 1) {
        const source = Math.sin((frame * 2 * Math.PI * 431) / sampleRate) * 0.72;
        const output = processor.process(source, -source * 0.4);
        expect(Number.isFinite(output.left), manifest.productName).toBe(true);
        expect(Number.isFinite(output.right), manifest.productName).toBe(true);
      }
      processor.reset();
    }
  });

  it("writes every DSP result into caller-owned worklet storage", () => {
    for (let index = 0; index < PROCESSORS.length; index += 1) {
      const Constructor = PROCESSORS[index];
      const manifest = BUILT_IN_EFFECTS[index]?.manifest;
      if (Constructor === undefined || manifest === undefined) {
        throw new Error("Effect catalog order is incomplete.");
      }
      const state: Record<string, string | number | boolean> = {};
      for (const parameter of manifest.parameters) state[parameter.id] = parameter.defaultValue;
      const processor = new Constructor(48_000, state);
      const output = { left: Number.NaN, right: Number.NaN };
      expect(processor.process(0.25, -0.5, output)).toBe(output);
      expect(Number.isFinite(output.left)).toBe(true);
      expect(Number.isFinite(output.right)).toBe(true);
    }
  });

  it.each([44_100, 48_000])(
    "applies manifest parameter smoothing on exact sample frames at %i Hz",
    (sampleRate) => {
      const state: Record<string, number | boolean | string> = {
        drive: 1,
        model: "drive",
      };
      const smoother = new EffectParameterSmoother(
        sampleRate,
        state,
        effectParameterSmoothing("distortion"),
      );
      const startFrame = 1_000;
      const durationFrames = Math.round(sampleRate * 0.008);
      smoother.apply("drive", 12, startFrame);
      smoother.advance(startFrame);
      expect(state.drive).toBe(1);
      const middleFrame = startFrame + Math.floor(durationFrames / 2);
      smoother.advance(middleFrame);
      expect(state.drive).toBeCloseTo(
        1 + (11 * Math.floor(durationFrames / 2)) / durationFrames,
        12,
      );
      smoother.advance(startFrame + durationFrames);
      expect(state.drive).toBe(12);

      smoother.apply("model", "fold", startFrame + durationFrames + 1);
      expect(state.model).toBe("fold");
      expect(effectParameterSmoothing("delay").get("time")).toEqual({
        curve: "linear",
        durationMilliseconds: 20,
      });
    },
  );

  it.each([44_100, 48_000])(
    "keeps a worst-case distortion update continuous at %i Hz",
    (sampleRate) => {
      const state: Record<string, number | boolean | string> = {
        drive: 1,
        model: "drive",
        tone: 18_000,
        mix: 1,
      };
      const smoother = new EffectParameterSmoother(
        sampleRate,
        state,
        effectParameterSmoothing("distortion"),
      );
      const distortion = new DistortionDsp(sampleRate, state);
      let previous = 0;
      for (let frame = 0; frame <= 2_000; frame += 1) {
        smoother.advance(frame);
        if (frame === 2_000) smoother.apply("drive", 12, frame);
        const rendered = distortion.process(0.5, 0.5).left;
        if (frame === 2_000) expect(Math.abs(rendered - previous)).toBeLessThanOrEqual(0.02);
        previous = rendered;
      }
    },
  );

  it.each([44_100, 48_000])(
    "changes deterministic audio through every catalog effect at %i Hz",
    (sampleRate) => {
      for (let index = 0; index < PROCESSORS.length; index += 1) {
        const Constructor = PROCESSORS[index];
        const manifest = BUILT_IN_EFFECTS[index]?.manifest;
        if (Constructor === undefined || manifest === undefined) {
          throw new Error("Effect catalog order is incomplete.");
        }
        const state: Record<string, string | number | boolean> = {};
        for (const parameter of manifest.parameters) state[parameter.id] = parameter.defaultValue;
        Object.assign(state, ACTIVE_FIXTURES[manifest.pluginId]);
        const processor = new Constructor(sampleRate, state);
        let difference = 0;
        for (let frame = 0; frame < 4096; frame += 1) {
          const impulse = frame % 997 === 0 ? 0.9 : 0;
          const left = Math.sin((frame * 2 * Math.PI * 431) / sampleRate) * 0.55 + impulse;
          const right = Math.sin((frame * 2 * Math.PI * 677) / sampleRate) * 0.35 - impulse * 0.4;
          const output = processor.process(left, right);
          difference += Math.abs(output.left - left) + Math.abs(output.right - right);
        }
        expect(difference, manifest.productName).toBeGreaterThan(0.001);
      }
    },
  );

  it.each([44_100, 48_000])("renders a distinct shimmer tail at %i Hz", (sampleRate) => {
    const base = {
      mode: "plate",
      "pre-delay": 0,
      decay: 2,
      damping: 10_000,
      mix: 1,
    };
    const plain = new ReverbDsp(sampleRate, { ...base, shimmer: 0 });
    const shimmer = new ReverbDsp(sampleRate, { ...base, shimmer: 1 });
    let difference = 0;
    for (let frame = 0; frame < Math.round(sampleRate * 0.4); frame += 1) {
      const input = frame === 0 ? 1 : 0;
      const one = plain.process(input, input);
      const two = shimmer.process(input, input);
      difference += Math.abs(one.left - two.left) + Math.abs(one.right - two.right);
    }
    expect(difference).toBeGreaterThan(0.001);
  });

  it.each([44_100, 48_000])(
    "keeps mono input mono through maximum Stereo Width at %i Hz",
    (sampleRate) => {
      const width = new StereoWidthDsp(sampleRate, {
        width: 2,
        "high-pass": 2_000,
        "low-pass": 2_000,
        mix: 1,
      });
      for (let frame = 0; frame < 4_096; frame += 1) {
        const input = Math.sin((frame * 2 * Math.PI * 431) / sampleRate) * 0.8;
        const output = width.process(input, input);
        expect(output.left).toBeCloseTo(output.right, 12);
      }
    },
  );

  it("keeps fixed Drive compensation at or below the input magnitude", () => {
    for (const input of [-1, -0.28, -0.05, 0, 0.05, 0.28, 1]) {
      expect(Math.abs(distortSample(input, 3.2, "drive"))).toBeLessThanOrEqual(Math.abs(input));
    }
    expect(distortSample(0.38, 5, "fold")).not.toBe(distortSample(0.38, 5, "drive"));
    expect(distortSample(-0.38, 5, "asymmetric")).not.toBe(distortSample(0.38, 5, "asymmetric"));
  });

  it("enforces the limiter ceiling for hostile finite input", () => {
    const limiter = new LimiterDsp(48_000, { ceiling: -1, gain: 24, release: 80 });
    const ceiling = 10 ** (-1 / 20);
    for (let frame = 0; frame < 1000; frame += 1) {
      const output = limiter.process(4, -4);
      expect(Math.abs(output.left)).toBeLessThanOrEqual(ceiling);
      expect(Math.abs(output.right)).toBeLessThanOrEqual(ceiling);
    }
    expect(limiter.gainReductionDecibels).toBeGreaterThan(0);
  });
});
