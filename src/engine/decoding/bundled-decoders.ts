import decodeAiff from "@audio/decode-aiff";
import decodeFlac from "@audio/decode-flac";
import decodeWav from "@audio/decode-wav";

export type SupportedCodec = "wav" | "aiff" | "flac";

export interface DecodedAudio {
  readonly codec: SupportedCodec;
  readonly channelData: readonly Float32Array[];
  readonly sampleRate: number;
  readonly frames: number;
}

export interface AudioDecodePreflight {
  readonly codec: SupportedCodec;
  readonly channels: 1 | 2;
  readonly sampleRate: number;
  readonly frames: number;
  readonly decodedBytes: number;
}

const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_DECODED_BYTES = 256 * 1024 * 1024;
const MAX_DURATION_SECONDS = 1800;

export function identifyCodec(bytes: Uint8Array): SupportedCodec {
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") {
    return "wav";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "FORM" &&
    (ascii(bytes, 8, 12) === "AIFF" || ascii(bytes, 8, 12) === "AIFC")
  ) {
    return "aiff";
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "fLaC") return "flac";
  throw new Error("Unsupported audio container. Choose a WAV, AIFF, or FLAC file.");
}

export function preflightBundledAudio(source: ArrayBuffer): AudioDecodePreflight {
  if (source.byteLength < 1 || source.byteLength > MAX_SOURCE_BYTES) {
    throw new RangeError("Audio source must contain between 1 byte and 32 MiB.");
  }
  const bytes = new Uint8Array(source);
  const codec = identifyCodec(bytes);
  if (codec === "wav") return preflightWav(bytes);
  if (codec === "aiff") return preflightAiff(bytes);
  return preflightFlac(bytes);
}

export async function decodeBundledAudio(source: ArrayBuffer): Promise<DecodedAudio> {
  const preflight = preflightBundledAudio(source);
  const bytes = new Uint8Array(source);
  const decoded = await (preflight.codec === "wav"
    ? decodeWav(bytes)
    : preflight.codec === "aiff"
      ? decodeAiff(bytes)
      : decodeFlac(bytes));
  return validateDecoded(preflight, decoded.channelData, decoded.sampleRate);
}

function preflightWav(bytes: Uint8Array): AudioDecodePreflight {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const formEnd = checkedContainerEnd(view.getUint32(4, true), bytes.length, "WAV");
  let formatOffset: number | undefined;
  let formatLength = 0;
  let dataLength: number | undefined;
  for (let offset = 12; offset < formEnd;) {
    requireAvailable(offset, 8, formEnd, "WAV chunk header");
    const length = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    requireAvailable(dataOffset, length, formEnd, "WAV chunk");
    const id = ascii(bytes, offset, offset + 4);
    if (id === "fmt " && formatOffset === undefined) {
      formatOffset = dataOffset;
      formatLength = length;
    } else if (id === "data" && dataLength === undefined) {
      dataLength = length;
    }
    offset = dataOffset + length + (length & 1);
  }
  if (formatOffset === undefined || formatLength < 16 || dataLength === undefined) {
    throw new Error("WAV requires complete fmt and data chunks.");
  }
  const channels = readChannelCount(view.getUint16(formatOffset + 2, true));
  const sampleRate = readSampleRate(view.getUint32(formatOffset + 4, true));
  const blockAlign = view.getUint16(formatOffset + 12, true);
  const bitsPerSample = view.getUint16(formatOffset + 14, true);
  let formatTag = view.getUint16(formatOffset, true);
  if (formatTag === 0xfffe) {
    if (formatLength < 40 || view.getUint16(formatOffset + 16, true) < 22) {
      throw new Error("WAVE extensible fmt data is truncated.");
    }
    const subformatTag = view.getUint32(formatOffset + 24, true);
    const canonicalTail = [0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71];
    const hasCanonicalTail = canonicalTail.every(
      (value, index) => view.getUint8(formatOffset + 28 + index) === value,
    );
    if ((subformatTag !== 1 && subformatTag !== 3) || !hasCanonicalTail) {
      throw new Error(
        "Unsupported WAVE extensible subformat. Choose PCM integer or IEEE floating-point WAV audio.",
      );
    }
    formatTag = subformatTag;
  }
  const validPcm =
    formatTag === 1 &&
    (bitsPerSample === 8 || bitsPerSample === 16 || bitsPerSample === 24 || bitsPerSample === 32);
  const validFloat = formatTag === 3 && (bitsPerSample === 32 || bitsPerSample === 64);
  if (!validPcm && !validFloat) {
    throw new Error("Unsupported WAV codec. Choose PCM integer or IEEE floating-point WAV audio.");
  }
  const expectedBlockAlign = channels * (bitsPerSample / 8);
  if (
    !Number.isSafeInteger(expectedBlockAlign) ||
    blockAlign !== expectedBlockAlign ||
    dataLength === 0 ||
    dataLength % blockAlign !== 0
  ) {
    throw new Error("WAV sample layout is inconsistent.");
  }
  return createPreflight("wav", channels, sampleRate, dataLength / blockAlign);
}

