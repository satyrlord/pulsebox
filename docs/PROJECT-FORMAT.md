# Pulsebox project and pack format

**Status:** Normative Phase 0 contract  
**Project format:** 1  
**Pack format:** 1

This document defines the durable project, asset-pack, browser-storage, import,
save, recovery, and portable-export contract for Pulsebox. It refines the
approved requirements in the
[persistence and export specification](specs/spec-009-persistence-and-export.md).
If the documents disagree, reconcile the product decision in both before
product code is changed.

The format is data only. An importer must never evaluate a value as code or load
a URL named by imported data. It must never resolve an archive name as a host
file-system path.

## 1. Scope and non-goals

This contract covers:

- browser-resident projects and assets in IndexedDB.
- portable `.pulsebox` project archives.
- immutable factory and user-installed asset packs.
- plugin and project migrations.
- validation, quotas, atomic writes, autosave, and recovery.
- deterministic serialization and verification fixtures.

It does not define live audio objects, decoded `AudioBuffer` objects, meter
frames, playheads, focus, hover, previews, faceplate-group disclosure, theme
preferences, or other transient UI state. It does not permit loose-file links,
executable plugins, remote assets, network retrieval, or host file-system paths.

## 2. Terms and units

- `MiB` means 1,048,576 bytes.
- A byte count is measured before any browser storage compression.
- A content ID is `sha256:` followed by 64 lowercase hexadecimal characters.
- Canonical JSON means the encoding defined in section 12.
- Every referenced plugin is required to restore the project's authored audio
  and editable state.
- A loose asset is audio imported directly by the user rather than obtained from
  a recognized immutable pack.
- A pack reference names immutable bytes by both pack content ID and asset
  content ID. It is not a path.

All limits in this document are inclusive unless a rule says otherwise.

## 3. Stable IDs and scalar rules

### 3.1 Typed IDs

Project-owned entity IDs use lowercase UUID version 4 text in the form
`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`, where `y` is `8`, `9`, `a`, or `b`. This
applies to projects, module instances, effect instances, patterns, notes, steps,
automation lanes, clips, and user-created asset records. IDs
are stable across reorder, save, export, ordinary import, and migration. The
explicit Import as copy action in section 9.4 remaps only the project ID,
lineage ID, and revision epoch. Its project-scoped entity IDs remain stable.

Across stored heads, a project-scoped entity identity is the tuple of project
ID, lineage ID, typed ID. A lineage ID remains stable across ordinary saves,
counter rollover, export, ordinary import, and migrations. The explicit Replace
existing and Undo replace actions start new lineages and require complete state
and engine replacement. Code must not correlate their equal typed IDs with an
older lineage.

A lineage ID and revision epoch each use the same canonical UUID version 4 form.
They are metadata tokens, not project-owned entity IDs.

Fixed rack locations use `slot-01` through `slot-08`. Fixed send buses use
`send-a` through `send-d`. Array positions are never durable references.

Plugin and parameter IDs must match:

```text
[a-z][a-z0-9]*(?:-[a-z0-9]+)*
```

They are at most 64 ASCII bytes. Extension namespaces use reverse-domain form,
contain at least one dot, and are at most 128 ASCII bytes. IDs and content IDs
are case-sensitive. A document containing two equal IDs in the same ID domain is
invalid.

Semantic versions use SemVer 2.0.0 without a leading `v`, are at most 64 ASCII
bytes, and must not contain build metadata. Pre-release versions are permitted.

### 3.2 JSON scalars

- Text is valid Unicode and is encoded as UTF-8 without a byte-order mark.
- Lone UTF-16 surrogates, NUL, and C0 controls other than tab, line feed, and
  carriage return are invalid.
- A general string is at most 65,536 UTF-8 bytes.
- A user-visible name is at most 256 UTF-8 bytes after trimming.
- A user-visible description is at most 4,096 UTF-8 bytes.
- Numbers must be finite. `NaN`, infinities, and negative zero are invalid.
- Integer fields must be JSON numbers in the safe range `-9007199254740991`
  through `9007199254740991`.
- Timestamps use UTC RFC 3339 text with exactly three fractional digits, for
  example `2026-07-26T12:34:56.789Z`.

JSON nesting may not exceed 32 containers. One object may not contain more than
4,096 members. One array may not contain more than 1,000,000 elements. Duplicate
object keys are invalid, even if a normal JSON parser would keep the last one.
The keys `__proto__`, `prototype`, and `constructor` are forbidden at every
level. Parsers must build null-prototype records or an equivalent safe data
structure until schema validation completes.

## 4. Portable project archive

### 4.1 Archive shape

A `.pulsebox` file is a single-disk ZIP archive. Its only permitted entries are:

```text
manifest.json
assets/<asset-content-id-without-prefix>.<codec-extension>
```

`manifest.json` is required and is the first exported entry. The `assets/`
directory contains only assets whose manifest storage mode is `embedded`.
Directory entries, archive comments, and any other file are invalid.

