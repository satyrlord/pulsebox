import { describe, expect, it } from "vitest";

import {
  decodeBundledAudio,
  identifyCodec,
  preflightBundledAudio,
} from "../../../src/engine/decoding/bundled-decoders";
import { SampleDecoder } from "../../../src/engine/public";

function createMonoWav(samples: readonly number[], sampleRate = 8000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  writeAscii(view, 8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) =>
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true),
  );
  return buffer;
}

function createExtensibleWav(subformat: 1 | 3, canonicalGuid = true): ArrayBuffer {
  const bytesPerSample = subformat === 1 ? 2 : 4;
  const buffer = new ArrayBuffer(68 + bytesPerSample);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  writeAscii(view, 8, "WAVEfmt ");
  view.setUint32(16, 40, true);
  view.setUint16(20, 0xfffe, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000 * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  view.setUint16(36, 22, true);
  view.setUint16(38, bytesPerSample * 8, true);
  view.setUint32(40, 4, true);
  view.setUint32(44, subformat, true);
  new Uint8Array(buffer).set(
    [0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, canonicalGuid ? 0x71 : 0x70],
    48,
  );
  writeAscii(view, 60, "data");
  view.setUint32(64, bytesPerSample, true);
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1)
    view.setUint8(offset + index, value.charCodeAt(index));
}

function createFlacStreamInfo(
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
  frames: bigint,
): ArrayBuffer {
  const buffer = new ArrayBuffer(42);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode("fLaC"), 0);
  bytes[4] = 0x80;
  bytes[7] = 34;
  let packed =
    (BigInt(sampleRate) << 44n) |
    (BigInt(channels - 1) << 41n) |
    (BigInt(bitsPerSample - 1) << 36n) |
    frames;
  for (let index = 25; index >= 18; index -= 1) {
    bytes[index] = Number(packed & 0xffn);
    packed >>= 8n;
  }
  return buffer;
}

function createCompressedAifc(): ArrayBuffer {
  const buffer = new ArrayBuffer(60);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set(new TextEncoder().encode("FORM"), 0);
  view.setUint32(4, 52, false);
  bytes.set(new TextEncoder().encode("AIFC"), 8);
  bytes.set(new TextEncoder().encode("COMM"), 12);
  view.setUint32(16, 22, false);
  view.setUint16(20, 1, false);
  view.setUint32(22, 1, false);
  view.setUint16(26, 16, false);
  bytes.set([0x40, 0x0b, 0xfa, 0, 0, 0, 0, 0, 0, 0], 28);
  bytes.set(new TextEncoder().encode("ulaw"), 38);
  bytes.set(new TextEncoder().encode("SSND"), 42);
  view.setUint32(46, 10, false);
  return buffer;
}

describe("bundled audio decoders", () => {
  it("exports the owned decoder through the engine public boundary", () => {
    expect(SampleDecoder).toBeTypeOf("function");
  });

  it("identifies supported container signatures without using file extensions", () => {
    expect(identifyCodec(new Uint8Array(createMonoWav([0])))).toBe("wav");
    expect(identifyCodec(new TextEncoder().encode("FORM0000AIFF"))).toBe("aiff");
    expect(identifyCodec(new TextEncoder().encode("fLaC"))).toBe("flac");
    expect(() => identifyCodec(new Uint8Array([1, 2, 3, 4]))).toThrow(/WAV, AIFF, or FLAC/);
  });

  it("decodes a deterministic PCM WAV into planar finite floats", async () => {
    const source = createMonoWav([-1, -0.5, 0, 0.5, 1]);
    const decoded = await decodeBundledAudio(source);
    expect(decoded.codec).toBe("wav");
    expect(decoded.sampleRate).toBe(8000);
    expect(decoded.frames).toBe(5);
    expect(decoded.channelData).toHaveLength(1);
    expect(decoded.channelData[0]?.every(Number.isFinite)).toBe(true);
    expect(decoded.channelData[0]?.[2]).toBe(0);
  });

  it("rejects compressed WAV before invoking a bundled decoder", () => {
    const source = createMonoWav([0, 0]);
    new DataView(source).setUint16(20, 6, true);
    expect(() => preflightBundledAudio(source)).toThrow(/Unsupported WAV codec/);
  });

  it("accepts only canonical PCM and float WAVE extensible subformat GUIDs", () => {
    expect(preflightBundledAudio(createExtensibleWav(1))).toMatchObject({
      codec: "wav",
      frames: 1,
    });
    expect(preflightBundledAudio(createExtensibleWav(3))).toMatchObject({
      codec: "wav",
      frames: 1,
    });
    expect(() => preflightBundledAudio(createExtensibleWav(1, false))).toThrow(
      /Unsupported WAVE extensible subformat/,
    );
  });

  it("rejects compressed AIFC before invoking a bundled decoder", () => {
    expect(() => preflightBundledAudio(createCompressedAifc())).toThrow(/Unsupported AIFC codec/);
  });

  it("preflights FLAC STREAMINFO and rejects declared decompression excess", () => {
    expect(preflightBundledAudio(createFlacStreamInfo(48_000, 2, 24, 48_000n))).toEqual({
      codec: "flac",
      channels: 2,
      sampleRate: 48_000,
      frames: 48_000,
      decodedBytes: 384_000,
    });
    expect(() => preflightBundledAudio(createFlacStreamInfo(8_000, 2, 24, 0xfffffffffn))).toThrow(
      /decoded-memory limit/,
    );
  });

  it("rejects inconsistent declared container lengths before decoding", () => {
    const source = createMonoWav([0]);
    new DataView(source).setUint32(4, source.byteLength, true);
    expect(() => preflightBundledAudio(source)).toThrow(/container length/);
  });

  it("rejects empty and oversize inputs before decoding", async () => {
    await expect(decodeBundledAudio(new ArrayBuffer(0))).rejects.toThrow(
      /between 1 byte and 32 MiB/,
    );
    await expect(decodeBundledAudio(new ArrayBuffer(32 * 1024 * 1024 + 1))).rejects.toThrow(
      /32 MiB/,
    );
  });
});
