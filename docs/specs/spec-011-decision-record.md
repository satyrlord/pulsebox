# Pulsebox Approved Decision Record

**Status:** Approved normative traceability record  
**Spec ID:** `spec-011`  
**Read with:** [Specification index](spec-000-index.md) and the owning feature
specification.  
**Owns:** Stable decision IDs and decision traceability. Product behavior stays
in specifications 001 through 010.

---

## 25. Approved decision record

All product decisions below are final for version 1.0. The specification set
contains the normative requirements. This table is the traceability record.

- **D01.** Named historical research may exist only in the non-shipping
  `/research` directory. Production code, assets, tests, public docs, package
  metadata, and shipped data remain clean.
- **D02.** Use a hybrid engine. Put custom synthesis and custom DSP in
  AudioWorklet. Put suitable native Web Audio nodes behind engine-owned
  adapters.
- **D03.** The MVP has a maximum of eight rack slots, eight instrument mixer
  strips, and one master strip.
- **D04.** Compact A–D cards summarize modular send-bus chains.
- **D05.** All drum voices support synth and sample layers. Analog modules
  default to synth-heavy. Twin Engine defaults to blended. Digital modules
  default to sample-heavy with lo-fi enabled.
- **D06.** No destructive confirmation dialogs. Actions happen immediately and
  preserve complete Undo while active history retains their bounded entry. A
  new action evicts older history rather than failing for lack of history
  capacity.
- **D07.** The supported editing workspace begins at 1280 CSS pixels wide.
- **D08.** Deep effect editors use the established 760 × 680 playback-safe modal
  overlay.
- **D09.** Compact faceplates expose the established fast controls. Deeper
  synthesis, sample, voice, insert, and routing controls live in the expanded
  editor. Faceplates carry no step grid and no per-step editing, as recorded in
  `D65`.
- **D10.** Browser projects use JSON manifests plus asset records. Portable
  export is one `.pulsebox` package.
- **D11.** Support current stable Chrome.
- **D12.** Rack stems are post-module-insert and post-fader. Send returns are
  separate. Export also includes the master mix.
- **D13.** The MVP has no voice-level send controls. Sends exist only on the
  parent module channel.
- **D14.** Each module part inside a named Pattern has a nominal 1–64-step cycle.
  Drum voices may override length and resolution and wrap independently.
- **D15.** A project has 1 through 32 stable named Patterns. The UI identifies
  them by names such as Intro and Verse, never compound numbers such as `1 - 1`.
- **D16.** User themes import only through the bounded, allowlisted JSON token
  schema in `THEMING.md`. The validator rejects raw CSS and resource-loading or
  declaration-injecting values.
- **D17.** Musical input uses physical key positions through
  `KeyboardEvent.code`. The user can remap it.
- **D18.** MVP output routing is main plus four send buses.
- **D19.** Automation is step-based only.
- **D20.** Import safely repairs ranges and missing optional fields, rejects
  structural failures and any unknown or incompatible referenced plugin, and
  reports all changes. Every MVP project requires each referenced plugin.
- **D21.** Other than the defined first-sound functional metric, no fixed
  hardware benchmark, CPU threshold, buffer, duration, or utilization target is
  a release gate.
- **D22.** Browser application only. No PWA, service worker, or install flow.
- **D23.** The self-critique must fix acceptance-blocking gaps rather than
  deliberately leaving them unresolved.
- **D24.** Research informs broad synthesis families only. Factory voice lists,
  ranges, curves, defaults, and sound targets remain original.
- **D25.** Ordinary Save preserves each asset's current embedded or
  recognized-pack-reference policy silently. Portable Export asks whether
  eligible pack references remain references or whether Export embeds them.
- **D26.** Mixer strips have a fixed structure with swappable processing modules
  and insert chains.
- **D27.** The three-second first-sound metric starts at the first valid
  audio-unlock gesture that requests an audible result. It uses the five-run
  warm-cache procedure in section 21.8.
