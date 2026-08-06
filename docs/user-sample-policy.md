# User sample policy

This document defines the user-facing sample boundary for Pulsebox. The
normative storage and validation details are in
[PROJECT-FORMAT.md](PROJECT-FORMAT.md).

## Accepted sources

- WAV, AIFF, and FLAC files.
- Mono or stereo audio only.
- At most 32 MiB per source file.
- At most 512 MiB of stored imported assets in one project.
- Decoded duration and frame counts within the bounds in `PROJECT-FORMAT.md`.

Pulsebox uses its bundled deterministic decoder path for all three formats.
Browser-native codec support does not change the accepted-format list.

## Import behavior

Pulsebox validates the complete source before changing project state. It rejects
malformed containers, unsupported encodings, more than two channels,
declared-size mismatches, excessive decoded frames, and any operation that would
exceed project or browser-storage limits. A rejection names the file, reason,
and recovery action.

Accepted audio is assigned a SHA-256 content ID. Assigning the same asset to
multiple voices does not duplicate stored or decoded data. Display names are
separate from original source metadata and content identity.

## Playback preparation

Sample decoding runs outside the audio render thread. Before playback, the
engine prepares channel layout, sample rate, DC-offset handling, start and end
micro-fades, loop boundaries, and safe start offsets. Decoded `AudioBuffer`
objects and live nodes are never serialized.

## Project ownership

Loose user imports are project-owned and embedded in portable `.pulsebox`
exports. A loose file path is never a durable reference. An installed immutable
sample pack may use a validated `pack-reference` as defined in
`PROJECT-FORMAT.md`. Portable Export offers to embed eligible pack assets.

If a referenced pack is unavailable, the project loads in the defined degraded
mode. It preserves the reference and silences only the unavailable sample
layers. Synthesis layers stay active. The UI explains how to install the exact
matching pack or replace the asset.

## Removal and replacement

The project library shows every use of an asset. An asset can be removed only
when no project voice references it. Replacement is one undoable command that
updates selected references while preserving the old asset until the undo entry
expires. Installed packs cannot be removed while a current project, saved
project, retained recovery snapshot, or active Undo or Redo record references
them.

## Privacy and originality

Samples remain in origin-scoped browser storage and portable files selected by
the user. Pulsebox uploads nothing and has no cloud service. Factory content
must be original. You are responsible for the rights to material you import
and export.
