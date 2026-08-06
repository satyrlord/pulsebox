import { describe, expect, it } from "vitest";

import { BassMonoDsp } from "../../../src/engine/modules/bass-mono/dsp-core";

function render(sampleRate: number, frameCount: number, chunkSize: number): Float32Array {
  const dsp = new BassMonoDsp(sampleRate);
  dsp.noteOn(45, 0.8, true);
  const output = new Float32Array(frameCount);
  for (let offset = 0; offset < frameCount; offset += chunkSize) {
    dsp.process(output.subarray(offset, Math.min(frameCount, offset + chunkSize)));
  }
  return output;
}

function renderPitchFixture(sampleRate: number): Float32Array {
  const dsp = new BassMonoDsp(sampleRate);
  dsp.setParameters(
    {
      cutoff: 12_000,
      resonance: 0,
      envelopeAmount: 0,
      decay: 2,
      accentAmount: 0,
      waveform: "square",
      glide: 0,
      volume: 0.8,
    },
    "immediate",
  );
  dsp.noteOn(57, 1);
  const output = new Float32Array(sampleRate);
  dsp.process(output);
  return output;
}

function estimateFrequency(samples: Float32Array, sampleRate: number): number {
  const start = Math.floor(sampleRate * 0.2);
  const end = Math.floor(sampleRate * 0.8);
  const crossings: number[] = [];
  for (let index = start + 1; index < end; index += 1) {
    const previous = samples[index - 1] ?? 0;
    const current = samples[index] ?? 0;
    if (previous > 0 || current <= 0) continue;
    const span = current - previous;
    crossings.push(index - 1 + (span === 0 ? 0 : -previous / span));
  }
  if (crossings.length < 2) throw new Error("Expected enough positive crossings to measure pitch.");
  const first = crossings[0] ?? 0;
  const last = crossings.at(-1) ?? first;
  return ((crossings.length - 1) * sampleRate) / (last - first);
}

describe("BassMonoDsp", () => {
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

  it("keeps oscillator pitch within one cent across 44.1 and 48 kHz", () => {
    const at44k = estimateFrequency(renderPitchFixture(44_100), 44_100);
    const at48k = estimateFrequency(renderPitchFixture(48_000), 48_000);
    const cents = 1_200 * Math.log2(at48k / at44k);

    expect(at44k).toBeGreaterThan(0);
    expect(at48k).toBeGreaterThan(0);
    expect(Math.abs(cents)).toBeLessThanOrEqual(1);
  });

  it("keeps the filter stable and audible at maximum cutoff and minimum resonance", () => {
    // The Chamberlin topology diverges above its stability bound. A diverged
    // state latched NaN and silenced the instrument permanently, so this pins
    // the shared bound at the worst-case corner across both live rates.
    for (const sampleRate of [44_100, 48_000]) {
      const dsp = new BassMonoDsp(sampleRate);
      dsp.setParameters({ cutoff: 12_000, resonance: 0, envelopeAmount: 1 }, "immediate");
      const output = new Float32Array(Math.floor(sampleRate / 2));
      for (let offset = 0; offset < output.length; offset += 128) {
        // Retrigger every tenth of a second so the envelope stays open.
        if (offset % 4_864 === 0) dsp.noteOn(45, 1, true);
        dsp.process(output.subarray(offset, Math.min(output.length, offset + 128)));
      }
      expect(output.every(Number.isFinite)).toBe(true);
      const tail = output.subarray(output.length - 4_800);
      expect(tail.some((sample) => Math.abs(sample) > 1e-5)).toBe(true);
    }
  });

  it("clamps unsafe parameter values", () => {
    const dsp = new BassMonoDsp(44_100);
    dsp.setParameters({ cutoff: Number.POSITIVE_INFINITY, resonance: 12, volume: 8 });
    dsp.noteOn(127, 1, true);
    const output = new Float32Array(2048);
    dsp.process(output);
    expect(output.every(Number.isFinite)).toBe(true);
    expect(Math.max(...output.map(Math.abs))).toBeLessThanOrEqual(0.95);
  });

  it("follows the declared eight-millisecond parameter trajectories", () => {
    const dsp = new BassMonoDsp(48_000);
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
    const dsp = new BassMonoDsp(48_000);
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
    const dsp = new BassMonoDsp(48_000);
    dsp.setParameters({ resonance: 0.78 });
    dsp.process(new Float32Array(192));
    dsp.setParameters({ cutoff: 2_880 });
    dsp.process(new Float32Array(192));

    expect(dsp.getParameterSnapshot().resonance).toBeCloseTo(0.78, 10);
  });

  it("releases without a hard cut", () => {
    const dsp = new BassMonoDsp(48_000);
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