- **D28.** Import WAV, AIFF, and FLAC through the bundled decoder path. Preserve
  mono or stereo. Reject more than two channels. Limit source files to 32 MiB.
  Limit stored imported project assets to 512 MiB. Apply the decoded-audio
  bounds in `PROJECT-FORMAT.md`.
- **D29.** Multiple tabs use last-writer-wins behavior.
- **D30.** WAV export is always 16-bit, 44.1 kHz PCM.
- **D31.** When transport Record is on, each deliberate user parameter move
  records automatically.
- **D32.** AudioWorklet plugins process the host-supplied frame count and never
  hard-code 128 frames. Fixed-block algorithms use bounded internal buffering.
- **D33.** Automation always records into the active Pattern, including during
  Song playback. The fixed grid is 1/16, last value wins per cell, and one
  gesture or pass is one undo entry.
- **D34.** A `.pulsebox` file is a ZIP-compatible archive with root
  `manifest.json` and imported assets under `assets/`.
- **D35.** Import rejects each full project that contains more than eight rack
  slots. Its report identifies each over-cap slot.
- **D36.** Rack and send-return stems are pre-master-chain. Only the master mix
  includes the master chain.
- **D37.** WAV export does not normalize, uses deterministic TPDF dither, and
  resamples offline to 44.1 kHz at high quality.
- **D38.** Whenever the Mixer studio view is active, all eight instrument strips
  remain visible at the same time. Empty slots use disabled strips with a
  two-digit slot number. They expose their Empty state accessibly.
- **D39.** The minimum supported viewport is 1280 × 720. Below it, autosave
  continues and Save, portable Export, and a read-only project summary remain
  accessible behind a clear notice.
- **D40.** Theme and contrast are global local-storage preferences. Projects
  never change appearance settings, and new installations start on `rack`.
- **D41.** Durable references target immutable factory packs or explicitly
  installed IndexedDB packs. SHA-256 content ID identifies each pack. The
  install, integrity, missing-pack, and removal rules are in
  `PROJECT-FORMAT.md`. Portable export embeds loose imports.
- **D42.** Monitor is exclusive physical-output PFL for one post-insert,
  pre-fader channel. The engine keeps rendering the master program while Monitor
  is active. It does not send that program to the physical output. Thus, it
  never doubles the selected channel.
- **D43.** One header Pattern/Song toggle selects transport scope. One
  module-aware Piano Roll edits the selected Pattern, the Playlist orders
  Patterns into a Song, and the bottom bar only collapses or expands the editor.
- **D44.** The user pins one effect as each send card's focus. By default, the
  application pins the first effect. Its declared compact controls supply the
  four macros.
- **D45.** Sixteen rack slots remain an explicit post-MVP target. The MVP permits
  a maximum of eight.
- **D46.** The compact `Mix` control is send-chain return level from silence to
  unity. The source stays dry. Individual effects retain wet/dry controls.
- **D47.** Pause preserves position. Stop returns to the last explicit start
  marker. The default marker is Pattern step 1 or the first Playlist row.
  Repeated Stop has no second action.
- **D48.** Patterns longer than sixteen steps use sixteen-step pages in the
  Piano Roll, playback follow by default, and an optional viewed-page lock.
- **D49.** Channel mute silences main and sends. Global solo passes only soloed
  channels and their sends. Shared returns contain only surviving soloed
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
- **D54.** Saves and imports are atomic. Pulsebox requests storage persistence
  after an explicit gesture. Quota failure preserves the last committed project.
  Portable Export remains available. Creating a project from a template first
  saves the active project. A failed save cancels the replacement.
- **D55.** The MVP uses fixed 4/4 musical structure. Editable time-signature
  events and timelines are post-MVP.