Canonical codec extensions are `wav`, `aiff`, and `flac`. An embedded path is
derived from the asset content ID and codec. Display names and original file
names never become archive paths.

Every embedded manifest record must have exactly one matching archive entry.
Every asset entry must have a matching manifest record. Pack references must not
have archive entries unless portable export has converted the exported copy of
the record to `embedded`.

### 4.2 ZIP restrictions

An importer accepts only the Store method, method 0, and Deflate, method 8. It
rejects:

- encrypted entries.
- multi-disk archives.
- ZIP64 records.
- symlinks, hard links, devices, sockets, and other non-regular entries.
- a local header that disagrees with its central-directory record.
- overlapping entry data, invalid offsets, invalid CRC-32, or trailing data.
- an entry whose actual output differs from its declared uncompressed size.

Entry names must be valid UTF-8 and already use `/` separators and Unicode NFC.
The importer performs a safety normalization by converting `\` to `/`, applying
Unicode NFC, and resolving path segments. It then rejects the entry if the
normalized result differs from the original name.

An entry is also rejected if its name:

- is empty, begins with `/`, begins with a drive prefix, or contains `:`.
- contains an empty, `.` or `..` segment.
- contains NUL, a control character, or a backslash.
- exceeds 160 UTF-8 bytes or has a segment longer than 80 UTF-8 bytes.

Duplicate paths are invalid. Collision checks use Unicode NFC plus lowercase, so
names that differ only by case or normalization are also invalid.

### 4.3 Archive limits

A project archive has these hard limits:

- the complete ZIP file at most 522 MiB.
- the central directory at most 1 MiB.
- at most 257 entries: one manifest and at most 256 assets.
- `manifest.json` at most 8 MiB uncompressed.
- each asset at most 32 MiB uncompressed.
- all asset entries together at most 512 MiB uncompressed.
- all entries together at most 520 MiB uncompressed.
- a per-entry and aggregate expansion ratio at most 100 to 1.

For the ratio check, an empty entry has ratio 1. Any non-empty entry with zero
compressed bytes is invalid. The importer enforces declared limits before
inflation and actual limits while streaming inflation. Crossing a limit stops
that import immediately.

## 5. Project manifest version 1

### 5.1 Root record

The root is a JSON object with exactly these keys. A key marked optional may be
absent. Unknown root keys are invalid.

```text
format              "pulsebox-project"
formatVersion       1
project             ProjectMetadata
plugins             PluginRequirement[]
rack                RackSlot[8]
patterns            Pattern[]
song                SongState
automation          AutomationLane[]
mixer               MixerState
effects             EffectsState
assets              AssetRecord[]
migrations          MigrationRecord[]
extensions          ExtensionRecord[] (optional)
```

The combined number of note, trigger, step-property, automation, and Playlist
placement records is at most 1,000,000.
The limit is checked after safe migration as well as before it.

An `ExtensionRecord` follows section 5.8. A `MigrationRecord` contains exactly:

```text
scope               "project" or "plugin"
id                  stable migration ID
fromVersion         non-negative integer
toVersion           fromVersion + 1
pluginInstanceId    effect or module UUID for plugin scope, otherwise absent
implementation      semantic version of the migration implementation
```

### 5.2 Project metadata

`ProjectMetadata` contains:

```text
id                  project UUID
name                non-empty user-visible name
createdAt           timestamp
modifiedAt          timestamp, not earlier than createdAt
lineageId           UUID
revisionEpoch       UUID
revision            integer from 0 through 9007199254740991
favorite            boolean
tempo               number from 40 through 240 BPM
swing               number from 0 through 100 percent
```

`favorite` is reserved for the post-MVP Favourite feature. The MVP writes `false`
and offers no control that changes it. A reader must still accept and preserve
the field.

`tempo` and `swing` are global transport properties. In the MVP a project holds
exactly one Swing value that applies to every Pattern and every module. A
post-MVP per-Pattern Swing override would be added to the `Pattern` record, and
this field would remain the project default.

`revisionEpoch` and `revision` form one revision token. Export changes neither
the token nor `modifiedAt`. A successful save advances the token once and writes
the commit time to `modifiedAt`. Section 11.1 defines counter rollover.

This committed `ProjectRevision` is distinct from the runtime `StateRevision`
used to order in-memory commands and engine projections. `StateRevision` is not
a project-manifest field and is never serialized. Unsaved edits may advance the
runtime state revision many times while the last committed project revision
remains unchanged.

### 5.3 Plugin requirements and instances

A `PluginRequirement` contains:

```text
id                  stable plugin ID
kind                "instrument" or "effect"
pluginVersion       semantic version text
apiVersion          1
stateVersion        positive integer
```

There is exactly one requirement for each referenced plugin ID and kind.
Contradictory duplicate requirements are invalid. Every rack module references
an instrument requirement. Every effect instance references an effect
requirement.

A plugin instance contains a stable instance UUID, its plugin ID, its
`stateVersion`, and a JSON-object `state`. One plugin state is at most 1 MiB in
canonical JSON. Known plugin state is validated against that plugin's registered
schema, including parameter IDs, types, ranges, references, and allowed keys.
Instrument and effect parameters use the same registered descriptor checks.

Every instrument and effect instance is required in format 1. The manifest has
no optional-plugin mode. Missing, unknown, or incompatible referenced plugins
reject the project in full.

### 5.4 Required MVP plugin registry

Format 1 assigns API version 1, plugin version `1.0.0`, and state version 1 to
the following built-in instrument IDs:

- `bass-mono`
- `drum-analog-small`
- `drum-analog-large`
- `drum-hybrid`
- `drum-digital-a`
- `drum-digital-b`

It assigns the same initial versions to these built-in effect IDs:

- `lo-fi`
- `pattern-filter`
- `distortion`
- `compressor`
- `delay`
- `reverb`
- `chorus`
- `phaser`
- `parametric-eq`
- `transient-shaper`
- `stereo-width`

The visible modes Analog echo, Plate, Drive, and shimmer are parameter state of
the owning effect. They are not separate plugin IDs.

### 5.5 Rack, patterns, and plugin event data

`rack` contains exactly one `RackSlot` for each fixed slot ID, in slot-number
order. A slot contains its fixed slot ID and either `module: null` or a module
record with:

- a stable module UUID.
- a required instrument plugin reference and plugin state.
- enabled, mute, solo, level, and output-routing state.
- a reference to its module effect chain.

The eight-slot array is an MVP file-format limit. Slot-count-agnostic code may
support later migrations, but a format-1 importer rejects a ninth slot and
reports every over-cap slot before applying any state.

The root `patterns` array contains 1 through 32 project-wide `Pattern` records.
A Pattern contains a stable UUID, a unique user-visible name, a color, and a
positive duration in bars. It also contains Humanize from 0 through 100 percent
and an unsigned 32-bit seed. The record contains creation and modification
timestamps and referenced automation lane IDs.

It has at most one `PatternPart` per occupied module ID. A PatternPart contains
the module ID, a nominal step count from 1 through 64, plugin event records, and
referenced automation lane IDs. The part cycle repeats across the Pattern
duration. A drum voice may store its own bounded cycle length in plugin-validated
event data. The MVP grid is fixed at 1/16 and is not stored as a selectable
Pattern property.

Pattern array order is display order only. It is not identity and is never shown
as a compound module-and-pattern number. Removing a module removes its parts from
every Pattern as one undoable command.

The host envelope for a plugin event contains:

```text
id                  event UUID
type                registered plugin event type ID
positionTicks       non-negative safe integer
durationTicks       positive safe integer or absent for triggers
data                plugin-validated JSON object
```

Musical time uses 960 integer ticks per quarter note. Plugin event data is at
most 64 KiB per event. Known plugins reject unknown event types or fields. There
is no unknown-plugin event preservation path because every referenced plugin is
required.

### 5.6 Song and automation

`SongState` contains exactly one ordered `playlist` array. Each placement
contains exactly:

```text
id                  placement UUID
patternId           referenced Pattern UUID
repeatCount         integer from 1 through 64
```

Playlist order is array order, not identity. Every reference must resolve to a
Pattern in the same project. At least one placement is required. Pattern names
and duration are read from the referenced Pattern and are not duplicated in the
placement. There are no Section, Scene, lane, arrangement-clip, tempo-event,
time-signature-event, or Song-automation records in format version 1. Musical
structure is fixed at 4/4 for the MVP.

An `AutomationLane` contains:

- a stable lane UUID.
- scope, target instance ID, and stable parameter ID.
- `pattern` context and its owning Pattern ID.
- a fixed grid size of 240 ticks, equal to 1/16 at 960 ticks per quarter note.
- steps in strictly increasing tick order. Each step contains a non-negative
  tick and one JSON scalar value.

Two steps in one lane may not occupy the same tick. Automation contains only
discrete held steps. Lines, curves, and dense freehand points are invalid. Known
parameter descriptors validate every automation value.

### 5.7 Mixer and effects

`MixerState` contains exactly eight channel records in fixed slot order, four
send definitions in bus order, and one master record. Channel records reference
fixed slot IDs. They contain finite parameter values, four send amounts and
pre/post modes, mute, solo, and stable module-chain references. Transient
Monitor selection, monitor-only Mono state, and L/R or M/S meter mode are absent.

`EffectsState` contains:

- one voice-insert reference per supported drum voice.
- one ordered module chain per occupied module.
- four ordered send chains.
- one ordered master chain.
- one `masterEffectsBypassed` boolean.
- the pinned compact-focus instance for each send chain or `null`.

Every effect slot is `null` or contains a stable effect instance. Routing is
limited to the main path and sends A through D. Cycles, feedback edges, unknown
destinations, a missing protected final limiter, or more slots than the owning
chain contract permits are structural errors. `masterEffectsBypassed` bypasses
the user master effects before the protected limiter. It never bypasses master
gain or the limiter and is independent of the limiter instance's own bypass.

### 5.8 Extensions

An extension record contains a namespace, `required` boolean, positive schema
version, and JSON-object data. Extension data is at most 1 MiB per namespace and
2 MiB in total. Unknown required extensions reject the project. Unknown optional
extensions are retained as canonical opaque JSON and are never executed,
rendered as markup, or sent to a network endpoint.

## 6. Asset records and decoded-audio bounds

### 6.1 Common asset record

An `AssetRecord` contains:

```text
id                  project-owned asset UUID
contentId           SHA-256 content ID of the exact encoded bytes
displayName         user-visible name
originalName        sanitized metadata only
codec               "wav", "aiff", or "flac"
mediaType           registered audio media type
encodedBytes        integer from 1 through 33554432
channels            1 or 2
sampleRate          integer from 8000 through 192000
frames              positive safe integer
storage             EmbeddedStorage or PackStorage
```

`originalName` is not a path. Import strips directory components and control
characters before storing it. The content ID is computed over the exact source
file bytes, before decoding or normalization. The importer verifies the digest,
container metadata, decoded channel count, sample rate, and frames rather than
trusting manifest values.

Canonical media types are `audio/wav`, `audio/aiff`, and `audio/flac` for their
matching codecs. The root `assets` array has at most 256 records and at most 512
MiB of distinct encoded content.

### 6.2 Embedded storage

`EmbeddedStorage` is:

```text
mode                "embedded"
path                canonical assets/ path derived from contentId and codec
```

Loose imported files always use this mode in a portable project. Multiple
project asset records with the same content ID share one immutable browser blob
and one archive entry.

### 6.3 Pack storage

`PackStorage` is:

```text
mode                "pack-reference"
packContentId       SHA-256 content ID of the installed pack
assetContentId      equal to the asset record contentId
```

It contains no path, origin, URL, mutable pack name, or local database key.
Changing a pack or asset byte creates a different content ID.

### 6.4 Hard decoded limits

An asset is rejected if any of these conditions is true:

- decoded duration exceeds 1,800 seconds.
- `frames * channels * 4` exceeds 256 MiB.
- the file contains more than two channels.
- metadata and the bytes disagree.
- decoding produces a non-finite sample or an unsupported channel layout.

The sum of `frames * channels * 4` over all distinct project asset content IDs
must not exceed 1 GiB. This is a validation bound, not permission to keep all
decoded audio resident. The engine loads, shares, and releases decoded buffers
independently of serializable state.

## 7. Immutable asset packs

### 7.1 Pack archive and manifest

A user-installed pack is imported from a ZIP-compatible `.pulsebox-pack` file.
Its only entries are:

```text
pack.json
assets/<asset-content-id-without-prefix>.<codec-extension>
```

The project ZIP safety rules apply. A pack allows at most 257 entries and a 1
MiB `pack.json`. It allows at most 256 assets, 32 MiB per asset, and 512 MiB of
total asset bytes. It allows 513 MiB of total uncompressed bytes and a 515 MiB
complete ZIP file. The central directory is limited to 1 MiB. The expansion
ratio is limited to 100 to 1.

`pack.json` has exactly these keys:

```text
format              "pulsebox-pack"
formatVersion       1
packContentId       SHA-256 pack content ID
name                non-empty user-visible name
version             semantic version text
createdAt           timestamp
assets              PackAsset[]
license             LicenseRecord
provenance          ProvenanceRecord
```

Each `PackAsset` contains exactly:

```text
contentId           SHA-256 content ID of the exact encoded bytes
displayName         user-visible name
originalName        sanitized metadata only
codec               "wav", "aiff", or "flac"
mediaType           matching canonical media type from section 6
encodedBytes        integer from 1 through 33554432
channels            1 or 2
sampleRate          integer from 8000 through 192000
frames              positive safe integer
path                canonical assets/ path derived from contentId and codec
```

The decoded duration and per-asset byte limits from section 6 apply to every
pack asset. The sum of decoded bytes for distinct pack assets must not exceed 1
GiB. Pack asset content IDs are SHA-256 digests of exact encoded bytes.

`LicenseRecord` contains exactly:

```text
name                non-empty user-visible license name
spdx                SPDX identifier or null
text                license text, 65536 UTF-8 bytes maximum
attribution         attribution text, 4096 UTF-8 bytes maximum
```

`ProvenanceRecord` contains exactly:

```text
creator             non-empty user-visible creator name
creationMethod      user-visible description
rightsConfirmed     true
sourceDescription   user-visible description or null
```

Factory packs require an approved original-content provenance record. A user
pack records the importing user's assertion. Pulsebox stores these fields but
does not present them as an independent legal verification.

The pack content ID is SHA-256 over this byte sequence:

1. ASCII `pulsebox-pack-v1`, followed by one zero byte.
2. Canonical `pack.json` with the `packContentId` member omitted.
3. For each asset by ascending content ID, append one zero byte and its 32 raw
   digest bytes.

The asset list itself is ordered by content ID. Duplicate asset content IDs are
invalid. License and provenance are data records only and may not contain URLs
that Pulsebox automatically fetches.

### 7.2 Install location and immutability

The user installs a pack through Settings, Sample packs, Install pack and
selects one local `.pulsebox-pack` file. Installation never scans a directory,
accepts a URL, or watches a host path.

Packs have no operating-system install path. Their normative browser location is
the `pulsebox-v1` IndexedDB database at the canonical production origin:

```text
object store        key
pack-records        <packContentId>
pack-assets         <assetContentId>
```

The display form of this logical location is
`packs/<packContentId>/assets/<assetContentId>`. It must never be interpreted as
a file-system path.

Pack manifests and asset blobs are immutable after install. Installing an
identical pack is a no-op. A changed pack is a new record with a new content ID,
even when its visible name and semantic version are unchanged. Asset blobs may
be deduplicated by content ID and reference count.

Install validates all ZIP structures, JSON, audio metadata, and decoded bounds.
It also validates content IDs, license fields, and quota. After validation, one
IndexedDB transaction inserts the pack record, unique blobs, and reference
counts. Failure aborts the whole install.

### 7.3 Missing packs and safe removal

A missing recognized pack does not structurally invalidate a project. The
project opens in a degraded state with these rules:

- each missing sample layer produces silence.
- synthesis, other assets, editing, saving, and unrelated playback continue.
- one actionable report lists every pack and asset content ID.
- every pack reference is preserved unchanged on ordinary save and round trip.
- reinstalling matching content resolves the reference without editing the
  project.

Pulsebox never substitutes bytes from a pack with the same name or version but a
different content ID.

The Remove action is disabled while any current project, saved project, retained
recovery snapshot, or active Undo or Redo record references the pack. The usage
report identifies those projects and says when active history is the remaining
pin. The user may first convert references to embedded assets in an atomic
project save. A pack with no stored, recovery, or active-history references can
then be removed atomically. This rule prevents a local removal from deliberately
creating missing references and does not use a confirmation dialog.

Browser eviction or manual site-data clearing can still remove a pack. The
missing-pack behavior above is the recovery path.

## 8. Plugin compatibility and migrations

### 8.1 Compatibility decision

Every referenced instrument and effect plugin is required. An unknown plugin,
wrong plugin kind, unsupported API version, newer unsupported state version, or
state with no complete migration path rejects the import in full. The rejection
report lists every affected instance. A reader must not create a bypass or
silence placeholder to pass plugin validation.

Extensions remain separate from plugins. An unknown optional extension is
ignored at runtime and preserved under section 5.8. An unknown required
extension rejects the import.

### 8.2 Version checks

Semantic plugin version records authorship but does not alone decide state
compatibility. Compatibility requires:

1. A registered plugin with the same ID and kind.
2. Supported `apiVersion` 1.
3. A state schema equal to the current schema, or a complete registered
   migration chain from the stored positive `stateVersion`.
4. Successful validation after migration.

A newer plugin semantic version may read older state through migrations. A
reader must not guess at compatibility from semantic-version ranges. A project
with a newer state version than the installed plugin rejects the import.

### 8.3 Migration rules

Project and plugin migrations are pure, deterministic data transforms. They:

- run on a detached candidate document before storage or active state changes.
- advance exactly one integer schema version per step.
- never fetch data, read the clock, generate a random value, or inspect UI
  state.
- preserve stable IDs and unknown optional extension records.
- validate output after every step.
- append a migration record containing from-version, to-version, migration ID,
  and fixed implementation version.
- produce a complete repair and migration report.

Format 1 has no predecessor. Unversioned JSON is invalid. A reader rejects a
project `formatVersion` newer than it supports. Before format 2 ships, its full
project migration and rollback fixtures must ship with the reader.

## 9. Import validation and atomicity

### 9.1 Validation order

An import follows this order before changing a project, pack, or active audio
graph:

1. Read the end record and central directory under compressed-byte and entry
   count limits.
2. Validate ZIP features, entry metadata, normalized path keys, overlaps, and
   declared sizes.
3. Stream-inflate under per-entry, aggregate, and ratio limits while checking
   CRC-32.
4. Parse JSON with duplicate-key, Unicode, nesting, member, array, and byte
   limits.
5. Validate the root format, schema, scalar bounds, IDs, references, event
   count, rack count, routing, and known parameter ranges.
6. Hash and inspect every embedded audio entry, then enforce encoded and decoded
   bounds.
7. Resolve plugin and pack compatibility without substituting content.
8. Run deterministic migrations and allowed safe repairs on a detached copy,
   then repeat complete schema and reference validation.
9. Resolve any local project-ID collision under section 9.4.
10. Run storage quota preflight.
11. Commit all records in one IndexedDB transaction and only then replace the
    active project.

Security-limit failures may stop immediately. For bounded semantic validation,
the report accumulates all errors so the user does not have to retry one error
at a time.

### 9.2 Safe repairs

Safe repairs are limited to:

- clamping a finite known parameter to its registered minimum or maximum.
- filling a missing field that the owning versioned schema explicitly marks
  optional, using its registered deterministic default.
- normalizing a user-visible name by trimming outer whitespace.

Repairs never invent IDs, drop events, remove slots, reroute audio, change an
asset storage mode, substitute a plugin, or discard unknown data. Any such need
is a structural failure. A repair report identifies the JSON location, old
value, new value, and rule.

### 9.3 Validate before mutate

Parsing, hashing, decoding inspection, migration, repair, quota calculation, and
candidate engine preparation happen outside the active project and outside the
final transaction. Engine preparation occurs only after collision resolution and
any resulting remap has passed complete validation again. The final read-write
transaction includes the new project head, its immutable unique asset blobs,
reference counts, and initial recovery record. An abort leaves the previous
project and active audio graph unchanged and removes all candidate writes.

The UI swaps to the imported state only after the transaction completes and the
engine confirms that required plugins can prepare it. Compatible project load
uses playback-safe graph replacement. A rejected import never appears in the
project selector and never changes undo history.
After the swap, the UI reports the accepted engine state from the new runtime.

### 9.4 Existing project-ID collisions

Ordinary import rejects before mutation when `ProjectMetadata.id` already has a
local project head. The collision report names the local and imported project
revision tokens and offers three explicit resolution actions:

- **Open existing** discards the detached import candidate and opens the local
  head without writing data.
- **Import as copy** assigns a new project UUID, lineage ID, and revision epoch,
  sets revision to 0, and sets both timestamps to the action time. All
  project-scoped module, pattern, event, effect, lane, clip, asset-record, and
  migration IDs remain unchanged. Their identity is scoped by the new project
  and lineage IDs. Content IDs and pack IDs also
  remain unchanged. The remapped
  candidate receives complete validation again before quota preflight and
  commit.
- **Replace existing** keeps the existing project UUID and `createdAt`. It
  writes the imported musical state and name under a new lineage ID and revision
  epoch. It sets revision to 0 and sets `modifiedAt` to the action time. All imported
  project-scoped IDs and internal references remain unchanged within that new
  lineage. The prior local head is written to recovery, active command history
  is cleared, and the engine receives a complete replacement in the same
  transaction boundary. Failure changes neither head. The completion notice
  offers **Undo replace**, which atomically restores the prior content under
  another new lineage ID and revision epoch at revision 0. No old revision token
  is reused.

These are collision-resolution actions, not a confirmation dialog. No action is
preselected. Closing the report leaves both the local project and imported file
unchanged. A same-ID candidate is never allowed to overwrite a local head merely
because its numeric counter or timestamp is newer.

## 10. Browser storage and stable origin

### 10.1 Canonical origin

The released production build is served from exactly:

```text
http://127.0.0.1:4173
```

Scheme, host spelling, and port are part of the persistence identity.
`localhost`, another port, HTTPS, and a file URL have separate storage. Both
`npm run dev` and `npm run start` use the canonical origin and strict-port
behavior. They cannot run simultaneously. Automated tests use isolated browser
contexts and explicitly labeled temporary storage rather than another
user-facing origin.

A release must not change the canonical origin silently. If a future release
must change it, the old release first provides Export all projects and packs.
The new origin imports those portable files. Browser same-origin rules prevent
Pulsebox from directly reading the old origin's IndexedDB, so there is no
claimed automatic cross-origin migration. Release notes and startup UI must
state the export/import procedure before the old origin is retired.

### 10.2 Database stores

The `pulsebox-v1` IndexedDB database owns these logical object stores:

- `project-heads` for current canonical manifests and revision metadata.
- `project-assets` for immutable loose and embedded asset blobs by content ID.
- `project-asset-refs` for project-to-asset reference counts.
- `recovery-heads` for retained revision records.
- `pack-records` for immutable pack manifests by pack content ID.
- `pack-assets` for immutable pack blobs by asset content ID.
- `pack-asset-refs` for pack and project reference counts.

An asset or pack blob remains pinned while a current head, retained recovery
head, or active in-memory project references it. It also remains pinned during a
pending save or import, or while an active Undo or Redo record references it.
Runtime pins need not be serialized,
but the active tab shall register and release them through the persistence port.
Garbage collection may delete a blob only after a transaction confirms that no
stored reference and no registered runtime pin remains. A failed or interrupted
collection shall not change any project, recovery, pack, or history reference.

Database schema upgrades use `versionchange` and close older connections. An
upgrade does not delete an old store until the same transaction verifies its
migrated records.

### 10.3 Persistence and quota policy

At startup, Pulsebox checks `navigator.storage.persisted()` and
`navigator.storage.estimate()` when available. On the first explicit Save or
pack-install gesture, it calls `navigator.storage.persist()` once when the API
is available. Denial is not fatal. It produces a persistent non-blocking warning
that browser data may be evicted and offers portable Export.

Before a save, import, pack install, or recovery snapshot that adds bytes,
Pulsebox computes the exact new canonical JSON and unique blob byte counts. If
`estimate()` returns finite usage and quota, required free space is:

```text
new unique bytes + 64 MiB
```

If reported free space is smaller, the operation is rejected before mutation.
Because estimates are approximate, passing preflight is not a success claim. If
the API is unavailable or returns incomplete values, Pulsebox may attempt the
transaction but must keep the same failure behavior.

`QuotaExceededError`, transaction abort, disk error, or browser shutdown leaves
the previous committed head authoritative. The project stays dirty, no saved
status is shown, and an actionable error offers recovery pruning, unused-pack
removal, and portable Export. Pulsebox never deletes current project data or
packs automatically to make room.

## 11. Save, autosave, recovery, and tabs

### 11.1 Save transaction

Every committed user edit marks the in-memory project dirty. Autosave starts 750
milliseconds after the last committed edit and no later than 5 seconds after the
first unsaved edit in a continuous series. Explicit Save starts the same
transaction immediately. Saving never blocks editing. Edits made during a save
belong to the next revision.

The "next revision" in this section means the next committed
`ProjectRevision`. It does not reuse or derive its counter from the runtime
`StateRevision`.

A save transaction:

1. Reads the current stored revision token.
2. Creates one canonical detached snapshot of the intended revision.
3. Writes new immutable asset blobs and reference-count changes.
4. Writes the previous head into recovery history.
5. Replaces the project head with the next revision token.
6. Removes recovery records beyond the retention rule.
7. Reports saved only after the transaction `complete` event.

When the stored counter is below `9007199254740991`, the next token keeps the
epoch and increments the counter by one. When it equals that maximum, the save
uses a newly generated UUID epoch and counter 0. Counter rollover occurs inside
the same transaction as the save. It keeps the project ID stable and broadcasts
the complete new token. Tests inject the epoch factory.

An aborted transaction changes none of those records. Save status returns to
dirty with the specific error. Undo history is runtime state and is not written
as project state.

### 11.2 Recovery retention

Keep the five most recent committed heads before the current head for each
project. Shared immutable blobs are retained while any current or recovery head
references them. Recovery JSON for one project is additionally capped at 128
MiB. Oldest heads are pruned until both limits hold. The current head is never
pruned by recovery maintenance.

At startup, Pulsebox validates the current head. If it is missing or invalid,
Pulsebox selects the newest fully valid retained head without overwriting it. It
reports the recovered revision token and timestamp. A new successful save must
occur before that revision becomes current. Recovery is announced through visible text
and an ARIA live region.

### 11.3 Multiple tabs

Tabs broadcast the committed project ID and complete revision token. A tab whose
base token does not exactly equal the stored token shows a non-blocking
stale-state warning before its next save. Last writer wins remains
authoritative.

The later save transaction reads the current stored token again.
It writes its complete in-memory snapshot under the next token and does not
create an automatic conflict copy. Revision tokens are equality and concurrency
markers. Clients do not order different epochs by UUID or counter.

## 12. Canonical serialization

Canonical JSON uses these rules:

- UTF-8 without a byte-order mark or trailing newline.
- no insignificant whitespace.
- object keys sorted by Unicode code point after NFC normalization.
- arrays kept in their schema-defined order.
- strings escaped only as required by JSON, using lowercase hex escapes.
- finite numbers in the shortest decimal form that round-trips to the same
  IEEE-754 value.
- integers without a decimal point or exponent.
- negative zero serialized as `0` after validation.
- no omitted required field and no explicit substitute for an absent optional
  field.

Schema-defined set-like arrays are sorted before serialization. These include
plugin requirements by kind then ID and assets by content ID then record ID.
They also include extensions by namespace and migration records by destination
version then ID.
Timeline, rack, chain, pattern, event, and automation arrays use their declared
musical or UI order with stable ID as the final tie-breaker.

Canonical portable export uses ZIP Store for every entry. Entries are ordered as
`manifest.json` followed by asset paths in bytewise ascending order. Each entry
has the fixed ZIP timestamp `1980-01-01T00:00:00`, regular-file mode `0644`, no
extra fields, and no comments. CRC-32 and sizes are written in both headers.
Repeated export of the same committed revision token and the same export choice
must produce byte-identical output.

## 13. Portable export and round trips

Portable Export creates a detached copy and offers two choices:

1. **Keep pack references.** Existing embedded assets remain embedded. Valid
   recognized pack references remain references.
2. **Embed pack assets.** Every readable referenced pack asset is copied under
   `assets/`, and only the exported copy of its storage record changes to
   `embedded`.

Loose assets are always embedded. Ordinary Save never changes an asset storage
mode and never asks this question.

If a pack is missing, Keep pack references remains available with a complete
warning. Embed pack assets is blocked until every selected pack is reinstalled.
An export never substitutes another pack. Export does not mutate project state,
revision, timestamps, undo history, or asset reference counts.

When a storage error prevents Save, emergency portable export operates from the
validated in-memory snapshot and every still-readable immutable blob. It may
keep unresolved pack references. It must not claim a complete embedded export if
any required embedded blob is unreadable.

A successful import followed by an ordinary save preserves all stable IDs,
plugin state, extension data, and content IDs. The same export choice also
preserves pack content IDs, storage modes, and references. Canonical formatting may replace
noncanonical input bytes. Unknown optional extension data must have the same
canonical JSON bytes after the round trip.

## 14. Required verification fixtures

The Phase 0 fixture definitions are the typed catalog in
[`tests/unit/contracts/project-format-fixtures.ts`](../tests/unit/contracts/project-format-fixtures.ts).
Its unit test enforces unique IDs and the required group totals. Phase 7 must
replace each input classification with concrete archive, project, storage, and
recovery fixtures, then automate their outcomes in unit and browser tests.

### 14.1 Valid golden fixtures

- Minimum project with eight empty slots and no assets.
- Default project with all six built-in instruments and all built-in effects.
- One project containing each event, automation, mixer, chain, and song record.
- Embedded WAV, AIFF, and FLAC assets in mono and stereo.
- One immutable pack and projects using Keep references and Embed assets.
- Maximum-boundary names, JSON depth, event count, asset count, encoded bytes,
  and decoded bytes without exceeding a limit.
- Repeated canonical manifest and archive serialization with fixed SHA-256
  golden digests.

### 14.2 Rejection fixtures

- Truncated ZIP, bad CRC, overlapping entries, encrypted ZIP, ZIP64, and
  unsupported compression.
- Traversal, absolute, drive-prefixed, backslash, non-NFC, overlong, duplicate,
  and case-colliding paths.
- Symlink, hard-link, device, unexpected, missing, and unreferenced entries.
- Declared and streamed entry, manifest, aggregate, and ratio limit breaches.
- Invalid UTF-8, duplicate JSON keys, excess nesting, excess members, excess
  array length, non-finite number spellings, unsafe integer, and lone surrogate.
- Duplicate, malformed, dangling, wrong-kind, and unstable IDs.
- Existing project-ID collision with no selected resolution action.
- Nine rack slots with all over-cap slots listed in the report.
- Cyclic routing, invalid parameter values that cannot be safely repaired, and
  missing protected limiter.
- Wrong asset hash, spoofed codec, metadata mismatch, multichannel audio,
  decoded-duration breach, per-asset decoded breach, and project decoded breach.
- Unknown required plugin, unsupported required API, missing required migration,
  unknown required extension, and newer project format.
- Pack content-ID mismatch, duplicate pack asset, and changed bytes under an
  existing visible pack name and version.

### 14.3 Repair and degradation fixtures

- One finite parameter outside its range and one absent optional field, with an
  exact repair report.
- Unknown optional extension preserved without execution or network access.
- Missing pack restored as silence with every reference retained, followed by
  successful resolution after reinstalling exact content.
- Complete multi-step project and plugin migrations with deterministic output,
  plus failure at each intermediate step.
- A valid ordered Playlist, a dangling Pattern reference, duplicate placement
  IDs, an empty Playlist, and repeat counts below and above the valid range.

### 14.4 Storage and recovery fixtures

- Quota preflight below and exactly at the required headroom boundary.
- `persist()` granted, denied, unavailable, and rejected.
- `QuotaExceededError`, request failure, explicit abort, and simulated browser
  close before transaction completion, each retaining the old head.
- Five retained recovery heads, count pruning, byte pruning, corrupt current
  head fallback, and blob reference-count retention.
- Two tabs saving stale revisions, with warning and verified last-writer-wins
  output.
- Revision increment at the maximum-minus-one counter and epoch rollover at the
  maximum counter.
- Same-ID Open existing, Import as copy, Replace existing, and canceled
  resolution, including metadata remapping, cross-lineage equal typed IDs,
  recovery, Undo replace, and atomic rollback.
- Pack install and project import failures that leave no partial records.
- Referenced-pack removal blocked with a usage report and unreferenced removal
  completed atomically.
- Canonical production origin persistence across reload, plus proof that a
  different host spelling or port is detected and labeled as separate storage.

## 15. Browser basis

This contract relies on IndexedDB transaction rollback and atomic commit, the
origin-scoped storage model, and the Storage Manager persistence and estimate
APIs. Implementations must verify current Chrome behavior
against the primary IndexedDB specification and current browser documentation:

- <https://www.w3.org/TR/IndexedDB/>
- <https://developer.mozilla.org/en-US/docs/Web/API/StorageManager>
- <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
- <https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB>

An estimate is advisory. Persistence may be denied. IndexedDB is scoped to the
exact scheme, host, and port. This contract therefore requires failure recovery
and portable export instead of claiming that browser storage cannot be lost.
