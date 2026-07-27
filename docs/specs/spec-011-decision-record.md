# Pulsebox Approved Decision Record

**Status:** Approved normative traceability record  
**Spec ID:** `spec-011`  
**Read with:** [Specification index](spec-000-index.md) and the owning feature
specification.  
**Owns:** Stable decision IDs and decision traceability. Product behavior stays
in specifications 001 through 010.

---

## 25. Approved decision record

All product decisions below are final for version 1.0. The normative
requirements are integrated into the relevant sections of the specification set;
this table is the traceability record.

- **D01.** Named historical research may exist only in the non-shipping
  `/research` directory. Production code, assets, tests, public docs, package
  metadata, and shipped data remain clean.
- **D02.** Use a hybrid engine: custom synthesis and custom DSP in AudioWorklet;
  suitable native Web Audio nodes behind engine-owned adapters.
- **D03.** The MVP has a maximum of eight rack slots, eight instrument mixer
  strips, and one master strip.
- **D04.** Compact A–D cards summarize modular send-bus chains.
- **D05.** All drum voices support synth and sample layers; analog modules
  default synth-heavy, Hybrid Nine blended, digital modules sample-heavy with
  lo-fi enabled.
- **D06.** No destructive confirmation dialogs. Actions happen immediately and
  preserve complete Undo while their bounded active-history entry is retained. A
  new action evicts older history rather than failing for lack of history
  capacity.
- **D07.** The supported editing workspace begins at 1280 CSS pixels wide.
- **D08.** Deep effect editors use the established 760 × 680 playback-safe modal
  overlay.
- **D09.** Compact faceplates expose the established fast controls; deeper
  synthesis, sample, voice, insert, and routing controls live in the expanded
  editor.
- **D10.** Browser projects use JSON manifests plus asset records; portable
  export is one `.pulsebox` package.
- **D11.** Support current stable Chrome, Edge, and Firefox.
- **D12.** Rack stems are post-module-insert and post-fader; send returns are
  separate; export also includes the master mix.
- **D13.** Voice-level send controls are removed. Sends exist only on the parent
  module channel.
- **D14.** Patterns have a nominal 1–64-step span; drum voices may override
  length and resolution and wrap independently.
- **D15.** Pattern positions use flat numbers `1` through `32`.
- **D16.** User themes import only through the bounded, allowlisted JSON token
  schema in `THEMING.md`; raw CSS and resource-loading or declaration-injecting
  values are rejected.
- **D17.** Musical input uses physical key positions through
  `KeyboardEvent.code`; mapping is remappable.
- **D18.** MVP output routing is main plus four send buses.
- **D19.** Automation is step-based only.
- **D20.** Import safely repairs ranges and missing optional fields, rejects
  structural failures and any unknown or incompatible referenced plugin, and
  reports all changes. Every referenced MVP plugin is required.
- **D21.** Other than the defined first-sound functional metric, no fixed
  hardware benchmark, CPU threshold, buffer, duration, or utilization target is
  a release gate.
- **D22.** Browser application only. No PWA, service worker, or install flow.
- **D23.** The self-critique must fix acceptance-blocking gaps rather than
  deliberately leaving them unresolved.
- **D24.** Research informs broad synthesis families only; factory voice lists,
  ranges, curves, defaults, and sound targets remain original.
- **D25.** Ordinary Save preserves each asset's current embedded or
  recognized-pack-reference policy silently. Portable Export asks whether
  eligible pack references remain references or are embedded.
- **D26.** Mixer strips have a fixed structure with swappable processing modules
  and insert chains.
- **D27.** The three-second first-sound metric starts at the first valid
  audio-unlock gesture that also requests an audible result and uses the
  five-run warm-cache procedure in section 21.8.
- **D28.** Import WAV, AIFF, and FLAC through the bundled decoder path; preserve
  mono or stereo; reject more than two channels; limit source files to 32 MiB,
  stored imported project assets to 512 MiB, and decoded audio to the
  `PROJECT-FORMAT.md` bounds.
- **D29.** Multiple tabs use last-writer-wins behavior.
- **D30.** WAV export is always 16-bit, 44.1 kHz PCM.
- **D31.** Every deliberate user parameter move records automatically while
  transport Record is armed.
- **D32.** AudioWorklet plugins process the host-supplied frame count and never
  hard-code 128 frames; fixed-block algorithms use bounded internal buffering.