- **D56.** `D82` supersedes this decision. Whole rack-module collapse no longer
  exists. Faceplate-group disclosure is transient component state. Pulsebox
  excludes it from storage, project data, portable files, and Undo.
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
  budget. Each entry is at most 17 MiB under the proven encoding bound. Retained
  entries pin referenced blobs. The oldest Undo entries expire before a new
  edit commits.
- **D61.** Song is an ordered list of named-Pattern references with repeat
  counts. The MVP has no lane timeline, clip transforms, tempo timeline, or
  time-signature timeline.
- **D62.** The compact right studio column uses mutually exclusive Mixer,
  Effects, and Master views. The application never duplicates Effects beside or
  below the mixer. Every instrument strip shows A–D send buttons in a 2 × 2
  grid.
- **D63.** The module browser is one un-tabbed list. Browser Add buttons and
  rack-overview empty-slot plus controls are the visible rack Add actions.
  Module deletion lives in an accessible
  context menu rather than a persistent minus button. The piano-roll header has
  no local Play, pen, or erase buttons. Pattern mode uses global Play. A
  left-click creates, a right-click deletes, and a drag moves or resizes pitched
  notes. A named, project-wide Pattern is also the Playlist building block.

  Separate Section and Scene entities do not exist.
- **D64.** The approved compact header has no theme selector. Themes live in
  Settings. Its centered recessed app mark is independent of side-group widths,
  and its compact Pattern/Song switch sits left of transport. Its two master
  meters toggle between L/R and M/S analysis.

  The lower workspace has one collapse toggle and one module-aware Piano Roll.
  It has a global Swing slider, a Pattern-owned Humanize slider, and a fixed
  1/16 grid. It has no Performance,
  full Song timeline, Feel module, or Straight selector.

  It also has no local Play, pen, or erase tools. Monophonic pitched notes move,
  resize, and support slides. Drum triggers paint as fixed one-cell events. The
  master-effects
  bypass leaves master gain and the protected limiter active.
- **D65.** The Piano Roll is the only Pattern editing surface. Rack faceplates
  carry no step grid and no per-step editing. Each faceplate has a hold-to-sound
  audition control for sound design. Fast controls from the expanded editor use
  the available horizontal space. `D78` removes the former activity indicator.

  Two editing grids for one Pattern part appear as two pattern editors. The
  faceplate grid has less capability.

  A compact faceplate cannot show accent, tie, slide, probability, or
  micro-timing. It also cannot show page position or parts
  longer than sixteen
  steps. For a drum machine, it exposes only one voice at a time.

  The rejected alternatives included a read-only paged activity grid on the
  faceplate. That grid retains the appearance of an editor and uses the
  available space. Another rejected alternative made the audition control
  record into the active Pattern when record-armed. That action duplicates the
  live-input path in section 16.4. It also adds a second write path into Pattern
  data.

  `AC-011` gates the single-surface rule and the audition control.
  `AC-072` moves paging to the Piano Roll, where parts of 17 to 64 steps require
  it.
- **D66.** The Piano Roll's Parameter selector is the single entry point to every
  lane it edits, and exactly one lane is visible at a time. The selector is
  scoped to the selected module and offers two groups: that module's supported
  note properties, and its manifest-declared automatable parameters. This
  extends `D65` from event data to automation. The Piano Roll edits the Pattern,
  so a second automation editor would conflict with that rule.

  Mixer, send, effect, and master parameters have no owning module. An
  `Automate` action on each control arms its parameter. The parameter then opens
  in the same Piano
  Roll lane. The arming path stays with the parameter. The editing surface stays
  singular.

  Output-only ghost notes and ghost lane content provide cross-module
  context. The user does not edit a non-selected module in place.

  One rejected alternative listed each project parameter in one global
  selector. That design gives the common module case a long list. It also makes
  the visible lane's owner ambiguous. Another rejected alternative stacked
  multiple lanes under the grid. The 1280-by-720 target lacks the necessary
  vertical space. That design also adds stack-order, height, and persistence
  state.

  Ghost lanes already provide the comparison. `AC-079` gates the selector
  and its lane lifecycle. `AC-086` gates ghost behavior.
