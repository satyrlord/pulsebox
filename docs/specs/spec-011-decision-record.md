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
  editor. Faceplates carry no step grid and no per-step editing, as recorded in
  `D65`.
- **D10.** Browser projects use JSON manifests plus asset records; portable
  export is one `.pulsebox` package.
- **D11.** Support current stable Chrome, Edge, and Firefox.
- **D12.** Rack stems are post-module-insert and post-fader; send returns are
  separate; export also includes the master mix.
- **D13.** Voice-level send controls are removed. Sends exist only on the parent
  module channel.
- **D14.** Each module part inside a named Pattern has a nominal 1–64-step cycle;
  drum voices may override length and resolution and wrap independently.
- **D15.** A project has 1 through 32 stable named Patterns. The UI identifies
  them by names such as Intro and Verse, never compound numbers such as `1 - 1`.
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
- **D33.** Automation always records into the active Pattern, including during
  Song playback. The fixed grid is 1/16, last value wins per cell, and one
  gesture or pass is one undo entry.
- **D34.** A `.pulsebox` file is a ZIP-compatible archive with root
  `manifest.json` and imported assets under `assets/`.
- **D35.** Imports containing more than eight rack slots are rejected in full
  and report every over-cap slot.
- **D36.** Rack and send-return stems are pre-master-chain; only the master mix
  includes the master chain.
- **D37.** WAV export does not normalize, uses deterministic TPDF dither, and
  resamples offline to 44.1 kHz at high quality.
- **D38.** Whenever the Mixer studio view is active, all eight instrument strips
  remain simultaneously visible; empty slots use disabled strips identified by
  two-digit slot number and expose their Empty state accessibly.
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
- **D43.** One header Pattern/Song toggle selects transport scope. One
  module-aware Piano Roll edits the selected Pattern, the Playlist orders
  Patterns into a Song, and the bottom bar only collapses or expands the editor.
- **D44.** One effect is pinned as each send card's focus; the first effect is
  pinned by default, and its declared compact controls supply the four macros.
- **D45.** Sixteen rack slots remain an explicit post-MVP target while the MVP
  is capped at eight.
- **D46.** The compact `Mix` control is send-chain return level from silence to
  unity; the source stays dry and individual effects retain wet/dry controls.
- **D47.** Pause preserves position; Stop returns to the last explicit start
  marker, defaulting to Pattern step 1 or the first Playlist row; repeated Stop
  has no second action.
- **D48.** Patterns longer than sixteen steps use sixteen-step pages in the
  Piano Roll, playback follow by default, and an optional viewed-page lock.
- **D49.** Channel mute silences main and sends; global solo passes only soloed
  channels and their sends, and shared returns contain only surviving soloed
  sources.
- **D50.** Header L/R and M/S are transient meter-analysis modes and never alter
  audio or export. Mono remains a separate transient monitor-only fold-down in
  the Master studio view and does not affect WAV or stem export.
- **D51.** Development and built-app launch use `http://127.0.0.1:4173` with
  strict-port behavior. The static-file launcher exposes no product API.
- **D52.** WAV, AIFF, and FLAC import uses bundled deterministic decoders behind
  an engine-owned interface rather than browser-dependent format support.
- **D53.** `PROJECT-FORMAT.md` owns bounded archive, manifest, decoded-audio,
  path, collision, validation-order, and atomic-import rules.
- **D54.** Saves and imports are atomic, storage persistence is requested after
  an explicit gesture, quota failure preserves the last committed project, and
  portable Export remains available.
- **D55.** The MVP uses fixed 4/4 musical structure. Editable time-signature
  events and timelines are post-MVP.
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
- **D61.** Song is an ordered list of named-Pattern references with repeat
  counts. The MVP has no lane timeline, clip transforms, tempo timeline, or
  time-signature timeline.
- **D62.** `docs/design/claude-mock-up.html` is the approved shell composition
  target. Its compact right studio column uses mutually exclusive Mixer,
  Effects, and Master views; effects are never duplicated beside or below the
  mixer; and every instrument strip shows A–D send buttons in a 2 × 2 grid.
