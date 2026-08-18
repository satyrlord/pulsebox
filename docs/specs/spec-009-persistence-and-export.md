# Pulsebox Persistence and Export Specification

**Status:** Approved normative product specification  
**Spec ID:** `spec-009`  
**Build order:** 9 of 10  
**Depends on:** [Song and automation](spec-008-song-and-automation.md)  
**Owns:** Samples, browser storage, project documents, recovery, import,
portable archives, WAV, and stems.  
**Acceptance IDs:** `AC-034` through `AC-038`, `AC-051` through `AC-054`, and
`AC-081` through `AC-083` in
[release acceptance](spec-012-release-acceptance.md).

---

## 23. Persistence, project files, and export

### 23.0 Project sample library

User sample layers require a project sample library.

Capabilities:

- Import audio files.
- Preview.
- Rename the project asset.
- Assign one asset to multiple voices without duplicating decoded data.
- Replace.
- Remove when unreferenced.
- Show usage references.
- Detect duplicate content where practical.
- Report decode failure.
- Report missing linked assets.
- Store original metadata separately from display names.
- Prepare safe channel, rate, DC-offset, and boundary handling before playback.
- Keep decoded buffers out of serializable state.
- Durable non-embedded references may target immutable factory packs or
  user-installed packs stored in IndexedDB by content ID. Portable export
  embeds loose imported files.

User-installed packs enter through Settings, Sample packs, Install pack from a
local `.pulsebox-pack` archive. Packs are immutable and content-addressed as
defined in `PROJECT-FORMAT.md`. A missing referenced pack loads the project in
the defined degraded mode. Unavailable sample layers are silent. Synthesis and
unrelated audio continue.

References round-trip unchanged. The recovery report
identifies the exact content needed.

Accepted user-sample formats are WAV, AIFF, and FLAC. Preserve mono and stereo
channel layouts. Reject files with more than two channels. Enforce hard limits
of 32 MiB per source file and 512 MiB of total stored imported assets per
project. Enforce the decoded frame, duration, archive, manifest, and expansion
limits in `PROJECT-FORMAT.md` before project state changes. A compressed source
that expands beyond a decoded limit causes rejection.

This rule applies even
when its source file is smaller than 32 MiB.

### 23.1 Browser storage

IndexedDB stores:

- Project metadata.
- Rack order.
- Module state.
- Patterns.
- Notes.
- Steps.
- Automation.
- Mixer.
- Effects.
- Samples.
- Playlist.
- Timing.

Local storage stores only preferences such as:

- Last project ID.
- Last workspace.
- Collapsed panels.
- Last studio tab.
- Theme preference.
- Contrast mode.

Both development and production-build launch commands use
`http://127.0.0.1:4173` with strict-port behavior so origin-scoped project data
does not move silently. A different scheme, host, or port is a different storage
origin and is not an automatic migration path.

### 23.2 Project document

A `.pulsebox` project has:

- Version.
- Project metadata.
- Stable IDs.
- Plugin versions.
- Parameter state.
- Named project Patterns and their per-module parts.
- Ordered named-Pattern Playlist.
- Automation.
- Mixer and routing.
- Effect chains.
- Sample manifest, including a stable content ID and storage mode for each
  asset: `embedded` or `pack-reference`.
- Migration metadata.

Import rejects executable code.

Serialization excludes each live AudioNode and worklet object.

Browser storage uses a versioned JSON manifest plus separate asset records.
Portable export uses one `.pulsebox` package containing the manifest and any
embedded audio assets. A `.pulsebox` file is a standard ZIP-compatible archive
with `manifest.json` at the root and imported assets under `assets/`.

`PROJECT-FORMAT.md` defines the normative schema and canonical serialization.
It also defines the pack-reference contract, plugin compatibility rules,
resource bounds, and archive safety rules.

### 23.3 Save and recovery

- Autosave after committed edits with debounce.
- Dirty indicator.
- Saving indicator.
- Saved indicator.
- Explicit Save.
- Saving does not block interaction.
- Recover after refresh or crash.
- Tell the user which data recovery restored. Use a non-blocking panel and ARIA
  live announcement.
- Keep a bounded recovery history.
- The format-1 to format-2 project migration runs before current-schema
  validation. Import, stored-project open, and autosave recovery use it.

After the first explicit Save or sample-pack installation gesture, request
persistent origin storage once. Show whether the browser granted the request.
Before an asset or recovery-snapshot write, get the browser storage estimate.
Use it as an early warning. Calculate the worst-case new records for the
operation. Estimates never replace transaction error handling.

Every Save, autosave, import, migration, and recovery update is atomic. After a
transaction fails, Pulsebox preserves the last committed project. It keeps the
current editor dirty. It shows a storage error and recovery action. Portable
Export remains available.

`QuotaExceededError` never causes silent pruning of current project assets.
Pulsebox can prune only recovery snapshots outside the protected current and
last known-good pair.

It prunes the oldest snapshot first
and reports the action.

Ordinary Save preserves each sample manifest entry's current `embedded` or
`pack-reference` storage mode without prompting. Portable Export asks whether
eligible recognized pack references remain references or become embedded.
Loose imported files are not eligible as durable external references and are
embedded in the portable package.

When the same project is open in multiple tabs, last writer wins. There is no
edit lock and no automatic conflict copy. Tabs should broadcast version changes
so a stale tab can show a non-blocking warning before its next save, but a later
save still becomes authoritative.

### 23.4 Import validation

- Validate structure.
- Validate plugin IDs.
- Validate parameter ranges.
- Validate IDs and references.
- Validate effect routing.
- Validate sample metadata.
- Clamp or reject dangerous values.
- Reject executable content.
- Report every repaired or rejected item.

Apply the complete validation order and limits in `PROJECT-FORMAT.md`. Reject
unsafe or colliding archive paths, links, and duplicate entries. Reject
excessive expansion and oversized or deeply nested manifests. Reject excessive
record counts and decoded audio over the frame limits. Apply the limits in
`PROJECT-FORMAT.md`. Reject unknown or incompatible referenced plugins.

Complete these checks before asset decoding or IndexedDB changes.

Import safely repairs numeric ranges and missing optional fields. When only safe
repairs are needed, it applies the project and then shows a complete repair
report. Structural damage or an unknown or incompatible referenced plugin
rejects the import and produces a complete rejection report. Every plugin
reference in an MVP project is required. No optional-plugin degradation mode
exists. Import uses no confirmation dialog.

An imported project containing more than eight rack slots is incompatible with
the MVP. Import rejects the full project. The rejection report lists every
over-cap slot. Import applies no partial project state.

### 23.5 Audio export

- Master WAV export.
- One stem per rack slot.
- Offline rendering.
- Render faster than real time where supported. Measure the result informally.
  Do not use a hardware-specific threshold as a release gate.
- Visible progress.
- Cancel.
- Deterministic result.
- No playback dropout.
- No server.

Stem export produces one post-module-pedalboard, post-fader stem per occupied rack
slot, one separate stem for each of the four send returns, and one master mix.
Rack stems do not duplicate shared send returns. Rack and send-return stems are
rendered before the master chain. Only the master mix includes master-chain
processing.

All WAV exports use 16-bit, 44.1 kHz PCM, including exports from a 48 kHz live
project. Offline export uses high-quality deterministic resampling to 44.1 kHz.
Export does not normalize. Export applies deterministic TPDF dither whenever it
quantizes audio to 16-bit PCM.

---