- **D67.** `D82` supersedes the faceplate identity part of this decision. `D83`
  supersedes the browser type-text part. A rack faceplate shows only its short
  label. The module browser retains the full name. The bottom workspace bar is
  approximately 50 to 52 pixels high. Empty mixer strips show their two-digit
  slot numbers. The product specifications own responsive and accessible
  behavior. Design artifacts do not own that behavior.

  `D75` supersedes and removes the master strip's A–D grid. `D77` withdraws the
  separate 1568 × 1003 raster reference. The specifications retain its durable
  product rules.
- **D68.** Numbered phases remain the dependency and completion order. A narrow
  foundation from a later phase can follow its owner and all earlier
  dependencies. A foundation slice never completes its parent phase or a
  skipped phase. Status text names the exact slice and its missing parent-phase
  scope. This preserves executable integration points without weakening a final
  MVP acceptance criterion.
- **D69.** Swing is one global project property in the MVP, stored in project
  metadata beside tempo and applied to every Pattern and every module. The Piano
  Roll header slider edits that single value, so its position is identical on
  every Pattern. Humanize stays Pattern-owned. Per-Pattern Swing is post-MVP.

  It would add an override to the `Pattern` record while the project field
  remains the default. One rejected alternative shipped Pattern-owned Swing in
  the MVP.
  That design adds timing state before the Playlist can contrast Patterns.
  Another rejected alternative omitted Swing until it could be Pattern-owned.
  That alternative removes an important timing
  control from the MVP groove.
- **D70.** `PulseStore` owns in-memory project state only. Its project API is
  `loadProject` and `saveProject`, which exchange already validated in-memory
  projects. Serialization, portable export, and untrusted import belong to the
  persistence layer. These actions reach the user through the composition
  boundary. Thus, untrusted bytes have exactly one entry path.

  This path validates, migrates, and checks plugin compatibility before it calls
  `loadProject`. This design prevents a state-layer dependency on persistence.
  It matches the store interface in `ARCHITECTURE.md` section 7.1.

  One rejected alternative added `exportProject` and `importProject` to the
  store. That design would invert the state-to-persistence dependency direction.
  It would also give unvalidated data a second entry path that bypasses import
  validation.

  Another rejected alternative moved serialization ownership to the store. That
  design would put document schema and migration knowledge in a
  layer that must stay format-agnostic. `AC-033` and `AC-084` continue to gate
  Undo behavior. The `AC-034` through `AC-038` and `AC-081` through `AC-083`
  criteria gate export and import at their owning layer.
- **D71.** The state layer's command union expresses each typed edit. The UI
  component model delivers it through its typed dispatch. A DOM `CustomEvent`
  layer is not required. Do not add one only to express an edit that the command
  union already carries. The union stays the single edit vocabulary.

  Thus, an unknown or malformed edit fails to type-check before it reaches the
  store at run time. This supersedes the earlier named `pulse-` composed-event
  list. That list assumed a Web Components UI. The repository uses one React component
  model instead, as `AC-002` requires.

  Gesture coalescing remains normative. A continuous drag carries one gesture
  identifier and becomes one history entry. A typed numeric field commits on
  Enter or blur. The rejected alternative rebuilt the composed event layer over
  React to preserve the literal event names. That design adds indirection with
  no behavior change and weakens static checking.
- **D72.** The rack faceplate has no Edit button and the master strip has no pan
  control. A faceplate Edit button duplicates an existing selection path to a
  module part. The user can select the module in the rack overview or the Piano
  Roll's module selector. `D65` already fixed the faceplate contents.

  They are the output-only activity indicator and the hold-to-sound audition
  control. Under section 6.2, a master pan control would
  be an automatable, serialized, and exported master parameter. Master balance
  rarely needs that control.

  One rejected alternative made the faceplate Edit button open the 760 x 680
  expanded editor. That design no longer matches the approved composition.
  Another rejected alternative drew a permanently disabled master pan knob.
  That design preserves raster parity but violates `AC-059`. No visible control
  may be dead. `AC-011` and `AC-059` continue to gate this.