- **D63.** The module browser is one un-tabbed list. Empty-slot plus controls are
  the only visible rack Add actions, and module deletion lives in an accessible
  context menu rather than a persistent minus button. The piano-roll header has
  no local Play, pen, or erase buttons: Pattern mode uses global Play, left-click
  creates, right-click deletes, and dragging moves or resizes pitched notes. A
  named, project-wide Pattern is also the Playlist building block; separate
  Section and Scene entities do not exist.
- **D64.** The approved compact header has no theme selector; themes live in
  Settings. Its centered recessed app mark is independent of side-group widths,
  its two master meters toggle between L/R and M/S analysis, and its compact
  Pattern/Song switch sits left of transport. The lower workspace has one
  collapse toggle, one module-aware Piano Roll, a global Swing slider, a
  Pattern-owned Humanize slider, a fixed 1/16 grid, and no Performance, full Song timeline, Feel
  module, Straight selector, local Play, pen, or erase tools. Monophonic pitched
  notes move and resize and support slides; drum triggers paint as fixed one-cell
  events. The master-effects bypass leaves master gain and the protected limiter
  active.
- **D65.** The Piano Roll is the only Pattern editing surface. Rack faceplates
  carry no step grid and no per-step editing. Each faceplate keeps an
  output-only Pattern activity indicator and gains a hold-to-sound audition
  control for sound design, and the reclaimed horizontal space carries fast
  controls promoted from the expanded editor. Two editing grids over the same
  Pattern part read to users as two pattern editors, and the faceplate copy is
  the weaker of the two: within the 86-98 pixel module height it cannot show
  accent, tie, slide, probability, micro-timing, page position, or parts longer
  than sixteen steps, and for a drum machine it exposes only one voice at a
  time. Rejected alternatives: keeping a read-only paged activity grid on the
  faceplate, which preserves the visual language of an editor and still spends
  the space; and making the audition control record into the active Pattern when
  record-armed, which duplicates the live-input path in section 16.4 and
  reintroduces a second write path into Pattern data. `AC-011` now gates the
  single-surface rule and the audition control, and `AC-072` moves paging to the
  Piano Roll, where parts of 17 to 64 steps still require it.
- **D66.** The Piano Roll's Parameter selector is the single entry point to every
  lane it edits, and exactly one lane is visible at a time. The selector is
  scoped to the selected module and offers two groups: that module's supported
  note properties, and its manifest-declared automatable parameters. This
  extends `D65` from event data to automation: a user who has learned that the
  Piano Roll edits the Pattern should not discover a second automation editor
  elsewhere. Mixer, send, effect, and master parameters have no owning module,
  so they are armed by an `Automate` action on their own control and then open
  in the same Piano Roll lane; the arming path lives with the parameter, the
  editing surface stays singular. Cross-module context is served by output-only
  ghost notes and ghost lane content rather than by editing a non-selected
  module in place. Rejected alternatives: listing every project parameter in one
  global selector, which makes the common module case pay for a long list and
  makes the visible lane's owner ambiguous; and stacking multiple lanes under
  the grid, which spends vertical budget the 1280-by-720 target does not have
  and adds stack-order, height, and persistence state for a comparison that
  ghost lanes already serve. `AC-079` gates the selector and its lane
  lifecycle, `AC-086` gates ghost behavior.
- **D67.** The rack faceplate pairs its dominant short label with subordinate
  full-name and type text, the bottom workspace bar is approximately 50 to 52
  pixels high, and empty mixer strips show their two-digit slot numbers.
  Responsive and accessible behavior is owned by the product specifications
  rather than by design artifacts. Two parts of this decision are superseded:
  the master strip's A–D grid by `D75`, which removes it, and the separate
  1568 × 1003 raster reference by `D77`, which withdraws it and leaves
  `docs/design/claude-mock-up.html` as the single composition target.
