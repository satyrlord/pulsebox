import { describe, expect, it } from "vitest";

import { AcidBassDsp } from "../../../src/engine/modules/bass-mono/dsp-core";

function render(sampleRate: number, frameCount: number, chunkSize: number): Float32Array {
  const dsp = new AcidBassDsp(sampleRate);
  dsp.noteOn(45, 0.8, true);
  const output = new Float32Array(frameCount);
  for (let offset = 0; offset < frameCount; offset += chunkSize) {
    dsp.process(output.subarray(offset, Math.min(frameCount, offset + chunkSize)));
  }
  return output;
}

describe("AcidBassDsp", () => {
  it("is deterministic and independent of host render quantum", () => {
    const expected = render(48_000, 4096, 128);
    for (const chunkSize of [1, 17, 64, 255, 512]) {
      expect(render(48_000, 4096, chunkSize)).toEqual(expected);
    }
  });

  it("renders finite, conservative, non-silent output", () => {
    for (const sampleRate of [44_100, 48_000]) {
      const output = render(sampleRate, sampleRate / 2, 137);
      expect(output.some((sample) => Math.abs(sample) > 1e-5)).toBe(true);
      expect(output.every(Number.isFinite)).toBe(true);
      expect(Math.max(...output.map(Math.abs))).toBeLessThanOrEqual(0.95);
    }
  });

  it("clamps unsafe parameter values", () => {
    const dsp = new AcidBassDsp(44_100);
    dsp.setParameters({ cutoff: Number.POSITIVE_INFINITY, resonance: 12, volume: 8 });
    dsp.noteOn(127, 1, true);
    const output = new Float32Array(2048);
    dsp.process(output);
    expect(output.every(Number.isFinite)).toBe(true);
    expect(Math.max(...output.map(Math.abs))).toBeLessThanOrEqual(0.95);
  });

  it("follows the declared eight-millisecond parameter trajectories", () => {
    const dsp = new AcidBassDsp(48_000);
    dsp.setParameters({
      tune: 12,
      cutoff: 2_880,
      resonance: 0.78,
      envelopeAmount: 0.92,
      decay: 1.12,
      accentAmount: 0.85,
      glide: 0.68,
      volume: 0.02,
    });

    expect(dsp.getParameterSnapshot()).toMatchObject({
      tune: 0,
      cutoff: 720,
      resonance: 0.38,
      volume: 0.62,
    });
    dsp.process(new Float32Array(192));
    const midpoint = dsp.getParameterSnapshot();
    expect(midpoint.tune).toBeCloseTo(6, 10);
    expect(midpoint.cutoff).toBeCloseTo(1_440, 8);
    expect(midpoint.resonance).toBeCloseTo(0.58, 10);
    expect(midpoint.volume).toBeCloseTo(0.32, 10);

    dsp.process(new Float32Array(192));
    expect(dsp.getParameterSnapshot()).toMatchObject({
      tune: 12,
      cutoff: 2_880,
      resonance: 0.78,
      envelopeAmount: 0.92,
      decay: 1.12,
      accentAmount: 0.85,
      glide: 0.68,
      volume: 0.02,
    });
  });

  it("applies state snapshots immediately and crossfades waveform edits", () => {
    const dsp = new AcidBassDsp(48_000);
    dsp.setParameters({ cutoff: 400, volume: 0.4 }, "immediate");
    expect(dsp.getParameterSnapshot()).toMatchObject({ cutoff: 400, volume: 0.4 });
    dsp.noteOn(36, 0.8);
    const before = new Float32Array(4_096);
    dsp.process(before);
    dsp.setParameters({ waveform: "square" });
    const after = new Float32Array(384);
    dsp.process(after);

    expect(dsp.getParameterSnapshot().waveform).toBe("square");
    expect(Math.abs((after[0] ?? 0) - (before.at(-1) ?? 0))).toBeLessThan(0.02);
  });

  it("does not restart an unrelated parameter trajectory", () => {
    const dsp = new AcidBassDsp(48_000);
    dsp.setParameters({ resonance: 0.78 });
    dsp.process(new Float32Array(192));
    dsp.setParameters({ cutoff: 2_880 });
    dsp.process(new Float32Array(192));

    expect(dsp.getParameterSnapshot().resonance).toBeCloseTo(0.78, 10);
  });

  it("releases without a hard cut", () => {
    const dsp = new AcidBassDsp(48_000);
    dsp.noteOn(45, 1);
    const before = new Float32Array(2048);
    dsp.process(before);
    dsp.noteOff();
    const after = new Float32Array(4096);
    dsp.process(after);
    expect(Math.abs(after[0] ?? 0)).toBeLessThan(0.95);
    expect(Math.abs(after[0] ?? 0)).toBeGreaterThan(0);
    expect(Math.abs(after.at(-1) ?? 0)).toBeLessThan(Math.abs(after[0] ?? 0));
  });
});