- **D73.** The metronome on and off switch lives in the transport header's master
  group. Section 12 already required a configurable metronome for live recording
  but named no surface for it.

  Thus, the user could not control the click without a settings surface that the
  MVP does not have. The toggle is a global UI preference. It uses
  `aria-pressed` and creates no undo entry. It changes no
  project state, automation, or export. Count-in length and metronome sound
  remain with live recording in section 16.4.

  One rejected alternative put the switch only in a future recording settings
  surface. That design leaves the MVP with a required feature and no reachable
  control. Another rejected alternative put it in both places. That design
  duplicates the displayed state without added capability.
- **D74.** The specifications define four contract values. The MVP Pattern scale
  choices are Chromatic, Minor, Dorian, Phrygian, and
  Pentatonic (section 16.0). The limiter's compact controls are Ceiling, Gain,
  and Release (section 20.7). The default project sets each occupied instrument
  channel near -8 dB. The master stays near -6 dB (section 9.1).

  Other unspecified numbers stay unspecified. Section 12 transport work will
  choose and record its 960-ticks-per-beat clock resolution in the same change.

  Section 21.7 governs the product. Meters read silence while the transport is
  stopped.
- **D75.** The master strip carries no A–D grid, in any form. This supersedes the
  noninteractive return labels recorded in `D67`. Sends are an instrument-channel
  concept.

  A channel taps part of its signal to one of four parallel send chains.
  These chains return into the mix bus. The mix bus is never a send source. An
  A–D grid on the mix bus would show a routing relationship that does not exist.

  Section 20.6 defines mix-bus processing as the serial master chain. It has its
  own compressor, EQ, and protected limiter. Thus, section 8.5 gives it a
  dedicated Master studio view. It does not put this processing in a mixer
  strip. Return levels stay on the compact A–D cards in the Effects view. Each
  chain already owns its circular `Mix` return control.

  One rejected alternative kept the letters as a static legend. That design
  uses master-strip height for a label that controls nothing. It appears as a
  dead control under `AC-059`.

  Another rejected alternative added four return
  strips to the mixer. That design makes returns mixable in one place. However,
  it widens the compact studio column that section 8.4 keeps narrow. That width
  keeps the rack dominant. `AC-068` gates the master strip's contents.
- **D76.** The master strip is not an instrument channel, so it does not copy
  instrument-strip geometry. The fixed compact strip geometry applies to the
  eight instrument channels. The master strip has a different purpose. `D75`
  already removed its pan control and A–D grid. The master fader uses the height
  from those controls instead of padding. Thus, it is taller than an instrument
  fader.

  The master fader starts below the master label. It ends at the same bottom
  edge as the instrument faders. Thus, the strips share a baseline while their
  travel differs. The master level is the most frequently adjusted mixer
  control. It benefits from the most precise travel.

  The rejected alternative inserted a spacer to match the instrument-fader
  length. That design converts available height into unused space. Separately,
  the Mixer, Effects, and Master tabs are peers.

  They share one strip of equal-width controls. The earlier unequal widths
  encoded no meaning. Section 19.2 owns the master strip geometry. Section 8.5
  owns the tab strip.
- **D77.** The 1568 × 1003 raster reference is withdrawn. This supersedes that
  part of `D67`. The owning specifications retain the durable rules from the
  raster. `AC-067` gates the documented geometry, density, materials,
  typography scale, and control sizing.