- **D68.** Numbered phases remain the dependency and completion order, while a
  narrow vertical foundation from a later phase may land after its owner and
  all earlier dependencies are applied. A foundation slice never marks its
  parent phase or a skipped phase complete. Status text names the exact slice
  and its missing parent-phase scope. This preserves executable integration
  seams without weakening any final MVP acceptance criterion.
- **D69.** Swing is one global project property in the MVP, stored in project
  metadata beside tempo and applied to every Pattern and every module. The Piano
  Roll header slider edits that single value, so its position is identical on
  every Pattern. Humanize stays Pattern-owned. Per-Pattern Swing is post-MVP; it
  would add an override to the `Pattern` record while the project field remains
  the default. Rejected alternatives: shipping Pattern-owned Swing in the MVP,
  which multiplies the timing state a user must reason about before there is a
  Playlist to contrast Patterns in; and omitting Swing until it can be
  Pattern-owned, which removes the single most identity-defining timing control
  from the MVP groove.
- **D70.** `PulseStore` owns in-memory project state only. Its project API is
  `loadProject` and `saveProject`, which exchange already validated in-memory
  projects. Serialization, portable export, and untrusted import belong to the
  persistence layer and reach the user through the composition boundary, so
  untrusted bytes have exactly one entry path, which validates, migrates, and
  checks plugin compatibility before calling `loadProject`. This keeps the
  state layer free of a dependency on persistence and matches the store
  interface in `ARCHITECTURE.md` section 7.1. Rejected alternatives: adding
  `exportProject` and `importProject` to the store, which would invert the
  state-to-persistence dependency direction and give unvalidated data a second
  entry path that bypasses import validation; and moving serialization
  ownership onto the store, which would additionally place document schema and
  migration knowledge in the layer that must stay format-agnostic. `AC-033` and
  `AC-084` continue to gate Undo behavior, and the `AC-034` through `AC-038`
  and `AC-081` through `AC-083` persistence criteria gate export and import at
  their owning layer.
- **D71.** A typed edit is expressed as a command in the state layer's command
  union and delivered by the UI component model's own typed dispatch. A DOM
  `CustomEvent` layer is not required, and one must not be added solely to
  re-express an edit the command union already carries. The union stays the
  single edit vocabulary, so an unknown or malformed edit fails to type-check
  rather than reaching the store at run time. This supersedes the earlier named
  `pulse-` composed-event list, which assumed a Web Components UI; the repository
  uses one React component model instead, as `AC-002` requires. Gesture
  coalescing is unchanged and remains normative: a continuous drag carries one
  gesture identifier and collapses into one history entry, and a typed numeric
  field commits on Enter or blur. Rejected alternative: rebuilding the composed
  event layer over React to preserve the literal event names, which adds an
  indirection with no behavior change and weakens static checking.
- **D72.** The rack faceplate has no Edit button and the master strip has no pan
  control. Both appeared only in `docs/design/claude-mock-up.html` and were
  removed from it rather than adopted. A faceplate Edit button duplicates the
  existing path to a module's part, which is selecting the module in the rack
  overview or in the Piano Roll's own module selector, and `D65` already fixed
  the faceplate's contents as the output-only activity indicator plus the
  hold-to-sound audition control. A master pan control would become a fully
  automatable, serialized, exported master parameter under section 6.2 for a
  control that master balance rarely needs. Rejected alternatives: pointing the
  faceplate Edit button at the 760 x 680 expanded editor instead, which gives
  that editor a visible home but no longer matches the approved composition; and
  drawing the master pan knob permanently disabled to preserve raster parity,
  which `AC-059` forbids because no visible control may be dead. `AC-011` and
  `AC-059` continue to gate this.
- **D73.** The metronome on and off switch lives in the transport header's master
  group. Section 12 already required a configurable metronome for live recording
  but named no surface for it, so recording could not be started and stopped
  against a click without opening a settings surface that the MVP does not yet
  have. The toggle is a global UI preference: it uses `aria-pressed`, creates no
  undo entry, and changes no project state, automation, or export. Count-in
  length and metronome sound remain with live recording in section 16.4.
  Rejected alternatives: placing the switch only in a future recording settings
  surface, which leaves the MVP with a required feature and no reachable
  control; and exposing it in both places, which duplicates the displayed state
  for no added capability.
