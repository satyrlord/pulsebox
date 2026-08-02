import {
  DOCUMENT_LIMITS,
  parseProjectJson,
  type DocumentResult,
  type ParseOptions,
  type ProjectDocument,
} from "./project-document";

const MANIFEST_NAME = "manifest.json";
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const END_RECORD_BYTES = 22;
const MAXIMUM_ARCHIVE_BYTES = 522 * 1024 * 1024;
const MAXIMUM_MANIFEST_BYTES = 8 * 1024 * 1024;
const DOS_DATE_1980_01_01 = 0x21;

function archiveFailure(path: string, message: string): DocumentResult<never> {
  return { ok: false, issues: [{ path, message }] };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return Object.is(value, -0) ? 0 : value;
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .map(([key, entry]) => [key.normalize("NFC"), canonicalize(entry)] as const)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

/** Canonical project JSON: sorted object keys, stable arrays, and no whitespace. */
function serializeCanonicalProjectJson(document: ProjectDocument): string {
  return JSON.stringify(canonicalize(document));
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function copy(target: Uint8Array, offset: number, source: Uint8Array): void {
  target.set(source, offset);
}

/** Portable-archive file extension, owned beside the serializer that writes it. */
const PORTABLE_PROJECT_EXTENSION = ".pulsebox";

/**
 * Reduces a free-text project name to a safe portable filename. A name made
 * entirely of punctuation reduces to nothing, which would otherwise produce a
 * file called only the extension.
 */
export function portableProjectFilename(name: string): string {
  const base = name
    .replaceAll(/[^\w-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base.length === 0 ? "project" : base}${PORTABLE_PROJECT_EXTENSION}`;
}

/**
 * Writes the canonical no-asset `.pulsebox` ZIP. Asset entries will be added
 * when the project asset library ships; accepting hidden extra entries now
 * would weaken the import boundary.
 */
export function serializePortableProject(document: ProjectDocument): Uint8Array {
  if (document.assets.length !== 0) {
    throw new TypeError(
      "Portable export cannot yet write project assets, and silently dropping them would lose data.",
    );
  }
  const encoder = new TextEncoder();
  const name = encoder.encode(MANIFEST_NAME);
  const manifest = encoder.encode(serializeCanonicalProjectJson(document));
  if (manifest.length > MAXIMUM_MANIFEST_BYTES) {
    throw new RangeError("Project manifest exceeds the 8 MiB archive limit.");
  }
  const checksum = crc32(manifest);
  const centralOffset = LOCAL_HEADER_BYTES + name.length + manifest.length;
  const centralSize = CENTRAL_HEADER_BYTES + name.length;
  const bytes = new Uint8Array(centralOffset + centralSize + END_RECORD_BYTES);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, UTF8_FLAG, true);
  view.setUint16(8, STORE_METHOD, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, DOS_DATE_1980_01_01, true);
  view.setUint32(14, checksum, true);
  view.setUint32(18, manifest.length, true);
  view.setUint32(22, manifest.length, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  copy(bytes, LOCAL_HEADER_BYTES, name);
  copy(bytes, LOCAL_HEADER_BYTES + name.length, manifest);

  view.setUint32(centralOffset, 0x02014b50, true);
  view.setUint16(centralOffset + 4, 0x0314, true);
  view.setUint16(centralOffset + 6, 20, true);
  view.setUint16(centralOffset + 8, UTF8_FLAG, true);
  view.setUint16(centralOffset + 10, STORE_METHOD, true);
  view.setUint16(centralOffset + 12, 0, true);
  view.setUint16(centralOffset + 14, DOS_DATE_1980_01_01, true);
  view.setUint32(centralOffset + 16, checksum, true);
  view.setUint32(centralOffset + 20, manifest.length, true);
  view.setUint32(centralOffset + 24, manifest.length, true);
  view.setUint16(centralOffset + 28, name.length, true);
  view.setUint16(centralOffset + 30, 0, true);
  view.setUint16(centralOffset + 32, 0, true);
  view.setUint16(centralOffset + 34, 0, true);
  view.setUint16(centralOffset + 36, 0, true);
  view.setUint32(centralOffset + 38, 0o100644 << 16, true);
  view.setUint32(centralOffset + 42, 0, true);
  copy(bytes, centralOffset + CENTRAL_HEADER_BYTES, name);

  const end = centralOffset + centralSize;
  view.setUint32(end, 0x06054b50, true);
  view.setUint16(end + 4, 0, true);
  view.setUint16(end + 6, 0, true);
  view.setUint16(end + 8, 1, true);
  view.setUint16(end + 10, 1, true);
  view.setUint32(end + 12, centralSize, true);
  view.setUint32(end + 16, centralOffset, true);
  view.setUint16(end + 20, 0, true);
  return bytes;
}

function safeSlice(bytes: Uint8Array, start: number, length: number): Uint8Array | undefined {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0)
    return undefined;
  const end = start + length;
  return end <= bytes.length && end >= start ? bytes.subarray(start, end) : undefined;
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** Validates and reads the current no-asset portable archive before mutation. */
export function parsePortableProject(
  bytes: Uint8Array,
  options: ParseOptions,
): DocumentResult<ProjectDocument> {
  if (bytes.length > MAXIMUM_ARCHIVE_BYTES)
    return archiveFailure("$", "Project archive exceeds 522 MiB.");
  if (bytes.length < LOCAL_HEADER_BYTES + CENTRAL_HEADER_BYTES + END_RECORD_BYTES)
    return archiveFailure("$", "Project archive is truncated.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - END_RECORD_BYTES;
  if (view.getUint32(end, true) !== 0x06054b50)
    return archiveFailure("$", "ZIP end record is missing or the archive has trailing data.");
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0)
    return archiveFailure("$", "Multi-disk ZIP archives are not supported.");
  if (view.getUint16(end + 8, true) !== 1 || view.getUint16(end + 10, true) !== 1)
    return archiveFailure("$", "A no-asset project archive must contain only manifest.json.");
  if (view.getUint16(end + 20, true) !== 0)
    return archiveFailure("$", "ZIP archive comments are not permitted.");
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (centralSize > 1024 * 1024 || centralOffset + centralSize !== end)
    return archiveFailure("$", "ZIP central directory has an invalid size or offset.");
  if (
    centralOffset + CENTRAL_HEADER_BYTES > end ||
    view.getUint32(centralOffset, true) !== 0x02014b50
  )
    return archiveFailure("$", "ZIP central directory entry is invalid.");

  const flags = view.getUint16(centralOffset + 8, true);
  const method = view.getUint16(centralOffset + 10, true);
  const checksum = view.getUint32(centralOffset + 16, true);
  const compressedSize = view.getUint32(centralOffset + 20, true);
  const uncompressedSize = view.getUint32(centralOffset + 24, true);
  const nameLength = view.getUint16(centralOffset + 28, true);
  const extraLength = view.getUint16(centralOffset + 30, true);
  const commentLength = view.getUint16(centralOffset + 32, true);
  const disk = view.getUint16(centralOffset + 34, true);
  const externalAttributes = view.getUint32(centralOffset + 38, true);
  const localOffset = view.getUint32(centralOffset + 42, true);
  if ((flags & 1) !== 0 || (flags & ~UTF8_FLAG) !== 0)
    return archiveFailure(
      MANIFEST_NAME,
      "Encrypted entries and unsupported ZIP flags are not permitted.",
    );
  if (method !== STORE_METHOD || compressedSize !== uncompressedSize)
    return archiveFailure(MANIFEST_NAME, "The current no-asset format requires ZIP Store.");
  if (uncompressedSize > Math.min(MAXIMUM_MANIFEST_BYTES, DOCUMENT_LIMITS.maximumBytes))
    return archiveFailure(MANIFEST_NAME, "Manifest exceeds its size limit.");
  if (extraLength !== 0 || commentLength !== 0 || disk !== 0)
    return archiveFailure(
      MANIFEST_NAME,
      "ZIP extras, comments, and multiple disks are not permitted.",
    );
  const unixMode = externalAttributes >>> 16;
  if (unixMode !== 0 && (unixMode & 0xf000) !== 0x8000)
    return archiveFailure(MANIFEST_NAME, "Archive entry must be a regular file.");
  const centralNameBytes = safeSlice(bytes, centralOffset + CENTRAL_HEADER_BYTES, nameLength);
  if (centralNameBytes === undefined || centralOffset + CENTRAL_HEADER_BYTES + nameLength !== end)
    return archiveFailure("$", "ZIP central directory length is invalid.");
  const centralName = decodeUtf8(centralNameBytes);
  if (centralName !== MANIFEST_NAME || centralName !== centralName.normalize("NFC"))
    return archiveFailure("$", "The only permitted entry is canonical manifest.json.");

  if (localOffset !== 0 || view.getUint32(localOffset, true) !== 0x04034b50)
    return archiveFailure(MANIFEST_NAME, "Local ZIP header is missing or has an invalid offset.");
  const localFlags = view.getUint16(localOffset + 6, true);
  const localMethod = view.getUint16(localOffset + 8, true);
  const localChecksum = view.getUint32(localOffset + 14, true);
  const localCompressed = view.getUint32(localOffset + 18, true);
  const localUncompressed = view.getUint32(localOffset + 22, true);
  const localNameLength = view.getUint16(localOffset + 26, true);
  const localExtraLength = view.getUint16(localOffset + 28, true);
  if (
    localFlags !== flags ||
    localMethod !== method ||
    localChecksum !== checksum ||
    localCompressed !== compressedSize ||
    localUncompressed !== uncompressedSize ||
    localNameLength !== nameLength ||
    localExtraLength !== 0
  )
    return archiveFailure(MANIFEST_NAME, "Local and central ZIP headers disagree.");
  const localNameBytes = safeSlice(bytes, LOCAL_HEADER_BYTES, localNameLength);
  if (localNameBytes === undefined || decodeUtf8(localNameBytes) !== MANIFEST_NAME)
    return archiveFailure(MANIFEST_NAME, "Local ZIP entry name is invalid.");
  const dataOffset = LOCAL_HEADER_BYTES + localNameLength;
  const manifest = safeSlice(bytes, dataOffset, compressedSize);
  if (manifest === undefined || dataOffset + compressedSize !== centralOffset)
    return archiveFailure(
      MANIFEST_NAME,
      "ZIP entry overlaps another record or has an invalid size.",
    );
  if (crc32(manifest) !== checksum)
    return archiveFailure(MANIFEST_NAME, "Manifest CRC-32 does not match its bytes.");
  const json = decodeUtf8(manifest);
  if (json === undefined || json.charCodeAt(0) === 0xfeff)
    return archiveFailure(MANIFEST_NAME, "Manifest must be UTF-8 without a byte-order mark.");
  return parseProjectJson(json, options);
}