function preflightAiff(bytes: Uint8Array): AudioDecodePreflight {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const formEnd = checkedContainerEnd(view.getUint32(4, false), bytes.length, "AIFF");
  const formType = ascii(bytes, 8, 12);
  let commonOffset: number | undefined;
  let commonLength = 0;
  let soundBytes: number | undefined;
  for (let offset = 12; offset < formEnd;) {
    requireAvailable(offset, 8, formEnd, "AIFF chunk header");
    const length = view.getUint32(offset + 4, false);
    const dataOffset = offset + 8;
    requireAvailable(dataOffset, length, formEnd, "AIFF chunk");
    const id = ascii(bytes, offset, offset + 4);
    if (id === "COMM" && commonOffset === undefined) {
      commonOffset = dataOffset;
      commonLength = length;
    } else if (id === "SSND" && soundBytes === undefined) {
      if (length < 8) throw new Error("AIFF SSND chunk is truncated.");
      const soundOffset = view.getUint32(dataOffset, false);
      if (soundOffset > length - 8) {
        throw new Error("AIFF SSND offset exceeds its chunk.");
      }
      soundBytes = length - 8 - soundOffset;
    }
    offset = dataOffset + length + (length & 1);
  }
  if (commonOffset === undefined || commonLength < 18 || soundBytes === undefined) {
    throw new Error("AIFF requires complete COMM and SSND chunks.");
  }
  const channels = readChannelCount(view.getUint16(commonOffset, false));
  const frames = view.getUint32(commonOffset + 2, false);
  const bitsPerSample = view.getUint16(commonOffset + 6, false);
  const sampleRate = readSampleRate(readExtended80(bytes, commonOffset + 8));
  if (bitsPerSample !== 8 && bitsPerSample !== 16 && bitsPerSample !== 24 && bitsPerSample !== 32) {
    throw new Error("Unsupported AIFF bit depth. Choose 8, 16, 24, or 32-bit PCM.");
  }
  if (formType === "AIFC") {
    if (commonLength < 22) throw new Error("AIFC compression data is truncated.");
    const compression = ascii(bytes, commonOffset + 18, commonOffset + 22);
    if (compression !== "NONE" && compression !== "twos" && compression !== "sowt") {
      throw new Error("Unsupported AIFC codec. Choose uncompressed PCM AIFF or AIFC audio.");
    }
  }
  const bytesPerFrame = channels * Math.ceil(bitsPerSample / 8);
  if (frames === 0 || frames * bytesPerFrame > soundBytes) {
    throw new Error("AIFF sample data is truncated or inconsistent.");
  }
  return createPreflight("aiff", channels, sampleRate, frames);
}