- **D78.** Rack faceplates carry no Pattern activity indicator. The faceplate
  contents have a short label, fast controls, audition control, and module state
  controls. `D82` removes faceplate metadata and the Pattern selector.

  This supersedes the activity-indicator part of `D65` and `D72`. The
  single-editing-surface rule is unchanged. Faceplates have no step grid or
  per-step editing. The Piano Roll stays the only Pattern editing surface.

  Under the section 15.0 visual constraints, a sixteen-cell row resembles a
  step sequencer. Users can try to click it. An inoperative surface conflicts
  with the rule that every visible control operates. The Piano Roll playhead,
  Pattern position readout, and transport clock provide playback position
  feedback.

  One rejected alternative kept the flat bar-graph style. It still resembled
  pressable steps. Another rejected alternative made the row focus the Piano
  Roll. That design restores a Pattern-shaped faceplate control. It also
  restores the two-editor interpretation that `D65` removed. `AC-011` continues
  to gate the single editing surface.
- **D79.** The MVP ships exactly one built-in theme, `rack`. The `mono`,
  `cosmic`, `analog`, and `rust` themes leave the MVP scope. The token
  architecture, the high-contrast overlay, and the bounded user-theme import
  contract are unchanged.

  Appearance remains one built-in ID or `user`, plus the independent
  high-contrast state. Each built-in theme is a normative palette. Its full
  contrast matrix must stay correct across each supported
  viewport and state. Four extra matrices added appearance choices but no
  capability. User-theme import already provides personalization.

  A stored appearance preference that names a removed theme is invalid data.
  The existing corrupt-preference fallback resolves it to `rack`. One rejected
  alternative kept all five palettes. That design multiplies each visual
  regression, contrast audit, and accessibility check by five. Another rejected
  alternative removed the theme system.

  Removing the theme system would discard the token architecture. User themes
  and post-MVP theme packs rely on that architecture. `AC-039` and `AC-040` gate
  the reduced scope.
- **D80.** The product UI displays only true or specification-owned state. No
  element may show a value that the product cannot produce. Uniform rack-knob
  pointer and arc values misreport each parameter. Lit channel meters while
  transport is stopped conflict with section 21.7. A seeded undo entry conflicts
  with `D06` because it makes project opening an undoable edit. `AC-059` and
  `AC-067` gate the result.
- **D81.** The rack-ear pull handles are a rack module's reorder drag
  affordance. Dragging a module by either handle moves it up or down the rack.
  The gesture uses pointer capture and shows an insertion marker at the landing
  position. Release commits one undoable move. Escape cancels the active drag.
  Keyboard reorder on the focused module commits the same move.

  Before this decision, the handles provided visual language only. A
  handle-shaped surface that does nothing conflicts with the operable-control
  rule. One rejected alternative let the user drag anywhere on the faceplate.
  That design conflicts with the pointer gestures for knobs, buttons, and
  selectors.

  Another rejected alternative added dedicated move-up and move-down buttons.
  That design adds two controls for a move that the handles already provide.
  Section 14 owns the behavior. `AC-010` gates reorder.
- **D82.** Rack faceplates have no whole-module Fold action, Pattern selector,
  full-name label, or type label. Loaded faceplates and rack-overview cards have
  no separate Select, Duplicate, or Swap buttons. Selection uses the loaded
  overview card. Duplicate and Swap stay in the module menu.

  A loaded faceplate puts Sound, Voice when applicable, and Output groups in one
  horizontal row. Each group can collapse independently. Group disclosure is
  transient component state. The full-rack empty slot is a compact identity
  row. The module browser and rack overview own the visible Add actions.

  The module browser card is the drag surface. It has no separate drag handle
  or inspection panel. Its visible identity content remains the short label,
  full name, and thumbnail. Its tooltip contains the type description.

  The same redundancy audit removes three other repeated surfaces. An empty
  effect card has no Details button that only repeats its empty state. The
  mixer master label does not duplicate Master-tab navigation. The Pattern
  inspector does not repeat the fixed grid value from the Piano Roll header.

  These changes remove repeated actions and repeated identity text. They also
  reduce unused vertical space without removing the module menu or the detailed
  editor. Sections 13 through 15 own the behavior. `AC-010` and `AC-080` gate
  the result.