- **D74.** Four values the approved composition target already showed are now
  contract: the MVP Pattern scale choices are Chromatic, Minor, Dorian,
  Phrygian, and Pentatonic (section 16.0); the limiter's compact controls are
  Ceiling, Gain, and Release (section 20.7); and the default project sets every
  occupied instrument channel near -8 dB while the master stays near -6 dB
  (section 9.1). The mock's remaining unspecified numbers stay unspecified: its
  960-ticks-per-beat clock resolution is deferred to the section 12 transport
  work, which chooses and records a resolution in the same change. Separately,
  the mock holds its channel and master meters at a lit idle floor while stopped
  so it matches the raster reference frame; that is a static-picture fixture
  only. Section 21.7 governs the product, where meters read silence while the
  transport is stopped.
- **D75.** The master strip carries no A–D grid, in any form. This supersedes the
  noninteractive return labels recorded in `D67`. Sends are an instrument-channel
  concept: a channel taps a portion of its signal to one of four parallel send
  chains, which return into the mix bus. The mix bus is that destination, so it
  is never a send source, and giving it the same four-letter grid states a
  routing relationship that does not exist. Mix-bus processing is also a
  different kind of work from instrument effects: it is the serial master chain
  in section 20.6, with its own compressor, EQ, and protected limiter, which is
  why section 8.5 gives it a dedicated Master studio view rather than a corner of
  a mixer strip. Return levels stay on the compact A–D cards in the Effects view,
  where each chain already owns its circular `Mix` return control. Rejected
  alternatives: keeping the letters as a static legend, which spends master-strip
  height on something that controls nothing and reads as a dead control under
  `AC-059`; and adding four dedicated return strips to the mixer, which makes
  returns mixable in one place but widens the compact studio column that section
  8.4 deliberately keeps narrow so the rack stays dominant. `AC-068` gates the
  master strip's contents.
- **D76.** The master strip is not an instrument channel, so it does not copy
  instrument-strip geometry. The fixed compact strip geometry applies to the
  eight instrument channels; the master is a different object with a different
  job, and `D75` already removed the pan control and the A–D grid from it. The
  height those controls vacate goes to the master fader rather than to padding,
  so the master fader is deliberately taller than an instrument fader. It starts
  below the master label and ends on the same floor, so the strips still share a
  baseline while the travel differs. This is also correct on its own terms:
  master level is the most frequently adjusted control in the mixer and benefits
  from the finest travel. Rejected alternative: inserting a spacer to force the
  master fader to the instrument-fader length, which buys a visual alignment
  nobody needs by converting reclaimed height into dead space. Separately, the
  Mixer, Effects, and Master tabs are peers and share one strip of equal-width
  controls; the earlier unequal widths encoded no meaning. Section 19.2 owns the
  master strip's geometry and section 8.5 owns the tab strip.
- **D77.** The 1568 × 1003 raster reference is withdrawn, and
  `docs/design/claude-mock-up.html` is the single approved composition target.
  This supersedes that part of `D67`. Two approved targets in different media
  cannot stay identical: the HTML target is corrected whenever a product
  decision changes the composition, while a raster image cannot be edited in the
  same change, so it drifts. Once drifted it is actively harmful, because an
  implementer measuring against it reproduces decisions the specifications have
  already reversed. The HTML target therefore owns proportion, placement,
  density, materials, typography scale, and control sizing in addition to
  semantics and interaction, and the raster file is removed from the repository.
  The durable rules the raster established survive in `D67` and in their owning
  specifications rather than in an image. Rejected alternatives: keeping the
  image as non-normative historical evidence, which leaves the drifted artifact
  on disk where an agent instructed to match the design will still find and
  follow it; and regenerating the raster to match the current HTML, which
  restores the same drift the moment the next composition decision lands.
  `AC-067` now gates against the composition target rather than a raster.
