export type ProjectFormatFixtureGroup = "valid" | "rejection" | "repair" | "storage";
export type ProjectFormatFixtureInput =
  "archive" | "manifest" | "pack" | "project" | "storage-runtime";
export type ProjectFormatFixtureOutcome = "accept" | "degraded" | "reject" | "repair" | "rollback";

export interface ProjectFormatFixtureDefinition {
  readonly id: string;
  readonly group: ProjectFormatFixtureGroup;
  readonly input: ProjectFormatFixtureInput;
  readonly outcome: ProjectFormatFixtureOutcome;
  readonly assertion: string;
}

export const PROJECT_FORMAT_FIXTURE_DEFINITIONS = [
  {
    id: "valid-minimum-project",
    group: "valid",
    input: "project",
    outcome: "accept",
    assertion: "Eight empty rack slots and no assets validate.",
  },
  {
    id: "valid-default-project",
    group: "valid",
    input: "project",
    outcome: "accept",
    assertion: "All six built-in instruments and all built-in effects validate.",
  },
  {
    id: "valid-complete-record-union",
    group: "valid",
    input: "manifest",
    outcome: "accept",
    assertion: "Every event, automation, mixer, chain, and Song record validates.",
  },
  {
    id: "valid-embedded-codecs",
    group: "valid",
    input: "archive",
    outcome: "accept",
    assertion: "Mono and stereo WAV, AIFF, and FLAC assets validate.",
  },
  {
    id: "valid-pack-reference-modes",
    group: "valid",
    input: "pack",
    outcome: "accept",
    assertion: "One immutable pack supports Keep references and Embed assets exports.",
  },
  {
    id: "valid-maximum-boundaries",
    group: "valid",
    input: "archive",
    outcome: "accept",
    assertion: "Every bounded field validates exactly at its maximum.",
  },
  {
    id: "valid-canonical-digests",
    group: "valid",
    input: "archive",
    outcome: "accept",
    assertion: "Repeated canonical serialization produces fixed SHA-256 digests.",
  },

  {
    id: "reject-zip-structure",
    group: "rejection",
    input: "archive",
    outcome: "reject",
    assertion:
      "Truncated, bad-CRC, overlapping, encrypted, ZIP64, and unsupported-compression archives reject.",
  },
  {
    id: "reject-unsafe-paths",
    group: "rejection",
    input: "archive",
    outcome: "reject",
    assertion:
      "Traversal, absolute, drive, backslash, non-NFC, overlong, duplicate, and case-colliding paths reject.",
  },
  {
    id: "reject-entry-kinds",
    group: "rejection",
    input: "archive",
    outcome: "reject",
    assertion: "Links, devices, unexpected, missing, and unreferenced entries reject.",
  },
  {
    id: "reject-resource-limits",
    group: "rejection",
    input: "archive",
    outcome: "reject",
    assertion: "Declared and streamed entry, manifest, aggregate, and ratio limit breaches reject.",
  },
  {
    id: "reject-json-grammar",
    group: "rejection",
    input: "manifest",
    outcome: "reject",
    assertion:
      "Invalid UTF-8, duplicate keys, excessive shape, invalid numbers, and lone surrogates reject.",
  },
  {
    id: "reject-invalid-identities",
    group: "rejection",
    input: "manifest",
    outcome: "reject",
    assertion: "Duplicate, malformed, dangling, wrong-kind, and unstable IDs reject.",
  },
  {
    id: "reject-unresolved-project-id",
    group: "rejection",
    input: "project",
    outcome: "reject",
    assertion: "A same-project-ID collision makes no change without a selected resolution.",
  },
  {
    id: "reject-rack-cap",
    group: "rejection",
    input: "project",
    outcome: "reject",
    assertion: "Nine rack slots reject and report every over-cap slot.",
  },
  {
    id: "reject-routing-and-limiter",
    group: "rejection",
    input: "manifest",
    outcome: "reject",
    assertion:
      "Cyclic routing, irreparable parameter values, and a missing protected limiter reject.",
  },
  {
    id: "reject-audio-integrity",
    group: "rejection",
    input: "archive",
    outcome: "reject",
    assertion: "Hash, codec, metadata, channel, duration, and decoded-size violations reject.",
  },
  {
    id: "reject-plugin-and-format-compatibility",
    group: "rejection",
    input: "manifest",
    outcome: "reject",
    assertion:
      "Unknown or incompatible required plugins, extensions, migrations, APIs, and formats reject.",
  },
  {
    id: "reject-pack-identity",
    group: "rejection",
    input: "pack",
    outcome: "reject",
    assertion:
      "Pack hash mismatch, duplicate assets, and changed bytes under an existing identity reject.",
  },

  {
    id: "repair-safe-fields",
    group: "repair",
    input: "manifest",
    outcome: "repair",
    assertion:
      "A finite out-of-range parameter and absent optional field produce an exact repair report.",
  },
  {
    id: "repair-optional-extension",
    group: "repair",
    input: "manifest",
    outcome: "repair",
    assertion: "Unknown optional extension data round-trips without execution or network access.",
  },
  {
    id: "degraded-missing-pack",
    group: "repair",
    input: "pack",
    outcome: "degraded",
    assertion:
      "Missing pack layers are silent, references survive, and exact reinstall restores them.",
  },
  {
    id: "repair-migration-chain",
    group: "repair",
    input: "project",
    outcome: "repair",
    assertion:
      "Complete project and plugin migration chains are deterministic and each intermediate failure is covered.",
  },
  {
    id: "reject-time-signature-structure",
    group: "repair",
    input: "project",
    outcome: "reject",
    assertion:
      "Duplicate ticks, non-boundaries, and downstream-invalidating edits reject atomically.",
  },

  {
    id: "storage-quota-headroom",
    group: "storage",
    input: "storage-runtime",
    outcome: "accept",
    assertion: "Quota preflight is defined below and exactly at required headroom.",
  },
  {
    id: "storage-persistence-outcomes",
    group: "storage",
    input: "storage-runtime",
    outcome: "accept",
    assertion: "Persistent-storage grant, denial, absence, and rejection are reported.",
  },
  {
    id: "storage-atomic-write-failures",
    group: "storage",
    input: "storage-runtime",
    outcome: "rollback",
    assertion: "Quota, request, abort, and browser-close failures retain the old head.",
  },
  {
    id: "storage-recovery-retention",
    group: "storage",
    input: "storage-runtime",
    outcome: "accept",
    assertion:
      "Recovery count, byte pruning, fallback, and blob retention preserve protected heads.",
  },
  {
    id: "storage-last-writer-wins",
    group: "storage",
    input: "storage-runtime",
    outcome: "accept",
    assertion: "Two stale tabs warn and the later atomic save remains authoritative.",
  },
  {
    id: "storage-revision-rollover",
    group: "storage",
    input: "storage-runtime",
    outcome: "accept",
    assertion: "Maximum-minus-one increments and maximum counter rolls to a new epoch at zero.",
  },
  {
    id: "storage-same-id-resolution",
    group: "storage",
    input: "storage-runtime",
    outcome: "accept",
    assertion:
      "Open, copy, replace, and cancel paths preserve their remap, recovery, and rollback rules.",
  },
  {
    id: "storage-install-import-rollback",
    group: "storage",
    input: "storage-runtime",
    outcome: "rollback",
    assertion: "Pack install and project import failures leave no partial records.",
  },
  {
    id: "storage-pack-removal",
    group: "storage",
    input: "storage-runtime",
    outcome: "accept",
    assertion:
      "Referenced pack removal blocks with usage and unreferenced removal commits atomically.",
  },
  {
    id: "storage-origin-identity",
    group: "storage",
    input: "storage-runtime",
    outcome: "accept",
    assertion:
      "Canonical-origin reload persists while another host or port is labeled separate storage.",
  },
] as const satisfies readonly ProjectFormatFixtureDefinition[];