- **D33.** Pattern mode records automation into the active pattern; Song mode
  records into the arrangement; the dedicated grid defaults to 1/16, last value
  wins per cell, and one gesture or pass is one undo entry.
- **D34.** A `.pulsebox` file is a ZIP-compatible archive with root
  `manifest.json` and imported assets under `assets/`.
- **D35.** Imports containing more than eight rack slots are rejected in full
  and report every over-cap slot.
- **D36.** Rack and send-return stems are pre-master-chain; only the master mix
  includes the master chain.
- **D37.** WAV export does not normalize, uses deterministic TPDF dither, and
  resamples offline to 44.1 kHz at high quality.
- **D38.** All eight instrument strips remain visible; empty slots use disabled
  strips labeled `Empty`.
- **D39.** The minimum supported viewport is 1280 × 720. Below it, autosave
  continues and Save, portable Export, and a read-only project summary remain
  accessible behind a clear notice.
- **D40.** Theme and contrast are global local-storage preferences. Projects
  never change appearance settings, and new installations start on `rack`.
- **D41.** Durable references target immutable factory packs or explicitly
  installed IndexedDB packs by SHA-256 content ID under the install, integrity,
  missing-pack, and removal rules in `PROJECT-FORMAT.md`; loose imports are
  embedded during portable export.
- **D42.** Monitor is exclusive physical-output PFL for one post-insert,
  pre-fader channel. The master program keeps rendering but is not physically
  output while Monitor is active, so the selected channel is never doubled.
- **D43.** Workspace returns to the last Rack/Edit/Song view; Performance opens
  the live trigger surface; Sequencer and Piano roll switch editors inside
  Workspace only.
- **D44.** One effect is pinned as each send card's focus; the first effect is
  pinned by default, and its declared compact controls supply the four macros.
- **D45.** Sixteen rack slots remain an explicit post-MVP target while the MVP
  is capped at eight.
- **D46.** The compact `Mix` control is send-chain return level from silence to
  unity; the source stays dry and individual effects retain wet/dry controls.
- **D47.** Pause preserves position; Stop returns to the last explicit start
  marker, defaulting to Pattern step 1 or Song bar 1; repeated Stop has no
  second action.
- **D48.** Patterns longer than sixteen steps use sixteen-step pages, playback
  follow by default, and an optional viewed-page lock.
- **D49.** Channel mute silences main and sends; global solo passes only soloed
  channels and their sends, and shared returns contain only surviving soloed
  sources.
- **D50.** Mono is a monitor-only fold-down after the master chain. It affects
  live listening and meters but not WAV or stem export.
- **D51.** Development and built-app launch use `http://127.0.0.1:4173` with
  strict-port behavior. The static-file launcher exposes no product API.
- **D52.** WAV, AIFF, and FLAC import uses bundled deterministic decoders behind
  an engine-owned interface rather than browser-dependent format support.
- **D53.** `PROJECT-FORMAT.md` owns bounded archive, manifest, decoded-audio,
  path, collision, validation-order, and atomic-import rules.
- **D54.** Saves and imports are atomic, storage persistence is requested after
  an explicit gesture, quota failure preserves the last committed project, and
  portable Export remains available.
- **D55.** Time signatures are structural Song events at bar boundaries, not
  parameter automation targets.
- **D56.** Rack-module collapse is a local UI preference, is not portable
  project data, is lineage-keyed, and is excluded from undo.
- **D57.** Objective audio, browser, accessibility, startup, and first-use
  evidence uses the thresholds and procedures in section 24.4 and the Phase 0
  domain contracts.
- **D58.** Same-project-ID import never overwrites silently. Open existing,
  Import as copy, and Replace existing follow the atomic identity and recovery
  rules in `PROJECT-FORMAT.md`.
- **D59.** A project revision is an epoch UUID plus a safe-integer counter. At
  the counter maximum, an atomic save keeps the project ID, generates a new
  epoch, and resets the counter to zero.
- **D60.** Active Undo and Redo share a 100-entry, 64 MiB canonical-patch
  budget; each entry is at most 17 MiB under the proven encoding bound,
  referenced blobs are pinned, and oldest Undo entries expire before a new edit
  commits.
- **D61.** Song has one time-signature anchor at tick 0. Later time signatures
  are unique ordered events validated against the preceding signature's exact
  bar length, and every structural edit revalidates later events atomically.