function preflightFlac(bytes: Uint8Array): AudioDecodePreflight {
  if (bytes.length < 42) throw new Error("FLAC STREAMINFO metadata is truncated.");
  const metadataType = (bytes[4] ?? 0) & 0x7f;
  const metadataLength = ((bytes[5] ?? 0) << 16) | ((bytes[6] ?? 0) << 8) | (bytes[7] ?? 0);
  if (metadataType !== 0 || metadataLength !== 34) {
    throw new Error("FLAC must begin with one complete STREAMINFO block.");
  }
  let streamInfo = 0n;
  for (let index = 18; index < 26; index += 1) {
    streamInfo = (streamInfo << 8n) | BigInt(bytes[index] ?? 0);
  }
  const sampleRate = readSampleRate(Number((streamInfo >> 44n) & 0xfffffn));
  const channels = readChannelCount(Number((streamInfo >> 41n) & 0x7n) + 1);
  const bitsPerSample = Number((streamInfo >> 36n) & 0x1fn) + 1;
  const framesBig = streamInfo & 0xfffffffffn;
  if (bitsPerSample < 4 || bitsPerSample > 24) {
    throw new Error("FLAC sample depth must be between 4 and 24 bits.");
  }
  if (framesBig === 0n || framesBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("FLAC requires a bounded non-zero total sample count.");
  }
  return createPreflight("flac", channels, sampleRate, Number(framesBig));
}

function createPreflight(
  codec: SupportedCodec,
  channels: 1 | 2,
  sampleRate: number,
  frames: number,
): AudioDecodePreflight {
  if (!Number.isSafeInteger(frames) || frames <= 0) {
    throw new RangeError("Audio frame count must be a positive safe integer.");
  }
  const decodedBytes = frames * channels * Float32Array.BYTES_PER_ELEMENT;
  if (
    !Number.isSafeInteger(decodedBytes) ||
    decodedBytes > MAX_DECODED_BYTES ||
    frames / sampleRate > MAX_DURATION_SECONDS
  ) {
    throw new RangeError("Declared audio exceeds the project duration or decoded-memory limit.");
  }
  return Object.freeze({ codec, channels, sampleRate, frames, decodedBytes });
}

function validateDecoded(
  preflight: AudioDecodePreflight,
  channels: readonly Float32Array[],
  sampleRate: number,
): DecodedAudio {
  if (
    sampleRate !== preflight.sampleRate ||
    channels.length !== preflight.channels ||
    channels.some((channel) => channel.length !== preflight.frames)
  ) {
    throw new RangeError("Decoded audio metadata does not match the validated container headers.");
  }
  for (const channel of channels) {
    for (const sample of channel) {
      if (!Number.isFinite(sample)) {
        throw new RangeError("Decoded audio contains a non-finite sample.");
      }
    }
  }
  return Object.freeze({
    codec: preflight.codec,
    channelData: channels,
    sampleRate,
    frames: preflight.frames,
  });
}

function checkedContainerEnd(
  declaredPayloadBytes: number,
  availableBytes: number,
  label: string,
): number {
  const end = declaredPayloadBytes + 8;
  if (!Number.isSafeInteger(end) || end < 12 || end > availableBytes) {
    throw new Error(`${label} container length is truncated or inconsistent.`);
  }
  return end;
}

function requireAvailable(offset: number, length: number, limit: number, label: string): void {
  const end = offset + length;
  if (!Number.isSafeInteger(length) || length < 0 || !Number.isSafeInteger(end) || end > limit) {
    throw new Error(`${label} length is truncated or inconsistent.`);
  }
}

function readChannelCount(value: number): 1 | 2 {
  if (value !== 1 && value !== 2) {
    throw new RangeError("Pulsebox accepts mono or stereo audio only.");
  }
  return value;
}

function readSampleRate(value: number): number {
  if (!Number.isInteger(value) || value < 8_000 || value > 192_000) {
    throw new RangeError("Audio sample rate must be between 8000 and 192000 Hz.");
  }
  return value;
}

function readExtended80(bytes: Uint8Array, offset: number): number {
  const exponentWord = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  const sign = (exponentWord & 0x8000) === 0 ? 1 : -1;
  const exponent = exponentWord & 0x7fff;
  let mantissa = 0n;
  for (let index = offset + 2; index < offset + 10; index += 1) {
    mantissa = (mantissa << 8n) | BigInt(bytes[index] ?? 0);
  }
  if (exponent === 0 && mantissa === 0n) return 0;
  return sign * Number(mantissa) * 2 ** (exponent - 16_383 - 63);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}
