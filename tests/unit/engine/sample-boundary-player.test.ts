import { describe, expect, it } from "vitest";

import {
  SAMPLE_BOUNDARY_FADE_IN_SECONDS,
  SAMPLE_BOUNDARY_FADE_OUT_SECONDS,
  SampleBoundaryPlayer,
} from "../../../src/engine/dsp/sample-boundary-player";

const SAMPLE_RATES = [44_100, 48_000] as const;

function sampleAt(samples: Float32Array, index: number): number {
  const sample = samples[index];
  if (sample === undefined) throw new Error(`Test sample ${index} is missing.`);
  return sample;
}

function average(samples: Float32Array): number {
  let total = 0;
  for (let index = 0; index < samples.length; index += 1) total += sampleAt(samples, index);
  return total / samples.length;
}

function periodicPcm(frames: number, period: number, offset = 0, amplitude = 1): Float32Array {
  const pcm = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    pcm[index] = offset + amplitude * Math.cos((2 * Math.PI * index) / period);
  }
  return pcm;
}

function interpolate(samples: Float32Array, frame: number): number {
  const lower = Math.floor(frame);
  const upper = Math.min(samples.length - 1, lower + 1);
  const current = sampleAt(samples, lower);
  const next = sampleAt(samples, upper);
  return current + (next - current) * (frame - lower);
}

function renderMono(player: SampleBoundaryPlayer, frames: number, playbackRate: number): Float32Array {
  const output = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    player.render(playbackRate);
    output[index] = player.channel(0);
  }
  return output;
}