- **D83.** The transport shows the tempo number without a visible BPM label.
  Its tooltip defines beats per minute. Module browser cards show the short
  label and full name. Their tooltips contain the type description.

  Each loaded faceplate reserves its right edge for Output. Sound and Voice use
  the flexible lane to its left. This alignment keeps the faceplate balanced
  and keeps Output visible when the available width decreases. Sections 8, 12,
  13, and 14 own this behavior. `AC-010`, `AC-067`, and `AC-080` gate the result.
- **D84.** The Pin control is removed from the product. It marked a project so
  the project selector listed it first. It did not earn its place in the MVP.
  The transport far-left group now holds the project selector alone, and the
  selector orders stored projects by modified time alone.

  A Favourite feature is a post-MVP target. It is a separate feature from Pin.
  It will define its own behavior, ordering, and interface, and it does not
  inherit the removed Pin behavior. The project format reserves a `favorite`
  boolean for it. The MVP writes `false` and offers no control that changes it.
  Section 12 of [audio engine and transport](spec-004-audio-engine-and-transport.md)
  and section 27 of
  [product and design foundations](spec-001-product-and-design-foundations.md)
  own this scope.
- **D85.** Swing and Humanize default to 0 percent, so a new project starts
  straight. This supersedes the earlier 54 and 12 percent defaults, which
  shaped every new project before the user asked for a feel. The timing
  sliders use a two-segment taper: the first 30 percent of the value spans 60
  percent of the track. The mouse wheel steps the value by whole percent.

  A smooth power taper was rejected. Its slope near zero makes a keyboard step
  smaller than the whole-percent store granularity, which reads as a dead
  control. Section 17 of
  [audio engine and transport](spec-004-audio-engine-and-transport.md),
  section 9.1 of [rack and instruments](spec-005-rack-and-instruments.md), and
  the section 16 shared header of
  [pattern editing](spec-006-pattern-editing.md) own this behavior.
- **D86.** The lower editor workspace is user-resizable upward through a
  horizontal handle above it. The default height stays the minimum, so the
  rack keeps its visual priority until the user asks for a taller editor. The
  rack row never drops below its 350-pixel minimum. The chosen height is
  session UI state. It is not project data and it does not persist. Section
  8.1 of
  [application shell and controls](spec-003-application-shell-and-controls.md)
  owns this behavior.
- **D87.** The six instruments carry new product names and short labels:
  Silver Serpent `ACID`, Tin Soldier `SNAP`, Soft Thunder `BOOM`, Twin Engine
  `MESH`, Gray Ghost `BITS`, and Dusty Mosaic `PERC`. These names replace Acid
  Bass, Drumline Six, Boom Eight, Hybrid Nine, Digit Seven, and Digit Five.
  The stable code IDs, plugin IDs, module folder names, and worklet processor
  names do not change. Project documents reference plugin IDs only, so stored
  projects stay valid without a migration. Section 2.2 of
  [product and design foundations](spec-001-product-and-design-foundations.md)
  owns the name table.

  `SNAP` belongs to Tin Soldier because that machine has a Snap control and
  six dry synthesized voices. `MESH` belongs to Twin Engine because that
  machine blends a synthesized layer with a generated one-shot layer on every
  voice, which decision `D05` records as its defining behavior. Each module
  keeps the accent color it had before this decision.
- **D88.** The default project is named `Neon Basement`, and the built-in
  starter template creates a fresh copy of it. This supersedes the separate
  three-slot, 130 BPM twin-bassline starter, which is removed with its note
  data.

  Two authored starting projects made the product teach two different first
  impressions and doubled the original note data to maintain. One named piece
  of content now serves both the first start and every New action. Section 9.1
  of [rack and instruments](spec-005-rack-and-instruments.md) owns the content.
  Section 9.2 owns the template action and holds no content of its own.
- **D89.** Each instrument carries an original manifest-declared SVG icon and a
  revised accent: `ACID` acid yellow `#F2D530` with a smiley, `SNAP` soldier
  green `#6FDE76` with a marching snare, `BOOM` warm red with a thundercloud,
  `MESH` violet with meshed gears, `BITS` ghost blue `#A9C7E8` with a ghost,
  and `PERC` turquoise with mosaic tiles. This supersedes the color-stability
  note in `D87` for `ACID`, `SNAP`, and `BITS`.

  The acid-yellow smiley is a direct owner decision. It renders the acid-house
  motif as an original Pulsebox drawing. No icon or color copies a product's
  artwork, layout, or trade dress. Icons live in `PluginUiManifest.icon` as
  bounded path data, so shared UI renders them without plugin branches.
  Section 11.2 of
  [product and design foundations](spec-001-product-and-design-foundations.md)
  owns the accent and icon vocabulary. `THEMING.md` section 3.4 owns the token
  values.
- **D90.** A loaded rack faceplate shows only the module icon as its identity.
  The short label and the slot number leave the faceplate, because the icon
  and accent already identify the machine and the number repeats the rack
  overview. The slot number and full product name stay in the faceplate's
  accessible name. Empty faceplates keep their slot number and `Empty` label.
  Short labels remain the identity on rack-overview cards, mixer strips, and
  the module browser. This refines the faceplate identity rule in section 2.2
  of [product and design foundations](spec-001-product-and-design-foundations.md),
  which owns it.
- **D91.** A parameter descriptor declares a smoothing ramp only when the DSP
  glides that field. The drum machines glide the module bus fields and the
  per-voice level, pan, and blend over eight milliseconds. Per-voice tune,
  punch, snap, decay, noise, start, and attack land as immediate steps. A step
  on those fields moves pitch or shape, not gain, so it cannot click. Section
  6.3 of [ARCHITECTURE.md](../ARCHITECTURE.md) owns the
  descriptor-matches-behavior rule.
- **D92.** The section 9.1 bar counts describe the default Song chain, not
  per-Pattern lengths. Each Pattern is one bar of sixteen steps. A bar count
  is the chain entry's repeat count. The default project ships the chain
  disabled, and Song mode plays it when the user enables it. Section 9.1 of
  [rack and instruments](spec-005-rack-and-instruments.md) owns the content.
- **D93.** A drum voice with the `restart` retrigger policy restarts
  immediately on a retrigger of the same voice. The new attack transient masks
  the restart, and a declick ramp would delay the hit and move its frame.
  Section 21.4 of
  [audio engine and transport](spec-004-audio-engine-and-transport.md) owns
  the retrigger rule.
- **D94.** History entries are full state snapshots and keep their commit
  order when a gesture coalesces. When two gestures interleave, an undo of the
  later entry restores the snapshot from that gesture's begin, so the other
  gesture's mid-gesture value can appear at an intermediate undo step. The
  final state after both undos is exact. Section 7.4 of
  [ARCHITECTURE.md](../ARCHITECTURE.md) owns gesture coalescing.
- **D95.** The `pinned` to `favorite` metadata rename keeps format version 1
  and adds no lexical repair. The format has not shipped, so only local
  pre-release documents carry `pinned`. Such a document fails validation, and
  the application reports the discarded autosave with the non-blocking project
  notice. [PROJECT-FORMAT.md](../PROJECT-FORMAT.md) owns the schema.
- **D96.** Pulsebox supports the current stable release of Chrome and
  Chromium. Support applies to that release channel only. All verification
  runs in the same channel. It extends `D11`, which approved current stable
  Chrome support. The acceptance evidence in
  [ARCHITECTURE.md](../ARCHITECTURE.md) records Chrome results. Section 24.6 of
  [quality and delivery](spec-010-quality-and-delivery.md) owns this behavior.