describe("SampleBoundaryPlayer", () => {
  it.each(SAMPLE_RATES)("uses exact 2 ms and 4 ms linear ramps at %i Hz", (sampleRate) => {
    const fadeInFrames = Math.round(sampleRate * SAMPLE_BOUNDARY_FADE_IN_SECONDS);
    const fadeOutFrames = Math.round(sampleRate * SAMPLE_BOUNDARY_FADE_OUT_SECONDS);
    const source = periodicPcm(fadeOutFrames * 4, 16);
    const player = new SampleBoundaryPlayer([source], sampleRate);

    player.start();
    const output = renderMono(player, source.length, 1);
    const dcOffset = average(source);
    const tailStart = source.length - fadeOutFrames;
    const lastFrame = source.length - 1;

    expect(player.fadeInFrames).toBe(fadeInFrames);
    expect(player.fadeOutFrames).toBe(fadeOutFrames);
    expect(sampleAt(output, 0)).toBeCloseTo(0, 12);
    expect(sampleAt(output, fadeInFrames)).toBeCloseTo(
      sampleAt(source, fadeInFrames) - dcOffset,
      6,
    );
    expect(sampleAt(output, tailStart)).toBeCloseTo(sampleAt(source, tailStart) - dcOffset, 6);
    expect(sampleAt(output, lastFrame)).toBeCloseTo(
      (sampleAt(source, lastFrame) - dcOffset) / fadeOutFrames,
      6,
    );
    expect(Math.abs(sampleAt(output, lastFrame))).toBeLessThan(0.01);
    expect(player.active).toBe(false);
    expect(player.render(1)).toBe(false);
    expect(player.channel(0)).toBe(0);
  });

  it.each(SAMPLE_RATES)("fades an arbitrary start offset at %i Hz", (sampleRate) => {
    const fadeInFrames = Math.round(sampleRate * SAMPLE_BOUNDARY_FADE_IN_SECONDS);
    const source = periodicPcm(fadeInFrames * 8, 16);
    const startFrame = fadeInFrames + 0.5;
    const player = new SampleBoundaryPlayer([source], sampleRate);

    player.start({ startFrame });
    const output = renderMono(player, fadeInFrames + 1, 1);
    const dcOffset = average(source);

    expect(sampleAt(output, 0)).toBeCloseTo(0, 12);
    expect(sampleAt(output, fadeInFrames)).toBeCloseTo(
      interpolate(source, startFrame + fadeInFrames) - dcOffset,
      6,
    );
  });

  it("removes DC per stereo channel without folding the channels together", () => {
    const frameCount = 1_536;
    const left = periodicPcm(frameCount, 16, 0.35, 0.2);
    const right = periodicPcm(frameCount, 16, -0.25, 0.1);
    const player = new SampleBoundaryPlayer([left, right], 48_000);
    let leftTotal = 0;
    let rightTotal = 0;

    player.start({ fadeIn: false });
    for (let index = 0; index < 512; index += 1) {
      expect(player.render(1)).toBe(true);
      leftTotal += player.channel(0);
      rightTotal += player.channel(1);
    }

    expect(player.channelCount).toBe(2);
    expect(Math.abs(leftTotal / 512)).toBeLessThan(1e-6);
    expect(Math.abs(rightTotal / 512)).toBeLessThan(1e-6);
    expect(player.channel(0)).not.toBeCloseTo(player.channel(1), 4);
  });

  it.each(SAMPLE_RATES)("keeps a very short sample below the boundary-jump limit at %i Hz", (sampleRate) => {
    const player = new SampleBoundaryPlayer([new Float32Array([-1, 1])], sampleRate);

    player.start();
    const output = renderMono(player, 3, 1);

    for (const sample of output) expect(Number.isFinite(sample)).toBe(true);
    expect(Math.abs(sampleAt(output, 1) - sampleAt(output, 0))).toBeLessThan(0.01);
    expect(Math.abs(sampleAt(output, 2) - sampleAt(output, 1))).toBeLessThan(0.01);
    expect(player.active).toBe(false);
  });

  it.each(SAMPLE_RATES)("uses a linear four-millisecond release for a choked reader at %i Hz", (sampleRate) => {
    const fadeOutFrames = Math.round(sampleRate * SAMPLE_BOUNDARY_FADE_OUT_SECONDS);
    const source = periodicPcm(fadeOutFrames * 6, 16);
    const player = new SampleBoundaryPlayer([source], sampleRate);
    const preludeFrames = 32;

    player.start({ fadeIn: false });
    renderMono(player, preludeFrames, 1);
    player.release();
    const output = renderMono(player, fadeOutFrames, 1);
    const dcOffset = average(source);

    for (const index of [0, Math.floor(fadeOutFrames / 2), fadeOutFrames - 1]) {
      const expected =
        (sampleAt(source, preludeFrames + index) - dcOffset) * (1 - index / fadeOutFrames);
      expect(sampleAt(output, index)).toBeCloseTo(expected, 6);
    }
    expect(player.active).toBe(false);
  });

  it("joins a loop boundary to the pre-read head without a boundary step", () => {
    const frameCount = 512;
    const source = new Float32Array(frameCount);
    for (let index = 0; index < frameCount; index += 1) {
      source[index] = -1 + (2 * index) / (frameCount - 1);
    }
    const player = new SampleBoundaryPlayer([source], 48_000);

    player.start({ loop: { startFrame: 0, endFrame: frameCount }, fadeIn: false });
    const output = renderMono(player, frameCount + 1, 1);

    expect(player.active).toBe(true);
    expect(Math.abs(sampleAt(output, frameCount) - sampleAt(output, frameCount - 1))).toBeLessThan(
      0.01,
    );
  });

  it("keeps its fractional position when the playback rate changes", () => {
    const source = periodicPcm(1_536, 16);
    const player = new SampleBoundaryPlayer([source], 48_000);
    const dcOffset = average(source);

    player.start({ fadeIn: false });
    player.render(1);
    player.render(0.5);
    expect(player.render(2)).toBe(true);

    expect(player.channel(0)).toBeCloseTo(interpolate(source, 1.5) - dcOffset, 6);
    expect(player.active).toBe(true);
  });

  it("does not step when a rate increase reaches the tail", () => {
    const sampleRate = 48_000;
    const fadeOutFrames = Math.round(sampleRate * SAMPLE_BOUNDARY_FADE_OUT_SECONDS);
    const source = periodicPcm(6_144, 6_144);
    const player = new SampleBoundaryPlayer([source], sampleRate);

    player.start({ startFrame: source.length - 400, fadeIn: false });
    for (let index = 0; index < 8; index += 1) player.render(1);
    let previous = player.channel(0);
    for (let index = 0; index <= fadeOutFrames; index += 1) {
      player.render(4);
      const current = player.channel(0);
      expect(Math.abs(current - previous)).toBeLessThan(0.01);
      previous = current;
    }
  });
});
